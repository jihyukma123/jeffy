import OpenAI from "openai";
import type { ResponseInput } from "openai/resources/responses/responses";
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
  baseUrl: string;
  gatewayToken: string;
  model: string;
  instructions?: string;
};

export function createLlmClient(options: LlmClientOptions, tools: ToolDefinition[]) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");

  if (!baseUrl || !options.gatewayToken || !options.model) {
    throw new Error(
      "OPENAI_BASE_URL, GATEWAY_TOKEN, OPENAI_MODEL을 먼저 설정하세요.",
    );
  }

  const client = new OpenAI({
    apiKey: options.gatewayToken,
    baseURL: baseUrl,
    // The previous fetch implementation made one request per model turn.
    maxRetries: 0,
  });

  return async function callModel(inputItems: unknown[]): Promise<ModelTurn> {
    const stream = await client.responses.create({
      model: options.model,
      store: false,
      stream: true,
      instructions: options.instructions ?? "You are a helpful assistant.",
      tools,
      input: inputItems as ResponseInput,
    });

    let outputText = "";
    let completedOutput: ModelOutputItem[] | undefined;
    const completedItems: ModelOutputItem[] = [];
    const observedEventTypes = new Set<string>();

    for await (const event of stream) {
      observedEventTypes.add(event.type);

      switch (event.type) {
        case "error":
          throw new Error(`Model response failed: ${event.message}`);

        case "response.failed":
          throw new Error(
            `Model response failed: ${event.response.error?.message ?? "unknown error"}`,
          );

        case "response.incomplete":
          throw new Error(
            `Model response incomplete: ${event.response.incomplete_details?.reason ?? "unknown reason"}`,
          );

        case "response.output_text.delta":
          outputText += event.delta;
          break;

        case "response.output_item.done":
          completedItems.push(event.item as unknown as ModelOutputItem);
          break;

        case "response.completed":
          completedOutput = event.response.output as unknown as ModelOutputItem[];
          break;
      }
    }

    const output =
      completedItems.length > 0
        ? completedItems
        : completedOutput ?? [];

    if (output.length === 0 && outputText.length === 0) {
      const observed = [...observedEventTypes].join(", ") || "none";
      throw new Error(
        `Model returned no recognized output. Observed stream events: ${observed}`,
      );
    }

    return {
      output,
      outputText,
    };
  };
}
