import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Check, Mic, MicOff, Phone, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Radius, Space, Type } from "@/constants/theme";
import { ScreenBackground } from "@/components/screen-glow";
import { GhostButton, GhostSheet } from "@/components/ghost";
import { VoiceOrb } from "@/components/live-waveform";
import { useLiveSession } from "@/lib/live/use-live-session";
import { fetchLiveStatus } from "@/lib/live/ghostSessionApi";
import { VOICES } from "@/lib/live/voices";
import { useGhostStore } from "@/lib/store";

const LIMIT_SECONDS = 600;

function clock(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Talk to Ghost out loud. One shape that listens and speaks, what was just said
 * under it, and three controls docked at the bottom. The voice and the full
 * transcript are a tap away, not on the screen.
 */
export default function LiveVoiceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { config, connectionState } = useGhostStore();
  const { live, snapshot, voice, setVoice } = useLiveSession(config);
  const [status, setStatus] = useState<{ enabled: boolean; checked: boolean }>({ enabled: false, checked: false });
  const [picking, setPicking] = useState(false);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    if (!config) {
      setStatus({ enabled: false, checked: true });
      return;
    }
    let cancelled = false;
    fetchLiveStatus(config)
      .then((s) => !cancelled && setStatus({ enabled: s?.enabled === true, checked: true }))
      .catch(() => !cancelled && setStatus({ enabled: false, checked: true }));
    return () => {
      cancelled = true;
    };
  }, [config]);

  useEffect(() => {
    return () => {
      void live?.stop().catch(() => {});
    };
  }, [live]);

  const connecting = snapshot.status === "connecting";
  const ending = snapshot.status === "disconnecting";
  const busy = connecting || ending;
  const connected = snapshot.status === "connected";
  const offline = !config || connectionState !== "online";
  const speaking = connected && snapshot.outputLevel > 0.035;
  const listening = connected && !snapshot.muted && !speaking;
  const canStart = !offline && status.enabled && !busy;
  const level = speaking ? snapshot.outputLevel : listening ? snapshot.inputLevel : 0;

  const state = connected
    ? speaking
      ? "Ghost is speaking"
      : snapshot.muted
        ? "Muted"
        : "Listening"
    : connecting
      ? "Connecting"
      : ending
        ? "Ending"
        : snapshot.status === "error"
          ? "Call ended"
          : "Ready";

  // One quiet line for whatever is in the way, most important first.
  const notice = snapshot.error
    ? snapshot.error
    : !config
      ? "Pair your Ghost Pod to talk by voice."
      : offline
        ? "Your Ghost is offline, so voice is paused. Text still works."
        : status.checked && !status.enabled
          ? "Voice needs an OpenAI key. Add one under Intelligence."
          : !status.checked
            ? "Checking voice…"
            : null;

  const left = LIMIT_SECONDS - snapshot.elapsedSeconds;
  const timer = connected ? (left <= 120 ? `Ends in ${clock(Math.max(0, left))}` : clock(snapshot.elapsedSeconds)) : null;

  // What was just said, largest first: the last thing, and the one before it softer.
  const recent = useMemo(() => snapshot.transcript.slice(-2), [snapshot.transcript]);
  const voiceName = VOICES.find((v) => v.id === voice)?.label ?? "Voice";

  const start = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    void live?.start(voice).catch(() => {});
  };
  const end = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    void live?.stop().catch(() => {});
  };
  const mute = () => {
    void Haptics.selectionAsync().catch(() => {});
    live?.toggleMute();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenBackground />

      <View style={styles.top}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
          <X size={22} color={Ghost.text.primary} strokeWidth={2} />
        </Pressable>
        <Text style={styles.route}>{config ? "Home Pod" : "No Pod"}</Text>
      </View>

      <View style={styles.stage}>
        <VoiceOrb level={level} speaking={speaking} listening={listening} connecting={connecting} />
        <Text style={styles.state} accessibilityLiveRegion="polite">{state}</Text>
        {timer ? <Text style={styles.timer}>{timer}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {!config ? (
          <View style={{ marginTop: Space.lg }}>
            <GhostButton title="Connect a Ghost Pod" onPress={() => router.push("/connect")} />
          </View>
        ) : null}

        {recent.length > 0 ? (
          <Pressable onPress={() => setReading(true)} style={styles.captions} accessibilityRole="button" accessibilityLabel="Open the transcript">
            {recent.map((t, i) => (
              <Text
                key={t.id}
                numberOfLines={3}
                style={[styles.caption, t.role === "user" && styles.captionYou, i < recent.length - 1 && styles.captionOld]}
              >
                {t.text}
              </Text>
            ))}
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.dock, { paddingBottom: insets.bottom + Space.xl }]}>
        <View style={styles.side}>
          <Pressable
            onPress={mute}
            disabled={!connected}
            style={[styles.round, snapshot.muted && styles.roundOn, !connected && styles.dim]}
            accessibilityRole="button"
            accessibilityLabel={snapshot.muted ? "Unmute" : "Mute"}
          >
            {snapshot.muted ? <MicOff size={22} color={Ghost.text.primary} /> : <Mic size={22} color={Ghost.text.primary} />}
          </Pressable>
          <Text style={styles.sideLabel}>{snapshot.muted ? "Unmute" : "Mute"}</Text>
        </View>

        {connected || busy ? (
          <Pressable
            onPress={end}
            disabled={busy}
            style={[styles.main, styles.mainEnd, busy && styles.dim]}
            accessibilityRole="button"
            accessibilityLabel="End call"
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Phone size={26} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />}
          </Pressable>
        ) : (
          <Pressable
            onPress={start}
            disabled={!canStart}
            style={[styles.main, !canStart && styles.dim]}
            accessibilityRole="button"
            accessibilityLabel="Start talking"
          >
            <Mic size={28} color={Ghost.text.inverse} />
          </Pressable>
        )}

        <View style={styles.side}>
          <Pressable
            onPress={() => setPicking(true)}
            disabled={connected || busy}
            style={[styles.round, (connected || busy) && styles.dim]}
            accessibilityRole="button"
            accessibilityLabel={`Voice: ${voiceName}. Change`}
          >
            <Text style={styles.voiceInitial}>{voiceName.slice(0, 1)}</Text>
          </Pressable>
          <Text style={styles.sideLabel}>{voiceName}</Text>
        </View>
      </View>

      <GhostSheet visible={picking} onClose={() => setPicking(false)} title="Voice">
        <View style={styles.voices}>
          {VOICES.map((v) => {
            const on = v.id === voice;
            return (
              <Pressable
                key={v.id}
                onPress={() => {
                  setVoice(v.id);
                  setPicking(false);
                }}
                style={({ pressed }) => [styles.voiceRow, pressed && { opacity: 0.55 }]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Voice ${v.label}`}
              >
                <Text style={[styles.voiceLabel, on && styles.voiceLabelOn]}>{v.label}</Text>
                {on ? <Check size={18} color={Ghost.accent.primary} strokeWidth={2.4} /> : null}
              </Pressable>
            );
          })}
        </View>
      </GhostSheet>

      <GhostSheet visible={reading} onClose={() => setReading(false)} title="Transcript">
        <View style={styles.thread}>
          {snapshot.transcript.map((t) => (
            <View key={t.id} style={[styles.line, t.role === "user" && styles.lineYou]}>
              <Text style={styles.lineWho}>{t.role === "user" ? "You" : "Ghost"}</Text>
              <Text style={styles.lineText}>{t.text}</Text>
            </View>
          ))}
        </View>
      </GhostSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: Space.lg, minHeight: 48 },
  close: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginLeft: -6 },
  route: { ...Type.subhead, color: Ghost.text.tertiary },
  stage: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: Space.xxl },
  state: { ...Type.title, color: Ghost.text.primary, marginTop: Space.lg },
  timer: { ...Type.callout, color: Ghost.text.tertiary, marginTop: 4, fontVariant: ["tabular-nums"] },
  notice: { ...Type.callout, color: Ghost.text.secondary, marginTop: Space.md, textAlign: "center", maxWidth: 300 },
  captions: { marginTop: Space.xxl, gap: Space.sm, alignSelf: "stretch", minHeight: 96 },
  caption: { fontSize: 19, lineHeight: 26, fontWeight: "500", letterSpacing: -0.2, color: Ghost.text.primary, textAlign: "center" },
  captionYou: { color: Ghost.text.secondary },
  captionOld: { fontSize: 15, lineHeight: 21, color: Ghost.text.tertiary },
  dock: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: Space.xxxl },
  side: { width: 64, alignItems: "center", gap: 6, paddingTop: 8 },
  sideLabel: { ...Type.footnote, color: Ghost.text.tertiary },
  round: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: Ghost.bg.sunken },
  roundOn: { backgroundColor: Ghost.accent.soft, borderWidth: 1.5, borderColor: Ghost.accent.primary },
  main: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", backgroundColor: Ghost.text.primary },
  mainEnd: { backgroundColor: Ghost.status.error },
  dim: { opacity: 0.4 },
  voiceInitial: { fontSize: 18, fontWeight: "600", color: Ghost.text.primary },
  voices: { paddingBottom: Space.sm },
  voiceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Ghost.border.subtle },
  voiceLabel: { ...Type.body, color: Ghost.text.primary },
  voiceLabelOn: { fontWeight: "600", color: Ghost.accent.primary },
  thread: { gap: Space.lg, paddingBottom: Space.sm },
  line: { gap: 2, alignItems: "flex-start" },
  lineYou: { alignItems: "flex-end" },
  lineWho: { ...Type.footnote, color: Ghost.text.tertiary, fontWeight: "600" },
  lineText: { ...Type.body, color: Ghost.text.primary, maxWidth: "88%", borderRadius: Radius.lg },
});
