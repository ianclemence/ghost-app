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
import { Check, Copy } from "lucide-react-native";
import { Fonts, Ghost } from "@/constants/theme";
import { highlightTokens, splitTokenLines } from "@/lib/highlight";
import { syntaxStyle } from "@/lib/syntax-theme";

interface Props {
  /** Fence info string, e.g. "go". Empty when the model gave none. */
  language: string;
  /** Raw block content (trailing newline trimmed by the caller). */
  code: string;
}

/** Numbers appear once a block is long enough to refer to a line. */
const NUMBERED_FROM = 5;

export const CodeBlock = memo(function CodeBlock({ language, code }: Props) {
  const [copied, setCopied] = useState(false);
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
      <View accessibilityLabel={code}>
        {rows.map((row, r) => (
          <View key={r} style={styles.row}>
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
    color: Ghost.text.primary,
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
