import { describe, expect, test } from "bun:test";
import { highlightTokens, resolveLanguage, splitTokenLines } from "./highlight";
import { syntaxStyle } from "./syntax-theme";

const join = (t: { text: string }[]) => t.map((x) => x.text).join("");
const kinds = (code: string, lang: string) => highlightTokens(code, lang).filter((t) => t.kind).map((t) => `${t.kind}:${t.text}`);

const SAMPLES: Record<string, string> = {
  typescript: 'import { a } from "x";\nconst n: number = 42; // answer\nexport function add(a: number, b: number): number {\n  return a + b < 3 ? `x${a}` : "y";\n}',
  python: 'def greet(name: str) -> str:\n    """Say hi."""\n    return f"Hello, {name}!"  # done\n\nclass A(B):\n    pass',
  go: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tx := []int{1, 2}\n\tfmt.Println("hi", x)\n}',
  bash: 'for f in *.png; do\n  echo "$f" | grep -q cat && mv "$f" /tmp # move\ndone',
  json: '{ "name": "ghost", "n": 3, "ok": true, "tags": ["a", "b"], "x": null }',
  html: '<div class="a" id=\'b\'>Tom &amp; Jerry <b>5 &lt; 6</b></div>',
  sql: "SELECT id, name FROM users WHERE age >= 18 AND city = 'Nairobi' ORDER BY name;",
  yaml: "name: ghost\nversion: 1.2\nitems:\n  - one\n  - two # note",
  css: ".a:hover > .b { color: #fff; margin: 0 auto; }",
  rust: 'fn main() {\n    let x: i32 = 5;\n    println!("{}", x);\n}',
  diff: "--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new",
};

describe("highlightTokens never changes the code", () => {
  for (const [lang, code] of Object.entries(SAMPLES)) {
    test(`${lang}: tokens join back to the input exactly`, () => {
      expect(join(highlightTokens(code, lang))).toBe(code);
    });
  }

  test("characters highlight.js escapes (< > & quotes) come back as written", () => {
    const code = `if (a < b && c > d) { s = "x" + 'y'; }`;
    expect(join(highlightTokens(code, "js"))).toBe(code);
    // Code that itself contains an entity is left exactly as written.
    expect(join(highlightTokens(SAMPLES.html, "html"))).toContain("Tom &amp; Jerry");
  });

  test("odd input: empty, only whitespace, unicode, tabs, a lone span-like string", () => {
    for (const code of ["", "   \n", "const café = 'ünï';", "\t\tx", '<span class="hljs-keyword">x</span>', "a &lt; b"]) {
      expect(join(highlightTokens(code, "javascript"))).toBe(code);
      expect(join(highlightTokens(code, "html"))).toBe(code);
      expect(join(highlightTokens(code, ""))).toBe(code);
    }
  });
});

describe("what gets coloured", () => {
  test("keywords, strings, numbers and comments are told apart", () => {
    const k = kinds(SAMPLES.typescript, "ts");
    expect(k.some((x) => x.startsWith("keyword:"))).toBe(true);
    expect(k.some((x) => x.startsWith("string:"))).toBe(true);
    expect(k.some((x) => x.startsWith("number:"))).toBe(true);
    expect(k.some((x) => x.startsWith("comment:"))).toBe(true);
  });

  test("python functions and strings", () => {
    const k = kinds(SAMPLES.python, "py");
    expect(k).toContain("keyword:def");
    expect(k.some((x) => x.startsWith("title.function:greet"))).toBe(true);
  });

  test("a diff marks additions and deletions", () => {
    const k = kinds(SAMPLES.diff, "diff");
    expect(k.some((x) => x.startsWith("addition:"))).toBe(true);
    expect(k.some((x) => x.startsWith("deletion:"))).toBe(true);
  });
});

describe("naming a language", () => {
  test("aliases resolve", () => {
    expect(resolveLanguage("ts")).toBe("typescript");
    expect(resolveLanguage("TSX")).toBe("typescript");
    expect(resolveLanguage("py")).toBe("python");
    expect(resolveLanguage("shell")).toBe("bash");
    expect(resolveLanguage("html")).toBe("xml");
    expect(resolveLanguage("c++")).toBe("cpp");
  });

  test("an unknown or empty label is no language", () => {
    expect(resolveLanguage("klingon")).toBeNull();
    expect(resolveLanguage("")).toBeNull();
    expect(resolveLanguage(null)).toBeNull();
  });

  test("an unknown language is shown plain, not guessed at", () => {
    const toks = highlightTokens("const x = 1;", "klingon");
    expect(toks).toEqual([{ text: "const x = 1;", kind: null }]);
  });
});

describe("limits, and no guessing", () => {
  test("a huge block is left plain", () => {
    const big = "const a = 1;\n".repeat(2000);
    const toks = highlightTokens(big, "js");
    expect(toks).toEqual([{ text: big, kind: null }]);
  });

  test("a block with no label is never read as code, so plain output is never painted like code", () => {
    const sql = "SELECT id FROM users WHERE age >= 18;";
    const toks = highlightTokens(sql, "");
    expect(toks.some((t) => t.kind === "keyword")).toBe(false);
    expect(toks.map((t) => t.text).join("")).toBe(sql);
    const prose = "Everything is fine and nothing was changed.";
    expect(highlightTokens(prose, "")).toEqual([{ text: prose, kind: null }]);
  });
});

describe("plain output", () => {
  const out = (code: string) => highlightTokens(code, "").filter((t) => t.kind).map((t) => `${t.kind}:${t.text}`);

  test("an error line colours what went wrong and what was quoted", () => {
    const k = out("ls: cannot access '/nonexistent-dir': No such file or directory");
    expect(k).toContain("error:cannot");
    expect(k).toContain("string:'/nonexistent-dir'");
    expect(k).toContain("error:No such file or directory");
  });

  test("paths, links, numbers and success are told apart", () => {
    const k = out("see https://example.com/a?b=1 and /var/lib/ghost, exit 2, ok");
    expect(k).toContain("url:https://example.com/a?b=1");
    expect(k).toContain("path:/var/lib/ghost");
    expect(k).toContain("number:2");
    expect(k).toContain("success:ok");
  });

  test("a version string is one number, not three", () => {
    expect(out("Linux 6.18.50")).toContain("number:6.18.50");
  });

  test("labels that mean output get the same treatment; code labels do not", () => {
    for (const l of ["text", "txt", "log", "output", "stdout", "plaintext"]) {
      expect(highlightTokens("failed with exit 2", l).some((t) => t.kind === "error")).toBe(true);
    }
    expect(highlightTokens("const failed = 2", "js").some((t) => t.kind === "keyword")).toBe(true);
  });

  test("it never changes the text", () => {
    for (const code of ["", "  \n", "a'b", 'it\'s "x" 0x1F /a//b ~/c ./d', "é 日本 12px 3.5%", "error: 'unterminated", "a".repeat(5000)]) {
      expect(join(highlightTokens(code, ""))).toBe(code);
    }
  });

  test("a block over the limits stays plain", () => {
    const big = "error 1\n".repeat(3000);
    expect(highlightTokens(big, "")).toEqual([{ text: big, kind: null }]);
  });
});

describe("the theme", () => {
  test("falls back from a specific kind to its family", () => {
    expect(syntaxStyle("title.function.invoke")?.color).toBe(syntaxStyle("title.function")?.color);
    expect(syntaxStyle("keyword")).not.toBeNull();
    expect(syntaxStyle("nonsense")).toBeNull();
    expect(syntaxStyle(null)).toBeNull();
  });
});

describe("splitTokenLines", () => {
  const rejoin = (lines: { text: string }[][]) => lines.map((l) => l.map((t) => t.text).join("")).join("\n");

  test("every block divides into lines and joins back to exactly the code", () => {
    for (const [lang, code] of Object.entries(SAMPLES)) {
      expect(rejoin(splitTokenLines(highlightTokens(code, lang)))).toBe(code);
    }
  });

  test("one line per line of code, blank lines included", () => {
    const code = "a\n\nb\n";
    expect(splitTokenLines(highlightTokens(code, "")).length).toBe(4);
  });

  test("a token that spans lines keeps its kind on each piece", () => {
    const lines = splitTokenLines([{ text: "x ", kind: null }, { text: "/* one\ntwo */", kind: "comment" }]);
    expect(lines).toEqual([
      [{ text: "x ", kind: null }, { text: "/* one", kind: "comment" }],
      [{ text: "two */", kind: "comment" }],
    ]);
  });

  test("a long command stays one row to wrap in, not split", () => {
    const cmd = "ls: cannot access '/nonexistent-dir': No such file or directory";
    expect(splitTokenLines(highlightTokens(cmd, "")).length).toBe(1);
  });
});
