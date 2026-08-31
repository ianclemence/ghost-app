import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Ghost, Space } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { EmptyState } from "@/components/ghost";
import { useGhostStore } from "@/lib/store";
import { fetchMemoryFile } from "@/lib/ghostApi";

interface MemorySection {
  id: string;
  title: string;
  preview: string;
}

function parseProfileSections(content: string): MemorySection[] {
  if (!content || !content.trim()) return [];

  const lines = content.split("\n");
  const sections: MemorySection[] = [];
  let current: MemorySection | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      if (current) sections.push(current);
      current = {
        id: headingMatch[1].toLowerCase().replace(/\s+/g, "-"),
        title: headingMatch[1],
        preview: "",
      };
    } else if (current && line.trim()) {
      current.preview = current.preview
        ? current.preview + " " + line.trim()
        : line.trim();
    }
  }
  if (current) sections.push(current);

  return sections.map((s) => ({
    ...s,
    preview: s.preview.slice(0, 160),
  }));
}

export default function MemoryScreen() {
  const insets = useSafeAreaInsets();
  const { config } = useGhostStore();
  const [sections, setSections] = useState<MemorySection[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadMemory = useCallback(async () => {
    if (!config) return;
    setLoading(true);
    try {
      const [profile, curated] = await Promise.allSettled([
        fetchMemoryFile(config, "user-profile.md"),
        fetchMemoryFile(config, "curated-memory.md"),
      ]);

      const all: MemorySection[] = [];
      if (profile.status === "fulfilled") {
        all.push(...parseProfileSections(profile.value));
      }
      if (curated.status === "fulfilled") {
        all.push(...parseProfileSections(curated.value));
      }
      setSections(all);
    } catch {
      // Fine
    }
    setLoading(false);
  }, [config]);

  const onRefresh = useCallback(async () => {
    if (!config) return;
    setRefreshing(true);
    try {
      const [profile, curated] = await Promise.allSettled([
        fetchMemoryFile(config, "user-profile.md"),
        fetchMemoryFile(config, "curated-memory.md"),
      ]);

      const all: MemorySection[] = [];
      if (profile.status === "fulfilled") {
        all.push(...parseProfileSections(profile.value));
      }
      if (curated.status === "fulfilled") {
        all.push(...parseProfileSections(curated.value));
      }
      setSections(all);
    } catch {
      // Fine
    }
    setRefreshing(false);
  }, [config]);

  useEffect(() => {
    loadMemory();
  }, [loadMemory]);

  const renderSection = useCallback(
    ({ item }: { item: MemorySection }) => (
      <View style={styles.row}>
        <GhostText type="headline" style={styles.rowTitle}>{item.title}</GhostText>
        <GhostText type="callout" style={styles.rowPreview} numberOfLines={2}>
          {item.preview}
        </GhostText>
      </View>
    ),
    [],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <GhostText type="largeTitle" style={styles.headerTitle}>Memory</GhostText>
        <GhostText type="subhead" style={styles.headerSubtitle}>
          What Ghost remembers about you.
        </GhostText>
      </View>

      {!config ? (
        <EmptyState
          title="Not connected"
          subtitle="Connect to your Ghost Pod to see what it remembers."
        />
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Ghost.accent.primary} size="large" />
        </View>
      ) : sections.length === 0 ? (
        <EmptyState
          title="Nothing remembered yet."
          subtitle="Talk to Ghost and it will remember what matters."
        />
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderSection}
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
    paddingHorizontal: Space.xl,
    paddingVertical: Space.lg,
  },
  headerTitle: {
    color: Ghost.text.primary,
  },
  headerSubtitle: {
    color: Ghost.text.secondary,
    marginTop: 2,
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
  row: {
    paddingVertical: Space.md,
  },
  rowTitle: {
    color: Ghost.text.primary,
    marginBottom: Space.xxs,
  },
  rowPreview: {
    color: Ghost.text.secondary,
    lineHeight: 20,
  },
});
