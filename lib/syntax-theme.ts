/**
 * Code colours: an editor's dark theme in the app's own palette, in the family
 * of GitHub Dark and One Dark (violet keywords, green strings, gold numbers,
 * blue functions, teal types) tuned to sit on Ghost's black and aurora. Every
 * colour is chosen to read on the block's near-black ground (see
 * syntax-theme.test.ts, which checks the contrast of each). Anything not listed
 * is plain text. Plain values, no imports, so it is testable.
 */
export interface SyntaxStyle {
  color: string;
  italic?: boolean;
  bold?: boolean;
}

/** Plain code ink, and the ground colours sit on. */
export const CODE_INK = "#E6E4F0";
export const CODE_GROUND = "#0A0A0F";

const KEYWORD = "#D78BFF"; // violet: control flow, declarations
const STRING = "#A6E3A1"; // soft green
const NUMBER = "#FFC266"; // ember gold, the palette's warm note
const LITERAL = "#FF9E7A"; // true, false, null, regexes
const FUNCTION = "#82AAFF"; // soft blue
const TYPE = "#7FE0C8"; // teal: types and classes
const BUILTIN = "#89DDFF"; // cyan: the language's own names
const PROP = "#8FD0FF"; // properties and attributes
const TAG = "#FF8FA3"; // rose: markup tags
const PARAM = "#F5C6A0"; // peach: parameters
const OPERATOR = "#8FD3E0";
const PUNCT = "#9D9BAD";
const COMMENT = "#7F7D8C";
const ERROR = "#FF8A8A";
const OK = "#6FE3A0";

const BY_KIND: Record<string, SyntaxStyle> = {
  keyword: { color: KEYWORD },
  doctag: { color: KEYWORD },
  meta: { color: KEYWORD },
  "meta.keyword": { color: KEYWORD },
  "meta.prompt": { color: "#7C7A88" },
  selector_tag: { color: TAG },
  string: { color: STRING },
  "meta.string": { color: STRING },
  regexp: { color: LITERAL },
  subst: { color: "#FFFFFF" },
  number: { color: NUMBER },
  literal: { color: LITERAL },
  symbol: { color: STRING },
  bullet: { color: STRING },
  title: { color: FUNCTION },
  "title.function": { color: FUNCTION },
  "title.function.invoke": { color: FUNCTION },
  "title.class": { color: TYPE },
  "title.class.inherited": { color: TYPE },
  type: { color: TYPE },
  class: { color: TYPE },
  built_in: { color: BUILTIN },
  variable: { color: CODE_INK },
  "variable.language": { color: LITERAL, italic: true },
  "variable.constant": { color: NUMBER },
  params: { color: PARAM },
  attr: { color: PROP },
  attribute: { color: PROP },
  property: { color: PROP },
  name: { color: TAG },
  tag: { color: TAG },
  selector_id: { color: FUNCTION },
  selector_class: { color: TYPE },
  selector_attr: { color: PROP },
  selector_pseudo: { color: KEYWORD },
  section: { color: FUNCTION, bold: true },
  emphasis: { color: "#FFFFFF", italic: true },
  strong: { color: "#FFFFFF", bold: true },
  link: { color: PROP },
  quote: { color: "#B3B1BD", italic: true },
  comment: { color: COMMENT, italic: true },
  addition: { color: OK },
  deletion: { color: ERROR },
  operator: { color: OPERATOR },
  punctuation: { color: PUNCT },
  template_variable: { color: PROP },
  "template-variable": { color: PROP },
  // Plain output (lib/highlight.ts outputTokens): only what is literal in it.
  url: { color: PROP },
  path: { color: PROP },
  error: { color: ERROR },
  success: { color: OK },
};

/** Every colour in the theme, for the contrast check. */
export const THEME_COLORS: string[] = Array.from(new Set(Object.values(BY_KIND).map((s) => s.color)));

/** A diff line's tint: added and removed lines read at a glance, as on GitHub. */
export function diffRowTint(kind: "addition" | "deletion"): string {
  return kind === "addition" ? "rgba(111,227,160,0.10)" : "rgba(255,122,122,0.10)";
}

/** The style for a token kind; "title.function.invoke" falls back to "title.function", then "title". */
export function syntaxStyle(kind: string | null): SyntaxStyle | null {
  if (!kind) return null;
  let k = kind;
  while (k) {
    const hit = BY_KIND[k];
    if (hit) return hit;
    const dot = k.lastIndexOf(".");
    if (dot < 0) break;
    k = k.slice(0, dot);
  }
  return null;
}
