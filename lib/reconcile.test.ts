import { describe, expect, test } from "bun:test";
import { reconcileHistory } from "./reconcile";
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
