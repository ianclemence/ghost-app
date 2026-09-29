import { describe, expect, test } from "bun:test";
import MarkdownIt from "markdown-it";
// Pure parser utilities: these files do not import React Native, so the AST
// shape can be asserted directly (the package's main entry cannot load under
// bun because it pulls in react-native).
import tokensToAST from "react-native-markdown-display/src/lib/util/tokensToAST.js";
import hasParents from "react-native-markdown-display/src/lib/util/hasParents.js";
import { cleanupTokens } from "react-native-markdown-display/src/lib/util/cleanupTokens.js";

const md = MarkdownIt({ typographer: true, linkify: true, html: false });

// The real parser runs cleanupTokens between markdown-it and the AST (it
// promotes image/hardbreak to blocks and fills in image alt text), so the
// assertions below use the same order the renderer does.
function parse(src: string): Node[] {
  return tokensToAST(cleanupTokens(md.parse(src, {}))) as Node[];
}

interface Node {
  type: string;
  index: number;
  content: string;
  sourceInfo?: string;
  children: Node[];
}

function find(nodes: Node[], type: string, out: Node[] = []): Node[] {
  for (const n of nodes) {
    if (n.type === type) out.push(n);
    if (n.children?.length) find(n.children, type, out);
  }
  return out;
}

function walk(nodes: Node[], parents: Node[], fn: (n: Node, parents: Node[]) => void) {
  for (const n of nodes) {
    fn(n, parents);
    if (n.children?.length) walk(n.children, [...parents, n], fn);
  }
}

describe("markdown AST assumptions the chat rules rely on", () => {
  test("a task item's marker text is index 0 inside a list_item", () => {
    const ast = parse("- [ ] todo\n- [x] done\n");
    const hits: { content: string; index: number; inList: boolean }[] = [];
    walk(ast, [], (n, parents) => {
      if (n.type === "text" && /^\[[ x]\]/.test(n.content)) {
        hits.push({ content: n.content, index: n.index, inList: hasParents(parents, "list_item") });
      }
    });
    expect(hits.length).toBe(2);
    for (const h of hits) {
      expect(h.index).toBe(0);
      expect(h.inList).toBe(true);
    }
  });

  test("fence nodes carry the language in sourceInfo", () => {
    const ast = parse("```go\nx := 1\n```\n");
    const fences = find(ast, "fence");
    expect(fences.length).toBe(1);
    expect(fences[0].sourceInfo).toBe("go");
  });

  test("a mermaid fence is distinguishable from other languages", () => {
    const ast = parse("```mermaid\nflowchart TD\n  A --> B\n```\n");
    const fences = find(ast, "fence");
    expect(fences.length).toBe(1);
    expect(String(fences[0].sourceInfo).trim().toLowerCase()).toBe("mermaid");
  });

  test("image nodes expose src and alt attributes", () => {
    const ast = parse("![arch](https://example.com/a.png)");
    const images = find(ast, "image");
    expect(images.length).toBe(1);
    const attrs = (images[0] as unknown as { attributes: Record<string, string> }).attributes;
    expect(attrs.src).toBe("https://example.com/a.png");
    expect(attrs.alt).toBe("arch");
  });
});
