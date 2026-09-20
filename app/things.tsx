import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Space, Type } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { PlusMenu } from "@/components/plus-menu";
import { ScreenBackground } from "@/components/screen-glow";
import { GhostButton, EmptyState } from "@/components/ghost";
import {
  controlRoutineItem,
  fetchRoutines,
  kindLabel,
  stateLabel,
  type RoutineItem,
} from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";

// Things — the one place that answers "what does Ghost do for me?".
//
// The owner never files their intent as a "routine" or an "automation".
// They say what they want in conversation; Ghost infers the shape. This
// screen shows what is running, what is waiting, and what is done — one
// list, one vocabulary, no internal taxonomy to learn.
//
// Creation happens in conversation ("every Monday at 9…"). This surface is
// for reviewing and steering, not for filling forms — matching the design
// principle that talk is the primary verb, not configuration.

function badgeFor(t: RoutineItem): { label: string; color: string } {
  switch (t.state) {
    case "waiting":
      return { label: stateLabel(t.state), color: Ghost.status.warning };
    case "failed":
      return { label: stateLabel(t.state), color: Ghost.status.error };
    case "paused":
      return { label: stateLabel(t.state), color: Ghost.text.tertiary };
    case "done":
      return { label: stateLabel(t.state), color: Ghost.status.success };
    case "cancelled":
      return { label: stateLabel(t.state), color: Ghost.text.tertiary };
    default:
      return { label: stateLabel(t.state), color: Ghost.status.success };
  }
}

export default function ThingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { config } = useGhostStore();
  const [items, setItems] = useState<RoutineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!config) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      setItems(await fetchRoutines(config));
    } catch {
      setError("Couldn't load what Ghost is doing.");
    }
    setLoading(false);
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  const handleOp = useCallback(
    async (t: RoutineItem, op: "pause" | "resume" | "cancel") => {
      if (!config || busyId) return;
      const run = async () => {
        setBusyId(t.id);
        try {
          await controlRoutineItem(config, t, op);
          await load(true);
        } catch (e) {
          Alert.alert("Couldn't do that", e instanceof Error ? e.message : "Unknown error");
        }
        setBusyId(null);
      };
      if (op === "cancel") {
        Alert.alert("Stop this?", `Ghost will stop "${t.title}".`, [
          { text: "Keep it", style: "cancel" },
          { text: "Stop", style: "destructive", onPress: run },
        ]);
        return;
      }
      await run();
    },
    [config, busyId, load],
  );

  const active = items.filter((t) => t.state === "active" || t.state === "waiting").length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenBackground />
      <View style={styles.header}>
        <GhostText type="largeTitle" style={styles.title} accessibilityRole="header">
          Routines
        </GhostText>
        <GhostText type="subhead" style={styles.sub}>
          {active > 0
            ? `${active} ${active === 1 ? "routine" : "routines"} running for you.`
            : "Tell Ghost in a chat — \u201cevery Monday at 9, prepare my brief\u201d."}
        </GhostText>
      </View>

      {!config ? (
        <EmptyState
          title="Not connected"
          subtitle="This lives on a Ghost Pod. Connect one to see what Ghost is doing."
          action={<GhostButton title="Connect a Ghost Pod" onPress={() => router.push("/connect")} />}
        />
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Ghost.text.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load(true);
                setRefreshing(false);
              }}
              tintColor={Ghost.text.primary}
            />
          }
        >
          {error && items.length === 0 ? (
            <EmptyState
              title="Couldn't load"
              subtitle={error}
              action={<GhostButton title="Try again" onPress={() => load()} />}
            />
          ) : null}

          {!error && items.length === 0 ? (
            <EmptyState
              title="Nothing yet"
              subtitle="Say \u201cevery Monday at 9, prepare my weekly brief\u201d in a chat and it appears here."
              action={<GhostButton title="Start a chat" onPress={() => router.push("/conversation")} />}
            />
          ) : (
            items.map((t) => {
              const busy = busyId === t.id;
              const badge = badgeFor(t);
              const canPause = t.state === "active";
              const canResume = t.state === "paused" || t.state === "failed";
              const canStop =
                t.state === "active" || t.state === "paused" || t.state === "waiting";
              return (
                <View key={t.id} style={styles.row}>
                  <View style={styles.rowHead}>
                    <GhostText type="headline" style={styles.rowTitle}>
                      {t.title}
                    </GhostText>
                    <View style={[styles.badge, { borderColor: badge.color }]}>
                      <GhostText type="footnote" style={{ color: badge.color }}>
                        {badge.label}
                      </GhostText>
                    </View>
                  </View>
                  <GhostText type="footnote" style={styles.rowMeta}>
                    {kindLabel(t.kind)} · {t.schedule}
                    {t.run_count > 0 ? ` · ran ${t.run_count}\u00d7` : ""}
                  </GhostText>
                  {t.what ? (
                    <GhostText type="footnote" style={styles.rowWhat} numberOfLines={2}>
                      {t.what}
                    </GhostText>
                  ) : null}
                  {t.last_error ? (
                    <GhostText type="footnote" style={styles.rowError} numberOfLines={2}>
                      {t.last_error}
                    </GhostText>
                  ) : null}
                  <View style={styles.actions}>
                    {canPause ? (
                      <GhostButton
                        title={busy ? "\u2026" : "Pause"}
                        variant="secondary"
                        onPress={() => handleOp(t, "pause")}
                      />
                    ) : null}
                    {canResume ? (
                      <GhostButton
                        title={busy ? "\u2026" : "Resume"}
                        variant="secondary"
                        onPress={() => handleOp(t, "resume")}
                      />
                    ) : null}
                    {canStop ? (
                      <GhostButton
                        title={busy ? "\u2026" : "Stop"}
                        variant="ghost"
                        onPress={() => handleOp(t, "cancel")}
                      />
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
      <PlusMenu />
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
  title: {
    ...Type.largeTitle,
    color: Ghost.text.primary,
  },
  sub: {
    ...Type.subhead,
    color: Ghost.text.secondary,
    marginTop: 2,
  },
  center: {
    flex: 1,
    justifyContent: "center",
  },
  list: {
    paddingHorizontal: Space.xl,
    paddingBottom: Space.huge,
  },
  row: {
    paddingVertical: Space.lg,
    borderBottomWidth: 1,
    borderBottomColor: Ghost.border.subtle,
    gap: 4,
  },
  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Space.sm,
  },
  rowTitle: {
    color: Ghost.text.primary,
    flexShrink: 1,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Space.sm,
    paddingVertical: 2,
  },
  rowMeta: {
    color: Ghost.text.secondary,
  },
  rowWhat: {
    color: Ghost.text.tertiary,
    marginTop: 2,
  },
  rowError: {
    color: Ghost.status.error,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    gap: Space.sm,
    marginTop: Space.sm,
  },
});
