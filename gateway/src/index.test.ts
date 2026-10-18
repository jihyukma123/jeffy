import assert from "node:assert/strict";
import test from "node:test";
import worker, { type Env } from "./index.js";

const env: Env = {
  OPENAI_API_KEY: "upstream-secret",
  GATEWAY_TOKEN: "local-gateway-token",
};

test("rejects requests without the gateway token", async () => {
  const response = await worker.fetch(
    new Request("https://gateway.example/v1/responses", { method: "POST" }),
    env,
  );

  assert.equal(response.status, 401);
});

test("rejects paths outside the allowlist", async () => {
  const response = await worker.fetch(
    new Request("https://gateway.example/v1/files", {
      method: "POST",
      headers: { authorization: "Bearer local-gateway-token" },
    }),
    env,
  );

  assert.equal(response.status, 404);
});

test("replaces auth and forwards an SSE stream without buffering", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  let forwardedRequest: Request | undefined;
  globalThis.fetch = async (input, init) => {
    forwardedRequest = new Request(input, {
      ...init,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: first\n\n"));
        controller.enqueue(new TextEncoder().encode("data: second\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "x-request-id": "request-123",
        "set-cookie": "must-not-leak=true",
      },
    });
  };

  const response = await worker.fetch(
    new Request("https://gateway.example/v1/responses?example=1", {
      method: "POST",
      headers: {
        authorization: "Bearer local-gateway-token",
        "content-type": "application/json",
        "x-unsafe-header": "do-not-forward",
      },
      body: JSON.stringify({ model: "test-model", input: "hello" }),
    }),
    env,
  );

  assert.ok(forwardedRequest);
  assert.equal(
    forwardedRequest.url,
    "https://api.openai.com/v1/responses?example=1",
  );
  assert.equal(
    forwardedRequest.headers.get("authorization"),
    "Bearer upstream-secret",
  );
  assert.equal(forwardedRequest.headers.get("x-unsafe-header"), null);
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  assert.equal(response.headers.get("x-request-id"), "request-123");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(await response.text(), "data: first\n\ndata: second\n\n");
});
