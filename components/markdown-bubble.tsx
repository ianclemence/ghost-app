import React, { memo } from "react";
import Markdown, { MarkdownIt } from "react-native-markdown-display";
import { Ghost, Type } from "@/constants/theme";
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

const markdownStyle = {
  body: {
    color: Ghost.text.primary,
    ...Type.body,
  },
  heading1: {
    color: Ghost.accent.primary,
    fontSize: 21,
    lineHeight: 28,
    fontWeight: "700" as const,
    marginTop: 10,
    marginBottom: 4,
  },
  heading2: {
    color: Ghost.accent.primary,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: "700" as const,
    marginTop: 8,
    marginBottom: 3,
  },
  heading3: {
    color: Ghost.accent.primary,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "600" as const,
    marginTop: 6,
    marginBottom: 2,
  },
  heading4: {
    color: Ghost.text.primary,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "600" as const,
  },
  heading5: {
    color: Ghost.text.primary,
    fontSize: 15,
    fontWeight: "600" as const,
  },
  heading6: {
    color: Ghost.text.tertiary,
    fontSize: 14,
    fontWeight: "600" as const,
  },
  strong: {
    color: Ghost.text.primary,
    fontWeight: "700" as const,
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
    textDecorationLine: "underline" as const,
  },
  code_inline: {
    color: Ghost.text.primary,
    backgroundColor: Ghost.bg.sunken,
    fontSize: 14,
    paddingHorizontal: 4,
    borderRadius: 4,
    fontFamily: "monospace",
  },
  fence: {
    backgroundColor: Ghost.bg.sunken,
    padding: 0,
    borderRadius: 8,
    marginVertical: 6,
  },
  code_block: {
    backgroundColor: Ghost.bg.sunken,
    padding: 0,
    borderRadius: 8,
    marginVertical: 6,
  },
  blockquote: {
    backgroundColor: Ghost.bg.raised,
    borderLeftColor: Ghost.accent.medium,
    borderLeftWidth: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginVertical: 6,
  },
  bullet_list: {
    marginVertical: 4,
  },
  ordered_list: {
    marginVertical: 4,
  },
  list_item: {
    marginVertical: 2,
  },
  bullet_list_icon: {
    color: Ghost.text.secondary,
    marginRight: 8,
  },
  ordered_list_icon: {
    color: Ghost.text.secondary,
    marginRight: 8,
  },
  table: {
    borderColor: Ghost.border.default,
    borderWidth: 1,
    marginVertical: 6,
  },
  tr: {
    borderBottomColor: Ghost.border.subtle,
    borderBottomWidth: 1,
  },
  th: {
    color: Ghost.text.primary,
    fontWeight: "700" as const,
    padding: 8,
    backgroundColor: Ghost.bg.sunken,
  },
  td: {
    color: Ghost.text.primary,
    padding: 8,
  },
  hr: {
    backgroundColor: Ghost.border.default,
    height: 1,
    marginVertical: 10,
  },
  paragraph: {
    marginVertical: 2,
  },
};

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
