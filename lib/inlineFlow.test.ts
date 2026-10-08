import { describe, expect, test } from "bun:test";
import { flow, glue, hasPill, spaceWidth, type Seg } from "./inlineFlow";

const t = (text: string): Seg => ({ kind: "text", text });
const pill: Seg = { kind: "pill", node: "ls" };
const brief = (items: ReturnType<typeof flow>) => items.map((i) => (i.kind === "word" ? `${i.text}${i.space ? "_" : ""}` : i.kind === "break" ? "|" : `[${i.kind}]${i.space ? "_" : ""}`));

describe("flow", () => {
  test("words keep the spaces between them and none after the last", () => {
    expect(brief(flow([t("ran and failed")]))).toEqual(["ran_", "and_", "failed"]);
  });

  test("a space before a pill and one after it are kept", () => {
    expect(brief(flow([t("the "), pill, t(" test")]))).toEqual(["the_", "[pill]_", "test"]);
  });

  test("punctuation hugs the code it follows", () => {
    expect(brief(flow([t("Run "), pill, t(": ran and")]))).toEqual(["Run_", "[pill]", ":_", "ran_", "and"]);
    expect(brief(flow([t("("), pill, t(")")]))).toEqual(["(", "[pill]", ")"]);
  });

  test("a space at the end of one piece and the start of the next is one space", () => {
    expect(brief(flow([t("a "), t(" b")]))).toEqual(["a_", "b"]);
  });

  test("a soft line break is a space; a hard break ends the line", () => {
    expect(brief(flow([t("one\ntwo")]))).toEqual(["one_", "two"]);
    expect(brief(flow([t("one"), { kind: "break" }, t("two")]))).toEqual(["one", "|", "two"]);
  });

  test("leading whitespace is dropped, and runs of it are one space", () => {
    expect(brief(flow([t("   a   \n  b")]))).toEqual(["a_", "b"]);
  });

  test("a piece keeps the style and the press it came with", () => {
    const items = flow([{ kind: "text", text: "wttr.in", style: ["link"], press: "open" } as Seg]);
    expect(items[0]).toMatchObject({ kind: "word", style: ["link"], press: "open" });
  });

  test("nothing in, nothing out", () => {
    expect(flow([])).toEqual([]);
    expect(flow([t("   ")])).toEqual([]);
  });

  test("only a paragraph with inline code needs the row", () => {
    expect(hasPill([t("plain words"), { kind: "other", node: 1 }])).toBe(false);
    expect(hasPill([t("a"), pill])).toBe(true);
  });

  test("a space is a little over a quarter of the type size", () => {
    expect(spaceWidth(18.5)).toBe(5);
    expect(spaceWidth(undefined)).toBeGreaterThan(0);
  });
});


describe("glue", () => {
  const shape = (segs: Seg[]) => glue(flow(segs)).map((g) => g.map((i) => (i.kind === "word" ? i.text : i.kind === "break" ? "|" : `[${i.kind}]`)).join("+"));

  test("punctuation stays with the code it follows; spaced words stand alone", () => {
    expect(shape([t("Run "), pill, t(": ran and")])).toEqual(["Run", "[pill]+:", "ran", "and"]);
  });

  test("brackets stay with what they hold", () => {
    expect(shape([t("see ("), pill, t(") now")])).toEqual(["see", "(+[pill]+)", "now"]);
  });

  test("a break ends a group", () => {
    expect(shape([t("one"), { kind: "break" }, t("two")])).toEqual(["one", "|", "two"]);
  });
});
