import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { showDialog } from "@/lib/dialog";
import { Text } from "@/components/text";
import * as Haptics from "expo-haptics";
import Animated, { FadeOut, LinearTransition } from "react-native-reanimated";
import { Ghost, Space } from "@/constants/theme";
import { GhostButton, GhostInput, GhostSheet } from "@/components/ghost";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { correctMemoryFact, fetchMemorySelf, forgetMemoryFact, forgetMemoryNote, type MemoryFact, type MemorySelf } from "@/lib/ghostApi";
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
  // The memory being corrected, and the words typed so far.
  const [editing, setEditing] = useState<MemoryFact | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const saveEdit = async () => {
    if (!config || !editing) return;
    const v = draft.trim();
    if (!v || v === editing.value.trim()) {
      setEditing(null);
      return;
    }
    setSaving(true);
    try {
      await correctMemoryFact(config, editing.id, v);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setEditing(null);
      await load();
    } catch {
      setError("Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  };

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
    // Who you are comes first; the rest by name.
    return [...by.entries()].sort(([a], [b]) => (a === "Identity" ? -1 : b === "Identity" ? 1 : a.localeCompare(b)));
  }, [mem]);

  const confirmForget = (label: string, run: () => Promise<void>, key: string) => {
    showDialog(`Forget “${label}”?`, "Ghost won't use this again. This can't be undone.", [
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

  // "you" is Ghost's own one-line copy of the entries below (rebuilt from them
  // on the Pod), so it is neither shown nor counted: it made 12 memories read
  // as 18, and forgetting a copy did nothing because it was rebuilt.
  const total = (mem?.entries.length ?? 0) + (mem?.notes.length ?? 0);

  return (
    <View style={styles.container}>
      <ScreenBackground variant="calm" />
      <ScreenHeader
        title="Memory"
        subtitle={mem ? (total === 0 ? "Nothing remembered yet" : "What Ghost remembers about you") : undefined}
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
          {groups.map(([label, facts]) => (
            <Group key={label} title={label}>
              {facts.map((f) => (
                <Item
                  key={f.id}
                  label={f.field ? f.label : undefined}
                  title={f.field ? f.value : f.title || f.label}
                  value={f.field ? undefined : secondLine(f)}
                  meta={memoryMeta(f)}
                  busy={busy === f.id}
                  onEdit={() => {
                    setDraft(f.value);
                    setEditing(f);
                  }}
                  onForget={() => confirmForget(f.field ? `${f.label}: ${f.value}` : f.title || f.label, () => forgetMemoryFact(config!, f.id), f.id)}
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
      <GhostSheet
        visible={editing !== null}
        onClose={() => { if (!saving) setEditing(null); }}
        title={editing?.field ? `Change your ${editing.label.toLowerCase()}` : "Correct this memory"}
        message="Ghost keeps the old version in its history and uses yours from now on."
      >
        <GhostInput value={draft} onChangeText={setDraft} accessibilityLabel="New value" autoCapitalize="sentences" />
        <GhostButton title={saving ? "Saving…" : "Save"} fullWidth onPress={saveEdit} disabled={saving || !draft.trim()} />
      </GhostSheet>
    </View>
  );
}

// The line under a memory's title, only when it adds something. The title is
// usually the whole sentence now, and repeating it ("Takes vitamins every
// weekday" twice) read as a glitch. The same goes for a bare value the title
// already contains ("Name: Ian" over "Ian"), and for a summary that merely
// restates the title ("Your name is Ian."): a second line that adds nothing
// is not shown.
const SECOND_LINE_STOP = new Set(["a", "an", "the", "is", "are", "was", "were", "your", "you", "my", "me", "in", "on", "at", "to", "of", "and", "or", "for", "it", "its", "this", "that"]);

function secondLine(f: MemoryFact): string | undefined {
  const norm = (a?: string) => (a ?? "").trim().replace(/[.!]+$/, "").toLowerCase();
  const title = norm(f.title);
  const contained = (a?: string) => {
    const t = norm(a);
    return t !== "" && (title.includes(t) || t.includes(title));
  };
  if (f.value && !contained(f.value)) return f.value;
  if (f.summary && !contained(f.summary)) {
    // A summary that only restates the title in sentence form ("Your name is
    // Ian." under "Name: Ian") carries no new words: show it only when it
    // says something the title doesn't. Words compare stemmed so "live" and
    // "lives" count as the same word.
    const stem = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
    const known = new Set<string>();
    for (const w of [...title.split(/[^a-z0-9]+/), ...norm(f.value).split(/[^a-z0-9]+/)]) {
      if (w && !SECOND_LINE_STOP.has(w)) known.add(stem(w));
    }
    if (norm(f.summary).split(/[^a-z0-9]+/).some((w) => w && !SECOND_LINE_STOP.has(w) && !known.has(stem(w)))) {
      return f.summary;
    }
  }
  return undefined;
}

// When and how firmly Ghost knows this: "You told Ghost · 20 Sep", or
// "Confirmed 4 times · last Jul 31" once the owner has repeated it.
function memoryMeta(f: MemoryFact): string | undefined {
  const parts: string[] = [];
  if (f.about) parts.push(`About ${f.about}`);
  const n = f.reinforce_count ?? 0;
  if (n > 1) {
    const last = whenAgo(f.reinforced_at ?? f.created_at ?? null);
    parts.push(last ? `Confirmed ${n} times · last ${last}` : `Confirmed ${n} times`);
  } else {
    // When it was first heard, and from whom: "You told Ghost" is a fact you
    // gave; "Ghost noticed" is something it worked out. The date is when it
    // was said, not when the record was last written.
    const iso = f.learned_at ?? f.created_at ?? null;
    const t = iso ? Date.parse(iso) : NaN;
    const when = Number.isFinite(t) ? new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : null;
    const who = f.said_by === "you" ? "You told Ghost" : "Ghost noticed";
    parts.push(when ? `${who} · ${when}` : who);
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
  label,
  title,
  value,
  meta,
  busy,
  onEdit,
  onForget,
}: {
  /** A field's name ("Name"), shown small above its value. */
  label?: string;
  title: string;
  value?: string;
  meta?: string;
  busy: boolean;
  onEdit?: () => void;
  onForget: () => void;
}) {
  return (
    <Animated.View exiting={FadeOut.duration(180)} layout={LinearTransition.duration(200)} style={styles.item}>
      <View style={styles.itemText}>
        {label ? <Text style={styles.itemLabel}>{label}</Text> : null}
        <Text style={label ? styles.itemField : styles.itemTitle}>{title}</Text>
        {value ? <Text style={styles.itemValue}>{value}</Text> : null}
        {meta ? <Text style={styles.itemMeta}>{meta}</Text> : null}
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={Ghost.text.tertiary} />
      ) : (
        <View style={styles.itemActions}>
          {onEdit ? <GhostButton title="Edit" variant="secondary" size="sm" style={styles.itemAction} onPress={onEdit} /> : null}
          <GhostButton title="Forget" variant="ghost" size="sm" style={styles.itemAction} onPress={onForget} />
        </View>
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
  itemLabel: { fontSize: 12, lineHeight: 16, fontWeight: "500", letterSpacing: 0.4, textTransform: "uppercase", color: Ghost.text.tertiary },
  itemField: { fontSize: 19, lineHeight: 25, fontWeight: "500", letterSpacing: -0.2, color: Ghost.text.primary },
  itemActions: { gap: Space.xs, alignItems: "stretch" },
  // Both pills fill the action column so Edit and Forget are always the same
  // width with clean left and right edges (GhostButton defaults to
  // content-width, which came out ragged).
  itemAction: { alignSelf: "stretch" },
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
