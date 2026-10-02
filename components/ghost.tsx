import React, { useEffect, useState } from "react";
import Reanimated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { X } from "lucide-react-native";
import {
  ActivityIndicator,
  Modal,
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
import { alpha, Ghost, Inter, Radius, Space, UI } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { GhostMark } from "@/components/ghost-mark";

const AnimatedTouchableOpacity = Reanimated.createAnimatedComponent(TouchableOpacity);

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
      bg: Ghost.glass.fillStrong,
      fg: Ghost.text.primary,
      border: Ghost.glass.border,
    },
    secondary: {
      bg: Ghost.glass.fill,
      fg: Ghost.text.primary,
      border: Ghost.border.default,
    },
    ghost: {
      bg: "transparent",
      fg: Ghost.text.secondary,
      border: "transparent",
    },
    danger: {
      bg: alpha(Ghost.status.error, 0.12),
      fg: Ghost.status.error,
      border: "transparent",
    },
  }[variant];
  const [pressed, setPressed] = useState(false);
  const reduceMotion = useReducedMotion();
  const interactive = !disabled && !loading;

  return (
    <AnimatedTouchableOpacity
      activeOpacity={disabled || loading ? 1 : 0.7}
      accessibilityLabel={title}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading) }}
      onPress={disabled || loading ? undefined : onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      pressRetentionOffset={16}
      style={[
        pressTransition.base,
        pressed && interactive && !reduceMotion && pressTransition.pressed,
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: Space.sm,
          paddingVertical: Space.md - 1,
          paddingHorizontal: Space.xl,
          borderRadius: Radius.full,
          backgroundColor: disabled ? Ghost.bg.sunken : palette.bg,
          borderWidth: variant === "ghost" ? 0 : 1,
          borderColor: disabled ? Ghost.border.subtle : palette.border,
          opacity: disabled ? 0.5 : 1,
          alignSelf: fullWidth ? "stretch" : "flex-start",
          minHeight: 46,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={Ghost.text.primary}
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
    </AnimatedTouchableOpacity>
  );
}

// Press feedback: near-imperceptible 120ms scale, the ceiling for
// tens-of-times-a-day controls. Opacity dip (activeOpacity) stays as the
// reduced-motion path.
const pressTransition = StyleSheet.create({
  base: {
    transform: [{ scale: 1 }],
    transitionProperty: "transform",
    transitionDuration: "120ms",
    transitionTimingFunction: "ease-out",
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
});

/* ------------------------------------------------------------------ */
/* GhostSheet (bottom sheet / modal)                                   */
/* ------------------------------------------------------------------ */

export function GhostSheet({
  visible,
  onClose,
  title,
  message,
  confirmTitle,
  onConfirm,
  variant = "default",
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  confirmTitle?: string;
  onConfirm?: () => void;
  variant?: "default" | "destructive";
  children?: React.ReactNode;
}) {
  // Alert mode is confirm/cancel only. When children are provided the sheet
  // is a form: an optional message renders as a description and the children
  // (inputs, buttons) always stay visible above the keyboard.
  const isAlert = !children && (!!message || !!confirmTitle);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0); // 0 away, 1 shown
  const drag = useSharedValue(0); // how far it has been pulled down
  const height = useSharedValue(0);
  const keyboard = useAnimatedKeyboard();

  useEffect(() => {
    if (visible) {
      setMounted(true);
      drag.set(0);
      progress.set(reduceMotion ? 1 : withSpring(1, { damping: 26, stiffness: 260, mass: 0.9 }));
      return;
    }
    progress.set(withTiming(0, { duration: reduceMotion ? 0 : 200 }));
    const t = setTimeout(() => setMounted(false), reduceMotion ? 0 : 220);
    return () => clearTimeout(t);
  }, [visible, reduceMotion, progress, drag]);

  // Pull the sheet down to send it away: past a third of a swipe, or a flick.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => {
      drag.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > 96 || e.velocityY > 900) {
        drag.set(withTiming(height.get() || 400, { duration: 180 }));
        onClose();
      } else {
        drag.set(withSpring(0, { damping: 22, stiffness: 260 }));
      }
    });

  const backdropStyle = useAnimatedStyle(() => {
    const h = height.get() || 400;
    return { opacity: progress.get() * (1 - Math.min(1, drag.get() / h) * 0.7) };
  });
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.get()) * (height.get() || 500) + drag.get() }],
    paddingBottom: Math.max(insets.bottom, keyboard.height.get()) + Space.lg,
  }));

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Reanimated.View style={[StyleSheet.absoluteFill, { backgroundColor: UI.modal.backdrop }, backdropStyle]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        </Reanimated.View>
        <View style={{ flex: 1, justifyContent: "flex-end" }} pointerEvents="box-none">
          <Reanimated.View
            accessibilityViewIsModal
            onLayout={(e) => height.set(e.nativeEvent.layout.height)}
            style={[sheetStyles.sheet, sheetStyle]}
          >
            <GestureDetector gesture={pan}>
              <View collapsable={false}>
                <View style={sheetStyles.grabber} />
                {title ? (
                  <View style={sheetStyles.head}>
                    <GhostText type="title" accessibilityRole="header" style={[sheetStyles.title, variant === "destructive" && { color: Ghost.status.error }]}>
                      {title}
                    </GhostText>
                    {!isAlert ? (
                      <Pressable onPress={onClose} hitSlop={10} style={sheetStyles.close} accessibilityLabel="Close" accessibilityRole="button">
                        <X size={16} color={Ghost.text.secondary} strokeWidth={2.2} />
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
                {message ? (
                  <GhostText type="callout" style={sheetStyles.message}>
                    {message}
                  </GhostText>
                ) : null}
              </View>
            </GestureDetector>

            {isAlert ? (
              <View style={sheetStyles.actions}>
                {confirmTitle && onConfirm ? (
                  <GhostButton
                    title={confirmTitle}
                    variant={variant === "destructive" ? "danger" : "primary"}
                    fullWidth
                    onPress={() => {
                      onConfirm();
                      onClose();
                    }}
                  />
                ) : null}
                <GhostButton title="Cancel" variant="ghost" fullWidth onPress={onClose} />
              </View>
            ) : (
              <ScrollView
                style={sheetStyles.body}
                contentContainerStyle={{ gap: Space.md, paddingTop: Space.md }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                showsVerticalScrollIndicator={false}
              >
                {children}
              </ScrollView>
            )}
          </Reanimated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  sheet: {
    alignSelf: "stretch",
    maxHeight: "90%",
    backgroundColor: Ghost.bg.raised,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: Ghost.border.default,
    paddingHorizontal: Space.xl,
  },
  grabber: {
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: Ghost.border.strong,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: Space.md,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Space.md },
  title: { flex: 1, fontSize: 21, lineHeight: 27, fontWeight: "600", letterSpacing: -0.3, color: Ghost.text.primary },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Ghost.bg.sunken,
    alignItems: "center",
    justifyContent: "center",
  },
  message: { color: Ghost.text.secondary, marginTop: Space.xs },
  actions: { gap: Space.xs, paddingTop: Space.xl },
  body: { flexGrow: 0 },
});

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
          paddingTop: Space.xxl,
          paddingBottom: Space.xs,
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
          paddingVertical: Space.sm + 2,
          paddingHorizontal: Space.xl,
          minHeight: 48,
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
      <TouchableOpacity
        activeOpacity={0.6}
        onPress={onPress}
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        accessibilityRole="button"
      >
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
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      // On reads as on at a glance: a green track, as in the console. Off is a
      // quiet well. The thumb is white in both, so only the track changes.
      trackColor={{ false: Ghost.border.strong, true: Ghost.status.success }}
      ios_backgroundColor={Ghost.border.strong}
      thumbColor="#FFFFFF"
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
  autoCapitalize,
  autoCorrect,
  accessibilityLabel,
  editable = true,
  style,
}: {
  value: string;
  onChangeText?: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "numeric" | "number-pad" | "email-address" | "url";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  accessibilityLabel?: string;
  editable?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={Ghost.text.tertiary}
      multiline={multiline}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize ?? (secureTextEntry || keyboardType === "url" ? "none" : undefined)}
      autoCorrect={autoCorrect ?? (secureTextEntry || keyboardType === "url" ? false : undefined)}
      accessibilityLabel={accessibilityLabel ?? placeholder}
      editable={editable}
      selectionColor={Ghost.accent.primary}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        {
          backgroundColor: Ghost.glass.fill,
          borderWidth: 1,
          borderColor: focused ? Ghost.accent.primary : Ghost.glass.border,
          borderRadius: Radius.xxl,
          borderCurve: "continuous",
          paddingVertical: Space.md,
          paddingHorizontal: Space.lg,
          color: Ghost.text.primary,
          fontFamily: Inter.regular,
          fontSize: 16,
          lineHeight: 22,
          textAlignVertical: multiline ? "top" : "center",
          minHeight: multiline ? 96 : 52,
          opacity: editable ? 1 : 0.5,
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
          style={{
            textAlign: "center",
            color: Ghost.text.primary,
            fontSize: 21,
            lineHeight: 30,
            fontWeight: "600",
            letterSpacing: -0.2,
          }}
        >
          {title}
        </GhostText>
        {subtitle ? (
          <GhostText
            style={{
              textAlign: "center",
              color: Ghost.text.secondary,
              fontSize: 15,
              lineHeight: 22,
            }}
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
/* OfflineBadge — one offline language for every screen                */
/* ------------------------------------------------------------------ */

export function OfflineBadge({ state }: { state: "offline" | "syncing" }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: Space.xs,
        paddingVertical: Space.xs,
        paddingHorizontal: Space.sm,
        minHeight: 44,
      }}
      accessibilityLabel={state === "syncing" ? "Reconnecting" : "Offline"}
    >
      <StatusDot status={state === "syncing" ? "warning" : "offline"} size={8} />
      <GhostText type="footnote" style={{ color: Ghost.text.tertiary }}>
        {state === "syncing" ? "Reconnecting" : "Offline"}
      </GhostText>
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
