import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Space } from "@/constants/theme";

/**
 * Header for every screen that isn't the conversation. The conversation is
 * home; everything else is a short trip away from it and back, so the only
 * navigation a screen needs is the way back.
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
          hitSlop={10}
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.5 }]}
          accessibilityRole="button"
          accessibilityLabel={variant === "close" ? "Close" : "Back"}
        >
          <Icon size={24} color={Ghost.text.primary} strokeWidth={2} />
        </Pressable>
        <View style={styles.trailing}>{trailing}</View>
      </View>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Space.xl,
    paddingBottom: Space.md,
    backgroundColor: Ghost.bg.base,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    marginLeft: -10,
  },
  btn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "600",
    letterSpacing: -0.4,
    color: Ghost.text.primary,
    marginTop: Space.xs,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    color: Ghost.text.secondary,
    marginTop: 2,
  },
});
