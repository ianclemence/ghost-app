import { describe, expect, mock, test } from "bun:test";
import React from "react";

// The rules draw with React Native; these tests only read the element tree they
// return, so the native pieces are stand-ins.
const Text = (p: { children?: React.ReactNode }) => p.children as React.ReactElement;
const View = (p: { children?: React.ReactNode }) => p.children as React.ReactElement;
mock.module("react-native", () => ({
  Text, View, StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => (Array.isArray(s) ? Object.assign({}, ...s.flat(9).filter(Boolean)) : s), hairlineWidth: 1 },
}));
mock.module("@/components/text", () => ({ Text }));
mock.module("react-native-markdown-display", () => ({ hasParents: () => false }));
mock.module("@/components/code-block", () => ({ CodeBlock: () => null }));
mock.module("@/components/chat-image", () => ({ ChatImage: () => null }));
mock.module("@/components/md-table", () => ({ MdCell: () => null, MdRow: () => null, MdTable: () => null }));
mock.module("@/components/mermaid-diagram", () => ({ MermaidDiagram: () => null }));
mock.module("@/constants/theme", () => ({
  Fonts: { mono: "mono" }, Inter: { light: "Inter-Light" },
  Ghost: { emberBright: "#FFC266", text: { secondary: "#aaa", primary: "#fff" }, status: {} },
}));

const { textgroupRule, codeInlineRule } = await import("../components/markdown-rules");

const body = { body: { fontSize: 18.5 }, textgroup: {} };
const textEl = (key: string, text: React.ReactNode, style: object = {}, extra: object = {}) =>
  React.createElement(Text as never, { key, style: [{ fontSize: 18.5 }, style], ...extra }, text);
const code = (key: string, c: string) => codeInlineRule({ key, content: c, type: "code_inline", children: [], index: 0, sourceType: "", attributes: {}, sourceInfo: "", markup: "", tokenIndex: 0 } as never);
const group = (children: React.ReactNode[]) => textgroupRule({ key: "g" } as never, children, [], body as never) as React.ReactElement<{ children: React.ReactElement[]; style: unknown }>;
type P = React.ReactElement<{ children?: React.ReactNode; style?: unknown; space?: number; code?: string }>;
// The row's pieces, with the groups that keep punctuation against its code opened up.
const kids = (el: React.ReactElement): P[] =>
  (React.Children.toArray((el.props as { children: React.ReactNode }).children) as P[]).flatMap((c) =>
    c.type === View && !c.props.code && Array.isArray(c.props.children) ? (React.Children.toArray(c.props.children) as P[]) : [c],
  );

describe("a paragraph with inline code", () => {
  test("becomes a wrapping row of words and one pill, with the spaces where they were", () => {
    const row = group([textEl("a", "ls ran and failed:"), code("c", "ls /x"), textEl("b", " and then")]);
    const items = kids(row);
    // words: ls ran and failed: | pill | and then
    const words = items.map((i) => (typeof i.props.children === "string" ? i.props.children : i.props.code ? `[${i.props.code}]` : "?"));
    expect(words).toEqual(["ls", "ran", "and", "failed:", "[ls /x]", "and", "then"]);
    // "failed:" is directly against the pill: no space between them
    expect(items[3].props.style).not.toContainEqual(expect.objectContaining({ marginRight: expect.any(Number) }));
    // the pill is followed by a space, so it carries one
    expect(items[4].props.space).toBeGreaterThan(0);
    // every word carries a space but the last
    expect(JSON.stringify(items[0].props.style)).toContain("marginRight");
    expect(JSON.stringify(items[6].props.style)).not.toContain("marginRight");
  });

  test("a word keeps the style of what it was inside (bold, links)", () => {
    const row = group([
      textEl("s", [textEl("s1", "Weather:", { fontWeight: "700" })], { color: "white" }),
      textEl("t", " see "),
      code("c", "x"),
    ]);
    const first = kids(row)[0];
    expect(JSON.stringify(first.props.style)).toContain("700");
    expect(JSON.stringify(first.props.style)).toContain("white");
  });

  test("a link keeps its press on each of its words", () => {
    const press = () => {};
    const row = group([textEl("l", "open the docs", {}, { onPress: press }), textEl("t", " "), code("c", "x")]);
    const words = kids(row).filter((k) => typeof k.props.children === "string");
    expect(words.length).toBe(3);
    for (const w of words) expect((w.props as { onPress?: unknown }).onPress).toBe(press);
  });

  test("a hard break ends the line", () => {
    const row = group([textEl("a", "one"), textEl("react_native_markdown_display_0_hardbreak", "\n"), textEl("b", "two"), code("c", "x")]);
    expect(kids(row).length).toBe(4); // one, break, two, pill
  });
});

describe("a paragraph without inline code", () => {
  test("is left as one ordinary Text, exactly as before", () => {
    const kidsIn = [textEl("a", "just words "), textEl("b", "and more")];
    const el = group(kidsIn);
    expect(el.type).toBe(Text);
    expect((el.props as { children: unknown }).children).toBe(kidsIn);
  });
});
