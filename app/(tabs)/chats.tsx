import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { MessageCirclePlus, MoreHorizontal, Search } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Ghost, Radius, Space, Type } from "@/constants/theme";
import { cleanTitleText } from "@/lib/format";
import { GhostText } from "@/components/themed-text";
import { EmptyState, GhostButton, GhostRow, GhostSheet, OfflineBadge } from "@/components/ghost";
import {
  deleteSession,
  fetchSessions,
  renameSession,
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
    const rawTs = s.last_activity ?? 0;
    const d = new Date(rawTs > 1e12 ? rawTs : rawTs * 1000);
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
  const [query, setQuery] = useState("");
  const [actionSheet, setActionSheet] = useState<{ visible: boolean; session: SessionSummary | null }>({
    visible: false,
    session: null,
  });
  const [renameSheet, setRenameSheet] = useState<{ visible: boolean; session: SessionSummary | null; name: string }>({
    visible: false,
    session: null,
    name: "",
  });
  const [deleteSheet, setDeleteSheet] = useState<{ visible: boolean; session: SessionSummary | null }>({
    visible: false,
    session: null,
  });
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

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

  const confirmDelete = async () => {
    const s = deleteSheet.session;
    if (!config || !s) return;
    setMutating(true);
    setMutationError(null);
    try {
      await deleteSession(config, s.id);
      setSessions((prev) => prev.filter((x) => x.id !== s.id));
      setDeleteSheet({ visible: false, session: null });
    } catch {
      setMutationError("Couldn't delete that conversation.");
    }
    setMutating(false);
  };

  const confirmRename = async () => {
    const s = renameSheet.session;
    const name = renameSheet.name.trim();
    if (!config || !s || !name) return;
    setMutating(true);
    setMutationError(null);
    try {
      await renameSession(config, s.id, name);
      setSessions((prev) =>
        prev.map((x) => (x.id === s.id ? { ...x, title: name } : x)),
      );
      setRenameSheet({ visible: false, session: null, name: "" });
    } catch {
      setMutationError("Couldn't rename that conversation.");
    }
    setMutating(false);
  };

  const filteredSessions = query.trim()
    ? sessions.filter((s) =>
        getSessionTitle(s).toLowerCase().includes(query.trim().toLowerCase()),
      )
    : sessions;

  const sections = groupSessions(filteredSessions);

  const renderItem = useCallback(
    ({ item }: { item: SessionSummary }) => (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.6}
        onPress={() => openConversation(item)}
      >
        <View style={styles.rowMain}>
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
        </View>
        <TouchableOpacity
          style={styles.rowAction}
          hitSlop={8}
          accessibilityLabel={`Options for ${getSessionTitle(item)}`}
          onPress={() => setActionSheet({ visible: true, session: item })}
        >
          <MoreHorizontal size={18} color={Ghost.text.tertiary} />
        </TouchableOpacity>
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

      {config && !loading && sessions.length > 0 ? (
        <View style={styles.searchRow}>
          <Search size={16} color={Ghost.text.tertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search chats"
            placeholderTextColor={Ghost.text.tertiary}
            style={styles.searchInput}
            returnKeyType="search"
            accessibilityLabel="Search chats"
          />
        </View>
      ) : null}

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
      ) : filteredSessions.length === 0 ? (
        <EmptyState
          title="No matches."
          subtitle={`Nothing titled like "${query.trim()}".`}
          action={
            <GhostButton
              title="Clear search"
              onPress={() => setQuery("")}
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
          onPress={() => {
            if (process.env.EXPO_OS === "ios") {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            }
            handleNewConversation();
          }}
          accessibilityLabel="Start a new chat"
        >
          <MessageCirclePlus size={24} color={Ghost.text.inverse} />
        </TouchableOpacity>
      ) : null}

      <GhostSheet
        visible={actionSheet.visible}
        onClose={() => setActionSheet({ visible: false, session: null })}
        title={actionSheet.session ? getSessionTitle(actionSheet.session) : undefined}
      >
        <GhostRow
          title="Rename"
          style={{ paddingHorizontal: 0 }}
          onPress={() => {
            const s = actionSheet.session;
            setActionSheet({ visible: false, session: null });
            if (s) setRenameSheet({ visible: true, session: s, name: getSessionTitle(s) });
          }}
        />
        <GhostRow
          title="Delete"
          style={{ paddingHorizontal: 0 }}
          onPress={() => {
            const s = actionSheet.session;
            setActionSheet({ visible: false, session: null });
            if (s) {
              setMutationError(null);
              setDeleteSheet({ visible: true, session: s });
            }
          }}
        />
      </GhostSheet>

      <GhostSheet
        visible={renameSheet.visible}
        onClose={() => {
          if (!mutating) setRenameSheet({ visible: false, session: null, name: "" });
        }}
        title="Rename conversation"
      >
        <TextInput
          value={renameSheet.name}
          onChangeText={(t) => {
            setRenameSheet((prev) => ({ ...prev, name: t }));
            if (mutationError) setMutationError(null);
          }}
          placeholder="Conversation name"
          placeholderTextColor={Ghost.text.tertiary}
          style={styles.renameInput}
          maxLength={80}
          returnKeyType="done"
          onSubmitEditing={confirmRename}
          autoFocus
        />
        {mutationError ? (
          <GhostText type="subhead" style={styles.sheetError}>{mutationError}</GhostText>
        ) : null}
        <GhostButton
          title={mutating ? "Renaming…" : "Save"}
          onPress={confirmRename}
          disabled={!renameSheet.name.trim() || mutating}
          fullWidth
        />
      </GhostSheet>

      <GhostSheet
        visible={deleteSheet.visible}
        onClose={() => {
          if (!mutating) {
            setDeleteSheet({ visible: false, session: null });
            setMutationError(null);
          }
        }}
        title="Delete this conversation?"
        message={
          mutationError ??
          (deleteSheet.session
            ? `"${getSessionTitle(deleteSheet.session)}" and its history will be gone for good.`
            : undefined)
        }
        confirmTitle={mutating ? "Deleting…" : "Delete"}
        variant="destructive"
        onConfirm={confirmDelete}
      />
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
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    paddingVertical: Space.md,
  },
  rowMain: {
    flex: 1,
    gap: Space.xxs,
  },
  rowAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
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
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    marginHorizontal: Space.xl,
    marginBottom: Space.sm,
    borderWidth: 1,
    borderColor: Ghost.border.default,
    borderRadius: Radius.lg,
    borderCurve: "continuous",
    paddingHorizontal: Space.md,
    backgroundColor: Ghost.bg.raised,
  },
  searchInput: {
    ...Type.body,
    flex: 1,
    color: Ghost.text.primary,
    paddingVertical: Space.sm,
    minHeight: 44,
  },
  renameInput: {
    ...Type.body,
    color: Ghost.text.primary,
    borderWidth: 1,
    borderColor: Ghost.border.default,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    minHeight: 48,
    backgroundColor: Ghost.bg.base,
  },
  sheetError: {
    ...Type.subhead,
    color: Ghost.status.error,
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
    boxShadow: "0 3px 6px rgba(0, 0, 0, 0.2)",
  },
});
