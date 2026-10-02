import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts, Ghost, Space } from "@/constants/theme";

/**
 * Header for every screen that isn't the conversation: the way back on the
 * left, the title and one quiet line under it centred, and at most one thing
 * to do here on the right. No bar and no background: it sits on the aurora.
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
  return (
    <View style={[styles.wrap, { paddingTop: (inset ? insets.top : 0) + Space.sm }]}>
      <View style={styles.bar}>
        <Pressable
          onPress={leave}
          hitSlop={8}
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.5 }]}
          accessibilityRole="button"
          accessibilityLabel={variant === "close" ? "Close" : "Back"}
        >
          <ChevronLeft size={20} color={Ghost.text.primary} strokeWidth={1.6} />
        </Pressable>
        <View style={styles.trailing}>{trailing}</View>
      </View>
      <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // Above the scroll shade that reaches up over this area, so the title never dims.
    position: "relative",
    zIndex: 3,
    paddingHorizontal: Space.xl,
    paddingBottom: Space.lg,
    alignItems: "center",
  },
  bar: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 40,
    zIndex: 2,
  },
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.38)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 40,
    justifyContent: "flex-end",
  },
  title: {
    fontFamily: Fonts.voice,
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: -0.8,
    color: Ghost.text.primary,
    textAlign: "center",
    marginTop: 2,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "300",
    color: "rgba(255,255,255,0.72)",
    textAlign: "center",
    marginTop: 4,
    maxWidth: 320,
  },
});
