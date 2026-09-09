import { usePathname, useRouter } from "expo-router";
import { Bookmark, Clock, MessageCircle, Settings } from "lucide-react-native";
import React, { useCallback } from "react";
import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Radius, Space, UI } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { MAIN_SESSION_ID, useGhostStore } from "@/lib/store";

interface Props {
  visible: boolean;
  onClose: () => void;
}

const ROWS = [
  { label: "Talk to Ghost", path: "/conversation", Icon: MessageCircle },
  { label: "Activity", path: "/(tabs)/activity", Icon: Clock },
  { label: "Memory", path: "/(tabs)/memory", Icon: Bookmark },
  { label: "Settings", path: "/(tabs)/more", Icon: Settings },
] as const;

export function MenuDrawer({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { setCurrentSession } = useGhostStore();

  const nav = useCallback(
    (path: string) => {
      onClose();
      setTimeout(() => router.push(path as any), 60);
    },
    [onClose, router],
  );

  const openThread = useCallback(() => {
    setCurrentSession(MAIN_SESSION_ID);
    nav("/conversation");
  }, [nav, setCurrentSession]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.panel, { paddingTop: insets.top + Space.md, paddingBottom: insets.bottom + Space.lg }]}>
          {ROWS.map(({ label, path, Icon }) => {
            const active = pathname === path || (path === "/conversation" && pathname === "conversation");
            const onPress = path === "/conversation" ? openThread : () => nav(path);
            return (
              <TouchableOpacity
                key={path}
                style={[styles.row, active && styles.rowActive]}
                activeOpacity={0.7}
                onPress={onPress}
                accessibilityLabel={label}
                accessibilityState={{ selected: active }}
              >
                <View style={styles.tile}>
                  <Icon size={20} color={Ghost.text.inverse} />
                </View>
                <GhostText type="headline" style={[styles.rowLabel, active && styles.rowLabelActive]}>
                  {label}
                </GhostText>
              </TouchableOpacity>
            );
          })}
        </View>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu" />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: "row",
  },
  backdrop: {
    flex: 1,
    backgroundColor: UI.modal.backdrop,
  },
  panel: {
    width: "85%",
    maxWidth: 340,
    backgroundColor: Ghost.bg.base,
    paddingHorizontal: Space.xl,
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.lg,
    paddingVertical: Space.md,
    paddingHorizontal: Space.sm,
    minHeight: 56,
    borderRadius: Radius.md,
  },
  rowActive: {
    backgroundColor: Ghost.accent.soft,
  },
  tile: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Ghost.text.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    color: Ghost.text.primary,
    flex: 1,
  },
  rowLabelActive: {
    color: Ghost.accent.primary,
  },
});
