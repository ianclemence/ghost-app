import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Ghost, Radius, Space } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";

/* ------------------------------------------------------------------ */
/* GhostButton                                                          */
/* ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function GhostButton({
  title,
  onPress,
  variant = "primary",
  disabled,
  leftIcon,
  rightIcon,
  fullWidth,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = {
    primary: { bg: Ghost.accent, fg: Ghost.accentInk, border: "transparent" },
    secondary: { bg: Ghost.bg.surface2, fg: Ghost.text.primary, border: Ghost.hairline },
    ghost: { bg: "transparent", fg: Ghost.text.secondary, border: "transparent" },
    danger: { bg: "transparent", fg: Ghost.danger, border: Ghost.hairline },
  }[variant];

  return (
    <TouchableOpacity
      activeOpacity={disabled ? 1 : 0.7}
      onPress={disabled ? undefined : onPress}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: Space.sm,
          paddingVertical: Space.md,
          paddingHorizontal: Space.lg,
          borderRadius: Radius.lg,
          backgroundColor: disabled ? Ghost.bg.surface2 : palette.bg,
          borderWidth: 1,
          borderColor: disabled ? Ghost.hairline : palette.border,
          opacity: disabled ? 0.5 : 1,
          alignSelf: fullWidth ? "stretch" : "flex-start",
        },
        style,
      ]}
    >
      {leftIcon}
      <GhostText
        type="bodyStrong"
        style={{ color: disabled ? Ghost.text.tertiary : palette.fg }}
      >
        {title}
      </GhostText>
      {rightIcon}
    </TouchableOpacity>
  );
}

/* ------------------------------------------------------------------ */
/* GhostSheet (bottom sheet / modal)                                    */
/* ------------------------------------------------------------------ */

export function GhostSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }}
        onPress={onClose}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            style={{
              backgroundColor: Ghost.bg.surface,
              borderTopLeftRadius: Radius.xl,
              borderTopRightRadius: Radius.xl,
              borderTopWidth: 1,
              borderColor: Ghost.hairline,
              maxHeight: "88%",
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View
              style={{
                paddingVertical: Space.lg,
                paddingHorizontal: Space.xl,
                borderBottomWidth: 1,
                borderColor: Ghost.hairline,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <GhostText type="title">{title ?? ""}</GhostText>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <GhostText type="secondary" style={{ color: Ghost.text.tertiary }}>
                  Done
                </GhostText>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={{ padding: Space.xl }}
              contentContainerStyle={{ gap: Space.lg, paddingBottom: Space.xl }}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* SectionHeader                                                        */
/* ------------------------------------------------------------------ */

export function SectionHeader({
  title,
  subtitle,
  action,
  style,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
          paddingHorizontal: Space.xl,
          paddingTop: Space.xxxl,
          paddingBottom: Space.sm,
        },
        style,
      ]}
    >
      <View style={{ gap: Space.xs }}>
        <GhostText type="micro" style={{ color: Ghost.text.tertiary }}>
          {title}
        </GhostText>
        {subtitle ? <GhostText type="secondary">{subtitle}</GhostText> : null}
      </View>
      {action}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* GhostList + GhostRow                                                 */
/* ------------------------------------------------------------------ */

export function GhostList({
  children,
  divided,
  style,
}: {
  children: React.ReactNode;
  divided?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: Ghost.bg.surface,
          borderRadius: Radius.lg,
          marginHorizontal: Space.xl,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {React.Children.map(children, (child, i) => (
        <View key={i}>
          {child}
          {divided && i < React.Children.count(children) - 1 ? (
            <View style={{ height: 1, backgroundColor: Ghost.hairline, marginLeft: Space.lg }} />
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function GhostRow({
  icon,
  title,
  subtitle,
  trailing,
  onPress,
  chevron,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: Space.md,
        paddingVertical: Space.md,
        paddingHorizontal: Space.lg,
      }}
    >
      {icon ? <View style={{ width: 22, alignItems: "center" }}>{icon}</View> : null}
      <View style={{ flex: 1, gap: Space.xs }}>
        <GhostText type="body">{title}</GhostText>
        {subtitle ? (
          <GhostText type="secondary" style={{ color: Ghost.text.secondary }}>
            {subtitle}
          </GhostText>
        ) : null}
      </View>
      {trailing}
      {chevron ? <GhostText style={{ color: Ghost.text.tertiary }}>›</GhostText> : null}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.6} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

/* ------------------------------------------------------------------ */
/* GhostToggle                                                          */
/* ------------------------------------------------------------------ */

export function GhostToggle({
  value,
  onValueChange,
  disabled,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: Ghost.bg.surface2, true: Ghost.accentSoft }}
      thumbColor={value ? Ghost.accent : Ghost.text.tertiary}
      style={{ transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }] }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* GhostInput                                                           */
/* ------------------------------------------------------------------ */

export function GhostInput({
  value,
  onChangeText,
  placeholder,
  multiline,
  secureTextEntry,
  keyboardType,
  style,
}: {
  value: string;
  onChangeText?: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "numeric" | "email-address" | "url";
  style?: StyleProp<TextStyle>;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={Ghost.text.tertiary}
      multiline={multiline}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      style={[
        {
          backgroundColor: Ghost.bg.surface2,
          borderWidth: 1,
          borderColor: Ghost.hairline,
          borderRadius: Radius.lg,
          paddingVertical: Space.md,
          paddingHorizontal: Space.md,
          color: Ghost.text.primary,
          fontFamily: undefined,
          fontSize: 16,
          lineHeight: 24,
          textAlignVertical: multiline ? "top" : "center",
          minHeight: multiline ? 96 : undefined,
        },
        style,
      ]}
    />
  );
}

/* ------------------------------------------------------------------ */
/* ConnectionPill (quiet presence)                                      */
/* ------------------------------------------------------------------ */

export function ConnectionPill({
  connected,
  degraded,
  label,
}: {
  connected: boolean;
  degraded?: boolean;
  label?: string;
}) {
  const dot = degraded ? Ghost.warn : connected ? Ghost.accent : Ghost.text.tertiary;
  const text = degraded ? "Available" : connected ? (label ?? "Connected") : "Offline";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: Space.sm,
        backgroundColor: Ghost.accentSoft,
        paddingVertical: Space.xs + 2,
        paddingHorizontal: Space.md,
        borderRadius: Radius.pill,
      }}
    >
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: dot,
        }}
      />
      <GhostText type="caption" style={{ color: Ghost.text.secondary }}>
        {text}
      </GhostText>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* EmptyState                                                           */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: Space.xxxl,
        gap: Space.lg,
      }}
    >
      {icon ? <View style={{ opacity: 0.7 }}>{icon}</View> : null}
      <View style={{ gap: Space.sm, alignItems: "center" }}>
        <GhostText type="title" style={{ textAlign: "center" }}>
          {title}
        </GhostText>
        {subtitle ? (
          <GhostText type="secondary" style={{ textAlign: "center", color: Ghost.text.secondary }}>
            {subtitle}
          </GhostText>
        ) : null}
      </View>
      {action}
    </View>
  );
}
