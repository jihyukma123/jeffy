import type { ModelTurn } from "./llm-client.js";
import type { ConversationMessage } from "./session-manager.js";
import { isToolCall, type ToolCall } from "./tool-calling.js";

export type AgentLoopOptions = {
  callModel: (inputItems: unknown[]) => Promise<ModelTurn>;
  executeTool: (call: ToolCall) => Promise<string>;
  maximumTurns?: number;
  onEvent?: (event: AgentEvent) => void;
};

export type AgentEvent =
  | {
      type: "model_start";
      turn: number;
      inputItemCount: number;
    }
  | {
      type: "model_end";
      turn: number;
      outputItemCount: number;
      outputTextCharacters: number;
    }
  | {
      type: "tool_start";
      turn: number;
      callId: string;
      name: string;
      arguments: string;
    }
  | {
      type: "tool_end";
      turn: number;
      callId: string;
      name: string;
      outputCharacters: number;
    }
  | {
      type: "final";
      turn: number;
      answer: string;
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

  for (let turnIndex = 0; turnIndex < maximumTurns; turnIndex++) {
    const turn = turnIndex + 1;
    options.onEvent?.({
      type: "model_start",
      turn,
      inputItemCount: inputItems.length,
    });

    const response = await options.callModel(inputItems);

    options.onEvent?.({
      type: "model_end",
      turn,
      outputItemCount: response.output.length,
      outputTextCharacters: response.outputText.length,
    });

    // Preserve everything the model produced.
    inputItems.push(...response.output);

    const toolCalls = response.output.filter(isToolCall);

    // No tool calls means the model has finished.
    if (toolCalls.length === 0) {
      options.onEvent?.({ type: "final", turn, answer: response.outputText });
      newMessages.push({ type: "assistant", text: response.outputText });
      return {
        answer: response.outputText,
        newMessages,
      };
    }

    for (const call of toolCalls) {
      options.onEvent?.({
        type: "tool_start",
        turn,
        callId: call.call_id,
        name: call.name,
        arguments: call.arguments,
      });

      newMessages.push({
        type: "tool_call",
        call_id: call.call_id,
        name: call.name,
        arguments: call.arguments,
      });

      const result = await options.executeTool(call);

      options.onEvent?.({
        type: "tool_end",
        turn,
        callId: call.call_id,
        name: call.name,
        outputCharacters: result.length,
      });

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
