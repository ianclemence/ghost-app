import { ArrowUp, Camera, Check, Image as ImageIcon, Mic, Paperclip, Plus, Square, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
} from "expo-audio";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInput as RNTextInput,
} from "react-native";

import { Ghost, Radius, shadowRGB, Space, Type } from "@/constants/theme";
import { composerPlaceholder } from "@/lib/placeholder";

const MAX_VOICE_MS = 120_000;
const SPRING = { damping: 18, stiffness: 240, mass: 0.6 };

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
  showMic?: boolean;
  minHeight?: number;
  maxLength?: number;
  inputRef?: React.Ref<RNTextInput>;
  autoFocus?: boolean;
  onTranscribeAudio?: (uri: string) => Promise<string>;
  onVoiceError?: (message: string) => void;
  streaming?: boolean;
  onStop?: () => void;
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
        if (!reduceMotion) scale.set(withSpring(0.9, SPRING));
      }}
      onPressOut={() => {
        if (!reduceMotion) scale.set(withSpring(1, SPRING));
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

  const canAttach = !!(onPhoto || onFile || onCamera);
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.set(reduceMotion ? (tray ? 1 : 0) : withSpring(tray ? 1 : 0, SPRING));
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
  const fadeOut = reduceMotion ? undefined : FadeOut.duration(100);

  // What the button on the right is, right now.
  let action: React.ReactNode = null;
  if (recording) {
    action = (
      <Round label="Finish and transcribe" style={styles.solid} onPress={() => finishRecording(true)}>
        <Check size={20} color={Ghost.text.inverse} strokeWidth={2.4} />
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
          <Animated.View entering={fade} exiting={fadeOut}>
            <Round label="Send. Joins what Ghost is doing" style={styles.solid} onPress={submit}>
              <ArrowUp size={20} color={Ghost.text.inverse} strokeWidth={2.4} />
            </Round>
          </Animated.View>
        ) : null}
        <Round label="Stop" style={styles.ring} onPress={onStop}>
          <Square size={13} color={Ghost.text.primary} fill={Ghost.text.primary} />
        </Round>
      </View>
    );
  } else if (hasText || !showMic) {
    action = (
      <Round
        label="Send"
        style={canSend ? styles.solid : styles.quiet}
        disabled={!canSend}
        onPress={submit}
      >
        <ArrowUp size={20} color={canSend ? Ghost.text.inverse : Ghost.text.tertiary} strokeWidth={2.4} />
      </Round>
    );
  } else {
    action = (
      <Round
        label={micReady ? "Dictate a message" : "Dictation needs your Pod. Type instead"}
        disabled={!micReady}
        style={!micReady ? { opacity: 0.4 } : undefined}
        onPress={startRecording}
      >
        <Mic size={20} color={Ghost.text.secondary} />
      </Round>
    );
  }

  return (
    <Animated.View layout={reduceMotion ? undefined : LinearTransition.duration(160)} style={styles.pill}>
      {tray && canAttach ? (
        <Animated.View entering={fade} exiting={fadeOut} style={styles.tray}>
          {onPhoto ? (
            <Pressable style={styles.chip} onPress={pick(onPhoto)} accessibilityRole="button" accessibilityLabel="Attach a photo">
              <ImageIcon size={16} color={Ghost.text.primary} />
              <Text style={styles.chipText}>Photo</Text>
            </Pressable>
          ) : null}
          {onCamera ? (
            <Pressable style={styles.chip} onPress={pick(onCamera)} accessibilityRole="button" accessibilityLabel="Take a photo">
              <Camera size={16} color={Ghost.text.primary} />
              <Text style={styles.chipText}>Camera</Text>
            </Pressable>
          ) : null}
          {onFile ? (
            <Pressable style={styles.chip} onPress={pick(onFile)} accessibilityRole="button" accessibilityLabel="Attach a file">
              <Paperclip size={16} color={Ghost.text.primary} />
              <Text style={styles.chipText}>File</Text>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}

      <View style={styles.line}>
        {canAttach && !recording ? (
          <Round
            label={tray ? "Close attachments" : "Attach something"}
            onPress={() => setTray((t) => !t)}
            state={{ selected: tray }}
          >
            <Animated.View style={plusStyle}>
              <Plus size={22} color={Ghost.text.secondary} strokeWidth={1.8} />
            </Animated.View>
          </Round>
        ) : null}

        {recording ? (
          <View style={styles.rec} accessible accessibilityLiveRegion="polite" accessibilityLabel={`Recording, ${clock}`}>
            <RecDot />
            <Text style={styles.clock}>{clock}</Text>
            <Text style={styles.recHint}>Listening</Text>
          </View>
        ) : (
          <TextInput
            ref={inputRef}
            style={[styles.input, !canAttach && styles.inputLeading, minHeight ? { minHeight } : null]}
            value={value}
            onChangeText={onChangeText}
            accessibilityLabel="Message Ghost"
            placeholder={transcribing ? "Transcribing…" : (placeholder ?? composerPlaceholder({ online: true, streaming, firstTime: false }))}
            placeholderTextColor={Ghost.text.tertiary}
            multiline
            maxLength={maxLength}
            onSubmitEditing={submit}
            blurOnSubmit={false}
            returnKeyType="send"
            textAlignVertical="center"
            selectionColor={Ghost.accent.primary}
            editable={editable && !busy && !transcribing}
            autoFocus={autoFocus}
            onFocus={() => setTray(false)}
          />
        )}

        {recording ? (
          <Round label="Discard recording" onPress={() => finishRecording(false)}>
            <X size={20} color={Ghost.text.secondary} />
          </Round>
        ) : null}
        {action}
      </View>
    </Animated.View>
  );
}

const BTN = 40;

const styles = StyleSheet.create({
  pill: {
    backgroundColor: Ghost.bg.raised,
    borderRadius: 28,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.border.default,
    paddingHorizontal: 6,
    paddingVertical: 6,
    maxHeight: 200,
    boxShadow: `0 1px 2px rgba(${shadowRGB}, 0.05), 0 10px 28px rgba(${shadowRGB}, 0.07)`,
  },
  line: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
    minHeight: BTN + 4,
  },
  input: {
    ...Type.body,
    fontSize: 16.5,
    lineHeight: 22,
    color: Ghost.text.primary,
    flex: 1,
    minHeight: BTN,
    maxHeight: 132,
    paddingTop: 9,
    paddingBottom: 9,
    paddingHorizontal: 6,
    // Android: no extra font padding, so the text centres on the same line as the buttons.
    includeFontPadding: false,
  },
  inputLeading: { paddingLeft: 14 },
  round: {
    width: BTN,
    height: BTN,
    borderRadius: BTN / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  solid: { backgroundColor: Ghost.text.primary },
  quiet: { backgroundColor: Ghost.bg.sunken },
  ring: { borderWidth: 1.5, borderColor: Ghost.border.strong },
  pair: { flexDirection: "row", alignItems: "center", gap: 2 },
  tray: { flexDirection: "row", gap: Space.sm, paddingHorizontal: 6, paddingTop: 4, paddingBottom: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: Radius.full,
    backgroundColor: Ghost.bg.sunken,
  },
  chipText: { ...Type.callout, fontWeight: "500", color: Ghost.text.primary },
  rec: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minHeight: BTN, paddingLeft: 14 },
  recDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Ghost.status.error },
  clock: { ...Type.body, color: Ghost.text.primary, fontVariant: ["tabular-nums"], fontWeight: "500" },
  recHint: { ...Type.callout, color: Ghost.text.tertiary },
});
