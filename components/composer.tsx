import { Camera, ImagePlus, Mic, Send, Square, X } from "lucide-react-native";
import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
} from "expo-audio";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInput as RNTextInput,
} from "react-native";

import { Ghost, Radius, Space, Type } from "@/constants/theme";

const MAX_VOICE_MS = 120_000;

interface ComposerProps {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit: (text: string) => void;
  placeholder?: string;
  editable?: boolean;
  busy?: boolean;
  leading?: React.ReactNode;
  onPhoto?: () => void;
  onCamera?: () => void;
  showMic?: boolean;
  minimal?: boolean;
  minHeight?: number;
  maxLength?: number;
  inputRef?: React.Ref<RNTextInput>;
  autoFocus?: boolean;
  onTranscribeAudio?: (uri: string) => Promise<string>;
  onVoiceError?: (message: string) => void;
}

/**
 * Shared prompt composer for Home and Conversation.
 * One object, one behavior: multiline input, media actions and mic on the
 * right inside the bar, always-visible send in primary accent with a white
 * icon. Mic records via expo-audio and transcribes through Ghost; without an
 * onTranscribeAudio handler it stays visibly disabled.
 */
export function Composer({
  value,
  onChangeText,
  onSubmit,
  placeholder = "Talk to Ghost…",
  editable = true,
  busy = false,
  leading,
  onPhoto,
  onCamera,
  showMic = true,
  minimal = false,
  minHeight,
  maxLength,
  inputRef,
  autoFocus,
  onTranscribeAudio,
  onVoiceError,
}: ComposerProps) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const recordStart = useRef(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const clearStopTimer = () => {
    if (stopTimer.current) {
      clearTimeout(stopTimer.current);
      stopTimer.current = null;
    }
  };

  useEffect(() => clearStopTimer, []);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => {
      setRecordElapsed(Date.now() - recordStart.current);
    }, 500);
    return () => clearInterval(t);
  }, [recording]);

  const failVoice = useCallback(
    (message: string) => {
      onVoiceError?.(message);
    },
    [onVoiceError],
  );

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
      if (!transcribe || !uri) return;
      if (!onTranscribeAudio) return;
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
      if (typeof inputRef === "object" && inputRef?.current) {
        inputRef.current.focus();
      }
    },
    [recorder, onTranscribeAudio, onChangeText, failVoice, inputRef],
  );

  const startRecording = useCallback(async () => {
    if (recording || transcribing || !onTranscribeAudio) return;
    try {
      const current = await getRecordingPermissionsAsync();
      const granted = current.granted
        ? true
        : (await requestRecordingPermissionsAsync()).granted;
      if (!granted) {
        failVoice("Microphone access is needed for voice input.");
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordStart.current = Date.now();
      setRecordElapsed(0);
      setRecording(true);
      stopTimer.current = setTimeout(() => {
        finishRecording(true);
      }, MAX_VOICE_MS);
    } catch {
      setRecording(false);
      failVoice("Couldn't start recording. Try again.");
    }
  }, [recording, transcribing, onTranscribeAudio, recorder, finishRecording, failVoice]);

  const voiceOccupied = recording || transcribing;
  const canSend = value.trim().length > 0 && !busy && !voiceOccupied && editable !== false;
  const showSend = minimal ? canSend : true;

  const submit = () => {
    const text = value.trim();
    if (!text || busy || voiceOccupied || editable === false) return;
    onSubmit(text);
  };

  const voiceClock = `${Math.floor(recordElapsed / 60000)}:${String(
    Math.floor((recordElapsed % 60000) / 1000),
  ).padStart(2, "0")}`;

  return (
    <View style={styles.bar}>
      {leading}
      <TextInput
        ref={inputRef}
        style={[styles.input, minHeight ? { minHeight } : null]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Ghost.text.tertiary}
        multiline
        maxLength={maxLength}
        onSubmitEditing={submit}
        blurOnSubmit={false}
        returnKeyType="send"
        textAlignVertical="top"
        editable={editable && !busy}
        autoFocus={autoFocus}
      />
      {onPhoto ? (
        <TouchableOpacity
          style={styles.iconBtn}
          activeOpacity={0.7}
          hitSlop={8}
          accessibilityLabel="Attach a picture"
          onPress={onPhoto}
        >
          <ImagePlus size={18} color={Ghost.text.secondary} />
        </TouchableOpacity>
      ) : null}
      {onCamera ? (
        <TouchableOpacity
          style={styles.iconBtn}
          activeOpacity={0.7}
          hitSlop={8}
          accessibilityLabel="Take a photo"
          onPress={onCamera}
        >
          <Camera size={18} color={Ghost.text.secondary} />
        </TouchableOpacity>
      ) : null}
      {showMic ? (
        onTranscribeAudio ? (
          recording ? (
            <View style={styles.voiceRow}>
              <View style={styles.recDot} />
              <Text style={styles.voiceClock}>{voiceClock}</Text>
              <TouchableOpacity
                style={styles.iconBtn}
                activeOpacity={0.7}
                hitSlop={8}
                accessibilityLabel="Stop recording and transcribe"
                onPress={() => finishRecording(true)}
              >
                <Square size={16} color={Ghost.status.error} fill={Ghost.status.error} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtn}
                activeOpacity={0.7}
                hitSlop={8}
                accessibilityLabel="Discard recording"
                onPress={() => finishRecording(false)}
              >
                <X size={16} color={Ghost.text.secondary} />
              </TouchableOpacity>
            </View>
          ) : transcribing ? (
            <View style={styles.iconBtn} accessibilityLabel="Transcribing voice">
              <ActivityIndicator size="small" color={Ghost.accent.primary} />
            </View>
          ) : (
            <TouchableOpacity
              style={styles.iconBtn}
              activeOpacity={0.7}
              hitSlop={8}
              accessibilityLabel="Record a voice message"
              onPress={startRecording}
            >
              <Mic size={18} color={Ghost.text.secondary} />
            </TouchableOpacity>
          )
        ) : (
          <View
            style={[styles.iconBtn, styles.micDisabled]}
            accessibilityLabel="Voice input coming soon"
            accessibilityState={{ disabled: true }}
          >
            <Mic size={18} color={Ghost.text.secondary} />
          </View>
        )
      ) : null}
      {showSend ? (
        <TouchableOpacity
          style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          activeOpacity={0.7}
          hitSlop={8}
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !canSend }}
          onPress={submit}
          disabled={!canSend}
        >
          <Send size={18} color={canSend ? Ghost.text.inverse : Ghost.text.tertiary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: Ghost.bg.base,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Ghost.border.default,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    minHeight: 56,
    maxHeight: 160,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Space.xs,
  },
  input: {
    ...Type.body,
    color: Ghost.text.primary,
    flex: 1,
    minHeight: 28,
    maxHeight: 128,
    paddingVertical: Space.xs,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Ghost.accent.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: Ghost.bg.sunken,
  },
  micDisabled: {
    opacity: 0.4,
  },
  voiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Ghost.status.error,
  },
  voiceClock: {
    ...Type.footnote,
    color: Ghost.text.secondary,
    fontVariant: ["tabular-nums"],
  },
});
