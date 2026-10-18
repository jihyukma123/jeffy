export interface Env {
  OPENAI_API_KEY: string;
  GATEWAY_TOKEN: string;
}

const ALLOWED_ENDPOINTS = new Set([
  "POST /v1/responses",
  "POST /v1/chat/completions",
  "POST /v1/embeddings",
]);

const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "content-type",
  "idempotency-key",
  "openai-beta",
  "openai-organization",
  "openai-project",
  "x-client-request-id",
] as const;

const FORWARDED_RESPONSE_HEADERS = new Set([
  "content-type",
  "openai-organization",
  "openai-processing-ms",
  "openai-version",
  "x-request-id",
]);

function jsonError(status: number, message: string): Response {
  return Response.json(
    { error: { message, type: "gateway_error" } },
    { status, headers: { "cache-control": "no-store" } },
  );
}

function tokensMatch(actual: string, expected: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(actual);
  const right = encoder.encode(expected);
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;

  for (let index = 0; index < length; index++) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return difference === 0;
}

function isAuthorized(request: Request, token: string): boolean {
  const authorization = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!authorization.startsWith(prefix)) return false;
  return tokensMatch(authorization.slice(prefix.length), token);
}

function upstreamHeaders(request: Request, apiKey: string): Headers {
  const headers = new Headers();

  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  headers.set("authorization", `Bearer ${apiKey}`);
  return headers;
}

function clientHeaders(upstream: Response): Headers {
  const headers = new Headers();

  for (const [name, value] of upstream.headers) {
    if (
      FORWARDED_RESPONSE_HEADERS.has(name.toLowerCase()) ||
      name.toLowerCase().startsWith("x-ratelimit-")
    ) {
      headers.set(name, value);
    }
  }

  headers.set("cache-control", "no-store");
  return headers;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/healthz") {
      return Response.json({ ok: true });
    }

    if (!env.OPENAI_API_KEY || !env.GATEWAY_TOKEN) {
      return jsonError(500, "Gateway secrets are not configured");
    }

    if (!isAuthorized(request, env.GATEWAY_TOKEN)) {
      return jsonError(401, "Unauthorized");
    }

    if (!ALLOWED_ENDPOINTS.has(`${request.method} ${url.pathname}`)) {
      return jsonError(404, "Endpoint not allowed");
    }

    const upstreamUrl = new URL(url.pathname + url.search, "https://api.openai.com");
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers: upstreamHeaders(request, env.OPENAI_API_KEY),
      body: request.body,
      redirect: "manual",
    });

    // Passing the ReadableStream through without reading it preserves SSE streaming.
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: clientHeaders(upstream),
    });
  },
};
