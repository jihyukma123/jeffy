import type { ToolCall, ToolDefinition } from "./tool-calling.js";

export type ModelOutputItem = ToolCall | {
  type: string;
  [key: string]: unknown;
};

export type ModelTurn = {
  output: ModelOutputItem[];
  outputText: string;
};

export type LlmClientOptions = {
  accessToken: string;
  chatgptAccountId: string;
  model?: string;
  instructions?: string;
};

export function createLlmClient(options: LlmClientOptions, tools: ToolDefinition[]) {
  const { accessToken, chatgptAccountId } = options;

  return async function callCodex(inputItems: unknown[]): Promise<ModelTurn> {
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
          model: options.model ?? "gpt-5.6-terra",
          store: false,
          stream: true,
          instructions: options.instructions ?? "You are a helpful assistant.",
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
  };
}

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

export async function loginAndRun() {
  const device = await getDeviceCode();
  console.log("인증 페이지: https://auth.openai.com/codex/device");
  console.log(`코드: ${device.user_code}`);
  const authCode = await pollDeviceAuth(device.device_auth_id, device.user_code, device.interval || 5);
  const token = await exchangeToken(authCode.authorization_code, authCode.code_verifier);
  console.log("인증 성공!");
  console.log("Access Token:", token.access_token);
  console.log("Account ID:", extractAccountId(token.access_token));
}

