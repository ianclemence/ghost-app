import { beforeEach, describe, expect, mock, test } from "bun:test";

const asyncBacking = new Map<string, string>();

mock.module("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => asyncBacking.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      asyncBacking.set(k, v);
    },
    removeItem: async (k: string) => {
      asyncBacking.delete(k);
    },
  },
}));

const {
  clearOutbox,
  enqueueOutbox,
  isRetryableSendError,
  loadOutbox,
  makeOutboxId,
  removeOutboxEntry,
} = await import("./outbox");

beforeEach(async () => {
  asyncBacking.clear();
  await clearOutbox();
});

const entry = (content: string, id = `q-${content}`) => ({
  id,
  messageId: `temp-${content}`,
  content,
  sessionKey: "mobile:default",
  createdAt: Date.now(),
  attempts: 0,
});

describe("outbox queue", () => {
  test("empty outbox loads as []", async () => {
    expect(await loadOutbox()).toEqual([]);
  });

  test("enqueue preserves FIFO order", async () => {
    await enqueueOutbox(entry("first"));
    await enqueueOutbox(entry("second"));
    const loaded = await loadOutbox();
    expect(loaded.map((e) => e.content)).toEqual(["first", "second"]);
  });

  test("re-enqueue of same id replaces, never duplicates", async () => {
    await enqueueOutbox(entry("hello", "q-1"));
    await enqueueOutbox({ ...entry("hello!", "q-1") });
    const loaded = await loadOutbox();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].content).toEqual("hello!");
  });

  test("removeEntry drops only the named entry", async () => {
    await enqueueOutbox(entry("a", "q-a"));
    await enqueueOutbox(entry("b", "q-b"));
    await removeOutboxEntry("q-a");
    const loaded = await loadOutbox();
    expect(loaded.map((e) => e.id)).toEqual(["q-b"]);
  });

  test("corrupt storage loads as [] instead of throwing", async () => {
    asyncBacking.set("ghost:outbox", "not-json{{{");
    expect(await loadOutbox()).toEqual([]);
  });

  test("non-entry payloads are filtered", async () => {
    asyncBacking.set(
      "ghost:outbox",
      JSON.stringify([{ id: "q-x" }, "junk", 42, entry("ok", "q-ok")]),
    );
    const loaded = await loadOutbox();
    expect(loaded.map((e) => e.id)).toEqual(["q-ok"]);
  });

  test("queue caps at 50, oldest dropped", async () => {
    for (let i = 0; i < 55; i++) await enqueueOutbox(entry(`m${i}`, `q-${i}`));
    const loaded = await loadOutbox();
    expect(loaded).toHaveLength(50);
    expect(loaded[0].id).toEqual("q-5");
    expect(loaded[49].id).toEqual("q-54");
  });

  test("makeOutboxId is unique", () => {
    const ids = new Set([makeOutboxId(), makeOutboxId(), makeOutboxId()]);
    expect(ids.size).toEqual(3);
  });
});

describe("retryable errors", () => {
  test("network and timeout queue; everything else surfaces", () => {
    expect(isRetryableSendError("network")).toBe(true);
    expect(isRetryableSendError("timeout")).toBe(true);
    for (const kind of ["auth", "rate_limit", "provider", "empty_stream", "interrupted"] as const) {
      expect(isRetryableSendError(kind)).toBe(false);
    }
  });
});
