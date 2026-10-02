/**
 * Code fence block: language label, copy button, horizontal scroll.
 *
 * Long lines scroll sideways instead of pushing the chat layout wider;
 * the copy control is labelled for screen readers. No syntax
 * highlighting library: highlighting would cost a large dependency for
 * marginal gains on a phone screen, and monochrome code on the sunken
 * surface stays readable. (Deliberate, documented trade-off.)
 */
import React, { memo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import * as Clipboard from "expo-clipboard";
import { Check, Copy } from "lucide-react-native";
import { Fonts, Ghost, Radius } from "@/constants/theme";

interface Props {
  /** Fence info string, e.g. "go". Empty when the model gave none. */
  language: string;
  /** Raw block content (trailing newline trimmed by the caller). */
  code: string;
}

export const CodeBlock = memo(function CodeBlock({ language, code }: Props) {
  const [copied, setCopied] = useState(false);
  const label = language.trim().toLowerCase() || "code";

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
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={copied ? "Copied" : `Copy ${label} code`}
          accessibilityState={{ selected: copied }}
        >
          {copied ? (
            <Check size={15} color={Ghost.status.success} />
          ) : (
            <Copy size={15} color={Ghost.text.secondary} />
          )}
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text selectable style={styles.code}>
          {code}
        </Text>
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Ghost.bg.sunken,
    borderRadius: Radius.lg,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.border.subtle,
    marginVertical: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  lang: {
    color: Ghost.text.tertiary,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  code: {
    color: Ghost.text.primary,
    fontSize: 13.5,
    lineHeight: 20,
    fontFamily: Fonts?.mono ?? "monospace",
  },
});
