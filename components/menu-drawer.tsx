import { usePathname, useRouter } from "expo-router";
import { AlignLeft, Bookmark, CircleHelp, Clock, Ghost as GhostIcon, Plus, Settings } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Radius, Space, UI } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { fetchSessions, SessionSummary } from "@/lib/ghostApi";
import { cleanTitleText } from "@/lib/format";
import { useGhostStore } from "@/lib/store";

interface Props {
  visible: boolean;
  onClose: () => void;
}

const SYS_ROWS = [
  { label: "Activity", path: "/(tabs)/activity", Icon: Clock },
  { label: "Memory", path: "/(tabs)/memory", Icon: Bookmark },
  { label: "Ghost Pod", path: "/ghost-pod", Icon: GhostIcon },
  { label: "Settings", path: "/(tabs)/more", Icon: Settings },
  { label: "Help", path: "/about", Icon: CircleHelp },
] as const;

export function MenuDrawer({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { config, setCurrentSession } = useGhostStore();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadRecents = useCallback(async () => {
    if (!config) return;
    setLoading(true);
    setLoadError(false);
    try {
      const list = await fetchSessions(config);
      setSessions(list.slice(0, 6));
    } catch {
      setSessions([]);
      setLoadError(true);
    }
    setLoading(false);
  }, [config]);

  useEffect(() => {
    if (!visible) return;
    loadRecents();
  }, [visible, loadRecents]);

  const nav = useCallback(
    (path: string) => {
      onClose();
      setTimeout(() => router.push(path as any), 60);
    },
    [onClose, router],
  );

  const openSession = (s: SessionSummary) => {
    setCurrentSession(s.id);
    const title = s.title && s.title !== s.id ? cleanTitleText(s.title) : "";
    nav(
      title
        ? `/conversation?sessionId=${encodeURIComponent(s.id)}&title=${encodeURIComponent(title)}`
        : `/conversation?sessionId=${encodeURIComponent(s.id)}`,
    );
  };

  const newChat = () => {
    const id = `mobile:chat:${Date.now()}`;
    setCurrentSession(id);
    nav(`/conversation?sessionId=${encodeURIComponent(id)}`);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.panel, { paddingTop: insets.top + Space.md, paddingBottom: insets.bottom + Space.lg }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} style={styles.scrollView}>
            <TouchableOpacity style={styles.newRow} activeOpacity={0.7} onPress={newChat} accessibilityLabel="Start a new chat">
              <Plus size={18} color={Ghost.text.primary} />
              <GhostText type="headline" style={styles.rowLabel}>
                New chat
              </GhostText>
            </TouchableOpacity>

            <GhostText type="caption" style={styles.section}>
              RECENT
            </GhostText>
            {loading ? (
              <ActivityIndicator size="small" color={Ghost.accent.primary} style={styles.loader} />
            ) : loadError ? (
              <View style={styles.errorRow}>
                <GhostText type="subhead" style={styles.errorText}>
                  Couldn't load chats.
                </GhostText>
                <TouchableOpacity onPress={loadRecents} hitSlop={8} accessibilityLabel="Retry loading chats">
                  <GhostText type="subhead" style={styles.retryText}>Retry</GhostText>
                </TouchableOpacity>
              </View>
            ) : sessions.length === 0 ? (
              <GhostText type="subhead" style={styles.empty}>
                No conversations yet.
              </GhostText>
            ) : (
              sessions.map((s) => (
                <TouchableOpacity key={s.id} style={styles.recentRow} activeOpacity={0.7} onPress={() => openSession(s)}>
                  <AlignLeft size={18} color={Ghost.text.secondary} />
                <GhostText type="body" style={styles.rowLabel} numberOfLines={1}>
                  {s.title && s.title !== s.id ? cleanTitleText(s.title) || "Conversation" : "Conversation"}
                </GhostText>
                </TouchableOpacity>
              ))
            )}
            {sessions.length > 0 ? (
              <TouchableOpacity style={styles.recentRow} activeOpacity={0.7} onPress={() => nav("/(tabs)/chats")} accessibilityLabel="View all chats">
                <AlignLeft size={18} color={Ghost.text.tertiary} />
                <GhostText type="subhead" style={styles.moreLink}>
                  View all chats
                </GhostText>
              </TouchableOpacity>
            ) : null}

          </ScrollView>

          <View style={styles.sysGroup}>
            {SYS_ROWS.map(({ label, path, Icon }) => {
              const active = pathname === path;
              return (
                <TouchableOpacity
                  key={path}
                  style={[styles.sysRow, active && styles.sysRowActive]}
                  activeOpacity={0.7}
                  onPress={() => nav(path)}
                  accessibilityLabel={label}
                  accessibilityState={{ selected: active }}
                >
                  <Icon size={20} color={active ? Ghost.accent.primary : Ghost.text.primary} />
                  <GhostText type="headline" style={[styles.rowLabel, active && styles.rowLabelActive]}>
                    {label}
                  </GhostText>
                </TouchableOpacity>
              );
            })}
          </View>
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
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: Space.md,
  },
  sysGroup: {
    borderTopWidth: 1,
    borderTopColor: Ghost.border.subtle,
    paddingTop: Space.sm,
  },
  newRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingVertical: Space.sm,
    minHeight: 44,
  },
  section: {
    color: Ghost.text.tertiary,
    marginTop: Space.lg,
    marginBottom: Space.sm,
  },
  empty: {
    color: Ghost.text.tertiary,
  },
  loader: {
    alignSelf: "flex-start",
    marginVertical: Space.sm,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingVertical: Space.sm,
  },
  errorText: {
    color: Ghost.status.error,
  },
  retryText: {
    color: Ghost.accent.primary,
    fontWeight: "600",
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingVertical: Space.md,
    minHeight: 44,
  },
  moreLink: {
    color: Ghost.text.tertiary,
  },
  sysRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingVertical: Space.md,
    paddingHorizontal: Space.sm,
    minHeight: 44,
    borderRadius: Radius.md,
  },
  sysRowActive: {
    backgroundColor: Ghost.accent.soft,
  },
  rowLabel: {
    color: Ghost.text.primary,
    flex: 1,
  },
  rowLabelActive: {
    color: Ghost.accent.primary,
  },
});
