import * as fs from "node:fs/promises";
import * as path from "node:path";

export type ToolDefinition = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict: boolean;
};

export type ToolCall = {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
};

export function isToolCall(item: { type: string; [key: string]: unknown }): item is ToolCall {
  return (
    item.type === "function_call" &&
    typeof item.call_id === "string" &&
    typeof item.name === "string" &&
    typeof item.arguments === "string"
  );
}

async function readFileTool(args: unknown, workspaceDirectory: string): Promise<string> {
  if (
    !args ||
    typeof args !== "object" ||
    typeof (args as { path?: unknown }).path !== "string"
  ) {
    throw new Error("read_file requires a string path");
  }

  const requestedPath = (args as { path: string }).path;

  const workspaceRoot = await fs.realpath(workspaceDirectory);
  const targetPath = await fs.realpath(
    path.resolve(workspaceRoot, requestedPath),
  );

  const relativePath = path.relative(workspaceRoot, targetPath);
  const outsideWorkspace =
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath);

  if (outsideWorkspace) {
    throw new Error("Cannot read files outside the workspace");
  }

  return fs.readFile(targetPath, "utf8");
}

export function createToolCallingSystem(workspaceDirectory = process.cwd()) {
  const tools: ToolDefinition[] = [
    {
      type: "function",
      name: "read_file",
      description: "Read the UTF-8 text contents of a file in the current workspace.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path relative to the workspace root",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
      strict: true,
    },
  ];

  async function executeTool(call: ToolCall): Promise<string> {
    try {
      const args: unknown = JSON.parse(call.arguments);

      switch (call.name) {
        case "read_file":
          return await readFileTool(args, workspaceDirectory);

        default:
          throw new Error(`Unknown tool: ${call.name}`);
      }
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { tools, executeTool };
}
