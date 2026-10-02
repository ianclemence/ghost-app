import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
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
import { AlarmClock, Info, Repeat, TriangleAlert } from "lucide-react-native";
import { Ghost, Inter, Radius, Space } from "@/constants/theme";
import { MarkdownBubble, UserMarkdown } from "@/components/markdown-bubble";
import { NoticeCard } from "@/components/notice-card";
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
  attachments,
}: {
  message: ExtendedMessage;
  showTime: boolean;
  groupStart: boolean;
  animate: boolean;
  /** Photos and files sent with this message, drawn at the bubble's edge. */
  attachments?: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const { copied, copy } = useCopy(message.content);
  const hasText = message.content.trim().length > 0;
  // Tapping a message shows when it was sent, for the one you are wondering about.
  const [exact, setExact] = useState(false);
  return (
    <Animated.View entering={enter(reduce, animate)} style={[styles.userRow, groupStart && styles.groupGap]}>
      {showTime ? <Text style={styles.timeCaption} accessibilityLabel={`Sent ${clockTime(message.timestamp)}`}>{clockTime(message.timestamp)}</Text> : null}
      {attachments}
      {hasText || !attachments ? (
      <Pressable
        onPress={() => setExact((v) => !v)}
        onLongPress={copy}
        delayLongPress={350}
        accessibilityRole="text"
        accessibilityLabel={`You said: ${message.content}`}
        accessibilityHint="Tap to see when you sent it. Long press to copy"
        style={({ pressed }) => [styles.bubble, pressed && styles.bubblePressed]}
      >
        <UserMarkdown content={message.content} />
      </Pressable>
      ) : null}
      {exact ? <Text style={[styles.meta, styles.metaRight]}>{clockTime(message.timestamp)}</Text> : null}
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
  animate,
}: {
  message: ExtendedMessage;
  outOfTurn: boolean;
  showTime: boolean;
  groupStart: boolean;
  /** Live phase text while this message is still being produced. */
  phase: string | null;
  animate: boolean;
}) {
  const reduce = useReducedMotion();
  const { copied, copy } = useCopy(message.content);
  const streaming = message.status === "streaming";
  const empty = !message.content.trim();
  const [exact, setExact] = useState(false);
  // What Ghost started by itself is a card, not a paragraph with a label.
  if (message.kind && !empty) {
    return (
      <Animated.View entering={enter(reduce, animate)} style={[styles.ghostRow, groupStart && styles.groupGap]}>
        <Pressable onLongPress={copy} delayLongPress={350} accessibilityHint="Long press to copy">
          <NoticeCard kind={message.kind} time={clockTime(message.timestamp)} content={message.content} />
        </Pressable>
        {copied ? <Copied align="left" /> : null}
      </Animated.View>
    );
  }
  return (
    <Animated.View entering={enter(reduce, animate)} style={[styles.ghostRow, groupStart && styles.groupGap]}>
      {message.kind ? (
        <KindLabel kind={message.kind} time={showTime || message.kind !== undefined ? clockTime(message.timestamp) : null} />
      ) : outOfTurn ? (
        // Ghost spoke first: that is worth marking, with the amber light.
        <View style={styles.eyebrow} accessible accessibilityLabel={`Ghost, on its own, at ${clockTime(message.timestamp)}`}>
          <EmberDot size={6} active={false} />
          <Text style={styles.meta}>{clockTime(message.timestamp)}</Text>
        </View>
      ) : showTime ? (
        <Text style={styles.timeCaption} accessibilityLabel={clockTime(message.timestamp)}>{clockTime(message.timestamp)}</Text>
      ) : null}
      {empty && streaming ? (
        <Thinking phase={phase} />
      ) : (
        <Pressable
          onPress={() => setExact((v) => !v)}
          onLongPress={copy}
          delayLongPress={350}
          disabled={streaming}
          accessibilityHint={streaming ? undefined : "Tap to see when Ghost wrote it. Long press to copy"}
        >
          <MarkdownBubble content={message.content} streaming={streaming} />
        </Pressable>
      )}
      {streaming && !empty && phase ? <Thinking phase={phase} compact /> : null}
      {exact && !streaming ? <Text style={styles.meta}>{clockTime(message.timestamp)}</Text> : null}
      {copied ? <Copied align="left" /> : null}
    </Animated.View>
  );
});

const KINDS = {
  reminder: { label: "Reminder", Icon: AlarmClock, tint: () => Ghost.accent.primary },
  notice: { label: "Ghost noticed", Icon: Info, tint: () => Ghost.text.secondary },
  alert: { label: "Needs you", Icon: TriangleAlert, tint: () => Ghost.emberDeep },
  routine: { label: "Routine", Icon: Repeat, tint: () => Ghost.status.success },
} as const;

/**
 * What Ghost started by itself, named above the message so a glance tells
 * "Ghost answered me" from "Ghost is telling me something": a reminder, a
 * notice, an alert, a routine's result. One quiet line, tinted; the message
 * itself reads like any other.
 */
export function KindLabel({ kind, time }: { kind: keyof typeof KINDS; time: string | null }) {
  const k = KINDS[kind];
  if (!k) return null;
  const tint = k.tint();
  return (
    <View
      style={styles.eyebrow}
      accessible
      accessibilityRole="header"
      accessibilityLabel={time ? `${k.label}, ${time}` : k.label}
    >
      <k.Icon size={13} color={tint} strokeWidth={2.2} />
      <Text style={[styles.kindText, { color: tint }]}>{k.label}</Text>
      {time ? <Text style={styles.meta}>{time}</Text> : null}
    </View>
  );
}

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
  kindText: {
    fontFamily: Inter.regular,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  userRow: {
    alignItems: "flex-end",
    marginTop: Space.xs,
  },
  bubble: {
    maxWidth: "84%",
    backgroundColor: Ghost.bubble.user,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
    borderRadius: 24,
    borderCurve: "continuous",
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  bubblePressed: {
    opacity: 0.85,
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
    fontFamily: Inter.regular,
    fontSize: 12,
    lineHeight: 16,
    color: Ghost.text.tertiary,
    marginTop: 3,
  },
  metaRight: {
    textAlign: "right",
  },
  // A pause in the conversation: one centred time before what follows, the
  // way messaging apps mark it, so it never looks like it belongs to one bubble.
  timeCaption: {
    alignSelf: "center",
    fontSize: 12,
    lineHeight: 16,
    color: Ghost.text.tertiary,
    marginTop: 10,
    marginBottom: 8,
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
    fontFamily: Inter.regular,
    fontSize: 15,
    lineHeight: 20,
    color: Ghost.text.tertiary,
    flexShrink: 1,
  },
});
