import { useRouter } from "expo-router";
import { AlignLeft, Bookmark, CircleHelp, Clock, Ghost as GhostIcon, Plus, Settings } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Space } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { fetchSessions, SessionSummary } from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function MenuDrawer({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { config, setCurrentSession } = useGhostStore();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  useEffect(() => {
    if (!visible || !config) return;
    (async () => {
      try {
        const list = await fetchSessions(config);
        setSessions(list.slice(0, 6));
      } catch {
        setSessions([]);
      }
    })();
  }, [visible, config]);

  const nav = useCallback(
    (path: string) => {
      onClose();
      setTimeout(() => router.push(path as any), 60);
    },
    [onClose, router],
  );

  const openSession = (s: SessionSummary) => {
    setCurrentSession(s.id);
    nav("/conversation");
  };

  const newChat = () => {
    setCurrentSession("mobile:default");
    nav("/conversation");
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.panel, { paddingTop: insets.top + Space.md, paddingBottom: insets.bottom + Space.lg }]}>
          <TouchableOpacity style={styles.newRow} activeOpacity={0.7} onPress={newChat}>
            <Plus size={18} color={Ghost.text.primary} />
            <GhostText type="headline" style={styles.rowLabel}>
              New chat
            </GhostText>
          </TouchableOpacity>

          <GhostText type="caption" style={styles.section}>
            RECENT
          </GhostText>
          {sessions.length === 0 ? (
            <GhostText type="subhead" style={styles.empty}>
              No conversations yet.
            </GhostText>
          ) : (
            sessions.map((s) => (
              <TouchableOpacity key={s.id} style={styles.recentRow} activeOpacity={0.7} onPress={() => openSession(s)}>
                <AlignLeft size={18} color={Ghost.text.secondary} />
                <GhostText type="body" style={styles.rowLabel} numberOfLines={1}>
                  {s.title && s.title !== s.id ? s.title : "Conversation"}
                </GhostText>
              </TouchableOpacity>
            ))
          )}
          <TouchableOpacity style={styles.recentRow} activeOpacity={0.7} onPress={() => nav("/(tabs)/chats")}>
            <AlignLeft size={18} color={Ghost.text.tertiary} />
            <GhostText type="subhead" style={styles.moreLink}>
              View all chats
            </GhostText>
          </TouchableOpacity>

          <View style={styles.spacer} />

          <TouchableOpacity style={styles.sysRow} activeOpacity={0.7} onPress={() => nav("/(tabs)/activity")}>
            <Clock size={20} color={Ghost.text.primary} />
            <GhostText type="headline" style={styles.rowLabel}>Activity</GhostText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sysRow} activeOpacity={0.7} onPress={() => nav("/(tabs)/memory")}>
            <Bookmark size={20} color={Ghost.text.primary} />
            <GhostText type="headline" style={styles.rowLabel}>Memory</GhostText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sysRow} activeOpacity={0.7} onPress={() => nav("/ghost-pod")}>
            <GhostIcon size={20} color={Ghost.text.primary} />
            <GhostText type="headline" style={styles.rowLabel}>Ghost Pod</GhostText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sysRow} activeOpacity={0.7} onPress={() => nav("/(tabs)/more")}>
            <Settings size={20} color={Ghost.text.primary} />
            <GhostText type="headline" style={styles.rowLabel}>Settings</GhostText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sysRow} activeOpacity={0.7} onPress={() => nav("/manual")}>
            <CircleHelp size={20} color={Ghost.text.primary} />
            <GhostText type="headline" style={styles.rowLabel}>Help</GhostText>
          </TouchableOpacity>
        </View>
        <Pressable style={styles.backdrop} onPress={onClose} />
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
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  panel: {
    width: "85%",
    maxWidth: 340,
    backgroundColor: Ghost.bg.base,
    paddingHorizontal: Space.xl,
  },
  newRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingVertical: Space.sm,
  },
  section: {
    color: Ghost.text.tertiary,
    letterSpacing: 0.8,
    marginTop: Space.lg,
    marginBottom: Space.sm,
  },
  empty: {
    color: Ghost.text.tertiary,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingVertical: Space.md,
  },
  moreLink: {
    color: Ghost.text.tertiary,
  },
  spacer: {
    flex: 1,
  },
  sysRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.lg,
    paddingVertical: Space.md,
  },
  rowLabel: {
    color: Ghost.text.primary,
    flex: 1,
  },
});
