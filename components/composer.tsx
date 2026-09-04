import { Camera, ImagePlus, Mic, Send } from "lucide-react-native";
import React from "react";
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  type TextInput as RNTextInput,
} from "react-native";

import { Ghost, Radius, Space, Type } from "@/constants/theme";

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
}

/**
 * Shared prompt composer for Home and Conversation.
 * One object, one behavior: multiline input, media actions and mic on the
 * right inside the bar, always-visible send in primary accent with a white
 * icon. Mic is present but disabled until voice input ships.
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
}: ComposerProps) {
  const canSend = value.trim().length > 0 && !busy && editable !== false;
  const showSend = minimal ? canSend : true;

  const submit = () => {
    const text = value.trim();
    if (!text || busy || editable === false) return;
    onSubmit(text);
  };

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
        <View
          style={[styles.iconBtn, styles.micDisabled]}
          accessibilityLabel="Voice input coming soon"
          accessibilityState={{ disabled: true }}
        >
          <Mic size={18} color={Ghost.text.secondary} />
        </View>
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
});
