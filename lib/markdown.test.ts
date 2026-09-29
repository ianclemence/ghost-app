import { describe, expect, test } from "bun:test";
import {
  boundedDiagramFallback,
  codeLabel,
  fenceLanguage,
  parseTaskMarker,
} from "./markdown";

describe("fenceLanguage", () => {
  test("takes the first token, lowercased", () => {
    expect(fenceLanguage("go")).toBe("go");
    expect(fenceLanguage("Go title=x")).toBe("go");
    expect(fenceLanguage("  javascript  ")).toBe("javascript");
  });
  test("blanks stay blank", () => {
    expect(fenceLanguage("")).toBe("");
    expect(fenceLanguage(null)).toBe("");
    expect(fenceLanguage(undefined)).toBe("");
  });
});

describe("codeLabel", () => {
  test("falls back to 'code' when unspecified", () => {
    expect(codeLabel("")).toBe("code");
    expect(codeLabel("sql")).toBe("sql");
  });
});

describe("parseTaskMarker", () => {
  test("open and completed tasks", () => {
    expect(parseTaskMarker("[ ] todo")).toEqual({ checked: false, rest: "todo" });
    expect(parseTaskMarker("[x] done")).toEqual({ checked: true, rest: "done" });
    expect(parseTaskMarker("[X] done")).toEqual({ checked: true, rest: "done" });
  });
  test("requires the separator space", () => {
    expect(parseTaskMarker("[x]done")).toBeNull();
  });
  test("ignores text that merely starts with a bracket", () => {
    expect(parseTaskMarker("[link](https://example.com)")).toBeNull();
    expect(parseTaskMarker("plain text")).toBeNull();
    expect(parseTaskMarker("")).toBeNull();
  });
});

describe("boundedDiagramFallback", () => {
  test("keeps short diagrams whole", () => {
    expect(boundedDiagramFallback("flowchart TD\n  A-->B")).toBe("flowchart TD\n  A-->B");
  });
  test("caps long diagrams and marks the cut", () => {
    const long = Array.from({ length: 40 }, (_, i) => `node${i}`).join("\n");
    const out = boundedDiagramFallback(long, 10);
    expect(out.split("\n").length).toBe(11);
    expect(out.endsWith("…")).toBe(true);
  });
});
