import assert from "node:assert/strict";
import test from "node:test";
import {
  conversationMessagesToInputItems,
  runAgent,
  type AgentEvent,
} from "./agent-loop.js";
import type { ModelTurn } from "./llm-client.js";
import type { ConversationMessage } from "./session-manager.js";
import type { ToolCall } from "./tool-calling.js";

test("conversationMessagesToInputItems converts all message types for model input", () => {
  const messages: ConversationMessage[] = [
    { type: "user", text: "파일 읽어줘" },
    {
      type: "tool_call",
      call_id: "call-1",
      name: "read_file",
      arguments: '{"path":"README.md"}',
    },
    {
      type: "tool_result",
      call_id: "call-1",
      name: "read_file",
      output: "# Jeffy",
    },
    { type: "assistant", text: "파일 내용은 Jeffy 프로젝트 설명입니다." },
  ];

  const inputItems = conversationMessagesToInputItems(messages);

  assert.deepEqual(inputItems, [
    {
      role: "user",
      content: [{ type: "input_text", text: "파일 읽어줘" }],
    },
    {
      type: "function_call",
      call_id: "call-1",
      name: "read_file",
      arguments: '{"path":"README.md"}',
    },
    {
      type: "function_call_output",
      call_id: "call-1",
      output: "# Jeffy",
    },
    {
      role: "assistant",
      content: [{ type: "output_text", text: "파일 내용은 Jeffy 프로젝트 설명입니다." }],
    },
  ]);
});

test("runAgent records tool_call, tool_result, and assistant in newMessages trace", async () => {
  const callHistory: unknown[][] = [];
  const toolExecutions: ToolCall[] = [];
  const events: AgentEvent[] = [];

  const callModel = async (inputItems: unknown[]): Promise<ModelTurn> => {
    callHistory.push(JSON.parse(JSON.stringify(inputItems)));

    // 1st turn: model invokes read_file tool
    if (callHistory.length === 1) {
      return {
        output: [
          {
            type: "function_call",
            call_id: "call-101",
            name: "read_file",
            arguments: '{"path":"test.txt"}',
          },
        ],
        outputText: "",
      };
    }

    // 2nd turn: model provides final answer
    return {
      output: [],
      outputText: "파일 내용은 Hello World입니다.",
    };
  };

  const executeTool = async (call: ToolCall): Promise<string> => {
    toolExecutions.push(call);
    return "Hello World";
  };

  const initialMessages: ConversationMessage[] = [
    { type: "user", text: "test.txt 읽어봐" },
  ];

  const result = await runAgent(initialMessages, {
    callModel,
    executeTool,
    onEvent: (event) => events.push(event),
  });

  assert.equal(result.answer, "파일 내용은 Hello World입니다.");
  assert.equal(toolExecutions.length, 1);
  assert.equal(toolExecutions[0].name, "read_file");

  // Verify that newMessages holds the complete trace in order
  assert.deepEqual(result.newMessages, [
    {
      type: "tool_call",
      call_id: "call-101",
      name: "read_file",
      arguments: '{"path":"test.txt"}',
    },
    {
      type: "tool_result",
      call_id: "call-101",
      name: "read_file",
      output: "Hello World",
    },
    {
      type: "assistant",
      text: "파일 내용은 Hello World입니다.",
    },
  ]);

  assert.deepEqual(events, [
    { type: "model_start", turn: 1, inputItemCount: 1 },
    {
      type: "model_end",
      turn: 1,
      outputItemCount: 1,
      outputTextCharacters: 0,
    },
    {
      type: "tool_start",
      turn: 1,
      callId: "call-101",
      name: "read_file",
      arguments: '{"path":"test.txt"}',
    },
    {
      type: "tool_end",
      turn: 1,
      callId: "call-101",
      name: "read_file",
      outputCharacters: 11,
    },
    { type: "model_start", turn: 2, inputItemCount: 3 },
    {
      type: "model_end",
      turn: 2,
      outputItemCount: 0,
      outputTextCharacters: 22,
    },
    {
      type: "final",
      turn: 2,
      answer: "파일 내용은 Hello World입니다.",
    },
  ]);
});

test("multi-turn preserves full trace across turns so model sees previous tool outputs", async () => {
  // Turn 1 trace
  const turn1Trace: ConversationMessage[] = [
    { type: "user", text: "package.json 읽어줘" },
    {
      type: "tool_call",
      call_id: "call-1",
      name: "read_file",
      arguments: '{"path":"package.json"}',
    },
    {
      type: "tool_result",
      call_id: "call-1",
      name: "read_file",
      output: '{"name": "jeffy", "version": "1.0.0"}',
    },
    {
      type: "assistant",
      text: "package.json을 읽었습니다.",
    },
  ];

  // User asks a follow-up question in Turn 2
  const turn2Messages: ConversationMessage[] = [
    ...turn1Trace,
    { type: "user", text: "버전이 몇이었지?" },
  ];

  let receivedInput: unknown[] = [];
  const callModel = async (inputItems: unknown[]): Promise<ModelTurn> => {
    receivedInput = inputItems;
    return {
      output: [],
      outputText: "버전은 1.0.0이었습니다.",
    };
  };

  const executeTool = async (_call: ToolCall): Promise<string> => {
    throw new Error("Should not be called");
  };

  const result = await runAgent(turn2Messages, { callModel, executeTool });

  assert.equal(result.answer, "버전은 1.0.0이었습니다.");
  // Verify that turn 2's model call had the previous tool call and result in its input
  assert.equal(receivedInput.length, 5);
  assert.equal((receivedInput[1] as { type: string }).type, "function_call");
  assert.equal((receivedInput[2] as { type: string }).type, "function_call_output");
  assert.equal((receivedInput[2] as { output: string }).output, '{"name": "jeffy", "version": "1.0.0"}');
  assert.equal(
    (receivedInput[4] as { content: [{ text: string }] }).content[0].text,
    "버전이 몇이었지?",
  );
});
