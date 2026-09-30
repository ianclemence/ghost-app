import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AudioLines } from "lucide-react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ghost, Space } from "@/constants/theme";
import { GhostMark } from "@/components/ghost-mark";
import { EmberDot } from "@/components/thread";
import type { Presence } from "@/lib/presence";

/**
 * The top of the one conversation: who you're talking to and what it is
 * doing right now. Tapping Ghost opens its panel (what it's working on,
 * what's coming up, what it remembers, what it did). Voice is one tap away.
 */
export function PresenceHeader({
  name,
  status,
  scrolled,
  topInset,
  onOpenPanel,
  onVoice,
}: {
  name: string;
  status: Presence;
  scrolled: boolean;
  topInset: number;
  onOpenPanel: () => void;
  onVoice?: () => void;
}) {
  const light =
    status.tone === "working" ? <EmberDot size={8} /> :
    status.tone === "attention" ? <View style={[styles.light, { backgroundColor: Ghost.emberDeep }]} /> :
    status.tone === "offline" ? <View style={[styles.light, { backgroundColor: Ghost.text.tertiary }]} /> :
    <View style={[styles.light, { backgroundColor: Ghost.status.success }]} />;
  return (
    <View style={[styles.wrap, { paddingTop: topInset }, scrolled && styles.wrapScrolled]}>
      <Pressable
        onPress={onOpenPanel}
        style={({ pressed }) => [styles.who, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel={`${name}. ${status.text}.`}
        accessibilityHint="Opens what Ghost is doing, what's coming up, and what it remembers"
        hitSlop={6}
      >
        <View style={styles.markWrap}>
          <GhostMark size={18} />
          <View style={styles.lightWrap}>{light}</View>
        </View>
        <View style={styles.text}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Animated.Text key={status.text} entering={FadeIn.duration(200)} style={styles.status} numberOfLines={1}>
            {status.text}
          </Animated.Text>
        </View>
      </Pressable>
      {onVoice ? (
        <Pressable
          onPress={onVoice}
          style={({ pressed }) => [styles.voice, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="Talk to Ghost by voice"
          hitSlop={8}
        >
          <AudioLines size={20} color={Ghost.text.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Space.lg,
    paddingBottom: Space.xs,
    backgroundColor: Ghost.bg.base,
  },
  wrapScrolled: {},
  who: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    minHeight: 44,
  },
  markWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Ghost.bg.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.border.default,
    alignItems: "center",
    justifyContent: "center",
  },
  lightWrap: {
    position: "absolute",
    right: -1,
    bottom: -1,
    padding: 2,
    borderRadius: 8,
    backgroundColor: Ghost.bg.base,
  },
  light: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600",
    letterSpacing: -0.15,
    color: Ghost.text.primary,
  },
  status: {
    fontSize: 12.5,
    lineHeight: 16,
    color: Ghost.text.secondary,
  },
  voice: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
