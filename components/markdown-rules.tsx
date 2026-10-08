/**
 * Ghost chat Markdown rules — native-feeling rendering on top of
 * react-native-markdown-display defaults.
 *
 * Only what the defaults get wrong is overridden here; everything else
 * keeps library rendering:
 * - fence: Mermaid diagrams render as diagrams; all other code gets a
 *   language label, a copy button, and horizontal scroll.
 * - code_block (indented): same treatment without a language label.
 * - table: columns share the screen and wrap; too many columns become
 *   stacked rows. Never scrolls sideways (see md-table).
 * - text: GFM task markers (`- [ ]` / `- [x]`) at the start of a list
 *   item render as an accessible checkbox glyph + remainder text.
 * - image: https-only sources with loading, failure, and tap-to-view
 *   states; anything else degrades to its alt text.
 */
import React from "react";
import { StyleSheet, Text as RNText, View } from "react-native";
import { Text } from "@/components/text";
import { hasParents } from "react-native-markdown-display";
import { Fonts, Ghost, Inter } from "@/constants/theme";
import { CodeBlock } from "@/components/code-block";
import { ChatImage } from "@/components/chat-image";
import { MdCell, MdRow, MdTable } from "@/components/md-table";
import { measureTable, tableRows, type TableModel, type TableNode } from "@/lib/tables";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { isMermaidLanguage } from "@/lib/mermaid";
import { isSafeImageUrl } from "@/lib/link-policy";
import { codeLabel, parseTaskMarker } from "@/lib/markdown";
import { flow, glue, hasPill, spaceWidth, type FlowItem, type Seg } from "@/lib/inlineFlow";
import type { ASTNode } from "react-native-markdown-display";

/**
 * The runtime AST node carries the fence info string from markdown-it as
 * `sourceInfo`; the package's published types predate that field.
 */
type MarkdownNode = ASTNode & { sourceInfo?: string };

function trimTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content.slice(0, -1) : content;
}

function fenceRule(node: MarkdownNode) {
  const content = trimTrailingNewline(node.content ?? "");
  const info = (node.sourceInfo ?? "").trim();
  if (isMermaidLanguage(info)) {
    return (
      <MermaidDiagram
        key={node.key}
        source={content}
        fallback={<CodeBlock language="mermaid" code={content} />}
      />
    );
  }
  return <CodeBlock key={node.key} language={codeLabel(info)} code={content} />;
}

function textRule(node: ASTNode, children: React.ReactNode[], parents: ASTNode[], styles: any, inherited: any) {
  const task = parseTaskMarker(node.content ?? "");
  if (task && node.index === 0 && hasParents(parents, "list_item")) {
    return (
      <Text key={node.key} style={[inherited, styles.text]}>
        <Text
          accessibilityRole="checkbox"
          accessibilityState={{ checked: task.checked }}
          accessibilityLabel={task.checked ? "Completed task" : "Open task"}
        >
          <Text style={{ color: task.checked ? Ghost.status.success : Ghost.text.secondary }}>
            {task.checked ? "☑ " : "☐ "}
          </Text>
        </Text>
        {task.rest}
      </Text>
    );
  }
  // Text in a table cell is set at the cell's own size and weight. It used to
  // inherit the reply's body size (18.5px, light), which made tables larger than
  // designed and pushed words past their column.
  const cell = parents.find((p) => p.type === "td" || p.type === "th");
  if (cell) {
    const header = cell.type === "th";
    return (
      <Text
        key={node.key}
        style={[
          inherited,
          styles.text,
          {
            fontFamily: header || cell.index === 0 ? Inter.semibold : Inter.regular,
            fontSize: header ? 12.5 : 14.5,
            lineHeight: header ? 17 : 20,
            letterSpacing: 0,
            color: header ? Ghost.text.secondary : Ghost.text.primary,
          },
        ]}
      >
        {node.content}
      </Text>
    );
  }
  return (
    <Text key={node.key} style={[inherited, styles.text]}>
      {node.content}
    </Text>
  );
}

const tableModels = new WeakMap<object, TableModel>();
function modelFor(table: ASTNode): TableModel {
  let m = tableModels.get(table);
  if (!m) {
    m = measureTable(tableRows(table as TableNode));
    tableModels.set(table, m);
  }
  return m;
}

const isType = (n: ASTNode | undefined, t: string) => n?.type === t;

function tableRule(node: ASTNode, children: React.ReactNode[]) {
  return (
    <MdTable key={node.key} model={modelFor(node)}>
      {children}
    </MdTable>
  );
}

function trRule(node: ASTNode, children: React.ReactNode[], parents: ASTNode[]) {
  const header = parents.some((p) => isType(p, "thead"));
  const body = parents.find((p) => isType(p, "tbody"));
  const last = !!body && body.children?.[body.children.length - 1] === node;
  return (
    <MdRow key={node.key} header={header} last={last}>
      {children}
    </MdRow>
  );
}

function cellRule(header: boolean) {
  const rule = (node: ASTNode, children: React.ReactNode[]) => (
    <MdCell key={node.key} column={node.index} header={header}>
      <Text
        style={{
          color: header ? Ghost.text.secondary : Ghost.text.primary,
          fontSize: header ? 12.5 : 14.5,
          lineHeight: header ? 17 : 20,
          fontWeight: header ? "600" : node.index === 0 ? "600" : "400",
          letterSpacing: header ? 0.1 : 0,
        }}
      >
        {children}
      </Text>
    </MdCell>
  );
  return rule;
}

function imageRule(node: ASTNode) {
  const src: string = node.attributes?.src ?? "";
  const alt: string = node.attributes?.alt ?? "";
  if (!isSafeImageUrl(src)) {
    return (
      <Text key={node.key} style={{ color: Ghost.text.secondary, fontStyle: "italic" }}>
        {alt ? `◈ ${alt} (image unavailable)` : "◈ image unavailable"}
      </Text>
    );
  }
  return <ChatImage key={node.key} src={src.trim()} alt={alt} />;
}

/**
 * Inline code is a pill, and a paragraph with one is laid out as a wrapping row
 * of its own pieces (see lib/inlineFlow.ts for why): each word is a Text, each
 * code span a rounded box that sizes itself to its text and wraps inside itself
 * when it is longer than a line. Every piece is measured on its own with its own
 * font, so a pill can never lie over the words around it. A paragraph without
 * inline code is untouched: ordinary text, one Text, selectable and justified by
 * the platform as before.
 */
function InlinePill({ code, space }: { code: string; space?: number }) {
  return (
    <View style={[styles.pill, space ? { marginRight: space } : null]} accessible accessibilityLabel={code}>
      <Text style={styles.pillText}>{code}</Text>
    </View>
  );
}

/** Code is gold: the one warm ink in a reply, so it reads as "this is literal". */
export const inlineCodeInk = Ghost.emberBright;

export function codeInlineRule(node: ASTNode) {
  return <InlinePill key={node.key} code={node.content ?? ""} />;
}

const isTextEl = (el: React.ReactElement) => el.type === RNText || el.type === Text;

/** A paragraph's rendered pieces, flattened into words, pills and breaks. */
function collect(node: React.ReactNode, inherited: unknown[], press: unknown, out: Seg<React.ReactElement>[]) {
  React.Children.forEach(node, (child) => {
    if (child === null || child === undefined || typeof child === "boolean") return;
    if (typeof child === "string" || typeof child === "number") {
      out.push({ kind: "text", text: String(child), style: inherited, press });
      return;
    }
    if (!React.isValidElement(child)) return;
    const el = child as React.ReactElement<{ style?: unknown; onPress?: unknown; children?: React.ReactNode }>;
    if (el.type === InlinePill) {
      out.push({ kind: "pill", node: el });
      return;
    }
    if (isTextEl(el)) {
      // A hard break is a Text holding a newline and keyed as one.
      if (typeof el.key === "string" && el.key.includes("hardbreak")) {
        out.push({ kind: "break" });
        return;
      }
      collect(el.props.children, [...inherited, el.props.style], el.props.onPress ?? press, out);
      return;
    }
    out.push({ kind: "other", node: el });
  });
}

export function textgroupRule(node: ASTNode, children: React.ReactNode[], _parents: ASTNode[], mdStyles: Record<string, object>) {
  const segs: Seg<React.ReactElement>[] = [];
  collect(children, [], undefined, segs);
  if (!hasPill(segs)) {
    return (
      <RNText key={node.key} style={mdStyles.textgroup}>
        {children}
      </RNText>
    );
  }
  const bodySize = (StyleSheet.flatten(mdStyles.body as object) as { fontSize?: number } | undefined)?.fontSize;
  const piece = (it: FlowItem<React.ReactElement>, key: string) => {
    if (it.kind === "break") return <View key={key} style={styles.lineBreak} />;
    if (it.kind === "pill") {
      return React.cloneElement(it.node as React.ReactElement<{ space?: number }>, { key, space: it.space ? spaceWidth(bodySize) : 0 });
    }
    if (it.kind === "other") return <React.Fragment key={key}>{it.node}</React.Fragment>;
    const flat = StyleSheet.flatten(it.style as object[]) as { fontSize?: number } | undefined;
    const gap = it.space ? spaceWidth(flat?.fontSize) : 0;
    return (
      <RNText key={key} style={[it.style as object, gap ? { marginRight: gap } : null]} onPress={it.press as (() => void) | undefined}>
        {it.text}
      </RNText>
    );
  };
  return (
    <View key={node.key} style={styles.row}>
      {glue(flow(segs)).map((group, g) =>
        group.length === 1 ? (
          piece(group[0], `${g}`)
        ) : (
          // Kept together on one line: code and the punctuation against it.
          <View key={g} style={styles.glued}>
            {group.map((it, k) => piece(it, `${g}-${k}`))}
          </View>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", alignSelf: "stretch" },
  lineBreak: { width: "100%", height: 0 },
  glued: { flexDirection: "row", alignItems: "center", flexShrink: 1, maxWidth: "100%" },
  // A real rounded box that takes its size from its text.
  pill: {
    flexShrink: 1,
    maxWidth: "100%",
    borderRadius: 8,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,194,102,0.24)",
    backgroundColor: "rgba(255,194,102,0.09)",
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  pillText: {
    flexShrink: 1,
    fontFamily: Fonts?.mono ?? "monospace",
    fontSize: 13.5,
    lineHeight: 19,
    color: inlineCodeInk,
    includeFontPadding: false,
  },
});

export const markdownRules = {
  code_inline: codeInlineRule,
  textgroup: textgroupRule,
  fence: fenceRule,
  code_block: (node: ASTNode) => (
    <CodeBlock key={node.key} language="" code={trimTrailingNewline(node.content ?? "")} />
  ),
  table: tableRule,
  thead: (node: ASTNode, children: React.ReactNode[]) => <View key={node.key}>{children}</View>,
  tbody: (node: ASTNode, children: React.ReactNode[]) => <View key={node.key}>{children}</View>,
  tr: trRule,
  th: cellRule(true),
  td: cellRule(false),
  text: textRule,
  image: imageRule,
};
