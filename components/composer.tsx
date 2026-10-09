import { ArrowUp, AudioLines, Camera, Check, Image as ImageIcon, Mic, Paperclip, Plus, Square, X } from "lucide-react-native";
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
import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
} from "expo-audio";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View, type TextInput as RNTextInput } from "react-native";
import { Text } from "@/components/text";

import { Ghost, Space, Type } from "@/constants/theme";
import { composerPlaceholder } from "@/lib/placeholder";
import { showSuggestion } from "@/lib/suggestion";

const MAX_VOICE_MS = 120_000;
// Strong ease-out: the element is already moving on the first frame.
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

interface ComposerProps {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit: (text: string) => void;
  placeholder?: string;
  editable?: boolean;
  busy?: boolean;
  onPhoto?: () => void;
  /** Attach a document or any other file. */
  onFile?: () => void;
  onCamera?: () => void;
  /** Record a meeting, a lecture or a visit, transcribed on the Pod. */
  onMeeting?: () => void;
  showMic?: boolean;
  minHeight?: number;
  maxLength?: number;
  inputRef?: React.Ref<RNTextInput>;
  autoFocus?: boolean;
  onTranscribeAudio?: (uri: string) => Promise<string>;
  onVoiceError?: (message: string) => void;
  streaming?: boolean;
  onStop?: () => void;
  /**
   * What the owner is likely to say next. While the bar is empty it is shown
   * as the placeholder, with a "Use" button that puts it in the bar to edit or
   * send. Nothing is sent by using it.
   */
  suggestion?: string;
}

/** A round button that gives a little under the finger. */
function Round({
  onPress,
  label,
  disabled,
  style,
  children,
  state,
}: {
  onPress?: () => void;
  label: string;
  disabled?: boolean;
  style?: object;
  children: React.ReactNode;
  state?: { selected?: boolean; busy?: boolean };
}) {
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      onPressIn={() => {
        if (!reduceMotion) scale.set(withTiming(0.95, { duration: 100, easing: EASE_OUT }));
      }}
      onPressOut={() => {
        if (!reduceMotion) scale.set(withTiming(1, { duration: 140, easing: EASE_OUT }));
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, ...state }}
    >
      <Animated.View style={[styles.round, style, anim]}>{children}</Animated.View>
    </Pressable>
  );
}

/** A soft pulse for "recording". */
function RecDot() {
  const opacity = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (reduceMotion) return;
    opacity.set(withRepeat(withSequence(withTiming(0.3, { duration: 650 }), withTiming(1, { duration: 650 })), -1, false));
  }, [opacity, reduceMotion]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={[styles.recDot, style]} />;
}

/**
 * The message bar.
 *
 * One quiet pill. A "+" opens the ways to attach something, so the bar itself
 * holds only what you write and a single button on the right that becomes what
 * you need: the mic when it is empty, send when there is something to send, and
 * stop while Ghost is working (with send beside it, so you can add to the task
 * without waiting). Dictating replaces the text with a timer until you finish.
 */
export function Composer({
  value,
  onChangeText,
  onSubmit,
  placeholder,
  editable = true,
  busy = false,
  onPhoto,
  onFile,
  onMeeting,
  onCamera,
  showMic = true,
  minHeight,
  maxLength,
  inputRef,
  autoFocus,
  onTranscribeAudio,
  onVoiceError,
  streaming = false,
  onStop,
  suggestion,
}: ComposerProps) {
  const reduceMotion = useReducedMotion();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [tray, setTray] = useState(false);
  const recordStart = useRef(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const canAttach = !!(onPhoto || onFile || onCamera || onMeeting);
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.set(reduceMotion ? (tray ? 1 : 0) : withTiming(tray ? 1 : 0, { duration: 180, easing: EASE_OUT }));
  }, [tray, spin, reduceMotion]);
  const plusStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get() * 45}deg` }] }));

  const clearStopTimer = () => {
    if (stopTimer.current) {
      clearTimeout(stopTimer.current);
      stopTimer.current = null;
    }
  };
  useEffect(() => clearStopTimer, []);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setRecordElapsed(Date.now() - recordStart.current), 500);
    return () => clearInterval(t);
  }, [recording]);

  const failVoice = useCallback((message: string) => onVoiceError?.(message), [onVoiceError]);

  const finishRecording = useCallback(
    async (transcribe: boolean) => {
      clearStopTimer();
      const uri = recorder.uri;
      try {
        await recorder.stop();
      } catch {
        // Already stopped; continue with whatever URI we have.
      }
      setRecording(false);
      if (!transcribe || !uri || !onTranscribeAudio) return;
      setTranscribing(true);
      try {
        const text = (await onTranscribeAudio(uri)).trim();
        if (text) {
          const base = valueRef.current.trim();
          onChangeText(base ? `${base} ${text}` : text);
        } else {
          failVoice("Didn't catch that. Try again.");
        }
      } catch {
        failVoice("Voice transcription failed. Check your connection.");
      }
      setTranscribing(false);
      if (typeof inputRef === "object" && inputRef?.current) inputRef.current.focus();
    },
    [recorder, onTranscribeAudio, onChangeText, failVoice, inputRef],
  );

  const startRecording = useCallback(async () => {
    if (recording || transcribing || !onTranscribeAudio) return;
    try {
      const current = await getRecordingPermissionsAsync();
      const granted = current.granted ? true : (await requestRecordingPermissionsAsync()).granted;
      if (!granted) {
        failVoice("Microphone access is needed for voice input.");
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordStart.current = Date.now();
      setRecordElapsed(0);
      setTray(false);
      setRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      stopTimer.current = setTimeout(() => finishRecording(true), MAX_VOICE_MS);
    } catch {
      setRecording(false);
      failVoice("Couldn't start recording. Try again.");
    }
  }, [recording, transcribing, onTranscribeAudio, recorder, finishRecording, failVoice]);

  const voiceOccupied = recording || transcribing;
  const hasText = value.trim().length > 0;
  const offered = showSuggestion({ suggestion: suggestion ?? "", draft: value, streaming, recording: voiceOccupied }) ? suggestion! : "";
  const useSuggestion = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onChangeText(offered);
    if (typeof inputRef === "object" && inputRef?.current) inputRef.current.focus();
  };
  const canSend = hasText && !busy && !voiceOccupied && editable !== false;

  const submit = () => {
    const text = value.trim();
    if (!text || busy || voiceOccupied || editable === false) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setTray(false);
    onSubmit(text);
  };

  const pick = (fn?: () => void) => () => {
    setTray(false);
    fn?.();
  };

  const clock = `${Math.floor(recordElapsed / 60000)}:${String(Math.floor((recordElapsed % 60000) / 1000)).padStart(2, "0")}`;
  const micReady = showMic && !!onTranscribeAudio;
  const fade = reduceMotion ? undefined : FadeIn.duration(140);
  // Tray choreography: buttons ease in when "+" opens the tray, and ease out
  // when "x" closes it.
  const trayIn = reduceMotion
    ? undefined
    : FadeInDown.duration(180).easing(EASE_OUT).withInitialValues({ opacity: 0, transform: [{ translateY: 8 }, { scale: 0.96 }] });
  const trayOut = reduceMotion ? undefined : FadeOut.duration(140).easing(EASE_OUT);

  // What the button on the right is, right now.
  let action: React.ReactNode = null;
  if (recording) {
    action = (
      <Round label="Finish and transcribe" style={styles.glow} onPress={() => finishRecording(true)}>
        <Check size={20} color={Ghost.text.primary} strokeWidth={2} />
      </Round>
    );
  } else if (transcribing) {
    action = (
      <View style={styles.round} accessibilityLabel="Transcribing">
        <ActivityIndicator size="small" color={Ghost.text.secondary} />
      </View>
    );
  } else if (streaming && onStop) {
    action = (
      <View style={styles.pair}>
        {canSend ? (
          <Animated.View entering={fade} exiting={trayOut}>
            <Round label="Queue message. Ghost reads it at its next step" style={styles.glow} onPress={submit}>
              <ArrowUp size={20} color={Ghost.text.primary} strokeWidth={2} />
            </Round>
          </Animated.View>
        ) : null}
        <Round label="Stop" style={styles.ring} onPress={onStop}>
          <Square size={12} color={Ghost.text.primary} fill={Ghost.text.primary} />
        </Round>
      </View>
    );
  } else if (hasText || !showMic) {
    action = (
      <Round
        label="Send"
        style={canSend ? styles.glow : styles.quiet}
        disabled={!canSend}
        onPress={submit}
      >
        <ArrowUp size={20} color={canSend ? Ghost.text.primary : Ghost.text.tertiary} strokeWidth={2} />
      </Round>
    );
  } else {
    action = (
      <Round
        label={micReady ? "Dictate a message" : "Dictation needs your Pod. Type instead"}
        disabled={!micReady}
        style={[styles.glow, !micReady && { opacity: 0.4 }]}
        onPress={startRecording}
      >
        <AudioLines size={20} color="#B4AEFF" strokeWidth={1.8} />
      </Round>
    );
  }

  const chips = [
    onCamera ? { key: "camera", label: "Camera", hint: "Take a photo", Icon: Camera, fn: onCamera } : null,
    onPhoto ? { key: "photo", label: "Photo", hint: "From your gallery", Icon: ImageIcon, fn: onPhoto } : null,
    onFile ? { key: "file", label: "File", hint: "A document or any file", Icon: Paperclip, fn: onFile } : null,
    onMeeting ? { key: "meeting", label: "Meeting", hint: "Record it, transcribed on your Pod", Icon: Mic, fn: onMeeting } : null,
  ].filter(<T,>(c: T | null): c is T => c !== null);

  return (
    <View style={styles.wrap}>
      {tray && canAttach ? (
        // One menu, always opening from the + in the same place: it floats
        // above the composer and never moves the input.
        <Animated.View entering={trayIn} exiting={trayOut} style={styles.tray} accessibilityRole="menu">
          {chips.map(({ key, label, hint, Icon, fn }, i) => (
            <Pressable
              key={key}
              style={({ pressed }) => [styles.chip, i > 0 && styles.chipLine, pressed && styles.chipPressed]}
              onPress={pick(fn)}
              accessibilityRole="menuitem"
              accessibilityLabel={`${label}. ${hint}`}
            >
              <View style={styles.chipIcon}>
                <Icon size={17} color={Ghost.text.primary} strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.chipText}>{label}</Text>
                <Text style={styles.chipHint}>{hint}</Text>
              </View>
            </Pressable>
          ))}
        </Animated.View>
      ) : null}
      <View style={styles.pill}>
      {recording ? (
        <View style={styles.rec} accessible accessibilityLiveRegion="polite" accessibilityLabel={`Recording, ${clock}`}>
          <RecDot />
          <Text style={styles.clock}>{clock}</Text>
          <Text style={styles.recHint}>Listening</Text>
        </View>
      ) : (
        <TextInput
          ref={inputRef}
          style={[styles.input, minHeight ? { minHeight } : null]}
          value={value}
          onChangeText={onChangeText}
          accessibilityLabel="Message Ghost"
          placeholder={transcribing ? "Transcribing…" : (offered || placeholder || composerPlaceholder({ online: true, streaming, firstTime: false }))}
          placeholderTextColor={Ghost.text.secondary}
          multiline
          maxLength={maxLength}
          onSubmitEditing={submit}
          blurOnSubmit={false}
          returnKeyType="send"
          textAlignVertical="top"
          selectionColor={Ghost.accent.primary}
          editable={editable && !busy && !transcribing}
          autoFocus={autoFocus}
          onFocus={() => setTray(false)}
        />
      )}

      <View style={styles.line}>
        {canAttach && !recording ? (
          <Round
            label={tray ? "Close attachments" : "Attach something"}
            onPress={() => setTray((t) => !t)}
            state={{ selected: tray }}
            style={styles.plus}
          >
            <Animated.View style={plusStyle}>
              <Plus size={20} color={Ghost.text.primary} strokeWidth={1.6} />
            </Animated.View>
          </Round>
        ) : null}

        {offered ? (
          <Pressable
            onPress={useSuggestion}
            hitSlop={8}
            style={({ pressed }) => [styles.use, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={`Use suggestion: ${offered}`}
          >
            <Text style={styles.useText}>Use suggestion</Text>
          </Pressable>
        ) : null}

        <View style={styles.spacer} />

        {recording ? (
          <Round label="Discard recording" onPress={() => finishRecording(false)} style={styles.plus}>
            <X size={18} color={Ghost.text.secondary} />
          </Round>
        ) : null}
        {action}
      </View>
      </View>
    </View>
  );
}

const BTN = 40;

const styles = StyleSheet.create({
  // Relative anchor so the attachment tray can float above the pill without
  // taking up layout space: opening it never moves the input.
  wrap: { position: "relative" },
  pill: {
    backgroundColor: Ghost.bg.raised,
    borderRadius: 32,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    maxHeight: 260,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  spacer: { flex: 1 },
  input: {
    ...Type.body,
    fontSize: 16,
    lineHeight: 22,
    color: Ghost.text.primary,
    minHeight: 24,
    maxHeight: 132,
    padding: 0,
    paddingHorizontal: 2,
    // Android: no extra font padding, so the text sits where the placeholder was.
    includeFontPadding: false,
  },
  round: {
    width: BTN,
    height: BTN,
    borderRadius: BTN / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  plus: { width: 36, height: 36, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border, backgroundColor: Ghost.glass.fill },
  glow: {
    width: 56,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(58,46,240,0.34)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(140,128,255,0.45)",
    boxShadow: "0 0 18px rgba(58,46,240,0.55)",
  },
  quiet: { width: 56, height: 36, borderRadius: 18, backgroundColor: Ghost.glass.fill },
  use: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    justifyContent: "center",
    backgroundColor: Ghost.glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  useText: { fontSize: 13, fontWeight: "500", color: Ghost.text.primary },
  ring: { width: 56, height: 36, borderRadius: 18, borderWidth: 1, borderColor: Ghost.border.strong },
  pair: { flexDirection: "row", alignItems: "center", gap: 2 },
  tray: {
    position: "absolute",
    bottom: "100%",
    left: 0,
    width: 248,
    marginBottom: Space.sm,
    paddingVertical: 4,
    borderRadius: 20,
    borderCurve: "continuous",
    backgroundColor: Ghost.bg.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
    transformOrigin: "bottom left",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    zIndex: 10,
  },
  chip: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 54, paddingHorizontal: 12 },
  chipLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Ghost.border.subtle },
  chipPressed: { backgroundColor: Ghost.glass.fill },
  chipIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: Ghost.glass.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  chipText: { ...Type.callout, fontWeight: "500", color: Ghost.text.primary },
  chipHint: { fontSize: 12.5, lineHeight: 16, color: Ghost.text.tertiary },
  rec: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 24, paddingHorizontal: 2 },
  recDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Ghost.status.error },
  clock: { ...Type.body, color: Ghost.text.primary, fontVariant: ["tabular-nums"], fontWeight: "500" },
  recHint: { ...Type.callout, color: Ghost.text.tertiary },
});
