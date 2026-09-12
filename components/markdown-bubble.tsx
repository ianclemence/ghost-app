import { Linking } from "react-native";
import React, { memo } from "react";
import Markdown from "react-native-markdown-display";
import { Ghost } from "@/constants/theme";
import { prepareStreamingMarkdown } from "@/lib/streaming";

const markdownStyle = {
  body: {
    color: Ghost.text.primary,
    fontSize: 16,
    lineHeight: 24,
  },
  heading1: {
    color: Ghost.text.primary,
    fontSize: 20,
    fontWeight: "700" as const,
    marginVertical: 6,
  },
  heading2: {
    color: Ghost.text.primary,
    fontSize: 18,
    fontWeight: "700" as const,
    marginVertical: 4,
  },
  heading3: {
    color: Ghost.text.primary,
    fontSize: 16,
    fontWeight: "700" as const,
    marginVertical: 4,
  },
  strong: {
    color: Ghost.text.primary,
    fontWeight: "700" as const,
  },
  em: {
    color: Ghost.text.primary,
    fontStyle: "italic" as const,
  },
  link: {
    color: Ghost.accent.primary,
  },
  code_inline: {
    color: Ghost.text.primary,
    backgroundColor: Ghost.bg.sunken,
    fontSize: 14,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  fence: {
    backgroundColor: Ghost.bg.sunken,
    padding: 10,
    borderRadius: 8,
    marginVertical: 6,
  },
  code_block: {
    backgroundColor: Ghost.bg.sunken,
    padding: 10,
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
  table: {
    borderColor: Ghost.bg.sunken,
    marginVertical: 6,
  },
  th: {
    color: Ghost.text.primary,
    fontWeight: "700" as const,
    padding: 6,
  },
  td: {
    color: Ghost.text.primary,
    padding: 6,
  },
  hr: {
    backgroundColor: Ghost.bg.sunken,
    height: 1,
    marginVertical: 8,
  },
};

function openExternal(url: string): boolean {
  void Linking.openURL(url).catch(() => {});
  return true;
}

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
  // Default style merging stays on: custom tokens override the built-in
  // defaults, and keys we don't touch keep their base rendering.
  return (
    <Markdown style={markdownStyle} onLinkPress={openExternal}>
      {renderContent(content, streaming)}
    </Markdown>
  );
});
