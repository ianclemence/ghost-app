import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  FlatList,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Ghost, Space, Type } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { formatUptime } from "@/lib/format";
import { useGhostStore } from "@/lib/store";

interface HomeItem {
  id: string;
  title: string;
  preview: string;
  timestamp: number;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function groupByDay(items: HomeItem[]): { title: string; data: HomeItem[] }[] {
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString();

  const groups: Record<string, HomeItem[]> = {};
  for (const item of items) {
    const d = new Date(item.timestamp);
    const key = d.toDateString();
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }

  const result: { title: string; data: HomeItem[] }[] = [];
  if (groups[today]) result.push({ title: "TODAY", data: groups[today] });
  if (groups[yesterday]) result.push({ title: "YESTERDAY", data: groups[yesterday] });

  const sortedKeys = Object.keys(groups)
    .filter((k) => k !== today && k !== yesterday)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  for (const key of sortedKeys) {
    const d = new Date(key);
    const label = d.toLocaleDateString([], { weekday: "long" });
    result.push({ title: label.toUpperCase(), data: groups[key] });
  }

  return result;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { connectionState, inbox, ghostName, uptimeSeconds } = useGhostStore();
  const [greeting] = useState(getGreeting);

  const items: HomeItem[] = inbox.map((item) => ({
    id: item.id,
    title: "Ghost noticed",
    preview: item.content.slice(0, 120),
    timestamp: item.timestamp,
  }));

  const sections = groupByDay(items);

  const handleAskGhost = () => {
    router.push("/(tabs)/chats" as any);
  };

  const renderItem = useCallback(
    ({ item }: { item: HomeItem }) => (
      <View style={styles.row}>
        <View style={styles.rowTop}>
          <GhostText type="headline" style={styles.rowTitle} numberOfLines={1}>
            {item.title}
          </GhostText>
          <GhostText type="footnote" style={styles.rowTime}>
            {formatTime(item.timestamp)}
          </GhostText>
        </View>
        <GhostText type="callout" style={styles.rowPreview} numberOfLines={2}>
          {item.preview}
        </GhostText>
      </View>
    ),
    [],
  );

  const sectionsForList = sections.map((s) => ({
    ...s,
    data: s.data,
    key: s.title,
  }));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <GhostText type="display" style={styles.greeting}>
          {ghostName ? `${greeting}, ${ghostName}.` : `${greeting}.`}
        </GhostText>
        {connectionState === "online" ? (
          <GhostText type="body" style={styles.presenceLine}>
            Ghost is running{uptimeSeconds ? ` · Up ${formatUptime(uptimeSeconds)}` : ""}.
          </GhostText>
        ) : (
          <GhostText type="body" style={styles.statusLine}>
            {connectionState === "syncing"
              ? "Ghost is syncing..."
              : "Ghost is offline."}
          </GhostText>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <GhostText type="body" style={styles.emptyTitle}>
            Nothing new right now.
          </GhostText>
          <GhostText type="subhead" style={styles.emptySubtitle}>
            Ghost will let you know when something comes up.
          </GhostText>
        </View>
      ) : (
        <FlatList
          data={sectionsForList}
          keyExtractor={(item) => item.key}
          renderItem={({ item: section }) => (
            <View>
              <GhostText type="caption" style={styles.sectionTitle}>
                {section.title}
              </GhostText>
              {section.data.map((row) => (
                <View key={row.id}>{renderItem({ item: row })}</View>
              ))}
            </View>
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={[styles.inputContainer, { paddingBottom: insets.bottom + Space.lg }]}>
        <TouchableOpacity
          style={styles.inputBar}
          activeOpacity={0.8}
          onPress={handleAskGhost}
        >
          <GhostText type="body" style={styles.inputPlaceholder}>Ask Ghost</GhostText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Ghost.bg.base,
  },
  header: {
    paddingHorizontal: Space.xl,
    paddingTop: Space.lg,
    paddingBottom: Space.xxl,
    gap: Space.xs,
  },
  greeting: {
    color: Ghost.text.primary,
  },
  statusLine: {
    color: Ghost.text.secondary,
    marginTop: Space.xxs,
  },
  presenceLine: {
    color: Ghost.text.tertiary,
    marginTop: Space.xxs,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Space.huge,
    gap: Space.sm,
  },
  emptyTitle: {
    color: Ghost.text.tertiary,
    textAlign: "center",
  },
  emptySubtitle: {
    color: Ghost.text.tertiary,
    textAlign: "center",
  },
  listContent: {
    paddingHorizontal: Space.xl,
    paddingBottom: Space.huge,
  },
  sectionTitle: {
    color: Ghost.text.tertiary,
    letterSpacing: 0.3,
    marginTop: Space.xxl,
    marginBottom: Space.sm,
  },
  row: {
    paddingVertical: Space.md,
    gap: Space.xs,
  },
  rowTop: {
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
  rowPreview: {
    color: Ghost.text.secondary,
    lineHeight: 20,
  },
  inputContainer: {
    paddingHorizontal: Space.xl,
    paddingTop: Space.md,
  },
  inputBar: {
    alignItems: "center",
    paddingVertical: Space.md,
  },
  inputPlaceholder: {
    color: Ghost.text.secondary,
  },
});
