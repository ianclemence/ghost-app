import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Space, Type } from "@/constants/theme";
import { ScreenBackground } from "@/components/screen-glow";
import { PlusMenu } from "@/components/plus-menu";
import { LiveOrb, LiveWaveform } from "@/components/live-waveform";
import { useLiveSession } from "@/lib/live/use-live-session";
import { fetchLiveStatus } from "@/lib/live/ghostSessionApi";
import { VOICES } from "@/lib/live/voices";
import { useGhostStore } from "@/lib/store";

function fmtElapsed(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function LiveVoiceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { config, connectionState } = useGhostStore();
  const { live, snapshot, voice, setVoice } = useLiveSession(config);
  const [status, setStatus] = useState<{ enabled: boolean; checked: boolean }>({
    enabled: false,
    checked: false,
  });

  useEffect(() => {
    if (!config) {
      setStatus({ enabled: false, checked: true });
      return;
    }
    let cancelled = false;
    fetchLiveStatus(config).then((s) => {
      if (cancelled) return;
      setStatus({ enabled: s?.enabled === true, checked: true });
    }).catch(() => {
      if (!cancelled) setStatus({ enabled: false, checked: true });
    });
    return () => {
      cancelled = true;
    };
  }, [config]);

  useEffect(() => {
    return () => {
      void live?.stop().catch(() => {});
    };
  }, [live]);

  const busy =
    snapshot.status === "connecting" || snapshot.status === "disconnecting";
  const connected = snapshot.status === "connected";
  const voiceLocked = busy || connected;
  const offline = !config || connectionState !== "online";
  const speaking = connected && snapshot.outputLevel > 0.035;
  const listening = connected && !snapshot.muted && !speaking;

  const start = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    void live?.start(voice).catch(() => {});
  };
  const toggleMute = () => {
    void Haptics.selectionAsync().catch(() => {});
    live?.toggleMute();
  };
  const end = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    void live?.stop().catch(() => {});
  };

  const transcript = [...snapshot.transcript].reverse();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenBackground />
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={12}
          style={styles.backHit}
        >
          <Text style={styles.back}>{"‹ Back"}</Text>
        </Pressable>
        <Text style={styles.title}>Live voice</Text>
        <Text style={styles.route}>{config ? "via home Pod" : "no Pod"}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <LiveOrb speaking={speaking} listening={listening} />
        <Text style={styles.state}>
          {snapshot.status === "connected"
            ? speaking
              ? "Ghost is speaking, jump in anytime"
              : snapshot.muted
                ? "Mic muted"
                : "Listening"
            : snapshot.status === "connecting"
              ? "Connecting…"
              : snapshot.status === "disconnecting"
                ? "Ending…"
                : snapshot.status === "error"
                  ? "Call ended"
                  : "Tap Start to talk"}
        </Text>
        {connected ? (
          <Text style={styles.elapsed}>{fmtElapsed(snapshot.elapsedSeconds)} / 10:00</Text>
        ) : null}
        {snapshot.error ? <Text style={styles.error}>{snapshot.error}</Text> : null}
        {!status.checked ? (
          <Text style={styles.honest}>Checking live voice…</Text>
        ) : null}
        {offline ? (
          <Text style={styles.honest}>
            {config
              ? "Your Ghost is offline, so live voice is paused. Text still works."
              : "Pair your Ghost Pod for live voice. Text chat works on this phone."}
          </Text>
        ) : null}
        {status.checked && !status.enabled && !offline ? (
          <Text style={styles.honest}>
            {"Live voice needs an OpenAI key. Add one under Intelligence."}
          </Text>
        ) : null}

        <LiveWaveform
          level={Math.max(snapshot.inputLevel, snapshot.outputLevel)}
          speaking={speaking}
        />

        <View style={styles.controls}>
          <Pressable
            style={[styles.mute, snapshot.muted && styles.muteOn, !connected && styles.disabled]}
            disabled={!connected}
            onPress={toggleMute}
            accessibilityLabel={snapshot.muted ? "Unmute" : "Mute"}
            accessibilityRole="button"
          >
            <Text style={styles.muteText}>
              {snapshot.muted ? "Unmute" : "Mute"}
            </Text>
          </Pressable>
          {connected || busy ? (
            <Pressable
              style={[styles.end, busy && styles.disabled]}
              disabled={busy}
              onPress={end}
              accessibilityLabel="End call"
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator color="#FAFAF7" />
              ) : (
                <Text style={styles.endText}>End</Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              style={[styles.start, (offline || !status.enabled) && styles.disabled]}
              disabled={offline || !status.enabled}
              onPress={start}
              accessibilityLabel="Start live call"
              accessibilityRole="button"
            >
              <Text style={styles.startText}>Start</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.section}>Voice</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.voiceRow}
          style={styles.voiceScroll}
        >
          {VOICES.map((v) => {
            const active = v.id === voice;
            return (
              <Pressable
                key={v.id}
                disabled={voiceLocked}
                onPress={() => setVoice(v.id)}
                style={[styles.chip, active && styles.chipActive, voiceLocked && styles.disabled]}
                accessibilityLabel={`Voice ${v.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled: voiceLocked }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{v.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {voiceLocked ? <Text style={styles.lock}>Voice stays fixed for this call.</Text> : null}

        <Text style={styles.section}>Transcript</Text>
        {transcript.length === 0 ? (
          <Text style={styles.empty}>What you both say appears here while you talk.</Text>
        ) : (
          <View style={styles.thread}>
            {transcript.map((item) => (
              <View
                key={item.id}
                style={[styles.bubble, item.role === "user" ? styles.user : styles.ghost]}
              >
                <Text style={styles.bubbleText}>{item.text}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={{ height: 120 }} />
      </ScrollView>
      <PlusMenu />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Space.xl,
    paddingVertical: Space.sm,
    minHeight: 52,
  },
  backHit: { minWidth: 72, minHeight: 44, justifyContent: "center" },
  back: { fontSize: 16, color: Ghost.accent.primary },
  title: { ...Type.headline, color: Ghost.text.primary },
  route: { fontSize: 12, color: Ghost.text.secondary, minWidth: 72, textAlign: "right" },
  body: { alignItems: "stretch", paddingHorizontal: Space.xl, paddingTop: Space.md },
  state: { ...Type.headline, color: Ghost.text.primary, marginTop: Space.md, textAlign: "center" },
  elapsed: {
    fontSize: 13,
    color: Ghost.text.secondary,
    marginTop: 4,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  error: { fontSize: 13, color: Ghost.status.error, marginTop: Space.sm, textAlign: "center" },
  honest: {
    fontSize: 13,
    lineHeight: 18,
    color: Ghost.text.secondary,
    marginTop: Space.sm,
    textAlign: "center",
    maxWidth: 480,
    alignSelf: "center",
  },
  controls: {
    flexDirection: "row",
    gap: Space.md,
    marginTop: Space.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  mute: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: Space.xl,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Ghost.border.default,
    backgroundColor: Ghost.bg.raised,
  },
  muteOn: { backgroundColor: Ghost.accent.soft, borderColor: Ghost.accent.primary },
  muteText: { fontSize: 16, fontWeight: "600", color: Ghost.text.primary },
  start: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: Space.xxxl,
    borderRadius: 999,
    backgroundColor: Ghost.accent.primary,
  },
  startText: { fontSize: 16, fontWeight: "700", color: "#FAFAF7" },
  end: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: Space.xxxl,
    borderRadius: 999,
    backgroundColor: Ghost.status.error,
  },
  endText: { fontSize: 16, fontWeight: "700", color: "#FAFAF7" },
  disabled: { opacity: 0.45 },
  section: {
    fontSize: 13,
    fontWeight: "700",
    color: Ghost.text.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: Space.xxl,
    marginBottom: Space.sm,
  },
  voiceScroll: { marginHorizontal: -Space.xl },
  voiceRow: { gap: Space.sm, paddingHorizontal: Space.xl, paddingVertical: 4 },
  chip: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: Space.lg,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Ghost.border.default,
    backgroundColor: Ghost.bg.raised,
  },
  chipActive: { backgroundColor: Ghost.accent.primary, borderColor: Ghost.accent.primary },
  chipText: { fontSize: 14, color: Ghost.text.primary },
  chipTextActive: { color: "#FAFAF7", fontWeight: "600" },
  lock: { fontSize: 12, color: Ghost.text.tertiary, marginTop: Space.sm },
  empty: { fontSize: 14, lineHeight: 20, color: Ghost.text.tertiary, maxWidth: 480 },
  thread: { gap: Space.sm },
  bubble: {
    borderRadius: 14,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: Ghost.bg.raised,
    borderWidth: 1,
    borderColor: Ghost.border.subtle,
    maxWidth: "92%",
  },
  user: { alignSelf: "flex-end", backgroundColor: "#E4E2DC", borderColor: "transparent" },
  ghost: { alignSelf: "flex-start", backgroundColor: Ghost.bg.raised },
  bubbleText: { fontSize: 15, lineHeight: 21, color: Ghost.text.primary },
});
