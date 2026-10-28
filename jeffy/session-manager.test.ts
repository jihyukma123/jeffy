import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import {
  createSessionManager,
  type ConversationMessage,
} from "./session-manager.js";

test("sessionManager saves and loads multi-turn traces including tool calls and results", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "jeffy-session-test-"));

  try {
    const sessionManager = createSessionManager(tempDir);
    const newSession = await sessionManager.createNewSession();
    assert.equal(newSession.id, 1);

    const messages: ConversationMessage[] = [
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
        output: '{"name":"jeffy"}',
      },
      { type: "assistant", text: "프로젝트 이름은 jeffy입니다." },
      { type: "user", text: "정말이야?" },
      { type: "assistant", text: "네, 맞습니다." },
    ];

    await sessionManager.saveSession(newSession.id, messages);

    const loadedSession = await sessionManager.loadSession("1");
    assert.equal(loadedSession.id, 1);
    assert.deepEqual(loadedSession.messages, messages);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
