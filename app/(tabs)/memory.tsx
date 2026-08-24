import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Fonts, Ghost, Space, Type } from "@/constants/theme";
import { EmptyState, Divider } from "@/components/ghost";
import { useGhostStore } from "@/lib/store";
import { fetchMemoryFile } from "@/lib/ghostApi";

const FONT = Fonts.sans;

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

  useEffect(() => {
    if (!config) return;
    setLoading(true);

    const load = async () => {
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
    };

    load();
  }, [config]);

  const renderSection = useCallback(
    ({ item }: { item: MemorySection }) => (
      <View style={styles.row}>
        <Text style={styles.rowTitle}>{item.title}</Text>
        <Text style={styles.rowPreview} numberOfLines={2}>
          {item.preview}
        </Text>
      </View>
    ),
    [],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Memory</Text>
      </View>

      <Text style={styles.subtitle}>What Ghost remembers about you.</Text>

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
          title="Ghost is still getting to know you."
          subtitle="Talk to Ghost, and it will remember."
        />
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderSection}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <Divider />}
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
    ...Type.largeTitle,
    fontFamily: FONT,
    color: Ghost.text.primary,
  },
  subtitle: {
    ...Type.body,
    fontFamily: FONT,
    color: Ghost.text.secondary,
    paddingHorizontal: Space.xl,
    paddingBottom: Space.xl,
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
    ...Type.headline,
    fontFamily: FONT,
    color: Ghost.text.primary,
    marginBottom: Space.xxs,
  },
  rowPreview: {
    ...Type.callout,
    fontFamily: FONT,
    color: Ghost.text.secondary,
    lineHeight: 20,
  },
});
