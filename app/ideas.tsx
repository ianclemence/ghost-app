import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Space, Type } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { ScreenBackground } from "@/components/screen-glow";
import { GhostButton, EmptyState, OfflineBadge } from "@/components/ghost";
import { decideIdea, fetchIdeas, type IdeaItem } from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";

// Ideas — suggestions with evidence. Every idea cites the rows behind it,
// so the owner judges the source, not the prose. Accept and dismiss write
// receipts; unverified drafts say so on the card.
export default function IdeasScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { config } = useGhostStore();
  const connectionState = useGhostStore((s) => s.connectionState);
  const [items, setItems] = useState<IdeaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!config) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        setItems(await fetchIdeas(config));
      } catch {
        setError("Couldn't load ideas.");
      }
      setLoading(false);
    },
    [config],
  );

  useEffect(() => {
    load();
  }, [load]);

  const handleDecision = useCallback(
    async (idea: IdeaItem, decision: "accept" | "dismiss") => {
      if (!config || busyId) return;
      const run = async () => {
        setBusyId(idea.id);
        try {
          await decideIdea(config, idea.id, decision);
          await load(true);
        } catch (e) {
          Alert.alert("Couldn't do that", e instanceof Error ? e.message : "Unknown error");
        }
        setBusyId(null);
      };
      if (decision === "dismiss") {
        await run();
        return;
      }
      Alert.alert("Accept this idea?", `"${idea.title}"`, [
        { text: "Not yet", style: "cancel" },
        { text: "Accept", onPress: run },
      ]);
    },
    [config, busyId, load],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenBackground />
      <View style={styles.header}>
        <GhostText type="largeTitle" style={styles.title} accessibilityRole="header">
          Ideas
        </GhostText>
        <GhostText type="subhead" style={styles.sub}>
          Suggestions with evidence. Nothing here acts without you.
        </GhostText>
      </View>

      {config && connectionState !== "online" ? (
        <View style={styles.offlineWrap}>
          <OfflineBadge state={connectionState === "syncing" ? "syncing" : "offline"} />
        </View>
      ) : null}

      {!config ? (
        <EmptyState
          title="Not connected"
          subtitle="This lives on a Ghost Pod. Connect one to see ideas."
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
              title="No ideas right now"
              subtitle="Ghost suggests things when it notices something — each one says why."
              action={<GhostButton title="Start a chat" onPress={() => router.push("/conversation")} />}
            />
          ) : (
            items.map((idea) => {
              const busy = busyId === idea.id;
              return (
                <View key={idea.id} style={styles.row}>
                  <View style={styles.rowHead}>
                    <GhostText type="headline" style={styles.rowTitle}>
                      {idea.title}
                    </GhostText>
                    {idea.unverified ? (
                      <View style={[styles.badge, { borderColor: Ghost.status.warning }]}>
                        <GhostText type="footnote" style={{ color: Ghost.status.warning }}>
                          Needs checking
                        </GhostText>
                      </View>
                    ) : null}
                  </View>
                  <GhostText type="body" style={styles.body}>
                    {idea.body}
                  </GhostText>
                  {idea.sources.map((s, i) => (
                    <GhostText key={i} type="footnote" style={styles.why}>
                      Why: {s.excerpt || `${s.kind}:${s.ref}`}
                    </GhostText>
                  ))}
                  <View style={styles.actions}>
                    <GhostButton
                      title={busy ? "Working…" : "Accept"}
                      onPress={() => handleDecision(idea, "accept")}
                    />
                    <GhostButton title="Dismiss" onPress={() => handleDecision(idea, "dismiss")} />
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
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
  title: {
    ...Type.largeTitle,
    color: Ghost.text.primary,
  },
  sub: {
    ...Type.subhead,
    color: Ghost.text.secondary,
    marginTop: 2,
  },
  offlineWrap: {
    alignItems: "center",
  },
  center: {
    flex: 1,
    justifyContent: "center",
  },
  list: {
    paddingHorizontal: Space.xl,
    paddingBottom: Space.huge + Space.edge,
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
  },
  rowTitle: {
    flex: 1,
    color: Ghost.text.primary,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  body: {
    color: Ghost.text.secondary,
  },
  why: {
    color: Ghost.text.tertiary,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
});
