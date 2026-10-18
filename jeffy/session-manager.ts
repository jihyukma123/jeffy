import * as fs from "node:fs/promises";
import * as path from "node:path";

export type ConversationMessage = {
  type: "user" | "assistant";
  text: string;
};

export function createSessionManager(
  conversationsDirectory = path.join(process.cwd(), "conversations"),
) {
  function sessionPath(sessionId: number): string {
    return path.join(conversationsDirectory, `${sessionId}.json`);
  }

  async function createNewSession(): Promise<{ id: number; messages: ConversationMessage[] }> {
    await fs.mkdir(conversationsDirectory, { recursive: true });
    const files = await fs.readdir(conversationsDirectory);
    const existingIds = files
      .map((file) => /^([1-9]\d*)\.json$/.exec(file)?.[1])
      .filter((id): id is string => id !== undefined)
      .map(Number);
    const id = existingIds.length === 0 ? 1 : Math.max(...existingIds) + 1;
    const messages: ConversationMessage[] = [];

    await saveSession(id, messages);
    return { id, messages };
  }

  async function loadSession(sessionIdText: string): Promise<{ id: number; messages: ConversationMessage[] }> {
    if (!/^[1-9]\d*$/.test(sessionIdText)) {
      throw new Error("세션 ID는 1 이상의 정수여야 합니다.");
    }

    const id = Number(sessionIdText);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await fs.readFile(sessionPath(id), "utf8"));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") throw new Error(`${id}번 세션을 찾을 수 없습니다.`);
      throw error;
    }

    if (!Array.isArray(parsed) || !parsed.every(isConversationMessage)) {
      throw new Error(`${id}.json의 대화 형식이 올바르지 않습니다.`);
    }
    return { id, messages: parsed };
  }

  function isConversationMessage(value: unknown): value is ConversationMessage {
    if (!value || typeof value !== "object") return false;
    const message = value as Record<string, unknown>;
    return (message.type === "user" || message.type === "assistant") && typeof message.text === "string";
  }

  async function saveSession(sessionId: number, messages: ConversationMessage[]): Promise<void> {
    await fs.mkdir(conversationsDirectory, { recursive: true });
    await fs.writeFile(sessionPath(sessionId), `${JSON.stringify(messages, null, 2)}\n`, "utf8");
  }

  return { createNewSession, loadSession, saveSession };
}
