import { describe, expect, test } from "bun:test";
import {
  MERMAID_CDN_URL,
  MERMAID_MAX_SOURCE_CHARS,
  buildMermaidHtml,
  isMermaidLanguage,
  mermaidSourceFits,
} from "./mermaid";

describe("isMermaidLanguage", () => {
  test("accepts the fence info string", () => {
    expect(isMermaidLanguage("mermaid")).toBe(true);
    expect(isMermaidLanguage("Mermaid")).toBe(true);
    expect(isMermaidLanguage("mermaid title=flow")).toBe(true);
  });
  test("rejects other languages and blanks", () => {
    expect(isMermaidLanguage("go")).toBe(false);
    expect(isMermaidLanguage("")).toBe(false);
    expect(isMermaidLanguage(null)).toBe(false);
    expect(isMermaidLanguage(undefined)).toBe(false);
    expect(isMermaidLanguage("mermaidish")).toBe(false);
  });
});

describe("mermaidSourceFits", () => {
  test("accepts ordinary diagrams", () => {
    expect(mermaidSourceFits("flowchart TD\n  A-->B")).toBe(true);
  });
  test("rejects oversized payloads", () => {
    const huge = "A-->B\n".repeat(MERMAID_MAX_SOURCE_CHARS);
    expect(mermaidSourceFits(huge)).toBe(false);
  });
});

describe("buildMermaidHtml security", () => {
  const html = buildMermaidHtml("flowchart TD\n  A-->B");

  test("locks the renderer to strict security and no HTML labels", () => {
    expect(html).toContain("securityLevel:'strict'");
    expect(html).toContain("htmlLabels:false");
  });

  test("uses the pinned Mermaid runtime", () => {
    expect(MERMAID_CDN_URL).toContain("mermaid@11");
    expect(html).toContain(MERMAID_CDN_URL);
  });

  test("escapes template-literal breakouts in diagram source", () => {
    const evil = "A[`${alert(1)}`] --> B";
    const out = buildMermaidHtml(evil);
    // The injected backtick and ${ must not survive as live script syntax.
    expect(out).not.toContain("`${alert(1)}`");
    expect(out).toContain("\\`");
  });

  test("escapes backslashes so escapes cannot be forged", () => {
    const out = buildMermaidHtml("A[\\`] --> B");
    expect(out).toContain("\\\\");
  });

  test("does not enable clickable diagram links", () => {
    expect(html).not.toContain("securityLevel:'loose'");
    expect(html).not.toContain("securityLevel:'antiscript'");
  });

  test("reports height and errors back to the host", () => {
    expect(html).toContain("postMessage");
    expect(html).toContain("type:'height'");
    expect(html).toContain("type:'error'");
  });
});
