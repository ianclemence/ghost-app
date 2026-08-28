import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Fonts, Ghost, Space, Type } from "@/constants/theme";
import { formatUptime } from "@/lib/format";
import { useGhostStore } from "@/lib/store";

const FONT = Fonts.sans;

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
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.rowTime}>{formatTime(item.timestamp)}</Text>
        </View>
        <Text style={styles.rowPreview} numberOfLines={2}>
          {item.preview}
        </Text>
      </View>
    ),
    [],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string; data: HomeItem[] } }) => (
      <Text style={styles.sectionTitle}>{section.title}</Text>
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
        <Text style={styles.greeting}>
          {ghostName ? `${greeting}, ${ghostName}.` : `${greeting}.`}
        </Text>
        {connectionState === "online" ? (
          <Text style={styles.presenceLine}>
            Ghost is running{uptimeSeconds ? ` · Up ${formatUptime(uptimeSeconds)}` : ""}.
          </Text>
        ) : (
          <Text style={styles.statusLine}>
            {connectionState === "syncing"
              ? "Ghost is syncing..."
              : "Ghost is offline."}
          </Text>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>It&apos;s quiet today.</Text>
        </View>
      ) : (
        <FlatList
          data={sectionsForList}
          keyExtractor={(item) => item.key}
          renderItem={({ item: section }) => (
            <View>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.data.map((row) => (
                <View key={row.id}>
                  {renderItem({ item: row })}
                  <View style={styles.divider} />
                </View>
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
          <Text style={styles.inputPlaceholder}>Ask Ghost</Text>
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
    ...Type.display,
    fontFamily: FONT,
    color: Ghost.text.primary,
  },
  statusLine: {
    ...Type.body,
    fontFamily: FONT,
    color: Ghost.text.secondary,
    marginTop: Space.xxs,
  },
  presenceLine: {
    ...Type.body,
    fontFamily: FONT,
    color: Ghost.text.tertiary,
    marginTop: Space.xxs,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Space.huge,
  },
  emptyTitle: {
    ...Type.body,
    fontFamily: FONT,
    color: Ghost.text.tertiary,
    textAlign: "center",
  },
  listContent: {
    paddingHorizontal: Space.xl,
    paddingBottom: Space.huge,
  },
  sectionTitle: {
    ...Type.caption,
    fontFamily: FONT,
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
    ...Type.headline,
    fontFamily: FONT,
    color: Ghost.text.primary,
    flex: 1,
  },
  rowTime: {
    ...Type.footnote,
    fontFamily: FONT,
    color: Ghost.text.tertiary,
    marginLeft: Space.sm,
  },
  rowPreview: {
    ...Type.callout,
    fontFamily: FONT,
    color: Ghost.text.secondary,
    lineHeight: 20,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Ghost.border.subtle,
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
    ...Type.body,
    fontFamily: FONT,
    color: Ghost.text.tertiary,
  },
});
