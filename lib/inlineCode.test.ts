import { describe, expect, test } from "bun:test";
import { INLINE_CODE, canPillInlineCode, inlinePillWidth } from "./inlineCode";

describe("inline code pill", () => {
  test("short, plain, one-line snippets are pills", () => {
    for (const c of ["ls", "npm run build", "feature/gumzo", "uname -a | head -c 500"]) expect(canPillInlineCode(c)).toBe(true);
  });

  test("long, multi-line, empty or non-ASCII snippets wrap as text instead", () => {
    expect(canPillInlineCode("")).toBe(false);
    expect(canPillInlineCode("x".repeat(INLINE_CODE.maxChars + 1))).toBe(false);
    expect(canPillInlineCode("a\nb")).toBe(false);
    expect(canPillInlineCode("naïve")).toBe(false);
    expect(canPillInlineCode("日本語")).toBe(false);
    expect(canPillInlineCode("ls: cannot access '/nonexistent-dir': No such file or directory")).toBe(false);
  });

  test("the width grows with the text and never undershoots a monospace face", () => {
    const w = (n: number) => inlinePillWidth("x".repeat(n));
    expect(w(10)).toBeGreaterThan(w(5));
    // The text alone, at the exact advance, must fit inside the pill's inner width.
    for (const n of [1, 2, 13, 36]) {
      const exact = n * INLINE_CODE.fontSize * INLINE_CODE.advance;
      expect(w(n) - INLINE_CODE.padX * 2 - 2).toBeGreaterThanOrEqual(exact);
    }
  });
});
