import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { AgentEvent } from "./jeffy/agent-loop.js";
import { jeffy } from "./jeffy/index.js";

const baseUrl = process.env.OPENAI_BASE_URL ?? "";
const gatewayToken = process.env.GATEWAY_TOKEN ?? "";
const model = process.env.OPENAI_MODEL ?? "";

function logAgentEvent(event: AgentEvent): void {
  switch (event.type) {
    case "model_start":
      console.error(`[turn ${event.turn}] model_start (input items: ${event.inputItemCount})`);
      break;
    case "model_end":
      console.error(
        `[turn ${event.turn}] model_end (output items: ${event.outputItemCount}, text characters: ${event.outputTextCharacters})`,
      );
      break;
    case "tool_start": {
      let displayedArguments: unknown = event.arguments;
      try {
        displayedArguments = JSON.parse(event.arguments) as unknown;
      } catch {
        // Keep malformed arguments visible as their original string.
      }
      console.error(`[turn ${event.turn}] tool_start`);
      console.error(JSON.stringify({
        call_id: event.callId,
        name: event.name,
        arguments: displayedArguments,
      }, null, 2));
      break;
    }
    case "tool_end":
      console.error(`[turn ${event.turn}] tool_end`);
      console.error(JSON.stringify({
        call_id: event.callId,
        name: event.name,
        outputCharacters: event.outputCharacters,
      }, null, 2));
      break;
    case "final":
      console.error(`[turn ${event.turn}] final`);
      break;
  }
}

async function main(): Promise<void> {
  if (!baseUrl || !gatewayToken || !model) {
    throw new Error(
      ".env.local에 OPENAI_BASE_URL, GATEWAY_TOKEN, OPENAI_MODEL을 설정하세요.",
    );
  }

  const rl = readline.createInterface({ input, output });
  try {
    const requestedSessionId = (await rl.question("기존 세션 ID (새 세션은 Enter): ")).trim();
    const userInput = await rl.question("질문을 입력하세요: ");
    if (!userInput) return;

    const result = await jeffy({
      input: userInput,
      sessionId: requestedSessionId || undefined,
      baseUrl,
      gatewayToken,
      model,
      onEvent: logAgentEvent,
    });
    console.log(result.answer);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
