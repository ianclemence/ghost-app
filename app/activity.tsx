import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, SectionList, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { Ghost, Space } from "@/constants/theme";
import { ScreenHeader } from "@/components/screen-header";
import { fetchActivity, type ActivityChip } from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";
import { clockTime, dayLabel } from "@/lib/thread";

// Outcome words from the runtime's own state, not the model's account.
const STATE_WORD: Record<string, string> = {
  done: "Done",
  completed: "Done",
  succeeded: "Done",
  verified: "Verified",
  changed: "Changed",
  unchanged: "No change",
  waiting: "Waiting on you",
  pending: "Waiting on you",
  denied: "You said no",
  failed: "Didn't work",
  error: "Didn't work",
  cancelled: "Stopped",
};

function stateTone(state: string): string {
  const s = state.toLowerCase();
  if (s === "failed" || s === "error") return Ghost.status.error;
  if (s === "waiting" || s === "pending" || s === "changed") return Ghost.emberDeep;
  return Ghost.text.tertiary;
}

/**
 * Everything Ghost did, newest first: what, the outcome the runtime
 * recorded, and why Ghost acted. The owner's audit trail.
 */
export default function ActivityScreen() {
  const config = useGhostStore((s) => s.config);
  const [items, setItems] = useState<ActivityChip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!config) return;
    try {
      setItems(await fetchActivity(config, { limit: 100 }));
      setError(null);
    } catch {
      setError("Couldn't reach your Pod to read activity.");
    }
  }, [config]);

  useEffect(() => {
    void load();
  }, [load]);

  const sections = useMemo(() => {
    const by = new Map<string, ActivityChip[]>();
    const sorted = [...(items ?? [])].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    for (const a of sorted) {
      const t = Date.parse(a.timestamp);
      const k = Number.isFinite(t) ? dayLabel(t) : "Earlier";
      by.set(k, [...(by.get(k) ?? []), a]);
    }
    return [...by.entries()].map(([title, data]) => ({ title, data }));
  }, [items]);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Activity" subtitle="Everything Ghost did, and why" />
      {!config ? (
        <Text style={styles.empty}>Activity is recorded on your Ghost Pod. Connect one to see it.</Text>
      ) : items === null && !error ? (
        <ActivityIndicator style={{ marginTop: Space.xxxl }} color={Ghost.text.tertiary} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.content}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              tintColor={Ghost.text.tertiary}
            />
          }
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={
            !error ? <Text style={styles.empty}>Nothing yet. Every action Ghost takes for you is recorded here.</Text> : null
          }
          renderSectionHeader={({ section }) => <Text style={styles.day}>{section.title}</Text>}
          renderItem={({ item }) => {
            const t = Date.parse(item.timestamp);
            const mapped = STATE_WORD[item.state?.toLowerCase()] ?? null;
            // Don't say the same thing twice ("No change" / "No change").
            const word = mapped && mapped.toLowerCase() !== (item.summary ?? "").trim().toLowerCase() ? mapped : null;
            return (
              <View style={styles.item} accessible accessibilityLabel={[item.title, word, item.summary, item.why].filter(Boolean).join(". ")}>
                <Text style={styles.time}>{Number.isFinite(t) ? clockTime(t) : ""}</Text>
                <View style={styles.body}>
                  <Text style={styles.title}>{item.title}</Text>
                  {item.summary ? <Text style={styles.summary}>{item.summary}</Text> : null}
                  {word ? <Text style={[styles.state, { color: stateTone(item.state) }]}>{word}</Text> : null}
                  {item.why ? <Text style={styles.why}>{item.why}</Text> : null}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  content: { paddingBottom: Space.huge, paddingHorizontal: Space.xl },
  day: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
    color: Ghost.text.tertiary,
    marginTop: Space.xl,
    marginBottom: Space.xs,
  },
  item: {
    flexDirection: "row",
    gap: Space.md,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Ghost.border.subtle,
  },
  time: {
    width: 64,
    fontSize: 13,
    lineHeight: 21,
    color: Ghost.text.tertiary,
    fontVariant: ["tabular-nums"],
  },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 16, lineHeight: 21, color: Ghost.text.primary },
  summary: { fontSize: 14, lineHeight: 19, color: Ghost.text.secondary },
  state: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  why: { fontSize: 13, lineHeight: 18, color: Ghost.text.tertiary },
  empty: {
    fontSize: 15,
    lineHeight: 22,
    color: Ghost.text.secondary,
    marginTop: Space.lg,
    paddingHorizontal: Space.xl,
  },
  error: { fontSize: 14, color: Ghost.status.error, marginTop: Space.md },
});
