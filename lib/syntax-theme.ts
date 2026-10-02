/**
 * Code colours: an editor's dark theme in the app's own palette. Keywords take
 * the aurora's magenta, strings its amber, numbers its blue, functions its
 * indigo, so code reads like code in an IDE while still belonging to Ghost.
 * Anything not listed is plain text. Plain values, no imports, so it is testable.
 */
export interface SyntaxStyle {
  color: string;
  italic?: boolean;
  bold?: boolean;
}

const KEYWORD = "#D78BFF";
const STRING = "#FFC27A";
const NUMBER = "#8FB8FF";
const LITERAL = "#FF9E7A";
const FUNCTION = "#A9A3FF";
const TYPE = "#7FE0C8";
const ATTR = "#8FD0FF";
const TAG = "#FF8FA3";

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
  "title.class": { color: TYPE },
  "title.class.inherited": { color: TYPE },
  type: { color: TYPE },
  class: { color: TYPE },
  built_in: { color: TYPE },
  variable: { color: "#E6E4F0" },
  "variable.language": { color: LITERAL, italic: true },
  "variable.constant": { color: NUMBER },
  params: { color: "#E6E4F0" },
  attr: { color: ATTR },
  attribute: { color: ATTR },
  property: { color: ATTR },
  name: { color: TAG },
  tag: { color: TAG },
  selector_id: { color: FUNCTION },
  selector_class: { color: TYPE },
  selector_attr: { color: ATTR },
  selector_pseudo: { color: KEYWORD },
  section: { color: FUNCTION, bold: true },
  emphasis: { color: "#FFFFFF", italic: true },
  strong: { color: "#FFFFFF", bold: true },
  link: { color: ATTR },
  quote: { color: "#B3B1BD", italic: true },
  comment: { color: "#7F7D8C", italic: true },
  addition: { color: "#6FE3A0" },
  deletion: { color: "#FF7A7A" },
  operator: { color: "#C7C5D3" },
  punctuation: { color: "#A9A7B4" },
  template_variable: { color: ATTR },
  "template-variable": { color: ATTR },
};

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
