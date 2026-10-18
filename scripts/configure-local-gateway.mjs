import { randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(projectRoot, ".env.local");
const wranglerPath = path.join(projectRoot, "node_modules", ".bin", "wrangler");
const baseUrl = process.argv[2];
const model = process.argv[3] ?? "gpt-6-luna";

if (!baseUrl) {
  throw new Error(
    "Usage: npm run gateway:configure-local -- https://WORKER.workers.dev/v1 [model]",
  );
}

const parsedBaseUrl = new URL(baseUrl);
if (parsedBaseUrl.protocol !== "https:" || !parsedBaseUrl.pathname.endsWith("/v1")) {
  throw new Error("Gateway base URL must use HTTPS and end with /v1");
}

const gatewayToken = randomBytes(32).toString("hex");
const secretResult = spawnSync(
  wranglerPath,
  ["secret", "put", "GATEWAY_TOKEN", "--config", "gateway/wrangler.jsonc"],
  {
    cwd: projectRoot,
    input: `${gatewayToken}\n`,
    stdio: ["pipe", "inherit", "inherit"],
  },
);

if (secretResult.status !== 0) {
  throw new Error("Failed to register GATEWAY_TOKEN with Cloudflare");
}

let contents = "";
try {
  contents = await readFile(envPath, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

function setVariable(source, name, value) {
  const line = `${name}=${JSON.stringify(value)}`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  if (pattern.test(source)) return source.replace(pattern, line);
  return `${source.trimEnd()}${source.trim() ? "\n" : ""}${line}\n`;
}

contents = setVariable(contents, "OPENAI_BASE_URL", parsedBaseUrl.href.replace(/\/$/, ""));
contents = setVariable(contents, "GATEWAY_TOKEN", gatewayToken);
contents = setVariable(contents, "OPENAI_MODEL", model);

await writeFile(envPath, contents, { encoding: "utf8", mode: 0o600 });
await chmod(envPath, 0o600);

console.log("Configured Cloudflare GATEWAY_TOKEN and local .env.local.");
