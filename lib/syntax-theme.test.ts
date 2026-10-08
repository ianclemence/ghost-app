import { describe, expect, test } from "bun:test";
import { CODE_GROUND, CODE_INK, THEME_COLORS, diffRowTint, syntaxStyle } from "./syntax-theme";

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("the code theme", () => {
  test("every colour reads on the block's ground (WCAG AA for text)", () => {
    for (const c of [...THEME_COLORS, CODE_INK]) {
      expect(contrast(c, CODE_GROUND)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("the main kinds are told apart by colour", () => {
    const kinds = ["keyword", "string", "number", "title.function", "type", "built_in", "property", "tag", "comment", "operator"];
    const colours = kinds.map((k) => syntaxStyle(k)!.color);
    expect(new Set(colours).size).toBe(kinds.length);
  });

  test("comments are italic and quieter than code", () => {
    expect(syntaxStyle("comment")?.italic).toBe(true);
    expect(lum(syntaxStyle("comment")!.color)).toBeLessThan(lum(CODE_INK));
  });

  test("output kinds exist, and a diff has tints for both directions", () => {
    for (const k of ["error", "success", "path", "url"]) expect(syntaxStyle(k)).not.toBeNull();
    expect(diffRowTint("addition")).not.toBe(diffRowTint("deletion"));
  });
});
