import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { jeffy } from "./jeffy/index.js";

const baseUrl = process.env.OPENAI_BASE_URL ?? "";
const gatewayToken = process.env.GATEWAY_TOKEN ?? "";
const model = process.env.OPENAI_MODEL ?? "";

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
