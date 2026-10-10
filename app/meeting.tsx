import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from "expo-audio";
import { Mic, Pause, Play, Square } from "lucide-react-native";
import { Text } from "@/components/text";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { EdgeScrollView } from "@/components/scroll-edge";
import { GhostButton } from "@/components/ghost";
import { lifeStyles, Pill } from "@/components/life-ui";
import { alpha, Aurora, Fonts, Ghost, Inter, Space } from "@/constants/theme";
import { fetchMeeting, fetchMeetings, finishMeeting, sendMeetingChunk, startMeeting, type Meeting } from "@/lib/ghostApi";
import { clockOf, meetingStatus, pieces, summarizePrompt } from "@/lib/meetings";
import { readBase64 } from "@/lib/localFiles";
import { useGhostStore } from "@/lib/store";

// Speech, not music: mono AAC at 32 kbps keeps an hour near 14 MB.
const SPEECH: RecordingOptions = { ...RecordingPresets.HIGH_QUALITY, sampleRate: 16000, numberOfChannels: 1, bitRate: 32000 };

type Phase = "idle" | "recording" | "paused" | "sending" | "pod" | "done" | "failed";

/**
 * Recording a meeting (or a lecture, a doctor's visit): the phone records,
 * the recording goes to the owner's Pod in pieces, the Pod transcribes it with
 * the owner's own speech engine, and one tap asks Ghost for what was decided
 * and the action items, as a checklist in the conversation. The transcript is
 * kept with everything else Ghost made.
 */
export default function MeetingScreen() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const config = useGhostStore((s) => s.config);
  const recorder = useAudioRecorder(SPEECH);
  const [phase, setPhase] = useState<Phase>("idle");
  const [title, setTitle] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [sent, setSent] = useState(0);
  const [current, setCurrent] = useState<Meeting | null>(null);
  const [past, setPast] = useState<Meeting[]>([]);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(0);
  const carried = useRef(0);

  const loadPast = useCallback(async () => {
    if (!config) return;
    const r = await fetchMeetings(config);
    if (r.ok) setPast(r.data.meetings);
  }, [config]);
  useFocusEffect(useCallback(() => { void loadPast(); }, [loadPast]));

  // The clock while recording.
  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => setElapsed(carried.current + (Date.now() - started.current) / 1000), 500);
    return () => clearInterval(t);
  }, [phase]);

  // The Pod's progress while it transcribes.
  useEffect(() => {
    if (phase !== "pod" || !current || !config) return;
    let live = true;
    const t = setInterval(async () => {
      const r = await fetchMeeting(config, current.id);
      if (!live || !r.ok) return;
      setCurrent(r.data.meeting);
      if (r.data.meeting.state === "done") {
        setPhase("done");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        void loadPast();
      } else if (r.data.meeting.state === "failed") {
        setPhase("failed");
        setError(r.data.meeting.error ?? "The Pod couldn't transcribe it.");
      }
    }, 3000);
    return () => { live = false; clearInterval(t); };
  }, [phase, current, config, loadPast]);

  // A breathing ring while recording.
  const breath = useSharedValue(1);
  useEffect(() => {
    if (phase === "recording" && !reduce) {
      breath.set(withRepeat(withSequence(withTiming(1.12, { duration: 1100, easing: Easing.inOut(Easing.sin) }), withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) })), -1));
    } else {
      breath.set(withTiming(1, { duration: 200 }));
    }
  }, [phase, reduce, breath]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: breath.get() }], opacity: phase === "recording" ? 1 : 0.4 }));

  const start = async () => {
    setError(null);
    try {
      const has = await getRecordingPermissionsAsync();
      if (!has.granted && !(await requestRecordingPermissionsAsync()).granted) {
        setError("Ghost needs the microphone to record. Allow it in your phone's settings.");
        return;
      }
      // Keep recording with the screen off where this build allows it.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, allowsBackgroundRecording: true } as never).catch(() =>
        setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true } as never).catch(() => {}),
      );
      await recorder.prepareToRecordAsync();
      recorder.record();
      carried.current = 0;
      started.current = Date.now();
      setElapsed(0);
      setPhase("recording");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch {
      setError("Couldn't start recording. Try again.");
      setPhase("idle");
    }
  };
  const pause = () => {
    try {
      recorder.pause();
      carried.current += (Date.now() - started.current) / 1000;
      setPhase("paused");
    } catch {
      setError("Couldn't pause.");
    }
  };
  const resume = () => {
    try {
      recorder.record();
      started.current = Date.now();
      setPhase("recording");
    } catch {
      setError("Couldn't carry on recording.");
    }
  };

  const stop = async () => {
    if (!config) return;
    const uri = recorder.uri;
    try {
      await recorder.stop();
    } catch {
      // already stopped
    }
    await setAudioModeAsync({ allowsRecording: false } as never).catch(() => {});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (!uri) {
      setError("Nothing was recorded.");
      setPhase("idle");
      return;
    }
    await send(uri);
  };

  const send = async (uri: string) => {
    if (!config) return;
    setPhase("sending");
    setSent(0);
    setError(null);
    try {
      const b64 = await readBase64(uri);
      const parts = pieces(b64);
      const begin = await startMeeting(config, title.trim(), "audio/mp4");
      if (!begin.ok) throw new Error(begin.error);
      const id = begin.data.meeting.id;
      for (let i = 0; i < parts.length; i++) {
        let r = await sendMeetingChunk(config, id, i, parts[i]);
        if (!r.ok) r = await sendMeetingChunk(config, id, i, parts[i]); // one retry per piece
        if (!r.ok) throw new Error(r.error);
        setSent((i + 1) / parts.length);
      }
      const fin = await finishMeeting(config, id, parts.length);
      if (!fin.ok) throw new Error(fin.error);
      setCurrent(fin.data.meeting);
      setPhase("pod");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't send the recording to your Pod.");
      setPhase("failed");
    }
  };

  const summarize = (m: Meeting) => {
    useGhostStore.getState().setIntent({ text: summarizePrompt(m), send: true });
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  const reset = () => {
    setPhase("idle");
    setCurrent(null);
    setTitle("");
    setElapsed(0);
    setError(null);
  };

  const live = phase === "recording" || phase === "paused";
  return (
    <View style={styles.container}>
      <ScreenBackground variant="calm" alive={phase === "recording"} />
      <ScreenHeader title="Record" subtitle="Ghost listens, then writes it up" />
      <EdgeScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" alive={phase === "recording"}>
        {phase === "idle" || live ? (
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="What is it? (optional)"
            placeholderTextColor={Ghost.text.tertiary}
            style={styles.title}
            maxLength={80}
            accessibilityLabel="What the recording is"
            selectionColor={Ghost.accent.primary}
          />
        ) : null}

        <View style={styles.stage}>
          {phase === "idle" || live ? (
            <>
              <Text style={styles.clock} accessibilityLiveRegion="polite">{clockOf(elapsed)}</Text>
              <View style={styles.buttonWrap}>
                <Animated.View style={[styles.ring, ring]} pointerEvents="none" />
                <Pressable
                  onPress={phase === "idle" ? () => void start() : () => void stop()}
                  style={({ pressed }) => [styles.record, live && styles.recordLive, pressed && { transform: [{ scale: 0.96 }] }]}
                  accessibilityRole="button"
                  accessibilityLabel={phase === "idle" ? "Start recording" : "Stop and send to your Pod"}
                >
                  {phase === "idle" ? <Mic size={34} color="#FFFFFF" strokeWidth={1.8} /> : <Square size={28} color="#FFFFFF" fill="#FFFFFF" strokeWidth={1.8} />}
                </Pressable>
              </View>
              {live ? (
                <Pressable onPress={phase === "recording" ? pause : resume} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={phase === "recording" ? "Pause" : "Carry on recording"}>
                  {phase === "recording" ? <Pause size={15} color={Ghost.text.primary} /> : <Play size={15} color={Ghost.text.primary} />}
                  <Text style={styles.secondaryText}>{phase === "recording" ? "Pause" : "Carry on"}</Text>
                </Pressable>
              ) : (
                <Text style={styles.hint}>It keeps recording with your screen locked. The recording goes to your Pod and is transcribed there.</Text>
              )}
            </>
          ) : phase === "sending" ? (
            <Progress label="Sending to your Pod" value={sent} />
          ) : phase === "pod" && current ? (
            <Progress label={meetingStatus(current)} value={current.parts ? (current.part_done ?? 0) / current.parts : 0.04} />
          ) : phase === "done" && current ? (
            <View style={styles.doneBox}>
              <Text style={styles.doneTitle}>{current.title}</Text>
              <Text style={styles.doneMeta}>{meetingStatus(current)}</Text>
              <View style={styles.actions}>
                <GhostButton title="Summarize it" onPress={() => summarize(current)} />
                <GhostButton title="Record another" variant="secondary" onPress={reset} />
              </View>
            </View>
          ) : (
            <View style={styles.doneBox}>
              <Text style={styles.doneTitle}>It didn&apos;t work.</Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.actions}>
                {recorder.uri ? <GhostButton title="Send again" onPress={() => void send(recorder.uri!)} /> : null}
                <GhostButton title="Start over" variant="secondary" onPress={reset} />
              </View>
            </View>
          )}
          {error && phase !== "failed" ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        {past.length > 0 && phase === "idle" ? (
          <>
            <Text style={lifeStyles.eyebrow}>Earlier</Text>
            <View style={lifeStyles.group}>
              {past.slice(0, 20).map((m, i) => (
                <Pressable
                  key={m.id}
                  onPress={m.state === "done" ? () => summarize(m) : undefined}
                  style={({ pressed }) => [styles.row, i > 0 && styles.rowLine, pressed && m.state === "done" && { backgroundColor: "rgba(255,255,255,0.04)" }]}
                  accessibilityRole={m.state === "done" ? "button" : "text"}
                  accessibilityLabel={`${m.title}. ${meetingStatus(m)}${m.state === "done" ? ". Tap to summarize" : ""}`}
                >
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{m.title}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>{new Date(m.created_at).toLocaleDateString([], { day: "numeric", month: "short" })} · {meetingStatus(m)}</Text>
                  </View>
                  {m.state === "done" ? <Pill text="Summarize" tone="neutral" centered /> : m.state === "failed" ? <Pill text="Failed" tone="bad" centered /> : <Pill text="Working" tone="warn" centered />}
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </EdgeScrollView>
    </View>
  );
}

function Progress({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.progress} accessibilityLiveRegion="polite" accessibilityLabel={`${label}, ${Math.round(value * 100)} percent`}>
      <Text style={styles.progressLabel}>{label}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(3, Math.min(100, value * 100))}%` }]} />
      </View>
      <Text style={styles.hint}>You can leave this screen; the Pod carries on.</Text>
    </View>
  );
}

const BUTTON = 112;
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  content: { paddingBottom: 96, paddingHorizontal: Space.lg },
  title: { height: 50, paddingHorizontal: 18, borderRadius: 25, backgroundColor: "rgba(0,0,0,0.42)", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border, color: Ghost.text.primary, fontFamily: Inter.regular, fontSize: 15.5, marginTop: Space.xs },
  stage: { alignItems: "center", paddingVertical: Space.xxl, gap: Space.lg },
  clock: { fontFamily: Fonts.voice, fontSize: 64, lineHeight: 72, letterSpacing: -1.5, color: Ghost.text.primary, fontVariant: ["tabular-nums"] },
  buttonWrap: { width: BUTTON + 44, height: BUTTON + 44, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", width: BUTTON + 44, height: BUTTON + 44, borderRadius: (BUTTON + 44) / 2, backgroundColor: alpha(Aurora.magenta, 0.16), borderWidth: 1, borderColor: alpha(Aurora.magenta, 0.4) },
  record: { width: BUTTON, height: BUTTON, borderRadius: BUTTON / 2, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(58,46,240,0.55)", borderWidth: 1, borderColor: "rgba(140,128,255,0.6)", boxShadow: "0 0 36px rgba(58,46,240,0.55)" },
  recordLive: { backgroundColor: "rgba(194,61,235,0.55)", borderColor: "rgba(224,140,255,0.6)", boxShadow: "0 0 36px rgba(194,61,235,0.5)" },
  secondary: { flexDirection: "row", alignItems: "center", gap: 8, height: 42, paddingHorizontal: 18, borderRadius: 21, backgroundColor: Ghost.glass.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  secondaryText: { fontSize: 14.5, fontWeight: "500", color: Ghost.text.primary },
  hint: { fontSize: 13.5, lineHeight: 19, color: Ghost.text.tertiary, textAlign: "center", maxWidth: 300 },
  progress: { alignSelf: "stretch", gap: Space.md, paddingVertical: Space.xl },
  progressLabel: { fontFamily: Fonts.voice, fontSize: 26, lineHeight: 32, color: Ghost.text.primary, textAlign: "center" },
  track: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: Ghost.accent.primary },
  doneBox: { alignSelf: "stretch", alignItems: "center", gap: Space.sm, paddingVertical: Space.lg },
  doneTitle: { fontFamily: Fonts.voice, fontSize: 32, lineHeight: 38, color: Ghost.text.primary, textAlign: "center" },
  doneMeta: { fontSize: 14, color: Ghost.text.secondary },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: Space.sm, marginTop: Space.md },
  error: { fontSize: 13.5, lineHeight: 19, color: Ghost.status.error, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 62, paddingHorizontal: 14, paddingVertical: 10 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Ghost.border.subtle },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 15.5, fontWeight: "500", color: Ghost.text.primary },
  rowSub: { fontSize: 12.5, color: Ghost.text.tertiary },
});
