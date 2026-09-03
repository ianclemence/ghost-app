import { useRouter } from "expo-router";
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

import { Ghost, Radius, Space, Type } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { EmptyState, GhostButton } from "@/components/ghost";
import { GhostMark } from "@/components/ghost-mark";
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
    return session.title;
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

  const openConversation = (session: SessionSummary) => {
    setCurrentSession(session.id);
    router.push("/conversation" as any);
  };

  const handleNewConversation = () => {
    setCurrentSession("mobile:default");
    router.push("/conversation" as any);
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
    [],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <GhostText type="largeTitle" style={styles.headerTitle}>Chats</GhostText>
        <View style={styles.headerRight}>
          {connectionState !== "online" && (
            <View style={styles.offlineBadge}>
              <GhostMark size={12} color={Ghost.text.tertiary} />
              <GhostText type="footnote" style={styles.offlineText}>Offline</GhostText>
            </View>
          )}
          {config && (
            <TouchableOpacity
              style={styles.newButton}
              activeOpacity={0.7}
              onPress={handleNewConversation}
              accessibilityLabel="Start new conversation"
            >
              <GhostText type="subhead" style={styles.newButtonText}>New</GhostText>
            </TouchableOpacity>
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
  offlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm,
  },
  offlineText: {
    color: Ghost.text.tertiary,
  },
  newButton: {
    paddingVertical: Space.xs,
    paddingHorizontal: Space.md,
    borderRadius: Radius.full,
    backgroundColor: Ghost.accent.soft,
  },
  newButtonText: {
    fontWeight: "500",
    color: Ghost.accent.primary,
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
    letterSpacing: 0.3,
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
});
