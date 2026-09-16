import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Midnight, Space, Type } from "@/constants/theme";
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
    void live?.start(voice).catch(() => {});
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenBackground />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Go back" hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Live voice</Text>
        <Text style={styles.route}>{config ? "via home Pod" : "no Pod"}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <LiveOrb speaking={speaking} listening={listening} />
        <Text style={styles.state}>
          {snapshot.status === "connected"
            ? speaking
              ? "Ghost is speaking — talk over me"
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
        {offline ? (
          <Text style={styles.honest}>
            {config ? "Your Ghost is offline — live voice needs the Pod." : "Pair your Ghost Pod to use live voice. Text chat works on this phone."}
          </Text>
        ) : null}
        {!status.checked ? null : !status.enabled && !offline ? (
          <Text style={styles.honest}>
            {"Live voice isn't configured. Add an OpenAI key in Intelligence settings."}
          </Text>
        ) : null}

        <LiveWaveform level={Math.max(snapshot.inputLevel, snapshot.outputLevel)} live={speaking} />

        <View style={styles.controls}>
          <Pressable
            style={[styles.mute, snapshot.muted && styles.muteOn, !connected && styles.disabled]}
            disabled={!connected}
            onPress={() => live?.toggleMute()}
            accessibilityLabel={snapshot.muted ? "Unmute" : "Mute"}
            accessibilityRole="button"
          >
            <Text style={[styles.muteText, snapshot.muted && styles.muteTextOn]}>
              {snapshot.muted ? "Unmute" : "Mute"}
            </Text>
          </Pressable>
          {connected || busy ? (
            <Pressable
              style={[styles.end]}
              disabled={busy}
              onPress={() => {
                void live?.stop().catch(() => {});
              }}
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
        <View style={styles.voices}>
          {VOICES.map((v) => {
            const active = v.id === voice;
            return (
              <Pressable
                key={v.id}
                disabled={voiceLocked}
                onPress={() => setVoice(v.id)}
                style={[styles.chip, active && styles.chipActive, voiceLocked && styles.disabled]}
                accessibilityLabel={`Voice ${v.label}`}
                accessibilityState={{ selected: active, disabled: voiceLocked }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{v.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {voiceLocked ? <Text style={styles.lock}>Voice is fixed for this call.</Text> : null}

        <Text style={styles.section}>Transcript</Text>
        {snapshot.transcript.length === 0 ? (
          <Text style={styles.empty}>What you both say appears here, live.</Text>
        ) : (
          <FlatList
            data={[...snapshot.transcript].reverse()}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={[styles.bubble, item.role === "user" ? styles.user : styles.ghost]}>
                <Text style={[styles.bubbleText, item.role === "user" && styles.userText]}>
                  {item.text}
                </Text>
              </View>
            )}
          />
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
    paddingVertical: Space.md,
  },
  back: { fontSize: 16, color: Ghost.accent.primary, minWidth: 72 },
  title: { ...Type.headline, color: Ghost.text.primary },
  route: { fontSize: 12, color: Ghost.text.secondary, minWidth: 72, textAlign: "right" },
  body: { alignItems: "center", paddingHorizontal: Space.xl, paddingTop: Space.lg },
  state: { ...Type.headline, color: Ghost.text.primary, marginTop: Space.md, textAlign: "center" },
  elapsed: { fontSize: 13, color: Ghost.text.secondary, marginTop: 4, fontVariant: ["tabular-nums"] },
  error: { fontSize: 13, color: Ghost.status.error, marginTop: Space.sm, textAlign: "center" },
  honest: { fontSize: 13, color: Ghost.text.secondary, marginTop: Space.sm, textAlign: "center" },
  controls: { flexDirection: "row", gap: Space.md, marginTop: Space.lg, alignItems: "center" },
  mute: {
    paddingHorizontal: Space.xl,
    paddingVertical: Space.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Ghost.border.default,
    backgroundColor: Ghost.bg.raised,
  },
  muteOn: { backgroundColor: Midnight.surface, borderColor: Midnight.lineStrong },
  muteText: { fontSize: 16, fontWeight: "600", color: Ghost.text.primary },
  muteTextOn: { color: Midnight.ink },
  start: {
    paddingHorizontal: Space.xxxl,
    paddingVertical: Space.md,
    borderRadius: 999,
    backgroundColor: Ghost.accent.primary,
  },
  startText: { fontSize: 16, fontWeight: "700", color: "#FAFAF7" },
  end: {
    paddingHorizontal: Space.xxxl,
    paddingVertical: Space.md,
    borderRadius: 999,
    backgroundColor: Ghost.status.error,
  },
  endText: { fontSize: 16, fontWeight: "700", color: "#FAFAF7" },
  disabled: { opacity: 0.45 },
  section: {
    alignSelf: "flex-start",
    fontSize: 13,
    fontWeight: "700",
    color: Ghost.text.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: Space.xxl,
    marginBottom: Space.sm,
  },
  voices: { flexDirection: "row", flexWrap: "wrap", gap: Space.sm, alignSelf: "stretch" },
  chip: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Ghost.border.default,
    backgroundColor: Ghost.bg.raised,
  },
  chipActive: { backgroundColor: Ghost.accent.primary, borderColor: Ghost.accent.primary },
  chipText: { fontSize: 14, color: Ghost.text.primary },
  chipTextActive: { color: "#FAFAF7", fontWeight: "600" },
  lock: { alignSelf: "flex-start", fontSize: 12, color: Ghost.text.tertiary, marginTop: Space.sm },
  empty: { alignSelf: "flex-start", fontSize: 14, color: Ghost.text.tertiary },
  bubble: {
    alignSelf: "stretch",
    borderRadius: 14,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    marginBottom: Space.sm,
    backgroundColor: Ghost.bg.raised,
    borderWidth: 1,
    borderColor: Ghost.border.subtle,
  },
  user: { backgroundColor: "#E4E2DC", borderColor: "transparent" },
  ghost: { backgroundColor: Ghost.bg.raised },
  bubbleText: { fontSize: 15, lineHeight: 21, color: Ghost.text.primary },
  userText: { color: Ghost.text.primary },
});
