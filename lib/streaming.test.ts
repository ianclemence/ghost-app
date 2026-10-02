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
  // The app draws no math, so "$$" is only ever text (a price tier, a joke).
  // Holding it back once hid the rest of the reply, list items included, until
  // the stream ended.
  test("never hides text after a $$", () => {
    const text = "Dining is $$ for most places.\n\nHere are your options:\n\n1. Cafe\n2. Diner\n3. Bistro";
    expect(prepareStreamingMarkdown(text)).toBe(text);
  });

  test("a $$ does not hide a list that follows it, at any point in the stream", () => {
    const text = "The $$ symbol means moderate.\n- One\n- Two\n- Three";
    for (let i = 1; i <= text.length; i++) {
      const cut = text.slice(0, i);
      const out = prepareStreamingMarkdown(cut);
      // Whatever has fully arrived on earlier lines is on screen.
      const done = cut.slice(0, cut.lastIndexOf("\n") + 1).trimEnd();
      expect(out.startsWith(done)).toBe(true);
    }
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

describe("mermaid streaming safety", () => {
  test("holds an unclosed mermaid fence entirely", () => {
    const out = prepareStreamingMarkdown(
      "Here is the flow:\n\n```mermaid\nflowchart TD\n    A[User] --> B[Ghost]\n",
    );
    expect(out).not.toContain("```");
    expect(out).not.toContain("flowchart");
    expect(out).toContain("Here is the flow:");
  });

  test("holds a mermaid fence whose language just arrived", () => {
    const out = prepareStreamingMarkdown("Diagram:\n```mermaid");
    expect(out).not.toContain("```");
  });

  test("passes a completed mermaid block through verbatim", () => {
    const text = "```mermaid\nflowchart TD\n    A --> B\n```";
    expect(prepareStreamingMarkdown(text)).toBe(text);
  });

  test("does not inline-close markers inside a held mermaid fence", () => {
    const out = prepareStreamingMarkdown("```mermaid\nA[**not bold] --> B\n");
    expect(out).not.toContain("**not bold]");
  });
});
