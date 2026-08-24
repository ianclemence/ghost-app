
import {
  Users,
  Folder,
  Heart,
  MapPin,
  Flag,
  Info,
  GitBranch,
  ChevronRight,
  Book,
  type LucideIcon,
} from "lucide-react-native";
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
import { useGhostStore } from "@/lib/store";

const ICON_MAP: Record<string, LucideIcon> = {
  people: Users,
  folder: Folder,
  heart: Heart,
  mapPin: MapPin,
  flag: Flag,
  info: Info,
  gitBranch: GitBranch,
  book: Book,
};

const FONT = Fonts.sans;

interface MemoryCategory {
  id: string;
  title: string;
  icon: string;
  count: number;
  description: string;
}

// Memory categories will be populated from backend personal context
// For now, we show the structure with counts from available data
const defaultCategories: MemoryCategory[] = [
  {
    id: "people",
    title: "People",
    icon: "people",
    count: 0,
    description: "People Ghost knows about",
  },
  {
    id: "projects",
    title: "Projects",
    icon: "folder",
    count: 0,
    description: "Things you are working on",
  },
  {
    id: "preferences",
    title: "Preferences",
    icon: "heart",
    count: 0,
    description: "How you like things",
  },
  {
    id: "places",
    title: "Places",
    icon: "location-outline",
    count: 0,
    description: "Locations that matter",
  },
  {
    id: "goals",
    title: "Goals",
    icon: "flag-outline",
    count: 0,
    description: "What you are working toward",
  },
  {
    id: "facts",
    title: "Facts",
    icon: "information-circle-outline",
    count: 0,
    description: "Important things to remember",
  },
  {
    id: "decisions",
    title: "Decisions",
    icon: "git-branch-outline",
    count: 0,
    description: "Choices you have made",
  },
];

export default function MemoryScreen() {
  const insets = useSafeAreaInsets();
  const { config, connectionState } = useGhostStore();
  const [categories, setCategories] = useState<MemoryCategory[]>(defaultCategories);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!config) return;

    // TODO: Fetch memory counts from GET /v1/memory/entries
    // For now, we show the category structure
    setLoading(false);
  }, [config]);

  const renderCategory = useCallback(
    ({ item }: { item: MemoryCategory }) => {
      const IconComponent = ICON_MAP[item.icon] || Info;
      return (
        <TouchableOpacity style={styles.categoryCard} activeOpacity={0.7}>
          <View style={styles.categoryIcon}>
            <IconComponent size={22} color={Ghost.accent.primary} />
          </View>
          <View style={styles.categoryContent}>
            <Text style={styles.categoryTitle}>{item.title}</Text>
            <Text style={styles.categoryDescription}>{item.description}</Text>
          </View>
          <View style={styles.categoryCount}>
            <Text style={styles.categoryCountText}>{item.count}</Text>
          </View>
          <ChevronRight size={16} color={Ghost.text.tertiary} />
        </TouchableOpacity>
      );
    },
    [],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Memory</Text>
        <ConnectionPill
          connected={connectionState === "online"}
          degraded={connectionState === "syncing"}
        />
      </View>

      {/* Subtitle */}
      <View style={styles.subtitleContainer}>
        <Text style={styles.subtitle}>What Ghost remembers about you</Text>
      </View>

      {/* Content */}
      {!config ? (
        <EmptyState
          icon={<Book size={40} color={Ghost.text.tertiary} />}
          title="Not connected"
          subtitle="Connect to your Ghost to see what it remembers."
        />
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Ghost.accent.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(item) => item.id}
          renderItem={renderCategory}
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
  subtitleContainer: {
    paddingHorizontal: Space.xl,
    paddingBottom: Space.xl,
  },
  subtitle: {
    ...Type.body,
    fontFamily: FONT,
    color: Ghost.text.secondary,
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
  categoryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    backgroundColor: Ghost.bg.raised,
    borderRadius: Radius.lg,
    padding: Space.lg,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Ghost.accent.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryContent: {
    flex: 1,
    gap: 2,
  },
  categoryTitle: {
    ...Type.headline,
    fontFamily: FONT,
    color: Ghost.text.primary,
  },
  categoryDescription: {
    ...Type.subhead,
    fontFamily: FONT,
    color: Ghost.text.secondary,
  },
  categoryCount: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Ghost.bg.sunken,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Space.sm,
  },
  categoryCountText: {
    ...Type.caption,
    fontFamily: FONT,
    color: Ghost.text.tertiary,
  },
});
