import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Space } from "@/constants/theme";

/**
 * Header for every screen that isn't the conversation. The conversation is
 * home; everything else is a short trip away from it and back, so the header is
 * one line: the way back, where you are, and at most one thing to do here.
 * A subtitle, when it earns its place, is a single quiet line under it.
 */
export function ScreenHeader({
  title,
  subtitle,
  variant = "back",
  trailing,
  inset = true,
}: {
  title: string;
  subtitle?: string;
  /** "close" for sheets presented over the conversation. */
  variant?: "back" | "close";
  trailing?: React.ReactNode;
  /** Pad for the status bar (off inside sheets that already sit below it). */
  inset?: boolean;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };
  const Icon = variant === "close" ? X : ChevronLeft;
  return (
    <View style={[styles.wrap, { paddingTop: (inset ? insets.top : 0) + Space.xs }]}>
      <View style={styles.row}>
        <Pressable
          onPress={leave}
          hitSlop={8}
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.5 }]}
          accessibilityRole="button"
          accessibilityLabel={variant === "close" ? "Close" : "Back"}
        >
          <Icon size={22} color={Ghost.text.primary} strokeWidth={2} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
        <View style={styles.trailing}>{trailing}</View>
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Space.xl,
    paddingBottom: Space.sm,
    backgroundColor: Ghost.bg.base,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    marginLeft: -8,
    gap: 2,
  },
  btn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "600",
    letterSpacing: -0.3,
    color: Ghost.text.primary,
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
  },
  subtitle: {
    fontSize: 13.5,
    lineHeight: 19,
    color: Ghost.text.secondary,
    marginTop: 0,
  },
});
