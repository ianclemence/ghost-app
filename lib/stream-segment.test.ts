import { describe, expect, test } from "bun:test";
const { applyStreamEvent } = await import("./ghostApi");

function collect(events: any[]): string {
  const session: { fullText: string; needsBreak?: boolean } = { fullText: "" };
  const chunks: string[] = [];
  const opts: any = { onChunk: (c: string) => chunks.push(c), onDone: () => {} };
  for (const ev of events) applyStreamEvent(ev, session, opts, "sanitized");
  return session.fullText;
}

describe("applyStreamEvent segment separation", () => {
  test("joins a preamble and post-tool answer with a paragraph break", () => {
    const out = collect([
      { kind: "text", text: "I'll check that." },
      { kind: "tool", tool: "search", label: "Searching" },
      { kind: "text", text: "Here's what I found." },
    ]);
    expect(out).toBe("I'll check that.\n\nHere's what I found.");
  });

  test("does not insert a break between contiguous chunks (no tool)", () => {
    const out = collect([
      { kind: "text", text: "Hello " },
      { kind: "text", text: "world" },
    ]);
    expect(out).toBe("Hello world");
  });

  test("never doubles a break the model already emitted", () => {
    const out = collect([
      { kind: "text", text: "First.\n\n" },
      { kind: "tool", tool: "x", label: "x" },
      { kind: "text", text: "Second." },
    ]);
    expect(out).toBe("First.\n\nSecond.");
  });

  test("tool with no following text leaves the stream unchanged", () => {
    const out = collect([
      { kind: "text", text: "Done." },
      { kind: "tool", tool: "x", label: "x" },
    ]);
    expect(out).toBe("Done.");
  });
});
