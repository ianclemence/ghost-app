import { describe, expect, test } from "bun:test";
import { createChunkBatcher } from "./chunkBatch";

function fake() {
  const q: { id: number; fn: () => void }[] = [];
  let n = 0;
  return {
    timers: { set: (fn: () => void) => { q.push({ id: ++n, fn }); return n; }, clear: (t: unknown) => { const i = q.findIndex((x) => x.id === t); if (i >= 0) q.splice(i, 1); } },
    tick: () => q.splice(0).forEach((x) => x.fn()),
    pending: () => q.length,
  };
}

describe("chunk batcher", () => {
  test("many pieces in one interval are one hand-over, in order", () => {
    const f = fake();
    const out: string[] = [];
    const b = createChunkBatcher((t) => out.push(t), 50, f.timers);
    "hello world".split("").forEach((c) => b.push(c));
    expect(out).toEqual([]);
    f.tick();
    expect(out).toEqual(["hello world"]);
  });

  test("flush hands over now and leaves nothing for the timer", () => {
    const f = fake();
    const out: string[] = [];
    const b = createChunkBatcher((t) => out.push(t), 50, f.timers);
    b.push("a"); b.push("b");
    b.flush();
    expect(out).toEqual(["ab"]);
    expect(f.pending()).toBe(0);
    f.tick();
    expect(out).toEqual(["ab"]);
  });

  test("cancel drops what is gathered", () => {
    const f = fake();
    const out: string[] = [];
    const b = createChunkBatcher((t) => out.push(t), 50, f.timers);
    b.push("x");
    b.cancel();
    f.tick();
    b.flush();
    expect(out).toEqual([]);
  });
});
