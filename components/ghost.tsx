import React, { createContext, useContext, useEffect, useState } from "react";
import Reanimated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { ChevronRight, X } from "lucide-react-native";
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
import { alpha, Fonts, Ghost, Inter, Radius, Space, UI } from "@/constants/theme";
import { GlassCard } from "@/components/glass";
import { GhostText } from "@/components/themed-text";
import { GhostMark } from "@/components/ghost-mark";

const AnimatedTouchableOpacity = Reanimated.createAnimatedComponent(TouchableOpacity);

/**
 * A sheet's content scrolls inside a clipped area, which cuts a button's outer
 * glow into a visible rectangle behind it. Inside a sheet a button keeps its
 * fill and border and drops the glow.
 */
const InSheet = createContext(false);

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
  size = "md",
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** "sm" is the in-row size: Allow, Configure, Pause. */
  size?: "md" | "sm";
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  // One hierarchy everywhere: the action glows, the alternative is dark
  // glass, the quiet one is only text, and danger stays soft until pressed.
  const palette = {
    // The same values as the console's .ghost-btn variants, so a button is the
    // same button on every surface. The glowing one is for submitting a form
    // (Save, Connect); nearly everything else is the dark glass.
    primary: { bg: "rgba(58,46,240,0.38)", fg: Ghost.text.primary, border: "rgba(140,128,255,0.42)", glow: true },
    secondary: { bg: "rgba(0,0,0,0.36)", fg: Ghost.text.primary, border: "rgba(255,255,255,0.13)", glow: false },
    ghost: { bg: "#000000", fg: Ghost.text.primary, border: "rgba(255,255,255,0.18)", glow: false },
    danger: { bg: alpha(Ghost.status.error, 0.12), fg: Ghost.status.error, border: alpha(Ghost.status.error, 0.34), glow: false },
  }[variant];
  const [pressed, setPressed] = useState(false);
  const reduceMotion = useReducedMotion();
  const interactive = !disabled && !loading;
  const inSheet = useContext(InSheet);

  return (
    <AnimatedTouchableOpacity
      activeOpacity={disabled || loading ? 1 : 0.7}
      accessibilityLabel={title}
      accessibilityRole="button"
      hitSlop={size === "sm" ? { top: 5, bottom: 5, left: 4, right: 4 } : undefined}
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
          paddingVertical: size === "sm" ? 6 : Space.sm,
          paddingHorizontal: size === "sm" ? 16 : 22,
          borderRadius: Radius.full,
          backgroundColor: disabled ? Ghost.glass.fill : palette.bg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: disabled ? Ghost.border.subtle : palette.border,
          opacity: disabled ? 0.45 : 1,
          alignSelf: fullWidth ? "stretch" : "flex-start",
          minHeight: size === "sm" ? 34 : 42,
          boxShadow: palette.glow && interactive && !inSheet ? "0 0 22px rgba(58,46,240,0.55)" : undefined,
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
              fontSize: size === "sm" ? 13 : 14,
              fontWeight: "500",
              letterSpacing: -0.1,
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
  cancelTitle,
  variant = "default",
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  confirmTitle?: string;
  onConfirm?: () => void;
  /** The way out ("Cancel", "Not now"); alone, it is the one button ("OK"). */
  cancelTitle?: string;
  variant?: "default" | "destructive";
  children?: React.ReactNode;
}) {
  // Without children the sheet is a dialog: the action, then the way out, as
  // the console's modal is on a phone (main action on top, where a thumb
  // reaches). With children it is a form: an optional message renders as a
  // description and the children always stay visible above the keyboard.
  const isAlert = !children;
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
                    <GhostText type="title" accessibilityRole="header" style={sheetStyles.title}>
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
              <InSheet.Provider value>
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
                <GhostButton
                  title={cancelTitle ?? (confirmTitle && onConfirm ? "Cancel" : "OK")}
                  variant={confirmTitle && onConfirm ? "ghost" : "secondary"}
                  fullWidth
                  onPress={onClose}
                />
              </View>
              </InSheet.Provider>
            ) : (
              <ScrollView
                style={sheetStyles.body}
                contentContainerStyle={{ gap: Space.md, paddingTop: Space.md, paddingBottom: Space.sm }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                showsVerticalScrollIndicator={false}
              >
                <InSheet.Provider value>{children}</InSheet.Provider>
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
          paddingHorizontal: Space.xl + 6,
          paddingTop: Space.xxl,
          paddingBottom: Space.sm,
        },
        style,
      ]}
    >
      <View style={{ gap: Space.xxs, flexShrink: 1 }}>
        <GhostText
          type="caption"
          style={{
            color: Ghost.text.tertiary,
            fontSize: 11.5,
            fontWeight: "500",
            letterSpacing: 1.1,
            textTransform: "uppercase",
          }}
        >
          {title}
        </GhostText>
        {subtitle ? (
          <GhostText type="subhead" style={{ color: Ghost.text.secondary, fontWeight: "300" }}>
            {subtitle}
          </GhostText>
        ) : null}
      </View>
      {action}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* GhostList + GhostRow: a glass panel of hairline-divided rows        */
/* ------------------------------------------------------------------ */

export function GhostList({
  children,
  divided = true,
  style,
}: {
  children: React.ReactNode;
  divided?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View
      style={[
        {
          marginHorizontal: Space.lg,
          borderRadius: 26,
          borderCurve: "continuous",
          backgroundColor: "rgba(0,0,0,0.42)",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: Ghost.glass.border,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {items.map((child, i) => (
        <View key={i}>
          {child}
          {divided && i < items.length - 1 ? <Divider style={{ marginHorizontal: Space.xl }} /> : null}
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
  const content = (pressed: boolean) => (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: Space.md,
          paddingVertical: Space.md,
          paddingHorizontal: Space.xl,
          minHeight: 56,
          backgroundColor: pressed ? "rgba(255,255,255,0.05)" : "transparent",
        },
        style,
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <GhostText type="body" style={{ color: Ghost.text.primary, fontSize: 16, fontWeight: "500", letterSpacing: -0.15 }}>
          {title}
        </GhostText>
        {subtitle ? (
          <GhostText type="subhead" style={{ color: Ghost.text.secondary, fontWeight: "300", fontSize: 13.5, lineHeight: 19 }}>
            {subtitle}
          </GhostText>
        ) : null}
      </View>
      {trailing}
      {chevron ? <ChevronRight size={18} color={Ghost.text.tertiary} strokeWidth={1.6} /> : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        accessibilityRole="button"
      >
        {({ pressed }) => content(pressed)}
      </Pressable>
    );
  }
  return content(false);
}

/* ------------------------------------------------------------------ */
/* Panel: a titled glass card, the console's .panel                    */
/* ------------------------------------------------------------------ */

export function Panel({
  title,
  description,
  action,
  children,
  style,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <GlassCard style={[{ marginHorizontal: Space.lg, marginTop: Space.md, gap: Space.sm }, style]}>
      {title || action ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Space.md }}>
          {title ? (
            <GhostText type="headline" style={{ fontSize: 17, fontWeight: "600", letterSpacing: -0.2, flexShrink: 1 }}>
              {title}
            </GhostText>
          ) : <View />}
          {action}
        </View>
      ) : null}
      {description ? (
        <GhostText type="subhead" style={{ color: Ghost.text.secondary, fontWeight: "300", fontSize: 14.5, lineHeight: 21 }}>
          {description}
        </GhostText>
      ) : null}
      {children}
    </GlassCard>
  );
}

/* ------------------------------------------------------------------ */
/* StatusPill: a word with a light, the console's .status-pill         */
/* ------------------------------------------------------------------ */

const PILL = {
  ok: Ghost.status.success,
  warn: Ghost.status.warning,
  bad: Ghost.status.error,
  info: Ghost.status.info,
  off: Ghost.text.tertiary,
  accent: Ghost.accent.primary,
} as const;

export function StatusPill({ label, tone = "off", dot = true }: { label: string; tone?: keyof typeof PILL; dot?: boolean }) {
  const color = PILL[tone];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        height: 24,
        borderRadius: 12,
        backgroundColor: alpha(color, 0.12),
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: alpha(color, 0.32),
      }}
    >
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} /> : null}
      <GhostText type="caption" style={{ color, fontSize: 12, fontWeight: "500", letterSpacing: 0.1 }}>
        {label}
      </GhostText>
    </View>
  );
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
      trackColor={{ false: "rgba(255,255,255,0.16)", true: Ghost.status.success }}
      ios_backgroundColor="rgba(255,255,255,0.16)"
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
            fontFamily: Fonts.voice,
            fontSize: 30,
            lineHeight: 36,
            letterSpacing: -0.5,
          }}
        >
          {title}
        </GhostText>
        {subtitle ? (
          <GhostText
            style={{
              textAlign: "center",
              color: Ghost.text.secondary,
              fontSize: 15.5,
              lineHeight: 23,
              fontWeight: "300",
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
