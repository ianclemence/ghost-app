import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Ghost, Radius, Space } from "@/constants/theme";
import { MarkdownBubble } from "@/components/markdown-bubble";
import { clockTime } from "@/lib/thread";
import type { ExtendedMessage } from "@/lib/store";

const EASE = Easing.bezier(0.23, 1, 0.32, 1);

/** Quiet centered day label between days of the conversation. */
export const DaySeparator = memo(function DaySeparator({ label }: { label: string }) {
  return (
    <View style={styles.day} accessibilityRole="header" accessible accessibilityLabel={label}>
      <Text style={styles.dayText}>{label}</Text>
    </View>
  );
});

/** Ember breathing dot: Ghost's presence light. Static under reduced motion. */
export function EmberDot({ size = 7, active = true }: { size?: number; active?: boolean }) {
  const o = useSharedValue(1);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!active || reduce) {
      o.set(1);
      return;
    }
    o.set(withRepeat(withSequence(withTiming(0.35, { duration: 700 }), withTiming(1, { duration: 700 })), -1, false));
  }, [active, reduce, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.get() }));
  return (
    <Animated.View
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: Ghost.emberDeep }, style]}
    />
  );
}

/** Copy-on-long-press with a tick of feedback. Returns handlers + state. */
function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (t.current) clearTimeout(t.current);
  }, []);
  const copy = useCallback(() => {
    if (!text.trim()) return;
    void Clipboard.setStringAsync(text).catch(() => {});
    Haptics.selectionAsync().catch(() => {});
    setCopied(true);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setCopied(false), 1400);
  }, [text]);
  return { copied, copy };
}

function Copied({ align }: { align: "left" | "right" }) {
  return (
    <Animated.Text
      entering={FadeIn.duration(120)}
      exiting={FadeOut.duration(200)}
      style={[styles.meta, { textAlign: align }]}
      accessibilityLiveRegion="polite"
    >
      Copied
    </Animated.Text>
  );
}

function enter(reduce: boolean, animate: boolean) {
  if (reduce || !animate) return undefined;
  return FadeInDown.duration(240).easing(EASE).withInitialValues({ transform: [{ translateY: 8 }] });
}

export const UserMessage = memo(function UserMessage({
  message,
  showTime,
  groupStart,
  animate,
}: {
  message: ExtendedMessage;
  showTime: boolean;
  groupStart: boolean;
  animate: boolean;
}) {
  const reduce = useReducedMotion();
  const { copied, copy } = useCopy(message.content);
  return (
    <Animated.View entering={enter(reduce, animate)} style={[styles.userRow, groupStart && styles.groupGap]}>
      {showTime ? <Text style={[styles.meta, styles.metaRight]}>{clockTime(message.timestamp)}</Text> : null}
      <Pressable
        onLongPress={copy}
        delayLongPress={350}
        accessibilityRole="text"
        accessibilityLabel={`You said: ${message.content}`}
        accessibilityHint="Long press to copy"
        style={({ pressed }) => [styles.bubble, pressed && styles.bubblePressed]}
      >
        <Text style={styles.userText} selectable={false}>{message.content}</Text>
      </Pressable>
      {message.status === "queued" ? (
        <Text style={[styles.meta, styles.metaRight]} accessibilityLiveRegion="polite">
          Waiting to send · goes out when you&apos;re back online
        </Text>
      ) : message.status === "failed" ? (
        <Text style={[styles.meta, styles.metaRight, styles.metaError]}>Not sent</Text>
      ) : null}
      {copied ? <Copied align="right" /> : null}
    </Animated.View>
  );
});

export const GhostMessage = memo(function GhostMessage({
  message,
  outOfTurn,
  showTime,
  groupStart,
  phase,
  origin,
  animate,
}: {
  message: ExtendedMessage;
  outOfTurn: boolean;
  showTime: boolean;
  groupStart: boolean;
  /** Live phase text while this message is still being produced. */
  phase: string | null;
  /** "Answered on this phone"-style provenance, when known. */
  origin: string | null;
  animate: boolean;
}) {
  const reduce = useReducedMotion();
  const { copied, copy } = useCopy(message.content);
  const streaming = message.status === "streaming";
  const empty = !message.content.trim();
  return (
    <Animated.View entering={enter(reduce, animate)} style={[styles.ghostRow, groupStart && styles.groupGap]}>
      {showTime ? (
        <View style={styles.eyebrow} accessible accessibilityLabel={outOfTurn ? `Ghost, on its own, at ${clockTime(message.timestamp)}` : clockTime(message.timestamp)}>
          {outOfTurn ? <EmberDot size={6} active={false} /> : null}
          <Text style={styles.meta}>{clockTime(message.timestamp)}</Text>
        </View>
      ) : null}
      {empty && streaming ? (
        <Thinking phase={phase} />
      ) : (
        <Pressable
          onLongPress={copy}
          delayLongPress={350}
          disabled={streaming}
          accessibilityHint={streaming ? undefined : "Long press to copy"}
        >
          <MarkdownBubble content={message.content} streaming={streaming} />
        </Pressable>
      )}
      {streaming && !empty && phase ? <Thinking phase={phase} compact /> : null}
      {!streaming && origin ? <Text style={styles.meta}>{origin}</Text> : null}
      {copied ? <Copied align="left" /> : null}
    </Animated.View>
  );
});

/** Presence while Ghost works: breathing ember + the runtime's phase. */
export function Thinking({ phase, compact }: { phase: string | null; compact?: boolean }) {
  const label = phase?.trim() || "Thinking";
  return (
    <View style={[styles.thinking, compact && styles.thinkingCompact]} accessibilityLiveRegion="polite" accessibilityLabel={label}>
      <EmberDot />
      <Animated.Text key={label} entering={FadeIn.duration(180)} style={styles.thinkingText} numberOfLines={1}>
        {label}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  day: {
    alignItems: "center",
    paddingTop: Space.xxl,
    paddingBottom: Space.xs,
  },
  dayText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    letterSpacing: 0.3,
    color: Ghost.text.tertiary,
  },
  groupGap: {
    marginTop: Space.lg,
  },
  userRow: {
    alignItems: "flex-end",
    marginTop: Space.xs,
  },
  bubble: {
    maxWidth: "84%",
    backgroundColor: Ghost.bubble.user,
    borderRadius: Radius.xl + 2,
    borderCurve: "continuous",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  bubblePressed: {
    opacity: 0.85,
  },
  userText: {
    fontSize: 16,
    lineHeight: 23,
    color: Ghost.text.primary,
  },
  ghostRow: {
    alignItems: "stretch",
    marginTop: Space.xs,
  },
  eyebrow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  meta: {
    fontSize: 12,
    lineHeight: 16,
    color: Ghost.text.tertiary,
    marginTop: 3,
  },
  metaRight: {
    textAlign: "right",
  },
  metaError: {
    color: Ghost.status.error,
  },
  thinking: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 26,
  },
  thinkingCompact: {
    marginTop: 6,
    minHeight: 18,
  },
  thinkingText: {
    fontSize: 15,
    lineHeight: 20,
    color: Ghost.text.tertiary,
    flexShrink: 1,
  },
});
