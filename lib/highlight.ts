import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import lua from "highlight.js/lib/languages/lua";
import makefile from "highlight.js/lib/languages/makefile";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

/**
 * Syntax highlighting for code in replies, like an editor does.
 *
 * highlight.js (core plus the languages below, not the whole 386) turns code
 * into marked-up text; this module turns that into a flat list of tokens, each
 * with the kind of thing it is ("keyword", "string", "title.function"...). The
 * screen decides the colours (lib/syntax-theme.ts). One rule keeps it safe: the
 * tokens joined back together are always exactly the code that came in, so
 * highlighting can colour code but never change, drop or reorder it.
 */

const LANGUAGES = {
  bash, c, cpp, csharp, css, diff, dockerfile, go, ini, java, javascript, json, kotlin, lua,
  makefile, markdown, php, powershell, python, ruby, rust, sql, swift, typescript, xml, yaml,
};
for (const [name, def] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, def);

/** Names models and people write for the same language. */
const ALIASES: Record<string, string> = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript", node: "javascript",
  ts: "typescript", tsx: "typescript",
  py: "python", python3: "python", py3: "python",
  sh: "bash", shell: "bash", zsh: "bash", console: "bash", terminal: "bash", shellsession: "bash",
  yml: "yaml",
  golang: "go",
  "c++": "cpp", cc: "cpp", hpp: "cpp", h: "c",
  cs: "csharp", "c#": "csharp",
  html: "xml", htm: "xml", svg: "xml", xhtml: "xml", plist: "xml",
  jsonc: "json", json5: "json",
  rb: "ruby",
  rs: "rust",
  kt: "kotlin", kts: "kotlin",
  md: "markdown",
  toml: "ini", conf: "ini", cfg: "ini", env: "ini", properties: "ini",
  docker: "dockerfile",
  make: "makefile",
  ps: "powershell", ps1: "powershell", pwsh: "powershell",
  patch: "diff",
  postgres: "sql", postgresql: "sql", mysql: "sql", sqlite: "sql",
};

/** A run of code and what kind of thing it is; null is plain text. */
export interface Token {
  text: string;
  kind: string | null;
}

/** Past this, highlighting costs more than it gives on a phone. */
const MAX_CHARS = 12_000;
const MAX_LINES = 400;
/** The registered language a fence label means, or null if none. */
export function resolveLanguage(label: string | null | undefined): string | null {
  const l = (label ?? "").trim().toLowerCase();
  if (!l) return null;
  const name = ALIASES[l] ?? l;
  return hljs.getLanguage(name) ? name : null;
}

const ENTITIES: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&#x27;": "'", "&#39;": "'" };
const decode = (s: string) => s.replace(/&(?:lt|gt|amp|quot|#x27|#39);/g, (m) => ENTITIES[m] ?? m);

/** "hljs-title function_" is the kind "title.function"; "hljs-keyword" is "keyword". */
function kindOf(cls: string): string | null {
  const parts = cls.split(/\s+/).filter(Boolean);
  const first = parts.find((p) => p.startsWith("hljs-"));
  if (!first) return null;
  const base = first.slice(5);
  const sub = parts.find((p) => p !== first && p.endsWith("_") && !p.startsWith("hljs-"));
  return sub ? `${base}.${sub.slice(0, -1)}` : base;
}

/** highlight.js's marked-up string to flat tokens. The innermost span names a run. */
function parse(html: string): Token[] {
  const out: Token[] = [];
  const stack: (string | null)[] = [];
  const push = (text: string) => {
    if (!text) return;
    const kind = stack.length ? stack[stack.length - 1] : null;
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ text, kind });
  };
  const re = /<span class="([^"]*)">|<\/span>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) stack.push(kindOf(m[1]));
    else if (m[0] === "</span>") stack.pop();
    else push(decode(m[2]));
  }
  return out;
}

const cache = new Map<string, Token[]>();

/**
 * Tokens for `code`. `language` is a fence label ("ts", "python", "") or null.
 * Anything unknown, unlabeled, empty or over the limits comes back as one
 * plain token. The result always joins back to `code` exactly.
 */
export function highlightTokens(code: string, language?: string | null): Token[] {
  const plain: Token[] = [{ text: code, kind: null }];
  if (!code.trim()) return plain;
  if (code.length > MAX_CHARS || code.split("\n").length > MAX_LINES) return plain;
  const lang = resolveLanguage(language);
  const key = `${lang ?? "?"}\u0000${code}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let tokens = plain;
  try {
    // A block that names no language is not guessed at: highlight.js's own
    // confidence is about the same for real code and for ordinary text, so a
    // guess would sometimes paint plain output like code. Models label their
    // fences; an unlabeled one stays plain.
    if (lang) {
      const parsed = parse(hljs.highlight(code, { language: lang, ignoreIllegals: true }).value);
      // The safety rule: colour only, never content.
      if (parsed.map((t) => t.text).join("") === code) tokens = parsed;
    }
  } catch {
    tokens = plain;
  }
  if (cache.size >= 60) cache.delete(cache.keys().next().value as string);
  cache.set(key, tokens);
  return tokens;
}

/**
 * The tokens of a block divided into its lines, so each line can be its own row
 * (a long one wraps inside its row and its number stays beside its first line).
 * A token that spans lines (a comment, a template string) is cut at each line
 * break and keeps its kind on every piece. Joining the lines with "\n" gives
 * back the code exactly.
 */
export function splitTokenLines(tokens: Token[]): Token[][] {
  const lines: Token[][] = [[]];
  for (const t of tokens) {
    const parts = t.text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part !== "") lines[lines.length - 1].push({ text: part, kind: t.kind });
    });
  }
  return lines;
}
