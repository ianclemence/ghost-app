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

/**
 * A file's name as a person would say it. Names a machine made (a browser
 * screenshot's timestamp, a random id) read as what the file is; a name
 * someone chose is kept as it is.
 */
export function friendlyFileName(name: string): string {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, "");
  if (/^browser-\d{8}/i.test(base)) return "Browser screenshot";
  if (/^(screenshot|screen[-_ ]shot)[-_ ]?\d/i.test(base)) return "Screenshot";
  if (/^(img|pxl|dsc|photo)[-_]?\d{6,}/i.test(base)) return "Photo";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(base) || /^[0-9a-f]{24,}$/i.test(base)) {
    return /\.(png|jpe?g|webp|heic|gif)$/i.test(name) ? "Photo" : /\.pdf$/i.test(name) ? "Document" : "File";
  }
  return name;
}

/**
 * Why a file has no preview, in words: the Pod answers with a code
 * ("binary_or_unsupported_encoding"), which is never shown as it is.
 */
export function previewReason(code: string | undefined | null): string {
  switch (code) {
    case "binary_or_unsupported_encoding":
      return "There's no preview for this kind of file. Save it to open it in another app.";
    case "image_too_large":
      return "This picture is too large to show here. Save it to see it.";
    default:
      return code && !/^[a-z0-9_]+$/.test(code) ? code : "There's no preview for this file. Save it to open it in another app.";
  }
}
