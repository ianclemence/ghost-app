
import { ArrowUp } from "lucide-react-native";
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

import { Colors, Fonts, Ghost, Radius, Space, Type } from "@/constants/theme";
import { ConnectionPill } from "@/components/ghost";
import { useGhostStore } from "@/lib/store";

const FONT = Fonts.sans;

interface HomeItem {
  id: string;
  kind: "briefing" | "reminder" | "noticed" | "activity";
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

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { config, connectionState, inbox } = useGhostStore();
  const [greeting] = useState(getGreeting);

  // Transform inbox items to home items
  const items: HomeItem[] = inbox.map((item) => ({
    id: item.id,
    kind: "activity" as const,
    title: "Ghost noticed",
    preview: item.content.slice(0, 120),
    timestamp: item.timestamp,
  }));

  const handleAskGhost = () => {
    router.push("/chat" as any);
  };

  const renderItem = useCallback(
    ({ item }: { item: HomeItem }) => (
      <TouchableOpacity style={styles.itemCard} activeOpacity={0.7}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemTime}>{formatTime(item.timestamp)}</Text>
          <Text style={styles.itemKind}>{item.kind}</Text>
        </View>
        <Text style={styles.itemTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.itemPreview} numberOfLines={2}>
          {item.preview}
        </Text>
      </TouchableOpacity>
    ),
    [],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>{greeting}, Ian</Text>
          <Text style={styles.statusLine}>
            {connectionState === "online"
              ? "Ghost is keeping an eye on things."
              : connectionState === "syncing"
                ? "Ghost is syncing..."
                : "Ghost is offline."}
          </Text>
        </View>
        <ConnectionPill
          connected={connectionState === "online"}
          degraded={connectionState === "syncing"}
        />
      </View>

      {/* Content */}
      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Ghost is quiet today.</Text>
          <Text style={styles.emptySubtitle}>
            Ask me anything, and I will start working for you.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Ask Ghost */}
      <View style={[styles.inputContainer, { paddingBottom: insets.bottom + Space.lg }]}>
        <TouchableOpacity
          style={styles.inputBar}
          activeOpacity={0.8}
          onPress={handleAskGhost}
        >
          <Text style={styles.inputPlaceholder}>What can I help with?</Text>
          <View style={styles.sendButton}>
            <ArrowUp size={18} color={Ghost.text.inverse} />
          </View>
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: Space.xl,
    paddingTop: Space.lg,
    paddingBottom: Space.xxl,
  },
  headerLeft: {
    flex: 1,
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
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Space.huge,
  },
  emptyTitle: {
    ...Type.headline,
    fontFamily: FONT,
    color: Ghost.text.primary,
    textAlign: "center",
  },
  emptySubtitle: {
    ...Type.body,
    fontFamily: FONT,
    color: Ghost.text.secondary,
    textAlign: "center",
    marginTop: Space.sm,
  },
  listContent: {
    paddingHorizontal: Space.xl,
    gap: Space.md,
  },
  itemCard: {
    backgroundColor: Ghost.bg.raised,
    borderRadius: Radius.lg,
    padding: Space.lg,
    gap: Space.sm,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemTime: {
    ...Type.footnote,
    fontFamily: FONT,
    color: Ghost.text.tertiary,
  },
  itemKind: {
    ...Type.caption,
    fontFamily: FONT,
    color: Ghost.accent.primary,
    textTransform: "lowercase",
  },
  itemTitle: {
    ...Type.headline,
    fontFamily: FONT,
    color: Ghost.text.primary,
  },
  itemPreview: {
    ...Type.callout,
    fontFamily: FONT,
    color: Ghost.text.secondary,
    lineHeight: 20,
  },
  inputContainer: {
    paddingHorizontal: Space.xl,
    paddingTop: Space.md,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Ghost.bg.raised,
    borderRadius: Radius.xl,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    borderWidth: 1,
    borderColor: Ghost.border.subtle,
  },
  inputPlaceholder: {
    ...Type.body,
    fontFamily: FONT,
    color: Ghost.text.tertiary,
    flex: 1,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Ghost.accent.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
