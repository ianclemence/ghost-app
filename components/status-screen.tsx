import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { Easing, FadeIn, useReducedMotion } from "react-native-reanimated";
import { Fonts, Ghost, Space } from "@/constants/theme";
import { GhostMark } from "@/components/ghost-mark";
import { ScreenBackground } from "@/components/screen-glow";

/**
 * One layout for every "something happened" screen: connecting, connected,
 * couldn't connect, disconnected, camera needed. The mark and its light say
 * the state before a word is read (amber when it is fine, red when it failed,
 * grey when this device is no longer paired), then a serif headline, a light
 * sentence, and the actions at the bottom where a thumb is.
 */
export type StatusTone = "ok" | "bad" | "off";

const LIGHT: Record<StatusTone, string> = {
  ok: Ghost.ember,
  bad: Ghost.status.error,
  off: Ghost.text.tertiary,
};

const ENTER = FadeIn.duration(300).easing(Easing.bezier(0.23, 1, 0.32, 1));

export function StatusScreen({
  title,
  body,
  tone = "ok",
  busy = false,
  hint,
  actions,
  hero = true,
}: {
  title: string;
  body?: string | null;
  tone?: StatusTone;
  /** A quiet spinner under the words: still working. */
  busy?: boolean;
  hint?: string;
  actions?: React.ReactNode;
  /** The full aurora (arrivals) or the calm one (problems). */
  hero?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  return (
    <View style={styles.container}>
      <ScreenBackground variant={hero ? "hero" : "calm"} />
      <Animated.View entering={reduce ? undefined : ENTER} style={[styles.content, { paddingTop: insets.top }]}>
        <GhostMark size={64} dot={LIGHT[tone]} color={tone === "off" ? Ghost.text.secondary : Ghost.text.primary} />
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        {body ? <Text style={styles.body}>{body}</Text> : null}
        {busy ? <ActivityIndicator color={Ghost.text.secondary} style={{ marginTop: Space.sm }} /> : null}
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </Animated.View>
      {actions ? <View style={[styles.actions, { paddingBottom: insets.bottom + Space.xl }]}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base, paddingHorizontal: Space.xl },
  content: { flex: 1, alignItems: "center", justifyContent: "center", gap: Space.md },
  title: {
    fontFamily: Fonts.voice,
    fontSize: 42,
    lineHeight: 50,
    letterSpacing: -0.9,
    color: Ghost.text.primary,
    textAlign: "center",
    marginTop: Space.md,
  },
  body: {
    fontSize: 18,
    lineHeight: 27,
    fontWeight: "300",
    letterSpacing: -0.25,
    color: "rgba(255,255,255,0.78)",
    textAlign: "center",
    maxWidth: 320,
  },
  hint: { fontSize: 13.5, color: Ghost.text.tertiary, textAlign: "center", marginTop: Space.xs },
  actions: { gap: Space.sm, alignSelf: "stretch" },
});
