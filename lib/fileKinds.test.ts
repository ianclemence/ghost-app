import { describe, expect, test } from "bun:test";
import { previewRender } from "./fileKinds";

describe("previewRender", () => {
  test("only Markdown is Markdown", () => {
    for (const p of ["notes.md", "README.markdown", "a/b/doc.MDX"]) expect(previewRender(p)).toEqual({ kind: "markdown" });
  });

  test("an HTML page is code, not prose", () => {
    expect(previewRender("canvas/click-counter-v1.html")).toEqual({ kind: "code", language: "html" });
    expect(previewRender("logo.svg")).toEqual({ kind: "code", language: "svg" });
  });

  test("source and config files carry their language", () => {
    expect(previewRender("a.py")).toEqual({ kind: "code", language: "python" });
    expect(previewRender("src/App.TSX")).toEqual({ kind: "code", language: "ts" });
    expect(previewRender("deploy.sh")).toEqual({ kind: "code", language: "bash" });
    expect(previewRender("config.yml")).toEqual({ kind: "code", language: "yaml" });
    expect(previewRender("Dockerfile")).toEqual({ kind: "code", language: "dockerfile" });
  });

  test("plain text, logs and data stay plain; an unknown type stays plain, never Markdown", () => {
    for (const p of ["a.txt", "run.log", "data.csv", "mystery.xyz", "noextension", undefined, null]) {
      expect(previewRender(p)).toEqual({ kind: "code", language: "" });
    }
  });
});
