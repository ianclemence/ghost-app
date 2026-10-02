import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import * as Haptics from "expo-haptics";
import Animated, { FadeOut, LinearTransition } from "react-native-reanimated";
import { Ghost, Space } from "@/constants/theme";
import { GhostButton } from "@/components/ghost";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { fetchMemorySelf, forgetMemoryFact, forgetMemoryNote, type MemoryFact, type MemorySelf } from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";
import { whenAgo } from "@/lib/when";
import { EdgeScrollView } from "@/components/scroll-edge";

/**
 * What Ghost remembers, readable and deletable. It lives on the owner's
 * Pod; forgetting here removes it there. Nothing is hidden behind a
 * summary: every remembered thing is listed as stored.
 */
export default function MemoryScreen() {
  const config = useGhostStore((s) => s.config);
  const [mem, setMem] = useState<MemorySelf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!config) return;
    try {
      setMem(await fetchMemorySelf(config));
      setError(null);
    } catch {
      setError("Couldn't reach your Pod to read memory.");
    }
  }, [config]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    const by = new Map<string, MemoryFact[]>();
    for (const f of mem?.entries ?? []) {
      const k = f.domain_label || "Other";
      by.set(k, [...(by.get(k) ?? []), f]);
    }
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [mem]);

  const confirmForget = (label: string, run: () => Promise<void>, key: string) => {
    Alert.alert(`Forget “${label}”?`, "Ghost won't use this again. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Forget",
        style: "destructive",
        onPress: async () => {
          setBusy(key);
          try {
            await run();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            await load();
          } catch {
            setError("Couldn't forget that. Try again.");
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const total = (mem?.entries.length ?? 0) + (mem?.notes.length ?? 0) + (mem?.you.length ?? 0);

  return (
    <View style={styles.container}>
      <ScreenBackground variant="calm" />
      <ScreenHeader
        title="Memory"
        subtitle={mem ? (total === 0 ? "Nothing yet" : `${total} ${total === 1 ? "thing" : "things"}, kept on your Pod`) : undefined}
      />
      {!config ? (
        <Text style={styles.empty}>Memory lives on your Ghost Pod. Connect one to see and manage it.</Text>
      ) : !mem && !error ? (
        <ActivityIndicator style={{ marginTop: Space.xxxl }} color={Ghost.text.tertiary} />
      ) : (
        <EdgeScrollView contentContainerStyle={styles.content}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {total === 0 && mem ? (
            <Text style={styles.empty}>
              Ghost hasn&apos;t kept anything yet. Tell it something worth remembering (“I&apos;m vegetarian”, “Sam is my sister”) and it appears here.
            </Text>
          ) : null}
          {(mem?.you.length ?? 0) > 0 ? (
            <Group title="About you">
              {mem!.you.map((y) => (
                <Item key={`you-${y}`} title={y} busy={busy === `you-${y}`} onForget={() => confirmForget(y, () => forgetMemoryNote(config!, "user", y), `you-${y}`)} />
              ))}
            </Group>
          ) : null}
          {groups.map(([label, facts]) => (
            <Group key={label} title={label}>
              {facts.map((f) => (
                <Item
                  key={f.id}
                  title={f.title || f.label}
                  value={f.value && f.value !== f.title ? f.value : f.summary}
                  meta={memoryMeta(f)}
                  busy={busy === f.id}
                  onForget={() => confirmForget(f.title || f.label, () => forgetMemoryFact(config!, f.id), f.id)}
                />
              ))}
            </Group>
          ))}
          {(mem?.notes.length ?? 0) > 0 ? (
            <Group title="Notes">
              {mem!.notes.map((n) => (
                <Item key={`note-${n}`} title={n} busy={busy === `note-${n}`} onForget={() => confirmForget(n.slice(0, 40), () => forgetMemoryNote(config!, "memory", n), `note-${n}`)} />
              ))}
            </Group>
          ) : null}
        </EdgeScrollView>
      )}
    </View>
  );
}

// When and how firmly Ghost knows this: "Learned Sep 9", or
// "Confirmed 4 times · last Jul 31" once the owner has repeated it.
function memoryMeta(f: MemoryFact): string | undefined {
  const parts: string[] = [];
  if (f.about) parts.push(`About ${f.about}`);
  const n = f.reinforce_count ?? 0;
  if (n > 1) {
    const last = whenAgo(f.reinforced_at ?? f.created_at ?? null);
    parts.push(last ? `Confirmed ${n} times · last ${last}` : `Confirmed ${n} times`);
  } else {
    const learned = whenAgo(f.created_at ?? null);
    if (learned) parts.push(`Learned ${learned}`);
  }
  if (f.valid_until) {
    const t = Date.parse(f.valid_until);
    if (Number.isFinite(t)) parts.push(`until ${new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`);
  }
  if (f.sensitive) parts.push("Private");
  return parts.length ? parts.join(" · ") : undefined;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle} accessibilityRole="header">{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Item({
  title,
  value,
  meta,
  busy,
  onForget,
}: {
  title: string;
  value?: string;
  meta?: string;
  busy: boolean;
  onForget: () => void;
}) {
  return (
    <Animated.View exiting={FadeOut.duration(180)} layout={LinearTransition.duration(200)} style={styles.item}>
      <View style={styles.itemText}>
        <Text style={styles.itemTitle}>{title}</Text>
        {value ? <Text style={styles.itemValue}>{value}</Text> : null}
        {meta ? <Text style={styles.itemMeta}>{meta}</Text> : null}
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={Ghost.text.tertiary} />
      ) : (
        <GhostButton title="Forget" variant="ghost" size="sm" onPress={onForget} />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  content: { paddingBottom: 96 },
  group: { marginTop: Space.xl },
  groupTitle: {
    fontSize: 11.5,
    fontWeight: "500",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: Ghost.text.tertiary,
    paddingHorizontal: Space.xl + 6,
    marginBottom: Space.sm,
  },
  card: {
    marginHorizontal: Space.lg,
    borderRadius: 26,
    borderCurve: "continuous",
    backgroundColor: "rgba(0,0,0,0.42)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
    overflow: "hidden",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Ghost.border.subtle,
  },
  itemText: { flex: 1, gap: 2 },
  itemTitle: { fontSize: 16, lineHeight: 21, fontWeight: "500", letterSpacing: -0.15, color: Ghost.text.primary },
  itemValue: { fontSize: 14.5, lineHeight: 20, fontWeight: "300", color: Ghost.text.secondary },
  itemMeta: { fontSize: 12.5, lineHeight: 17, color: Ghost.text.tertiary },
  empty: {
    fontSize: 15.5,
    lineHeight: 23,
    fontWeight: "300",
    color: Ghost.text.secondary,
    textAlign: "center",
    paddingHorizontal: Space.xl,
    marginTop: Space.lg,
  },
  error: {
    fontSize: 14,
    color: Ghost.status.error,
    textAlign: "center",
    paddingHorizontal: Space.xl,
    marginTop: Space.md,
  },
});
