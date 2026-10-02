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
import { View } from "react-native";
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
 * Inline code as a rounded chip. React Native cannot round the background of
 * a run of text, so a short command (`allow once`, `deny`) is drawn as a small
 * pill that sits inside the line. Long inline code is left as a plain run so
 * it can still wrap instead of overflowing.
 */
const CHIP_MAX = 36;
function codeInlineRule(node: ASTNode, _children: React.ReactNode[], _parents: ASTNode[], styles: Record<string, object>) {
  const code: string = node.content ?? "";
  if (code.length > CHIP_MAX) {
    return <Text key={node.key} style={styles.code_inline}>{code}</Text>;
  }
  return (
    <Text key={node.key}>
      <View style={chipStyles.chip}>
        <Text style={chipStyles.code}>{code}</Text>
      </View>
    </Text>
  );
}

const chipStyles = {
  chip: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 10,
    borderCurve: "continuous" as const,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 8,
    paddingVertical: 1,
    // Inline views sit on the baseline; pull the chip down so its text lines
    // up with the words around it.
    marginBottom: -3,
  },
  code: {
    fontFamily: Fonts?.mono ?? "monospace",
    fontSize: 13.5,
    lineHeight: 20,
    color: Ghost.text.primary,
  },
};

export const markdownRules = {
  code_inline: codeInlineRule,
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
