import { describe, expect, test } from "bun:test";
import { ReasoningStreamFilter, stripReasoningTags } from "./reasoning";

describe("stripReasoningTags", () => {
  test("passes plain answers through", () => {
    expect(stripReasoningTags("answer")).toBe("answer");
  });

  test("removes a complete think block", () => {
    expect(stripReasoningTags("<think>secret</think>answer")).toBe("answer");
    expect(stripReasoningTags("<thinking>secret</thinking>answer")).toBe("answer");
    expect(stripReasoningTags("a<think>secret</think>b")).toBe("ab");
  });

  test("drops an unclosed reasoning block", () => {
    expect(stripReasoningTags("<think>unclosed reasoning")).toBe("");
  });
});

describe("ReasoningStreamFilter", () => {
  test("strips tags split across tokens", () => {
    const f = new ReasoningStreamFilter();
    let out = "";
    for (const tok of ["Hel", "lo <thi", "nk>SECRET", "</thi", "nk> world"]) {
      out += f.write(tok);
    }
    out += f.flush();
    expect(out).toBe("Hello  world");
  });

  test("never emits reasoning content", () => {
    const f = new ReasoningStreamFilter();
    let out = "";
    for (const tok of ["<think>", "hidden", "</think>", "visible"]) {
      out += f.write(tok);
    }
    out += f.flush();
    expect(out).toBe("visible");
    expect(out).not.toContain("hidden");
  });
});
