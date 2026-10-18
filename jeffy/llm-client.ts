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

  return async function callModel(inputItems: unknown[]): Promise<ModelTurn> {
    if (!baseUrl || !options.gatewayToken || !options.model) {
      throw new Error(
        "OPENAI_BASE_URL, GATEWAY_TOKEN, OPENAI_MODEL을 먼저 설정하세요.",
      );
    }

    const response = await fetch(
      `${baseUrl}/responses`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.gatewayToken}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          model: options.model,
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

