import * as path from "node:path";
import { runAgent } from "./agent-loop.js";
import { createLlmClient, type LlmClientOptions } from "./llm-client.js";
import { createSessionManager } from "./session-manager.js";
import { createToolCallingSystem } from "./tool-calling.js";

export type JeffyOptions = LlmClientOptions & {
  input: string;
  sessionId?: number | string;
  maximumTurns?: number;
  workspaceRoot?: string;
  conversationsDirectory?: string;
};

export type JeffyResult = {
  sessionId: number;
  answer: string;
};

/**
 * 한 요청을 실행합니다. sessionId를 생략하면 새 세션을 만듭니다.
 * 반환된 sessionId를 다음 호출에 전달하면 같은 대화를 이어갑니다.
 *
 * const result = await jeffy({
 *   input: "package.json을 읽고 설명해줘",
 *   baseUrl: "https://your-worker.example.workers.dev/v1",
 *   gatewayToken,
 *   model: "your-api-model",
 *   instructions: "한국어로 간결하게 답하세요.",
 * });
 */
export async function jeffy(options: JeffyOptions): Promise<JeffyResult> {
  const workspaceRoot = path.resolve(options.workspaceRoot ?? process.cwd());
  const sessionManager = createSessionManager(
    options.conversationsDirectory ?? path.join(workspaceRoot, "conversations"),
  );
  const toolCalling = createToolCallingSystem(workspaceRoot);
  const callModel = createLlmClient(options, toolCalling.tools);

  const session = options.sessionId === undefined
    ? await sessionManager.createNewSession()
    : await sessionManager.loadSession(String(options.sessionId));

  session.messages.push({ type: "user", text: options.input });
  await sessionManager.saveSession(session.id, session.messages);

  const answer = await runAgent(session.messages, {
    callModel,
    executeTool: toolCalling.executeTool,
    maximumTurns: options.maximumTurns,
  });

  session.messages.push({ type: "assistant", text: answer });
  await sessionManager.saveSession(session.id, session.messages);

  return { sessionId: session.id, answer };
}
