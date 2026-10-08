/**
 * How a file's text is shown when a preview opens. Only Markdown is Markdown:
 * everything else is the file itself, in a code block with its own colours. A
 * file run through the Markdown renderer loses its meaning (a `*` rule becomes
 * a bullet, straight quotes turn curly, `--var` becomes an en dash), which is
 * what an HTML page's source looked like in a preview.
 */
export type PreviewRender = { kind: "markdown" } | { kind: "code"; language: string };

const MARKDOWN = new Set(["md", "markdown", "mdx"]);
// Plain text and data: shown as they are, uncoloured except what is plainly
// literal (see lib/highlight.ts, the "output" treatment).
const PLAIN = new Set(["txt", "log", "text", "out", "csv", "tsv", "rtf"]);
/** File extension to the fence label lib/highlight.ts resolves. */
const LANGUAGE: Record<string, string> = {
  html: "html", htm: "html", xhtml: "html", svg: "svg", xml: "xml", plist: "xml",
  css: "css", scss: "css", less: "css",
  js: "js", mjs: "js", cjs: "js", jsx: "js", ts: "ts", tsx: "ts",
  json: "json", jsonc: "json", json5: "json",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin", kts: "kotlin",
  swift: "swift", c: "c", h: "c", cc: "cpp", cpp: "cpp", hpp: "cpp", cs: "csharp",
  php: "php", lua: "lua", sql: "sql",
  sh: "bash", bash: "bash", zsh: "bash", ps1: "powershell",
  yml: "yaml", yaml: "yaml", toml: "toml", ini: "ini", conf: "ini", cfg: "ini", env: "ini",
  diff: "diff", patch: "diff", dockerfile: "dockerfile", mk: "makefile",
};

export function previewRender(path: string | undefined | null): PreviewRender {
  const name = (path ?? "").split("/").pop()?.toLowerCase() ?? "";
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : name;
  if (MARKDOWN.has(ext)) return { kind: "markdown" };
  if (name === "dockerfile") return { kind: "code", language: "dockerfile" };
  if (name === "makefile") return { kind: "code", language: "makefile" };
  if (PLAIN.has(ext)) return { kind: "code", language: "" };
  return { kind: "code", language: LANGUAGE[ext] ?? "" };
}
