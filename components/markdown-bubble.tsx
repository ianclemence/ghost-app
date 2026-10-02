import React, { memo } from "react";
import Markdown, { MarkdownIt } from "react-native-markdown-display";
import { StyleSheet } from "react-native";
import { Fonts, Ghost, Inter } from "@/constants/theme";
import { prepareStreamingMarkdown } from "@/lib/streaming";
import { openExternalUrl } from "@/lib/links";
import { markdownRules } from "@/components/markdown-rules";

/**
 * One markdown-it instance for every bubble: linkify turns bare URLs into
 * tappable links (the terminal conceals them; the phone opens them), and
 * typographer keeps quotes/dashes smart. Parsing is deterministic and
 * local — no plugins that could inject HTML.
 */
const markdownIt = MarkdownIt({
  typographer: true,
  linkify: true,
  // Model output is untrusted and the terminal shows raw HTML literally;
  // the phone must not diverge by executing it.
  html: false,
});

// Quiet typography: one ink colour, weight and space doing the hierarchy, and
// the accent kept for things you can tap.
const markdownStyle = {
  body: {
    color: "rgba(255,255,255,0.86)",
    fontFamily: Inter.light,
    fontSize: 18.5,
    lineHeight: 28,
    letterSpacing: -0.25,
  },
  // Titles in a reply are in the serif voice, like every other title in the app.
  heading1: {
    color: Ghost.text.primary,
    fontSize: 32,
    lineHeight: 40,
    fontFamily: Fonts.voice,
    letterSpacing: -0.6,
    marginTop: 18,
    marginBottom: 6,
  },
  heading2: {
    color: Ghost.text.primary,
    fontSize: 26,
    lineHeight: 33,
    fontFamily: Fonts.voice,
    letterSpacing: -0.45,
    marginTop: 18,
    marginBottom: 5,
  },
  heading3: {
    color: Ghost.text.primary,
    fontSize: 16.5,
    lineHeight: 23,
    fontFamily: Inter.semibold,
    letterSpacing: -0.1,
    marginTop: 14,
    marginBottom: 3,
  },
  heading4: {
    color: Ghost.text.secondary,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Inter.semibold,
    marginTop: 12,
    marginBottom: 2,
  },
  heading5: {
    color: Ghost.text.secondary,
    fontSize: 13,
    fontFamily: Inter.semibold,
  },
  heading6: {
    color: Ghost.text.tertiary,
    fontSize: 12.5,
    fontFamily: Inter.semibold,
  },
  strong: {
    color: Ghost.text.primary,
    fontFamily: Inter.semibold,
  },
  em: {
    color: Ghost.text.primary,
    fontStyle: "italic" as const,
  },
  s: {
    color: Ghost.text.secondary,
    textDecorationLine: "line-through" as const,
  },
  link: {
    color: Ghost.accent.primary,
    fontFamily: Inter.medium,
    textDecorationLine: "none" as const,
  },
  code_inline: {
    color: Ghost.text.primary,
    backgroundColor: Ghost.bg.sunken,
    fontSize: 13.5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    fontFamily: Fonts?.mono ?? "monospace",
  },
  fence: {
    backgroundColor: "transparent",
    padding: 0,
    marginVertical: 8,
  },
  code_block: {
    backgroundColor: "transparent",
    padding: 0,
    marginVertical: 8,
  },
  // A quote is set apart by an amber bar, the one warm colour in the identity.
  blockquote: {
    backgroundColor: "transparent",
    borderLeftColor: "rgba(255,169,40,0.55)",
    borderLeftWidth: 2,
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: 2,
    marginVertical: 8,
    marginLeft: 0,
  },
  bullet_list: {
    marginVertical: 4,
  },
  ordered_list: {
    marginVertical: 4,
  },
  list_item: {
    marginVertical: 3,
  },
  bullet_list_icon: {
    color: Ghost.text.tertiary,
    marginLeft: 2,
    marginRight: 10,
  },
  ordered_list_icon: {
    color: Ghost.text.tertiary,
    marginLeft: 2,
    marginRight: 8,
    fontVariant: ["tabular-nums" as const],
  },
  hr: {
    backgroundColor: Ghost.border.default,
    height: StyleSheet.hairlineWidth,
    marginVertical: 18,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 10,
  },
};

/**
 * What the owner writes is rendered with only the syntaxes that are chosen on
 * purpose: code spans, fenced code and links, with line breaks kept. Emphasis,
 * lists, headings and quotes stay literal, so a stray "*" or "1." in an
 * ordinary sentence never changes how your own words look.
 */
const userMarkdownIt = MarkdownIt("zero", { breaks: true, linkify: true, html: false }).enable([
  "paragraph",
  "newline",
  "text",
  "fence",
  "code",
  "backticks",
  "escape",
  "entity",
  "linkify",
]);

const userMarkdownStyle = {
  ...markdownStyle,
  body: {
    color: Ghost.text.primary,
    fontFamily: Inter.light,
    fontSize: 17,
    lineHeight: 25,
    letterSpacing: -0.2,
  },
  paragraph: { marginTop: 0, marginBottom: 0 },
};

export const UserMarkdown = memo(function UserMarkdown({ content }: { content: string }) {
  return (
    <Markdown
      style={userMarkdownStyle}
      rules={markdownRules}
      markdownit={userMarkdownIt}
      onLinkPress={(url) => {
        void openExternalUrl(url);
        return true;
      }}
    >
      {content}
    </Markdown>
  );
});

interface Props {
  /** Full message text. */
  content: string;
  /** True while the turn is still streaming: incomplete constructs are held back. */
  streaming: boolean;
}

function renderContent(content: string, streaming: boolean): string {
  if (!content) return content;
  return streaming ? prepareStreamingMarkdown(content) : content;
}

/**
 * Assistant message bubble with streaming-safe markdown.
 *
 * Completed messages render verbatim; in-progress text passes through the
 * streaming filter so half-written fences, tables, and markers never flash
 * raw. Memoized on content so settled messages never re-parse.
 */
export const MarkdownBubble = memo(function MarkdownBubble({ content, streaming }: Props) {
  // mergeStyle stays on (default): our tokens override the library's, and
  // anything we don't define (body, textgroup, softbreak, ...) keeps its
  // base rendering instead of silently losing color and size.
  return (
    <Markdown
      style={markdownStyle}
      rules={markdownRules}
      markdownit={markdownIt}
      onLinkPress={(url) => {
        void openExternalUrl(url);
        return true;
      }}
    >
      {renderContent(content, streaming)}
    </Markdown>
  );
});
