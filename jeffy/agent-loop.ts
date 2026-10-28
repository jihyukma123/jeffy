import type { ModelTurn } from "./llm-client.js";
import type { ConversationMessage } from "./session-manager.js";
import { isToolCall, type ToolCall } from "./tool-calling.js";

export type AgentLoopOptions = {
  callModel: (inputItems: unknown[]) => Promise<ModelTurn>;
  executeTool: (call: ToolCall) => Promise<string>;
  maximumTurns?: number;
};

export type AgentRunResult = {
  answer: string;
  newMessages: ConversationMessage[];
};

export function conversationMessagesToInputItems(
  messages: ConversationMessage[],
): unknown[] {
  return messages.map((message) => {
    switch (message.type) {
      case "user":
        return {
          role: "user",
          content: [{ type: "input_text", text: message.text }],
        };
      case "assistant":
        return {
          role: "assistant",
          content: [{ type: "output_text", text: message.text }],
        };
      case "tool_call":
        return {
          type: "function_call",
          call_id: message.call_id,
          name: message.name,
          arguments: message.arguments,
        };
      case "tool_result":
        return {
          type: "function_call_output",
          call_id: message.call_id,
          output: message.output,
        };
    }
  });
}

export async function runAgent(
  messages: ConversationMessage[],
  options: AgentLoopOptions,
): Promise<AgentRunResult> {
  const inputItems: unknown[] = conversationMessagesToInputItems(messages);
  const newMessages: ConversationMessage[] = [];
  const maximumTurns = options.maximumTurns ?? 20;

  for (let turn = 0; turn < maximumTurns; turn++) {
    const response = await options.callModel(inputItems);

    // Preserve everything the model produced.
    inputItems.push(...response.output);

    const toolCalls = response.output.filter(isToolCall);

    // No tool calls means the model has finished.
    if (toolCalls.length === 0) {
      newMessages.push({ type: "assistant", text: response.outputText });
      return {
        answer: response.outputText,
        newMessages,
      };
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

      newMessages.push({
        type: "tool_call",
        call_id: call.call_id,
        name: call.name,
        arguments: call.arguments,
      });

      const result = await options.executeTool(call);

      console.error("[tool -> function_call_output]");
      console.error(JSON.stringify({
        call_id: call.call_id,
        name: call.name,
        outputCharacters: result.length,
      }, null, 2));

      newMessages.push({
        type: "tool_result",
        call_id: call.call_id,
        name: call.name,
        output: result,
      });

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
