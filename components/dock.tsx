import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Space } from "@/constants/theme";

export type DockItem = {
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  onPress: () => void;
};

/**
 * The floating dock: a glass pill of icons and one round button beside it.
 * Icons carry no text; each has an accessibility label.
 */
export function Dock({ items, action }: { items: DockItem[]; action?: DockItem }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom + Space.lg }]} pointerEvents="box-none">
      {/* Content scrolling under the dock fades out instead of colliding with it. */}
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.85)", "#000"]}
        locations={[0, 0.55, 1]}
        style={[styles.scrim, { height: insets.bottom + 140 }]}
      />
      <View style={styles.pill}>
        {items.map(({ label, icon: Icon, onPress }) => (
          <Pressable
            key={label}
            onPress={onPress}
            hitSlop={4}
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.5 }]}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            <Icon size={21} color={Ghost.text.primary} strokeWidth={1.5} />
          </Pressable>
        ))}
      </View>
      {action ? (
        <Pressable
          onPress={action.onPress}
          style={({ pressed }) => [styles.round, pressed && { opacity: 0.5 }]}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <action.icon size={22} color={Ghost.text.primary} strokeWidth={1.5} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0 },
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    paddingHorizontal: 10,
    borderRadius: 28,
    backgroundColor: "rgba(0,0,0,0.42)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  item: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  round: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.42)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
});
