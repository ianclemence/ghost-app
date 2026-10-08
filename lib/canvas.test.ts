import { describe, expect, test } from "bun:test";
import {
  withAlpha,
  CANVAS_MAX_CHARS,
  buildCanvasDocument,
  canvasCsp,
  canvasInfos,
  canvasVersions,
  changeStarter,
  documentFromFence,
  fixPrompt,
  inlineHeight,
  isCanvasArtifact,
  isRunnableFence,
  parseCanvasMessage,
} from "./canvas";
import type { Artifact } from "./ghostApi";

const art = (id: string, title: string, at: string, path = `canvas/${title}-v1.html`, over: Partial<Artifact> = {}): Artifact => ({
  id, kind: "file", title, path, state: "available", actions: [], created_at: at, ...over,
});

describe("the sandbox document", () => {
  test("the policy and bridge come before anything of the page's own, in a full document", () => {
    const doc = buildCanvasDocument(`<!doctype html><html><head><title>t</title><script>alert(1)</script></head><body>hi</body></html>`)!;
    const csp = doc.indexOf("Content-Security-Policy");
    expect(csp).toBeGreaterThan(-1);
    expect(csp).toBeLessThan(doc.indexOf("alert(1)"));
    expect(doc.indexOf("ghost-bridge")).toBeLessThan(doc.indexOf("alert(1)"));
  });

  test("a document with no head gets one, and a fragment gets a whole document", () => {
    const noHead = buildCanvasDocument(`<html><body>x</body></html>`)!;
    expect(noHead.indexOf("Content-Security-Policy")).toBeLessThan(noHead.indexOf("<body>"));
    const frag = buildCanvasDocument(`<button>Go</button>`)!;
    expect(frag.startsWith("<!doctype html>")).toBe(true);
    expect(frag).toContain("<body><button>Go</button></body>");
  });

  test("a viewport is added only when the page has none", () => {
    expect(buildCanvasDocument("<p>x</p>")).toContain('name="viewport"');
    const own = buildCanvasDocument(`<head><meta name="viewport" content="width=500"></head><p>x</p>`)!;
    expect(own.match(/name="viewport"/g)).toHaveLength(1);
  });

  test("a page too large to load is refused", () => {
    expect(buildCanvasDocument("x".repeat(CANVAS_MAX_CHARS + 1))).toBeNull();
    expect(buildCanvasDocument("")).toBeNull();
  });

  test("the policy blocks the network and forms, and allows only the listed CDNs", () => {
    const csp = canvasCsp();
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("https://cdn.jsdelivr.net");
    expect(csp).not.toMatch(/script-src[^;]*\bhttps:(?!\/\/)/); // no blanket https: for scripts
    expect(csp).not.toContain("*");
  });

  test("the policy survives being put in an attribute", () => {
    const doc = buildCanvasDocument("<p>x</p>")!;
    const attr = /content="([^"]*)"/.exec(doc.slice(doc.indexOf("Content-Security-Policy")))![1];
    expect(attr).toBe(canvasCsp());
  });
});

describe("what a page may say back", () => {
  test("a height is clamped, an error is cut short and cleaned, ready passes", () => {
    expect(parseCanvasMessage(JSON.stringify({ type: "height", value: 321.4 }))).toEqual({ type: "height", value: 321 });
    expect(parseCanvasMessage(JSON.stringify({ type: "height", value: 1e9 }))).toEqual({ type: "height", value: 20000 });
    expect(parseCanvasMessage(JSON.stringify({ type: "ready" }))).toEqual({ type: "ready" });
    const e = parseCanvasMessage(JSON.stringify({ type: "error", message: "x\n\ty".padEnd(900, "z") }));
    expect(e).toMatchObject({ type: "error" });
    expect((e as { message: string }).message.length).toBe(300);
    expect((e as { message: string }).message.startsWith("x y")).toBe(true);
  });

  test("anything else is ignored", () => {
    for (const bad of [
      "not json", "null", "[]", JSON.stringify({ type: "navigate", url: "https://x" }),
      JSON.stringify({ type: "height", value: -5 }), JSON.stringify({ type: "height", value: "9" }),
      JSON.stringify({ type: "height", value: Number.NaN }), JSON.stringify({ type: "error" }),
      JSON.stringify({ type: "error", message: "   " }), "x".repeat(3000), 42, undefined,
    ]) {
      expect(parseCanvasMessage(bad)).toBeNull();
    }
  });

  test("the inline height stays within what a chat can hold", () => {
    expect(inlineHeight(null)).toBeGreaterThanOrEqual(120);
    expect(inlineHeight(10)).toBe(120);
    expect(inlineHeight(300)).toBe(300);
    expect(inlineHeight(5000)).toBe(520);
  });
});

describe("canvases and their versions", () => {
  test("only an available html file is a canvas", () => {
    expect(isCanvasArtifact(art("a", "T", "2026-10-09T10:00:00Z"))).toBe(true);
    expect(isCanvasArtifact(art("b", "T", "x", "notes/report.pdf"))).toBe(false);
    expect(isCanvasArtifact(art("c", "T", "x", "canvas/t-v1.html", { state: "unavailable" }))).toBe(false);
    expect(isCanvasArtifact(art("d", "T", "x", "canvas/t-v1.html", { kind: "text" }))).toBe(false);
  });

  test("versions are counted by title in the order they were made; the newest runs", () => {
    const list = [
      art("c2", "Click counter", "2026-10-09T10:05:00Z"),
      art("p1", "Pong", "2026-10-09T10:10:00Z"),
      art("c1", "Click counter", "2026-10-09T10:00:00Z"),
      art("doc", "Report", "2026-10-09T10:20:00Z", "report.pdf"),
    ];
    const info = canvasInfos(list);
    expect(info.c1).toEqual({ version: 1, total: 2, newestOfTitle: false, latest: false });
    expect(info.c2).toEqual({ version: 2, total: 2, newestOfTitle: true, latest: false });
    expect(info.p1).toEqual({ version: 1, total: 1, newestOfTitle: true, latest: true });
    expect(info.doc).toBeUndefined();
  });

  test("titles match without regard to case or padding", () => {
    const list = [art("a", "Todo App", "2026-10-09T10:00:00Z"), art("b", "  todo app ", "2026-10-09T10:01:00Z")];
    expect(canvasInfos(list).b.version).toBe(2);
    expect(canvasVersions(list, list[0]).map((a) => a.id)).toEqual(["a", "b"]);
  });

  test("no canvases, no infos", () => {
    expect(canvasInfos([])).toEqual({});
  });
});

describe("code the owner is reading that can be run", () => {
  test("html and svg are runnable; other languages are not", () => {
    for (const l of ["html", "HTML", "htm", "svg", " svg "]) expect(isRunnableFence(l)).toBe(true);
    for (const l of ["js", "bash", "", "xml", "htmlbars"]) expect(isRunnableFence(l)).toBe(false);
  });

  test("an svg is centred on a page; html is run as written", () => {
    expect(documentFromFence("<svg/>", "svg")).toContain("<svg/>");
    expect(documentFromFence("<svg/>", "svg")).toContain("place-items:center");
    expect(documentFromFence("<p>x</p>", "html")).toBe("<p>x</p>");
  });
});

describe("asking Ghost", () => {
  test("a fix names the canvas and the error; a change starts the owner's sentence", () => {
    expect(fixPrompt("Pong", "x is not defined")).toContain('"Pong"');
    expect(fixPrompt("Pong", "x is not defined")).toContain("x is not defined");
    expect(changeStarter("Pong")).toBe('Change the "Pong" canvas: ');
  });
});

describe("the page's surface", () => {
  test("only a plain colour comes through, dark or light", () => {
    expect(parseCanvasMessage(JSON.stringify({ type: "surface", dark: true }))).toEqual({ type: "surface", dark: true });
    expect(parseCanvasMessage(JSON.stringify({ type: "surface", dark: true, color: "rgb(15, 23, 42)" }))).toEqual({ type: "surface", dark: true, color: "rgb(15, 23, 42)" });
    expect(parseCanvasMessage(JSON.stringify({ type: "surface", dark: false, color: "rgb(250, 250, 250)" }))).toEqual({ type: "surface", dark: false, color: "rgb(250, 250, 250)" });
    // A colour that is not a plain rgb() value is never used as one.
    expect(parseCanvasMessage(JSON.stringify({ type: "surface", dark: false, color: "url(javascript:alert(1))" }))).toEqual({ type: "surface", dark: true });
    expect(parseCanvasMessage(JSON.stringify({ type: "surface", dark: "yes" }))).toBeNull();
  });

  test("a page's ground fades to clear in its own colour", () => {
    expect(withAlpha("rgb(250, 250, 250)", 0)).toBe("rgba(250, 250, 250, 0)");
    expect(withAlpha("rgba(15, 23, 42, 1)", 0.5)).toBe("rgba(15, 23, 42, 0.5)");
    expect(withAlpha("#0b0b10", 1)).toBe("rgba(11, 11, 16, 1)");
    expect(withAlpha("nonsense", 0)).toBe("rgba(11, 11, 16, 0)");
  });

  test("the bridge never makes a page's ground transparent", () => {
    expect(buildCanvasDocument("<p>x</p>", { inline: true })).not.toContain('"transparent"');
  });

  test("inline pages are told they are inline; full-screen pages are not", () => {
    expect(buildCanvasDocument("<p>x</p>", { inline: true })).toContain("__GHOST_INLINE__");
    expect(buildCanvasDocument("<p>x</p>")).not.toContain("__GHOST_INLINE__=true");
  });
});
