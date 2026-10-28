import assert from "node:assert/strict";
import test from "node:test";
import { createLlmClient } from "./llm-client.js";
import type { ToolDefinition } from "./tool-calling.js";

const tools: ToolDefinition[] = [
  {
    type: "function",
    name: "read_file",
    description: "Read a file.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
      },
      required: ["path"],
      additionalProperties: false,
    },
    strict: true,
  },
];

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(body, {
    headers: { "content-type": "text/event-stream" },
  });
}

test("sends a Responses request and parses SSE across chunk boundaries", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  let capturedRequest: Request | undefined;
  const completedItem = {
    type: "message",
    id: "message-1",
    role: "assistant",
    content: [{ type: "output_text", text: "안녕하세요" }],
  };
  const payload = [
    `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "안녕" })}\n\n`,
    `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "하세요" })}\n\n`,
    `data: ${JSON.stringify({ type: "response.output_item.done", item: completedItem })}\n\n`,
    `data: ${JSON.stringify({ type: "response.completed", response: { output: [] } })}\n\n`,
    "data: [DONE]\n\n",
  ].join("");

  globalThis.fetch = async (input, init) => {
    capturedRequest = new Request(input, init);
    return streamResponse([
      payload.slice(0, 19),
      payload.slice(19, 73),
      payload.slice(73),
    ]);
  };

  const callModel = createLlmClient(
    {
      baseUrl: "https://gateway.example/v1///",
      gatewayToken: "gateway-token",
      model: "test-model",
      instructions: "테스트 지침",
    },
    tools,
  );
  const inputItems = [{ role: "user", content: "hello" }];

  const result = await callModel(inputItems);

  const request = capturedRequest;
  assert.ok(request);
  assert.equal(request.url, "https://gateway.example/v1/responses");
  assert.equal(request.method, "POST");
  assert.equal(request.headers.get("authorization"), "Bearer gateway-token");
  assert.equal(request.headers.get("accept"), "text/event-stream");
  assert.deepEqual(await request.json(), {
    model: "test-model",
    store: false,
    stream: true,
    instructions: "테스트 지침",
    tools,
    input: inputItems,
  });
  assert.deepEqual(result, {
    output: [completedItem],
    outputText: "안녕하세요",
  });
});

test("uses response.completed output when item events are absent", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  const toolCall = {
    type: "function_call" as const,
    call_id: "call-1",
    name: "read_file",
    arguments: "{\"path\":\"README.MD\"}",
  };

  globalThis.fetch = async () => streamResponse([
    `data: ${JSON.stringify({
      type: "response.completed",
      response: { output: [toolCall] },
    })}\n\n`,
  ]);

  const callModel = createLlmClient(
    {
      baseUrl: "https://gateway.example/v1",
      gatewayToken: "gateway-token",
      model: "test-model",
    },
    tools,
  );

  assert.deepEqual(await callModel([]), {
    output: [toolCall],
    outputText: "",
  });
});

test("reports unsuccessful HTTP responses", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => new Response("upstream unavailable", {
    status: 503,
  });

  const callModel = createLlmClient(
    {
      baseUrl: "https://gateway.example/v1",
      gatewayToken: "gateway-token",
      model: "test-model",
    },
    tools,
  );

  await assert.rejects(
    callModel([]),
    /Request failed \(503\): upstream unavailable/,
  );
});

test("reports model failure events", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => streamResponse([
    `data: ${JSON.stringify({
      type: "error",
      error: { message: "model overloaded" },
    })}\n\n`,
  ]);

  const callModel = createLlmClient(
    {
      baseUrl: "https://gateway.example/v1",
      gatewayToken: "gateway-token",
      model: "test-model",
    },
    tools,
  );

  await assert.rejects(
    callModel([]),
    /Model response failed: model overloaded/,
  );
});

test("rejects streams without recognized output", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => streamResponse([
    `data: ${JSON.stringify({ type: "response.created" })}\n\n`,
    "data: [DONE]\n\n",
  ]);

  const callModel = createLlmClient(
    {
      baseUrl: "https://gateway.example/v1",
      gatewayToken: "gateway-token",
      model: "test-model",
    },
    tools,
  );

  await assert.rejects(
    callModel([]),
    /Model returned no recognized output.*response\.created/,
  );
});
