import { useRouter } from "expo-router";
import { MessageCirclePlus } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Ghost, Space } from "@/constants/theme";
import { cleanTitleText } from "@/lib/format";
import { GhostText } from "@/components/themed-text";
import { EmptyState, GhostButton, OfflineBadge } from "@/components/ghost";
import {
  fetchSessions,
  SessionSummary,
} from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";

function formatRelativeTime(timestamp: number): string {
  const raw = timestamp || 0;
  const ts = raw > 1e12 ? raw : raw * 1000;
  const now = Date.now();
  const diffMs = now - ts;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(ts).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function getSessionTitle(session: SessionSummary): string {
  if (session.title && session.title !== session.id) {
    return cleanTitleText(session.title) || "Conversation";
  }
  return "Conversation";
}

function groupSessions(sessions: SessionSummary[]): { title: string; data: SessionSummary[] }[] {
  const now = Date.now();
  const dayMs = 86400000;
  const today = new Date(now).toDateString();
  const yesterday = new Date(now - dayMs).toDateString();
  const weekAgo = new Date(now - 7 * dayMs).toDateString();

  const groups: Record<string, SessionSummary[]> = {
    TODAY: [],
    YESTERDAY: [],
    "EARLIER THIS WEEK": [],
    EARLIER: [],
  };

  for (const s of sessions) {
    const d = new Date((s.last_activity ?? 0) * 1000);
    const ds = d.toDateString();
    if (ds === today) {
      groups.TODAY.push(s);
    } else if (ds === yesterday) {
      groups.YESTERDAY.push(s);
    } else if (d.getTime() > new Date(weekAgo).getTime()) {
      groups["EARLIER THIS WEEK"].push(s);
    } else {
      groups.EARLIER.push(s);
    }
  }

  return Object.entries(groups)
    .filter(([, data]) => data.length > 0)
    .map(([title, data]) => ({ title, data }));
}

export default function ConversationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { config, connectionState, setCurrentSession } = useGhostStore();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    if (!config) return;
    setLoading(true);
    setListError(null);
    try {
      const list = await fetchSessions(config);
      setSessions(list);
    } catch {
      setListError("Couldn't load conversations.");
    }
    setLoading(false);
  }, [config]);

  const onRefresh = useCallback(async () => {
    if (!config) return;
    setRefreshing(true);
    setListError(null);
    try {
      const list = await fetchSessions(config);
      setSessions(list);
    } catch {
      setListError("Couldn't load conversations.");
    }
    setRefreshing(false);
  }, [config]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const openConversation = useCallback(
    (session: SessionSummary) => {
      setCurrentSession(session.id);
      const title = getSessionTitle(session);
      router.push({
        pathname: "/conversation",
        params: { sessionId: session.id, title },
      } as any);
    },
    [router, setCurrentSession],
  );

  const handleNewConversation = () => {
    const id = `mobile:chat:${Date.now()}`;
    setCurrentSession(id);
    router.push({
      pathname: "/conversation",
      params: { sessionId: id },
    } as any);
  };

  const sections = groupSessions(sessions);

  const renderItem = useCallback(
    ({ item }: { item: SessionSummary }) => (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.6}
        onPress={() => openConversation(item)}
      >
        <View style={styles.rowContent}>
          <GhostText type="headline" style={styles.rowTitle} numberOfLines={1}>
            {getSessionTitle(item)}
          </GhostText>
          <GhostText type="footnote" style={styles.rowTime}>
            {formatRelativeTime(item.last_activity ?? Date.now())}
          </GhostText>
        </View>
        <GhostText type="footnote" style={styles.rowSubtitle}>
          {item.message_count} message{item.message_count !== 1 ? "s" : ""}
        </GhostText>
      </TouchableOpacity>
    ),
    [openConversation],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <GhostText type="largeTitle" style={styles.headerTitle}>Chats</GhostText>
        <View style={styles.headerRight}>
          {connectionState !== "online" && (
            <OfflineBadge state={connectionState === "syncing" ? "syncing" : "offline"} />
          )}
        </View>
      </View>

      {!config ? (
        <EmptyState
          title="Not connected"
          subtitle="Connect to your Ghost Pod to start."
        />
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Ghost.accent.primary} size="large" />
        </View>
      ) : listError && sessions.length === 0 ? (
        <EmptyState
          title="Couldn't load conversations."
          subtitle="Check your connection and try again."
          action={
            <GhostButton
              title="Retry"
              onPress={loadSessions}
            />
          }
        />
      ) : sessions.length === 0 ? (
        <EmptyState
          title="No conversations yet."
          subtitle="Start one and Ghost will remember."
          action={
            <GhostButton
              title="New Conversation"
              onPress={handleNewConversation}
            />
          }
        />
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(item) => item.title}
          renderItem={({ item: section }) => (
            <View style={styles.section}>
              <GhostText type="caption" style={styles.sectionTitle}>{section.title}</GhostText>
              {section.data.map((session) => (
                <View key={session.id}>{renderItem({ item: session })}</View>
              ))}
            </View>
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Ghost.accent.primary}
            />
          }
        />
      )}
      {config ? (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + Space.xl }]}
          activeOpacity={0.8}
          onPress={handleNewConversation}
          accessibilityLabel="Start a new chat"
        >
          <MessageCirclePlus size={24} color={Ghost.text.inverse} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Ghost.bg.base,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Space.xl,
    paddingVertical: Space.lg,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
  },
  headerTitle: {
    color: Ghost.text.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: Space.xl,
    paddingBottom: Space.huge,
  },
  section: {
    marginBottom: Space.xxl,
  },
  sectionTitle: {
    color: Ghost.text.tertiary,
    marginBottom: Space.sm,
  },
  row: {
    paddingVertical: Space.md,
  },
  rowContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowTitle: {
    color: Ghost.text.primary,
    flex: 1,
  },
  rowTime: {
    color: Ghost.text.tertiary,
    marginLeft: Space.sm,
  },
  rowSubtitle: {
    color: Ghost.text.secondary,
    marginTop: Space.xxs,
  },
  fab: {
    position: "absolute",
    right: Space.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Ghost.accent.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
});
