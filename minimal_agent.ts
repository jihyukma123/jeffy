import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

type ConversationMessage = {
  type: "user" | "assistant";
  text: string;
};

const conversationsDirectory = path.join(process.cwd(), "conversations");

const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

async function getDeviceCode() {
  const res = await fetch("https://auth.openai.com/api/accounts/deviceauth/usercode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CODEX_CLIENT_ID }),
  });
  if (!res.ok) throw new Error(`User code request failed: ${res.status}`);
  return (await res.json()) as { device_auth_id: string; user_code: string; interval: number };
}

async function pollDeviceAuth(deviceAuthId: string, userCode: string, intervalSeconds: number) {
  const pollInterval = Math.max(1, intervalSeconds) * 1000;
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    const res = await fetch("https://auth.openai.com/api/accounts/deviceauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_auth_id: deviceAuthId, user_code: userCode }),
    });
    if (res.ok) {
      return (await res.json()) as { authorization_code: string; code_verifier: string };
    }
    if (res.status !== 403 && res.status !== 404) {
      throw new Error(`Device auth polling failed: ${res.status}`);
    }
  }
}

async function exchangeToken(authorizationCode: string, codeVerifier: string) {
  const res = await fetch("https://auth.openai.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CODEX_CLIENT_ID,
      code: authorizationCode,
      code_verifier: codeVerifier,
      redirect_uri: "https://auth.openai.com/deviceauth/callback",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  return (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
}

function extractAccountId(accessToken: string): string {
  const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64").toString());
  const accountId = payload["https://api.openai.com/auth"]?.chatgpt_account_id;
  if (!accountId) throw new Error("chatgpt_account_id not found in token payload");
  return accountId;
}

async function loginAndRun() {
  const device = await getDeviceCode();
  console.log("인증 페이지: https://auth.openai.com/codex/device");
  console.log(`코드: ${device.user_code}`);
  const authCode = await pollDeviceAuth(device.device_auth_id, device.user_code, device.interval || 5);
  const token = await exchangeToken(authCode.authorization_code, authCode.code_verifier);
  console.log("인증 성공!");
  console.log("Access Token:", token.access_token);
  console.log("Account ID:", extractAccountId(token.access_token));
}

const accessToken = ""
const chatgptAccountId = "";

function sessionPath(sessionId: number): string {
  return path.join(conversationsDirectory, `${sessionId}.json`);
}

async function createNewSession(): Promise<{ id: number; messages: ConversationMessage[] }> {
  await fs.mkdir(conversationsDirectory, { recursive: true });
  const files = await fs.readdir(conversationsDirectory);
  const existingIds = files
    .map((file) => /^([1-9]\d*)\.json$/.exec(file)?.[1])
    .filter((id): id is string => id !== undefined)
    .map(Number);
  const id = existingIds.length === 0 ? 1 : Math.max(...existingIds) + 1;
  const messages: ConversationMessage[] = [];

  await saveSession(id, messages);
  return { id, messages };
}

async function loadSession(sessionIdText: string): Promise<{ id: number; messages: ConversationMessage[] }> {
  if (!/^[1-9]\d*$/.test(sessionIdText)) {
    throw new Error("세션 ID는 1 이상의 정수여야 합니다.");
  }

  const id = Number(sessionIdText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(sessionPath(id), "utf8"));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new Error(`${id}번 세션을 찾을 수 없습니다.`);
    throw error;
  }

  if (!Array.isArray(parsed) || !parsed.every(isConversationMessage)) {
    throw new Error(`${id}.json의 대화 형식이 올바르지 않습니다.`);
  }
  return { id, messages: parsed };
}

function isConversationMessage(value: unknown): value is ConversationMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (message.type === "user" || message.type === "assistant") && typeof message.text === "string";
}

async function saveSession(sessionId: number, messages: ConversationMessage[]): Promise<void> {
  await fs.mkdir(conversationsDirectory, { recursive: true });
  await fs.writeFile(sessionPath(sessionId), `${JSON.stringify(messages, null, 2)}\n`, "utf8");
}
async function callCodex(inputItems: unknown[]): Promise<ModelTurn> {
  if (!accessToken || !chatgptAccountId) {
    throw new Error("accessToken과 chatgptAccountId를 먼저 설정하세요.");
  }

  const response = await fetch(
    "https://chatgpt.com/backend-api/codex/responses",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "chatgpt-account-id": chatgptAccountId,
        "OpenAI-Beta": "responses=experimental",
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: "gpt-5.6-terra",
        store: false,
        stream: true,
        instructions: "You are a helpful assistant.",
        tools,
        input: inputItems,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Request failed (${response.status}): ${await response.text()}`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable");
  }

  const decoder = new TextDecoder();

  let buffer = "";
  let outputText = "";
  let completedOutput: ModelOutputItem[] | undefined;
  const completedItems: ModelOutputItem[] = [];
  const observedEventTypes = new Set<string>();

  function handleSseLine(line: string): void {
    if (!line.startsWith("data:")) return;

    const data = line.slice(5).trimStart();
    if (!data || data === "[DONE]") return;

    let event: Record<string, any>;
    try {
      event = JSON.parse(data) as Record<string, any>;
    } catch (error) {
      throw new Error(
        `Failed to parse an SSE event: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (typeof event.type === "string") {
      observedEventTypes.add(event.type);
    }

    if (
      event.type === "error" ||
      event.type === "response.failed" ||
      event.type === "response.incomplete"
    ) {
      const message =
        typeof event.error?.message === "string"
          ? event.error.message
          : typeof event.message === "string"
            ? event.message
            : JSON.stringify(event);
      throw new Error(`Model response failed: ${message}`);
    }

    if (
      event.type === "response.output_text.delta" &&
      typeof event.delta === "string"
    ) {
      outputText += event.delta;
    }

    if (
      event.type === "response.output_item.done" &&
      event.item
    ) {
      completedItems.push(event.item as ModelOutputItem);
    }

    if (
      event.type === "response.completed" &&
      Array.isArray(event.response?.output)
    ) {
      completedOutput = event.response.output as ModelOutputItem[];
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      handleSseLine(line);
    }
  }

  buffer += decoder.decode();
  for (const line of buffer.split("\n")) {
    handleSseLine(line);
  }

  const output =
    completedItems.length > 0
      ? completedItems
      : completedOutput ?? [];

  if (output.length === 0 && outputText.length === 0) {
    const observed = [...observedEventTypes].join(", ") || "none";
    throw new Error(
      `Model returned no recognized output. Observed SSE events: ${observed}`,
    );
  }

  return {
    output,
    outputText,
  };
}


// tool calling test
//
// define tool
const tools = [
  {
    type: "function",
    name: "read_file",
    description: "Read the UTF-8 text contents of a file in the current workspace.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path relative to the workspace root",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
    strict: true,
  },
];

// read file tool function
async function readFileTool(args: unknown): Promise<string> {
  if (
    !args ||
    typeof args !== "object" ||
    typeof (args as { path?: unknown }).path !== "string"
  ) {
    throw new Error("read_file requires a string path");
  }

  const requestedPath = (args as { path: string }).path;

  const workspaceRoot = await fs.realpath(process.cwd());
  const targetPath = await fs.realpath(
    path.resolve(workspaceRoot, requestedPath),
  );

  const relativePath = path.relative(workspaceRoot, targetPath);
  const outsideWorkspace =
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath);

  if (outsideWorkspace) {
    throw new Error("Cannot read files outside the workspace");
  }

  return fs.readFile(targetPath, "utf8");
}

// tool execution logic
type ToolCall = {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
};

async function executeTool(call: ToolCall): Promise<string> {
  try {
    const args: unknown = JSON.parse(call.arguments);

    switch (call.name) {
      case "read_file":
        return await readFileTool(args);

      default:
        throw new Error(`Unknown tool: ${call.name}`);
    }
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// parsing tool calls Logic
// this is required because the model may return tool call responses or regular text responses
type ModelOutputItem = ToolCall | {
  type: string;
  [key: string]: unknown;
};

type ModelTurn = {
  output: ModelOutputItem[];
  outputText: string;
};

function isToolCall(item: ModelOutputItem): item is ToolCall {
  return (
    item.type === "function_call" &&
    typeof item.call_id === "string" &&
    typeof item.name === "string" &&
    typeof item.arguments === "string"
  );
}


// agent looping running logic
async function runAgent(
  messages: ConversationMessage[],
): Promise<string> {
  const inputItems: unknown[] = messages.map((message) => ({
    role: message.type,
    content: [
      {
        type:
          message.type === "user"
            ? "input_text"
            : "output_text",
        text: message.text,
      },
    ],
  }));

  const maximumTurns = 20;

  for (let turn = 0; turn < maximumTurns; turn++) {
    const response = await callCodex(inputItems);

    // Preserve everything the model produced.
    inputItems.push(...response.output);

    const toolCalls = response.output.filter(isToolCall);

    // No tool calls means the model has finished.
    if (toolCalls.length === 0) {
      return response.outputText;
    }

    for (const call of toolCalls) {
      let displayedArguments: unknown = call.arguments;
      try {
        displayedArguments = JSON.parse(call.arguments) as unknown;
      } catch {
        // Keep the original string so malformed arguments are still visible.
      }

      console.error("\n[model -> tool_call]");
      console.error(JSON.stringify({
        call_id: call.call_id,
        name: call.name,
        arguments: displayedArguments,
      }, null, 2));

      const result = await executeTool(call);

      console.error("[tool -> function_call_output]");
      console.error(JSON.stringify({
        call_id: call.call_id,
        name: call.name,
        outputCharacters: result.length,
      }, null, 2));

      inputItems.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: result,
      });
    }

    // The loop now sends the expanded input back to the model.
  }

  throw new Error(
    `Agent exceeded the maximum of ${maximumTurns} model turns`,
  );
}



async function main(): Promise<void> {
  const rl = readline.createInterface({ input, output });
  try {
    const requestedSessionId = (await rl.question("기존 세션 ID (새 세션은 Enter): ")).trim();
    const session = requestedSessionId
      ? await loadSession(requestedSessionId)
      : await createNewSession();
    const userInput = await rl.question("질문을 입력하세요: ");
    if (!userInput) return;

    session.messages.push({ type: "user", text: userInput });
    await saveSession(session.id, session.messages);

    const answer = await runAgent(session.messages);
    console.log(answer);

    session.messages.push({ type: "assistant", text: answer });
    await saveSession(session.id, session.messages);
  } finally {
    rl.close();
  }
}


// loginAndRun();
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
