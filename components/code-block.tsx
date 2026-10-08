/**
 * Code fence block: language label, copy button, syntax colours, line
 * numbers on longer blocks.
 *
 * Long lines wrap inside the block, so a command or an error message is always
 * readable in full without hunting for a sideways scroll that nothing hints at
 * (they used to look cut off at the edge). Each line is its own row, so its
 * number stays beside its first line however many rows it wraps to. The copy
 * control is labelled for screen readers. Colours come from
 * lib/highlight.ts (highlight.js, only the common languages) and an editor-style
 * theme in the app's palette (lib/syntax-theme.ts). Highlighting only ever
 * colours the code: what you copy is exactly what Ghost wrote.
 */
import React, { memo, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import * as Clipboard from "expo-clipboard";
import { Check, Copy, Play } from "lucide-react-native";
import { useRouter } from "expo-router";
import { Fonts, Ghost } from "@/constants/theme";
import { highlightTokens, splitTokenLines } from "@/lib/highlight";
import { CODE_INK, diffRowTint, syntaxStyle } from "@/lib/syntax-theme";
import { documentFromFence, isRunnableFence } from "@/lib/canvas";
import { setCanvasDraft } from "@/lib/canvasDraft";

interface Props {
  /** Fence info string, e.g. "go". Empty when the model gave none. */
  language: string;
  /** Raw block content (trailing newline trimmed by the caller). */
  code: string;
}

/** A diff line that was added or removed, so the whole line can carry the tint. */
function diffKind(row: { kind: string | null }[]): "addition" | "deletion" | null {
  const k = row.find((t) => t.kind === "addition" || t.kind === "deletion")?.kind;
  return k === "addition" || k === "deletion" ? k : null;
}

/** Numbers appear once a block is long enough to refer to a line. */
const NUMBERED_FROM = 5;

export const CodeBlock = memo(function CodeBlock({ language, code }: Props) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  // HTML and SVG can be run as they stand: shown, not just read.
  const runnable = isRunnableFence(language) && code.trim().length > 0;
  const run = () => {
    setCanvasDraft({ title: language.trim().toLowerCase() === "svg" ? "SVG" : "HTML page", html: documentFromFence(code, language) });
    router.push("/canvas" as never);
  };
  const label = language.trim().toLowerCase() || "code";
  const tokens = useMemo(() => highlightTokens(code, language), [code, language]);
  const lines = code.split("\n").length;
  const numbered = lines >= NUMBERED_FROM;
  const rows = useMemo(() => splitTokenLines(tokens), [tokens]);
  // One width for every number in the block, so the code starts at the same
  // place on every row (10 is wider than 9).
  const gutterWidth = String(lines).length * 8.5;

  async function onCopy() {
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable: stay quiet, the code is still readable.
    }
  }

  return (
    <View style={styles.wrap} accessibilityLabel={`${label} code block`}>
      <View style={styles.header}>
        <Text style={styles.lang}>{label}</Text>
        <View style={styles.tools}>
        {runnable ? (
          <Pressable
            onPress={run}
            hitSlop={10}
            style={styles.runBtn}
            accessibilityRole="button"
            accessibilityLabel={`Run this ${label} and see it`}
          >
            <Play size={11} color={Ghost.text.primary} fill={Ghost.text.primary} />
            <Text style={styles.runText}>Run</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onCopy}
          hitSlop={10}
          style={styles.copy}
          accessibilityRole="button"
          accessibilityLabel={copied ? "Copied" : `Copy ${label} code`}
          accessibilityState={{ selected: copied }}
        >
          {copied ? (
            <Check size={14} color={Ghost.status.success} strokeWidth={2} />
          ) : (
            <Copy size={14} color={Ghost.text.secondary} strokeWidth={1.8} />
          )}
        </Pressable>
        </View>
      </View>
      <View accessibilityLabel={code}>
        {rows.map((row, r) => (
          <View key={r} style={[styles.row, diffKind(row) && { backgroundColor: diffRowTint(diffKind(row)!), marginHorizontal: -16, paddingHorizontal: 16 }]}>
            {numbered ? (
              <Text style={[styles.code, styles.gutter, { width: gutterWidth }]} selectable={false} accessibilityElementsHidden importantForAccessibility="no">
                {r + 1}
              </Text>
            ) : null}
            <Text selectable style={[styles.code, styles.text]}>
              {row.length === 0
                ? " "
                : row.map((t, i) => {
                    const s = syntaxStyle(t.kind);
                    if (!s) return t.text;
                    return (
                      <Text
                        key={i}
                        style={{
                          color: s.color,
                          fontStyle: s.italic ? "italic" : undefined,
                          // Bold names the mono face too: a weight alone would swap it for the interface font.
                          ...(s.bold ? { fontWeight: "700" as const, fontFamily: Fonts?.mono ?? "monospace" } : null),
                        }}
                      >
                        {t.text}
                      </Text>
                    );
                  })}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 22,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
    marginVertical: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  lang: {
    color: Ghost.text.tertiary,
    fontSize: 11.5,
    fontWeight: "500",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  tools: { flexDirection: "row", alignItems: "center", gap: 8 },
  runBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 28,
    paddingHorizontal: 11,
    borderRadius: 14,
    backgroundColor: "rgba(58,46,240,0.34)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(140,128,255,0.45)",
  },
  runText: { fontSize: 12.5, fontWeight: "600", color: Ghost.text.primary },
  copy: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Ghost.glass.fill,
  },
  row: { flexDirection: "row", alignItems: "flex-start" },
  // The text takes the rest of the row and wraps inside it.
  text: { flex: 1, flexShrink: 1 },
  code: {
    color: CODE_INK,
    fontSize: 13.5,
    lineHeight: 20,
    fontFamily: Fonts?.mono ?? "monospace",
  },
  gutter: {
    color: "rgba(255,255,255,0.28)",
    textAlign: "right",
    marginRight: 14,
    flexShrink: 0,
  },
});
