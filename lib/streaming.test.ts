import { describe, expect, test } from "bun:test";
import { closeInlineMarkers, prepareStreamingMarkdown } from "./streaming";

describe("closeInlineMarkers", () => {
  test("auto-closes bold", () => {
    expect(closeInlineMarkers("This is **bold")).toBe("This is **bold**");
  });
  test("auto-closes inline code", () => {
    expect(closeInlineMarkers("run `ls -la")).toBe("run `ls -la`");
  });
  test("auto-closes strikethrough", () => {
    expect(closeInlineMarkers("~~gone")).toBe("~~gone~~");
  });
  test("leaves complete markup alone", () => {
    expect(closeInlineMarkers("This is **bold** done")).toBe("This is **bold** done");
  });
  test("renders unclosed link as its text", () => {
    expect(closeInlineMarkers("see [the docs](https://exa")).toBe("see the docs");
  });
  test("ignores content inside fenced blocks", () => {
    const text = "```js\nconst a = '**not bold";
    expect(closeInlineMarkers(text)).toBe(text);
  });
  test("does not touch snake_case", () => {
    expect(closeInlineMarkers("use my_var here")).toBe("use my_var here");
  });
});

describe("prepareStreamingMarkdown", () => {
  test("holds an open fence", () => {
    const out = prepareStreamingMarkdown("Here is code:\n```js\nconst a = 1;");
    expect(out).toBe("Here is code:");
  });
  test("passes closed fences through", () => {
    const text = "Here is code:\n```js\nconst a = 1;\n```\nDone.";
    expect(prepareStreamingMarkdown(text)).toBe(text);
  });
  test("holds a table without a separator", () => {
    const out = prepareStreamingMarkdown("Data:\n| a | b |\n| 1 | 2 |");
    expect(out).toBe("Data:");
  });
  test("passes complete tables through", () => {
    const text = "Data:\n| a | b |\n|---|---|\n| 1 | 2 |";
    expect(prepareStreamingMarkdown(text)).toBe(text);
  });
  test("holds unclosed math", () => {
    expect(prepareStreamingMarkdown("Result $$x^2").trim()).toBe("Result");
  });
  test("empty stays empty", () => {
    expect(prepareStreamingMarkdown("")).toBe("");
  });
});

describe("closeInlineMarkers guards", () => {
  test("balanced bold plus trailing words untouched", () => {
    expect(closeInlineMarkers("This is **bold** done")).toBe("This is **bold** done");
  });
  test("list markers are not treated as italic openers", () => {
    expect(closeInlineMarkers("* item one")).toBe("* item one");
  });
  test("single unclosed italic still closes", () => {
    expect(closeInlineMarkers("a *lone star")).toBe("a *lone star*");
  });
});
