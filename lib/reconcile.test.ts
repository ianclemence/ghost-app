import { describe, expect, test } from "bun:test";
import { normalizeHistoryTimestamps, reconcileHistory } from "./reconcile";
import type { Message } from "./ghostApi";
import type { ExtendedMessage } from "./store";

const msg = (over: Partial<ExtendedMessage> & { id: string }): ExtendedMessage => ({
  role: "assistant",
  content: "",
  timestamp: 1_000_000,
  ...over,
});

const srv = (over: Partial<Message> & { id: string }): Message => ({
  role: "assistant",
  content: "",
  timestamp: 1_000_000,
  ...over,
});

describe("reconcileHistory", () => {
  test("same id keeps the local copy (no swap)", () => {
    const local = [msg({ id: "abc", content: "streamed text" })];
    const server = [srv({ id: "abc", content: "streamed text plus hidden tail" })];
    const out = reconcileHistory(local, server);
    expect(out).toHaveLength(1);
    expect(out[0].content).toBe("streamed text");
  });

  test("temp ids match server rows by proximity + containment", () => {
    const local = [msg({ id: "temp-1", content: "Hello there" })];
    const server = [srv({ id: "srv-9", content: "Hello there" })];
    const out = reconcileHistory(local, server);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("temp-1");
  });

  test("quarantine-hidden content still matches (subset)", () => {
    const local = [msg({ id: "temp-2", content: "The answer is 42." })];
    const server = [
      srv({ id: "srv-8", content: "The answer is 42.\n[debug] skill notes" }),
    ];
    const out = reconcileHistory(local, server);
    expect(out).toHaveLength(1);
    expect(out[0].content).toBe("The answer is 42.");
  });

  test("genuinely new server rows append in timestamp order", () => {
    const local = [msg({ id: "temp-3", content: "hi", timestamp: 2_000_000 })];
    const server = [
      srv({ id: "srv-7", content: "hi", timestamp: 2_000_001 }),
      srv({ id: "srv-8", content: "reminder fired", timestamp: 2_100_000 }),
    ];
    const out = reconcileHistory(local, server);
    expect(out.map((m) => m.id)).toEqual(["temp-3", "srv-8"]);
  });

  test("unmatched local rows survive (queued, just-sent)", () => {
    const local = [msg({ id: "temp-4", role: "user", content: "offline msg" })];
    const out = reconcileHistory(local, []);
    expect(out).toHaveLength(1);
  });

  test("different content close in time does not merge", () => {
    const local = [msg({ id: "temp-5", content: "first answer" })];
    const server = [srv({ id: "srv-6", content: "completely different" })];
    const out = reconcileHistory(local, server);
    expect(out).toHaveLength(2);
  });
});

describe("multi-iteration turns", () => {
  test("concatenated bubble absorbs all its server rows, no duplicates", () => {
    const both =
      "Nice to meet you, Ian. I'll remember that.Got it, Ian — your name is saved.";
    const local = [
      msg({ id: "temp-u", role: "user", content: "My name is Ian" }),
      msg({ id: "msg-a", content: both }),
    ];
    const server = [
      srv({ id: "srv-u", role: "user", content: "My name is Ian" }),
      srv({ id: "srv-a1", content: "Nice to meet you, Ian. I'll remember that." }),
      srv({ id: "srv-a2", content: "Got it, Ian — your name is saved." }),
    ];
    const out = reconcileHistory(local, server);
    expect(out).toHaveLength(2);
    expect(out[1].id).toBe("msg-a");
    expect(out[1].content).toBe(both);
  });

  test("two identical rapid turns stay separate", () => {
    const local = [
      msg({ id: "msg-1", content: "ok", timestamp: 1_000_000 }),
      msg({ id: "temp-2", content: "ok", timestamp: 1_005_000 }),
    ];
    const server = [
      srv({ id: "srv-1", content: "ok", timestamp: 1_000_100 }),
      srv({ id: "srv-2", content: "ok", timestamp: 1_005_100 }),
    ];
    const out = reconcileHistory(local, server);
    expect(out).toHaveLength(2);
    expect(out.map((m) => m.id)).toEqual(["msg-1", "temp-2"]);
  });
});

describe("reconcileHistory with real units", () => {
  // The Pod reports history timestamps in Unix seconds; messages created on
  // the phone carry Date.now() milliseconds. Normalized at the boundary, a
  // just-sent message must reconcile with its server copy, not duplicate.
  test("server seconds normalize to ms and match the local send", () => {
    const sentAt = 1_790_000_000_123; // ms
    const local = [
      msg({ id: "temp-u", role: "user", content: "hi", timestamp: sentAt }),
      msg({ id: "temp-a", content: "hello", timestamp: sentAt + 50 }),
    ];
    const server = normalizeHistoryTimestamps([
      srv({ id: "11", role: "user", content: "hi", timestamp: Math.floor(sentAt / 1000) }),
      srv({ id: "12", content: "hello", timestamp: Math.floor(sentAt / 1000) + 2 }),
    ]);
    const out = reconcileHistory(local, server);
    expect(out.map((m) => m.id)).toEqual(["temp-u", "temp-a"]);
  });

  test("normalization leaves millisecond timestamps alone", () => {
    const out = normalizeHistoryTimestamps([srv({ id: "1", timestamp: 1_790_000_000_123 })]);
    expect(out[0].timestamp).toBe(1_790_000_000_123);
  });
});

describe("a reply cut off mid-stream", () => {
  const server = (id: string, content: string, ts = 1_000): Message => ({ id, role: "assistant", content, timestamp: ts }) as Message;

  test("is replaced by the Pod's full copy", () => {
    const local: ExtendedMessage[] = [
      { id: "msg-1", role: "assistant", content: "1. Apples\n", timestamp: 1_000, status: "completed", incomplete: true },
    ];
    const out = reconcileHistory(local, [server("s1", "1. Apples\n2. Bananas\n3. Cherries")]);
    expect(out).toHaveLength(1);
    expect(out[0].content).toBe("1. Apples\n2. Bananas\n3. Cherries");
    expect(out[0].incomplete).toBe(false);
  });

  test("stays as it is while the Pod has no more than the phone does", () => {
    const local: ExtendedMessage[] = [
      { id: "msg-1", role: "assistant", content: "1. Apples\n", timestamp: 1_000, status: "completed", incomplete: true },
    ];
    const out = reconcileHistory(local, [server("s1", "1. Apples\n")]);
    expect(out[0].content).toBe("1. Apples\n");
    expect(out[0].incomplete).toBe(true);
  });

  test("a complete reply is never rewritten, even if the Pod's copy is longer", () => {
    const local: ExtendedMessage[] = [
      { id: "msg-1", role: "assistant", content: "Hello", timestamp: 1_000, status: "completed" },
    ];
    const out = reconcileHistory(local, [server("s1", "Hello there, with hidden machinery")]);
    expect(out[0].content).toBe("Hello");
  });
});
