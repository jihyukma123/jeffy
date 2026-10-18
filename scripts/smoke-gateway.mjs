const baseUrl = process.env.OPENAI_BASE_URL?.replace(/\/+$/, "");
const gatewayToken = process.env.GATEWAY_TOKEN;
const model = process.env.OPENAI_MODEL;

if (!baseUrl || !gatewayToken || !model) {
  throw new Error("OPENAI_BASE_URL, GATEWAY_TOKEN, and OPENAI_MODEL are required");
}

const response = await fetch(`${baseUrl}/responses`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${gatewayToken}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  },
  body: JSON.stringify({
    model,
    input: "Reply with exactly: gateway-ok",
    reasoning: { effort: "none" },
    max_output_tokens: 32,
    stream: true,
    store: false,
  }),
});

if (!response.ok) {
  throw new Error(`Gateway request failed (${response.status}): ${await response.text()}`);
}

if (!response.body) throw new Error("Gateway returned no response body");

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
let outputText = "";
let eventCount = 0;
let completed = false;

function handleLine(line) {
  if (!line.startsWith("data:")) return;
  const data = line.slice(5).trim();
  if (!data || data === "[DONE]") return;

  const event = JSON.parse(data);
  eventCount += 1;

  if (event.type === "response.output_text.delta") outputText += event.delta;
  if (event.type === "response.completed") completed = true;
  if (event.type === "error" || event.type === "response.failed") {
    throw new Error(event.error?.message ?? event.message ?? "OpenAI stream failed");
  }
}

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) handleLine(line);
}

buffer += decoder.decode();
for (const line of buffer.split("\n")) handleLine(line);

if (!completed) throw new Error("Stream ended without response.completed");
if (outputText.trim() !== "gateway-ok") {
  throw new Error(`Unexpected model output: ${JSON.stringify(outputText.trim())}`);
}

console.log(`Gateway streaming OK: ${eventCount} SSE events, output=${outputText.trim()}`);
