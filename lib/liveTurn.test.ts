import { describe, expect, test } from "bun:test";
import { applySay, applyLiveEffect, liveEffect, sayEffect, liveReplyId, liveUserId, type LiveStore } from "./liveTurn";
import type { ExtendedMessage } from "./store";

const ctx = { session: "main", ownRequestId: "m-own" };

function fakeStore(): { store: LiveStore; msgs: ExtendedMessage[]; tool: () => string | null } {
  const msgs: ExtendedMessage[] = [];
  let tool: string | null = null;
  return {
    msgs,
    tool: () => tool,
    store: {
      messages: () => msgs,
      appendMessage: (m) => { msgs.push(m); },
      updateMessage: (id, p) => { const i = msgs.findIndex((m) => m.id === id); if (i >= 0) msgs[i] = { ...msgs[i], ...p }; },
      removeMessage: (id) => { const i = msgs.findIndex((m) => m.id === id); if (i >= 0) msgs.splice(i, 1); },
      setToolActivity: (l) => { tool = l; },
    },
  };
}

describe("following a reply another surface started", () => {
  test("ignores anything that is not a stream frame for this conversation", () => {
    expect(liveEffect({ type: "assistant_message" }, ctx)).toBeNull();
    expect(liveEffect({ type: "stream_delta", session_id: "other", request_id: "r1", delta: "x" }, ctx)).toBeNull();
    expect(liveEffect(null, ctx)).toBeNull();
    expect(liveEffect("nope", ctx)).toBeNull();
  });

  test("never shows this device its own reply a second time", () => {
    expect(liveEffect({ type: "stream_delta", session_id: "main", request_id: "m-own", delta: "x" }, ctx)).toBeNull();
    expect(liveEffect({ type: "stream_start", session_id: "main", request_id: "m-own", user_content: "hi" }, ctx)).toBeNull();
  });

  test("a message from the terminal appears, grows, and is replaced by the saved reply", () => {
    const { store, msgs, tool } = fakeStore();
    const frames = [
      { type: "stream_start", session_id: "main", request_id: "cli-1", origin: "cli", user_content: "explain boot" },
      { type: "stream_tool", session_id: "main", request_id: "cli-1", tool: "Searching the web" },
      { type: "stream_delta", session_id: "main", request_id: "cli-1", delta: "First " },
      { type: "stream_delta", session_id: "main", request_id: "cli-1", delta: "part." },
    ];
    for (const f of frames) {
      const e = liveEffect(f, ctx);
      expect(e).not.toBeNull();
      expect(applyLiveEffect(e!, store, 1000)).toBe(false);
    }
    expect(msgs.map((m) => [m.id, m.role, m.content])).toEqual([
      [liveUserId("cli-1"), "user", "explain boot"],
      [liveReplyId("cli-1"), "assistant", "First part."],
    ]);
    expect(msgs[1].status).toBe("streaming");
    expect(tool()).toBe("Searching the web");

    const end = liveEffect({ type: "stream_end", session_id: "main", request_id: "cli-1", text: "First part. Done.", outcome: "success" }, ctx);
    expect(applyLiveEffect(end!, store, 2000)).toBe(true);
    expect(msgs[1].content).toBe("First part. Done.");
    expect(msgs[1].status).toBe("completed");
    expect(tool()).toBeNull();
  });

  test("opening the app halfway through shows what was written so far, then the rest", () => {
    const { store, msgs } = fakeStore();
    const snap = liveEffect({ type: "stream_snapshot", session_id: "main", request_id: "cli-2", user_content: "q", text: "Half of it. ", tool: "Reading" }, ctx);
    applyLiveEffect(snap!, store);
    applyLiveEffect(liveEffect({ type: "stream_delta", session_id: "main", request_id: "cli-2", delta: "The rest." }, ctx)!, store);
    expect(msgs.find((m) => m.role === "assistant")!.content).toBe("Half of it. The rest.");
    // A repeated snapshot (reconnect) replaces rather than duplicates.
    applyLiveEffect(liveEffect({ type: "stream_snapshot", session_id: "main", request_id: "cli-2", user_content: "q", text: "Half of it. The rest. More." }, ctx)!, store);
    expect(msgs.filter((m) => m.role === "assistant")).toHaveLength(1);
    expect(msgs.filter((m) => m.role === "user")).toHaveLength(1);
    expect(msgs.find((m) => m.role === "assistant")!.content).toBe("Half of it. The rest. More.");
  });

  test("a reply that failed leaves nothing half-written behind", () => {
    const { store, msgs } = fakeStore();
    applyLiveEffect(liveEffect({ type: "stream_delta", session_id: "main", request_id: "cli-3", delta: "partial" }, ctx)!, store);
    const reconcile = applyLiveEffect(liveEffect({ type: "stream_end", session_id: "main", request_id: "cli-3", text: "", outcome: "failed" }, ctx)!, store);
    expect(reconcile).toBe(true);
    expect(msgs.find((m) => m.id === liveReplyId("cli-3"))).toBeUndefined();
  });
});

describe("Ghost speaking first", () => {
  test("a reminder joins the thread, labelled", () => {
    const e = sayEffect({ type: "assistant_message", session_id: "main", content: "Reminder: stretch.", kind: "reminder", metadata: { origin: "ghost", reminder: true } }, { session: "main" }, 5);
    expect(e).toEqual({ id: "say-5-18", text: "Reminder: stretch.", kind: "reminder" });
    const { store, msgs } = fakeStore();
    expect(applySay(e!, store, 100)).toBe(true);
    expect(msgs[0]).toMatchObject({ role: "assistant", content: "Reminder: stretch.", kind: "reminder", status: "completed" });
  });

  test("an alert, notice and routine result are told apart", () => {
    for (const kind of ["alert", "notice", "routine"] as const) {
      const e = sayEffect({ type: "assistant_message", session_id: "main", content: "x", kind }, { session: "main" });
      expect(e?.kind).toBe(kind);
    }
  });

  test("a message Ghost started without a kind is still shown, unlabelled", () => {
    const e = sayEffect({ type: "assistant_message", session_id: "main", content: "Hello", metadata: { origin: "ghost" } }, { session: "main" });
    expect(e?.kind).toBeNull();
  });

  test("a reply to a turn is not treated as Ghost speaking first", () => {
    expect(sayEffect({ type: "assistant_message", session_id: "main", content: "pong", metadata: { request_id: "m-1" } }, { session: "main" })).toBeNull();
  });

  test("other conversations and empty messages are ignored", () => {
    expect(sayEffect({ type: "assistant_message", session_id: "side", content: "x", kind: "notice" }, { session: "main" })).toBeNull();
    expect(sayEffect({ type: "assistant_message", session_id: "main", content: "  ", kind: "notice" }, { session: "main" })).toBeNull();
    expect(sayEffect({ type: "stream_delta", session_id: "main", content: "x", kind: "notice" }, { session: "main" })).toBeNull();
  });
});
