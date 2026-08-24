
import {
  MessageCircle,
  Plus,
  ChevronRight,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors, Fonts, Ghost, Radius, Space, Type } from "@/constants/theme";
import { ConnectionPill, EmptyState } from "@/components/ghost";
import {
  fetchSessions,
  deleteSession,
  SessionSummary,
} from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";

const FONT = Fonts.sans;

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(timestamp).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function getSessionTitle(session: SessionSummary): string {
  if (session.title && session.title !== session.id) {
    return session.title;
  }
  const id = session.id;
  if (id.includes(":")) {
    return id.split(":").pop() || id;
  }
  return id;
}

export default function ConversationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { config, connectionState, setCurrentSession } = useGhostStore();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    if (!config) return;
    setLoading(true);
    try {
      const list = await fetchSessions(config);
      setSessions(list);
    } catch {
      // Empty state is fine
    }
    setLoading(false);
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

  const renderItem = useCallback(
    ({ item }: { item: SessionSummary }) => (
      <TouchableOpacity
        style={styles.sessionRow}
        activeOpacity={0.6}
        onPress={() => openConversation(item)}
      >
        <View style={styles.sessionIcon}>
          <MessageCircle size={18} color={Ghost.text.tertiary} />
        </View>
        <View style={styles.sessionContent}>
          <View style={styles.sessionHeader}>
            <Text style={styles.sessionTitle} numberOfLines={1}>
              {getSessionTitle(item)}
            </Text>
            <Text style={styles.sessionTime}>
              {formatRelativeTime(item.last_activity ?? Date.now())}
            </Text>
          </View>
          <Text style={styles.sessionPreview} numberOfLines={1}>
            {item.message_count} message{item.message_count !== 1 ? "s" : ""}
          </Text>
        </View>
      </TouchableOpacity>
    ),
    [],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Conversations</Text>
        <View style={styles.headerActions}>
          <ConnectionPill
            connected={connectionState === "online"}
            degraded={connectionState === "syncing"}
          />
          <TouchableOpacity
            style={styles.newButton}
            onPress={handleNewConversation}
            activeOpacity={0.7}
          >
            <Plus size={20} color={Ghost.text.inverse} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Sessions List */}
      {!config ? (
        <EmptyState
          icon={<MessageCircle size={40} color={Ghost.text.tertiary} />}
          title="Not connected"
          subtitle="Connect to your Ghost to start conversations."
        />
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Ghost.accent.primary} size="large" />
        </View>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<MessageCircle size={40} color={Ghost.text.tertiary} />}
          title="No conversations yet"
          subtitle="Start a conversation with Ghost."
          action={
            <TouchableOpacity
              style={styles.startButton}
              onPress={handleNewConversation}
            >
              <Text style={styles.startButtonText}>New Conversation</Text>
            </TouchableOpacity>
          }
        />
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
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
  headerTitle: {
    ...Type.largeTitle,
    fontFamily: FONT,
    color: Ghost.text.primary,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
  },
  newButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Ghost.accent.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: Space.xl,
    gap: Space.sm,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingVertical: Space.md,
    paddingHorizontal: Space.lg,
    backgroundColor: Ghost.bg.raised,
    borderRadius: Radius.lg,
  },
  sessionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Ghost.bg.sunken,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionContent: {
    flex: 1,
    gap: 2,
  },
  sessionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sessionTitle: {
    ...Type.headline,
    fontFamily: FONT,
    color: Ghost.text.primary,
    flex: 1,
  },
  sessionTime: {
    ...Type.caption,
    fontFamily: FONT,
    color: Ghost.text.tertiary,
    marginLeft: Space.sm,
  },
  sessionPreview: {
    ...Type.callout,
    fontFamily: FONT,
    color: Ghost.text.secondary,
  },
  startButton: {
    marginTop: Space.lg,
    paddingVertical: Space.md,
    paddingHorizontal: Space.xl,
    backgroundColor: Ghost.accent.primary,
    borderRadius: Radius.full,
  },
  startButtonText: {
    ...Type.headline,
    fontFamily: FONT,
    color: Ghost.text.inverse,
    fontSize: 15,
  },
});
