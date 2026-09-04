import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Ghost, Radius, Space, Type } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { EmptyState, GhostButton, GhostSheet } from "@/components/ghost";
import { useGhostStore } from "@/lib/store";
import {
  fetchMemorySelf,
  forgetMemoryFact,
  forgetMemoryNote,
  recallConversations,
  MemoryFact,
} from "@/lib/ghostApi";

const KIND_ORDER = ["identity", "preference", "fact", "goal", "relationship", "routine"];
const KIND_LABEL: Record<string, string> = {
  identity: "Identity",
  preference: "Preferences",
  fact: "About you",
  goal: "Goals",
  relationship: "People",
  routine: "Routines",
};

function kindOf(kind: string): string {
  return KIND_LABEL[kind] ? kind : "fact";
}

function factMeta(f: MemoryFact): string {
  const parts: string[] = [];
  if (f.created_at) {
    const ts = Math.floor(new Date(f.created_at).getTime() / 1000);
    if (Number.isFinite(ts) && ts > 0) {
      const d = new Date(ts * 1000);
      parts.push(
        "Learned " +
          d.toLocaleDateString([], { month: "short", day: "numeric" }),
      );
    }
  }
  if ((f.reinforce_count ?? 0) > 1) parts.push(`confirmed ${f.reinforce_count}×`);
  if (f.domain_label) parts.push(f.domain_label);
  return parts.join("  ·  ");
}

type Row =
  | { type: "group"; key: string; label: string }
  | { type: "fact"; key: string; fact: MemoryFact }
  | { type: "note"; key: string; note: string };

export default function MemoryScreen() {
  const insets = useSafeAreaInsets();
  const { config, connectionState } = useGhostStore();
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forgettingId, setForgettingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [recallLoading, setRecallLoading] = useState(false);
  const [recallError, setRecallError] = useState<string | null>(null);
  const [recallSummary, setRecallSummary] = useState<string | null>(null);
  const [recallSessions, setRecallSessions] = useState<string[][]>([]);

  const loadMemory = useCallback(async () => {
    if (!config) return;
    setLoading(true);
    setLoadError(null);
    try {
      const self = await fetchMemorySelf(config);
      const seen = new Set<string>();
      setFacts(
        self.entries.filter((e) => {
          if (!e.id || seen.has(e.id)) return false;
          seen.add(e.id);
          return true;
        }),
      );
      setNotes(self.notes);
    } catch {
      setLoadError("Couldn't load what Ghost remembers.");
    }
    setLoading(false);
  }, [config]);

  const onRefresh = useCallback(async () => {
    if (!config) return;
    setRefreshing(true);
    setLoadError(null);
    try {
      const self = await fetchMemorySelf(config);
      const seen = new Set<string>();
      setFacts(
        self.entries.filter((e) => {
          if (!e.id || seen.has(e.id)) return false;
          seen.add(e.id);
          return true;
        }),
      );
      setNotes(self.notes);
    } catch {
      setLoadError("Couldn't load what Ghost remembers.");
    }
    setRefreshing(false);
  }, [config]);

  useEffect(() => {
    loadMemory();
  }, [loadMemory]);

  const [forgetTarget, setForgetTarget] = useState<
    { kind: "fact"; fact: MemoryFact } | { kind: "note"; note: string } | null
  >(null);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const confirmForgetFact = (f: MemoryFact) => {
    setForgetTarget({ kind: "fact", fact: f });
  };

  const confirmForgetNote = (note: string) => {
    setForgetTarget({ kind: "note", note });
  };

  const doForget = async () => {
    if (!config || !forgetTarget) return;
    setSheetError(null);
    if (forgetTarget.kind === "fact") {
      const f = forgetTarget.fact;
      setForgettingId(f.id);
      try {
        await forgetMemoryFact(config, f.id);
        setFacts((prev) => prev.filter((x) => x.id !== f.id));
        setForgetTarget(null);
      } catch {
        setSheetError("Check your connection and try again.");
      }
      setForgettingId(null);
    } else {
      const note = forgetTarget.note;
      setForgettingId(`note:${note}`);
      try {
        await forgetMemoryNote(config, "memory", note);
        setNotes((prev) => prev.filter((x) => x !== note));
        setForgetTarget(null);
      } catch {
        setSheetError("Check your connection and try again.");
      }
      setForgettingId(null);
    }
  };

  const runRecall = async () => {
    const q = query.trim();
    if (!config || !q || recallLoading) return;
    setRecallLoading(true);
    setRecallError(null);
    setRecallSummary(null);
    setRecallSessions([]);
    try {
      const res = await recallConversations(config, q);
      if (res.summarized && res.summary) setRecallSummary(res.summary);
      setRecallSessions(res.sessions.map((s) => s.messages ?? []).filter((m) => m.length > 0));
    } catch {
      setRecallError("Couldn't recall right now.");
    }
    setRecallLoading(false);
  };

  const rows: Row[] = [];
  const byKind: Record<string, MemoryFact[]> = {};
  for (const f of facts) {
    const k = kindOf(f.kind);
    (byKind[k] = byKind[k] || []).push(f);
  }
  for (const k of KIND_ORDER) {
    const list = (byKind[k] ?? []).sort((a, b) => (b.reinforce_count ?? 0) - (a.reinforce_count ?? 0));
    if (!list.length) continue;
    rows.push({ type: "group", key: `group:${k}`, label: KIND_LABEL[k] });
    for (const f of list) rows.push({ type: "fact", key: `fact:${f.id}`, fact: f });
  }
  if (notes.length) {
    rows.push({ type: "group", key: "group:notes", label: "What Ghost has learned" });
    notes.forEach((n, i) => rows.push({ type: "note", key: `note:${i}:${n.slice(0, 24)}`, note: n }));
  }

  const offline = connectionState !== "online";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <GhostText type="largeTitle" style={styles.headerTitle}>Memory</GhostText>
        <GhostText type="subhead" style={styles.headerSubtitle}>
          What Ghost remembers about you.
        </GhostText>
        <View style={styles.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={runRecall}
            returnKeyType="search"
            placeholder="What did we talk about…"
            placeholderTextColor={Ghost.text.tertiary}
            style={styles.searchInput}
          />
          <TouchableOpacity
            style={[styles.searchBtn, (!query.trim() || recallLoading) && styles.searchBtnDisabled]}
            onPress={runRecall}
            disabled={!query.trim() || recallLoading}
            accessibilityLabel="Search past conversations"
          >
            <GhostText type="subhead" style={styles.searchBtnText}>
              {recallLoading ? "…" : "Recall"}
            </GhostText>
          </TouchableOpacity>
        </View>
        {recallError ? (
          <GhostText type="subhead" style={styles.inlineError}>{recallError}</GhostText>
        ) : null}
        {recallSummary ? (
          <GhostText type="callout" style={styles.recallSummary} selectable>{recallSummary}</GhostText>
        ) : null}
        {recallSessions.length > 0 && !recallSummary ? (
          <GhostText type="subhead" style={styles.recallMeta}>
            {recallSessions.length} past conversation{recallSessions.length === 1 ? "" : "s"} matched.
          </GhostText>
        ) : null}
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
      ) : loadError && rows.length === 0 ? (
        <EmptyState
          title="Couldn't load memory."
          subtitle={offline ? "Ghost looks offline. Reconnect and try again." : "Check your connection and try again."}
          action={<GhostButton title="Retry" onPress={loadMemory} />}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Ghost is still getting to know you."
          subtitle="Talk to Ghost and it will remember the things that matter about you here."
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => {
            if (item.type === "group") {
              return (
                <GhostText type="caption" style={styles.groupLabel}>
                  {item.label.toUpperCase()}
                </GhostText>
              );
            }
            if (item.type === "note") {
              const busy = forgettingId === `note:${item.note}`;
              return (
                <View style={styles.row}>
                  <GhostText type="callout" style={styles.rowPreview} numberOfLines={3}>
                    {item.note}
                  </GhostText>
                  <TouchableOpacity
                    onPress={() => confirmForgetNote(item.note)}
                    disabled={busy}
                    hitSlop={8}
                    accessibilityLabel="Forget this note"
                  >
                    <GhostText type="subhead" style={styles.forget}>
                      {busy ? "…" : "Forget"}
                    </GhostText>
                  </TouchableOpacity>
                </View>
              );
            }
            const meta = factMeta(item.fact);
            const busy = forgettingId === item.fact.id;
            return (
              <View style={styles.row}>
                <View style={styles.rowContent}>
                  <GhostText type="headline" style={styles.rowTitle} numberOfLines={2}>
                    {item.fact.title}
                  </GhostText>
                  {meta ? (
                    <GhostText type="footnote" style={styles.rowMeta}>
                      {meta}
                    </GhostText>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => confirmForgetFact(item.fact)}
                  disabled={busy}
                  hitSlop={8}
                  accessibilityLabel={`Forget ${item.fact.title}`}
                >
                  <GhostText type="subhead" style={styles.forget}>
                    {busy ? "…" : "Forget"}
                  </GhostText>
                </TouchableOpacity>
              </View>
            );
          }}
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

      <GhostSheet
        visible={forgetTarget !== null}
        onClose={() => {
          setForgetTarget(null);
          setSheetError(null);
        }}
        title={sheetError ? "Couldn't forget that" : "Forget this?"}
        message={
          sheetError ??
          (forgetTarget
            ? forgetTarget.kind === "fact"
              ? `"${forgetTarget.fact.title}" won't be used anymore.`
              : "This note won't be used anymore."
            : undefined)
        }
        confirmTitle={sheetError ? "Try again" : "Forget"}
        variant="destructive"
        onConfirm={doForget}
      />
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
    paddingVertical: Space.md,
    gap: Space.xs,
  },
  headerTitle: {
    color: Ghost.text.primary,
  },
  headerSubtitle: {
    color: Ghost.text.secondary,
  },
  searchRow: {
    flexDirection: "row",
    gap: Space.sm,
    marginTop: Space.sm,
  },
  searchInput: {
    ...Type.body,
    flex: 1,
    borderWidth: 1,
    borderColor: Ghost.border.default,
    borderRadius: Radius.lg,
    borderCurve: "continuous",
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    minHeight: 48,
    color: Ghost.text.primary,
    backgroundColor: Ghost.bg.raised,
  },
  searchBtn: {
    borderRadius: Radius.full,
    backgroundColor: Ghost.accent.primary,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    minHeight: 48,
    justifyContent: "center",
  },
  searchBtnDisabled: {
    backgroundColor: Ghost.bg.sunken,
  },
  searchBtnText: {
    color: Ghost.text.inverse,
    fontWeight: "600",
  },
  inlineError: {
    color: Ghost.status.error,
  },
  recallSummary: {
    color: Ghost.text.primary,
    backgroundColor: Ghost.bg.raised,
    borderRadius: Radius.md,
    padding: Space.md,
    lineHeight: 21,
  },
  recallMeta: {
    color: Ghost.text.tertiary,
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
  groupLabel: {
    color: Ghost.text.tertiary,
    marginTop: Space.xl,
    marginBottom: Space.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingVertical: Space.md,
  },
  rowContent: {
    flex: 1,
    gap: Space.xxs,
  },
  rowTitle: {
    color: Ghost.text.primary,
  },
  rowMeta: {
    color: Ghost.text.tertiary,
  },
  rowPreview: {
    color: Ghost.text.secondary,
    lineHeight: 20,
    flex: 1,
  },
  forget: {
    color: Ghost.text.tertiary,
  },
});
