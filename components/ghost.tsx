import React from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Fonts, Radius, Space, UI } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { GhostMark } from "@/components/ghost-mark";

export { GhostMark };

/* ------------------------------------------------------------------ */
/* Divider                                                            */
/* ------------------------------------------------------------------ */

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          height: StyleSheet.hairlineWidth,
          backgroundColor: Ghost.border.subtle,
        },
        style,
      ]}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Screen — safe area wrapper with proper padding                      */
/* ------------------------------------------------------------------ */

export function Screen({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: Ghost.bg.base,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* GhostButton                                                        */
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
  loading,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = {
    primary: {
      bg: Ghost.accent.primary,
      fg: Ghost.text.inverse,
      border: "transparent",
    },
    secondary: {
      bg: "transparent",
      fg: Ghost.text.primary,
      border: Ghost.border.default,
    },
    ghost: {
      bg: "transparent",
      fg: Ghost.text.secondary,
      border: "transparent",
    },
    danger: {
      bg: "transparent",
      fg: Ghost.status.error,
      border: Ghost.border.default,
    },
  }[variant];

  return (
    <TouchableOpacity
      activeOpacity={disabled || loading ? 1 : 0.7}
      onPress={disabled || loading ? undefined : onPress}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: Space.sm,
          paddingVertical: Space.md + 2,
          paddingHorizontal: Space.xl,
          borderRadius: Radius.full,
          backgroundColor: disabled ? Ghost.bg.sunken : palette.bg,
          borderWidth: variant === "ghost" ? 0 : 1,
          borderColor: disabled ? Ghost.border.subtle : palette.border,
          opacity: disabled ? 0.5 : 1,
          alignSelf: fullWidth ? "stretch" : "flex-start",
          minHeight: 48,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "primary" ? Ghost.text.inverse : Ghost.accent.primary}
        />
      ) : (
        <>
          {leftIcon}
          <GhostText
            type="headline"
            style={{
              color: disabled ? Ghost.text.tertiary : palette.fg,
              fontSize: 15,
            }}
          >
            {title}
          </GhostText>
          {rightIcon}
        </>
      )}
    </TouchableOpacity>
  );
}

/* ------------------------------------------------------------------ */
/* GhostSheet (bottom sheet / modal)                                   */
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
        style={{ flex: 1, backgroundColor: UI.modal.backdrop }}
        onPress={onClose}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            style={{
              backgroundColor: Ghost.bg.base,
              borderTopLeftRadius: Radius.xxl,
              borderTopRightRadius: Radius.xxl,
              maxHeight: "88%",
              paddingTop: Space.sm,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Grabber */}
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: Ghost.border.default,
                alignSelf: "center",
                marginBottom: Space.sm,
              }}
            />

            {title && (
              <View
                style={{
                  paddingHorizontal: Space.xl,
                  paddingBottom: Space.md,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <GhostText type="title">{title}</GhostText>
                <TouchableOpacity onPress={onClose} hitSlop={8}>
                  <GhostText type="headline" style={{ color: Ghost.accent.primary }}>
                    Done
                  </GhostText>
                </TouchableOpacity>
              </View>
            )}

            <ScrollView
              style={{ paddingHorizontal: Space.xl }}
              contentContainerStyle={{ gap: Space.lg, paddingBottom: Space.xxxl + 20 }}
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
/* SectionHeader                                                      */
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
      <View style={{ gap: Space.xxs }}>
        <GhostText
          type="caption"
          style={{
            color: Ghost.text.tertiary,
            letterSpacing: 0.3,
          }}
        >
          {title}
        </GhostText>
        {subtitle ? (
          <GhostText type="subhead" style={{ color: Ghost.text.secondary }}>
            {subtitle}
          </GhostText>
        ) : null}
      </View>
      {action}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* GhostList + GhostRow                                               */
/* ------------------------------------------------------------------ */

export function GhostList({
  children,
  divided = false,
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
          marginHorizontal: Space.xl,
        },
        style,
      ]}
    >
      {React.Children.map(children, (child, i) => (
        <View key={i}>
          {child}
          {divided && i < React.Children.count(children) - 1 ? (
            <Divider style={{ marginLeft: Space.xl }} />
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function GhostRow({
  title,
  subtitle,
  trailing,
  onPress,
  chevron,
  style,
}: {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const content = (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: Space.md + 2,
          paddingHorizontal: Space.xl,
          minHeight: 52,
        },
        style,
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <GhostText type="body" style={{ color: Ghost.text.primary }}>
          {title}
        </GhostText>
        {subtitle ? (
          <GhostText type="subhead" style={{ color: Ghost.text.secondary }}>
            {subtitle}
          </GhostText>
        ) : null}
      </View>
      {trailing}
      {chevron ? (
        <GhostText
          type="callout"
          style={{ color: Ghost.text.tertiary, marginLeft: Space.xs }}
        >
          ›
        </GhostText>
      ) : null}
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
/* GhostToggle                                                        */
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
      trackColor={{ false: Ghost.bg.sunken, true: Ghost.accent.medium }}
      thumbColor={value ? Ghost.accent.primary : Ghost.text.tertiary}
      style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* GhostInput                                                         */
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
          backgroundColor: Ghost.bg.sunken,
          borderWidth: 1,
          borderColor: Ghost.border.default,
          borderRadius: Radius.md,
          paddingVertical: Space.md,
          paddingHorizontal: Space.lg,
          color: Ghost.text.primary,
          fontFamily: Fonts.sans,
          fontSize: 16,
          lineHeight: 24,
          textAlignVertical: multiline ? "top" : "center",
          minHeight: multiline ? 96 : 48,
        },
        style,
      ]}
    />
  );
}

/* ------------------------------------------------------------------ */
/* EmptyState                                                         */
/* ------------------------------------------------------------------ */

export function EmptyState({
  title,
  subtitle,
  action,
}: {
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
        paddingHorizontal: Space.huge,
        gap: Space.lg,
      }}
    >
      <View style={{ gap: Space.sm, alignItems: "center" }}>
        <GhostText
          type="headline"
          style={{ textAlign: "center", color: Ghost.text.primary }}
        >
          {title}
        </GhostText>
        {subtitle ? (
          <GhostText
            type="body"
            style={{ textAlign: "center", color: Ghost.text.secondary }}
          >
            {subtitle}
          </GhostText>
        ) : null}
      </View>
      {action ? <View style={{ alignItems: "center" }}>{action}</View> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* StatusDot                                                          */
/* ------------------------------------------------------------------ */

export function StatusDot({
  status,
  size = 6,
}: {
  status: "online" | "offline" | "warning";
  size?: number;
}) {
  const color =
    status === "online"
      ? Ghost.status.success
      : status === "warning"
        ? Ghost.status.warning
        : Ghost.text.tertiary;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
      }}
    />
  );
}
