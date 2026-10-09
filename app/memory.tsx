import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { showDialog } from "@/lib/dialog";
import { Text } from "@/components/text";
import * as Haptics from "expo-haptics";
import Animated, { FadeOut, LinearTransition } from "react-native-reanimated";
import { alpha, Ghost, Space } from "@/constants/theme";
import { GhostButton, GhostInput, GhostSheet } from "@/components/ghost";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { correctMemoryFact, fetchKnowledge, fetchMemorySelf, fetchFinances, fetchPeople, fetchTrips, fetchVault, forgetMemoryFact, forgetMemoryNote, type MemoryFact, type MemorySelf } from "@/lib/ghostApi";
import { formatCurrency } from "@/lib/life";
import { progressText } from "@/lib/knowledge";
import { useRouter } from "expo-router";
import { BookOpen, MoreHorizontal, Users, FileText, Wallet, Plane } from "lucide-react-native";
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
  // The memory whose sheet is open: what it says, and what can be done with it.
  const [open, setOpen] = useState<{ title: string; label?: string; meta?: string; fact?: MemoryFact; forget: () => void } | null>(null);

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
          <LifeDoors />
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
                  onPress={() =>
                    setOpen({
                      title: f.field ? f.value : f.title || f.label,
                      label: f.field ? f.label : undefined,
                      meta: memoryMeta(f),
                      fact: f,
                      forget: () => confirmForget(f.field ? `${f.label}: ${f.value}` : f.title || f.label, () => forgetMemoryFact(config!, f.id), f.id),
                    })
                  }
                />
              ))}
            </Group>
          ))}
          {(mem?.notes.length ?? 0) > 0 ? (
            <Group title="Notes">
              {mem!.notes.map((n) => (
                <Item
                  key={`note-${n}`}
                  title={n}
                  busy={busy === `note-${n}`}
                  onPress={() => setOpen({ title: n, forget: () => confirmForget(n.slice(0, 40), () => forgetMemoryNote(config!, "memory", n), `note-${n}`) })}
                />
              ))}
            </Group>
          ) : null}
        </EdgeScrollView>
      )}
      <GhostSheet visible={open !== null} onClose={() => setOpen(null)} title={open?.label ?? "Remembered"} message={open?.meta}>
        <Text style={styles.sheetText}>{open?.title}</Text>
        <View style={styles.sheetActions}>
          {open?.fact ? (
            <GhostButton
              title="Correct it"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => {
                const f = open.fact!;
                setOpen(null);
                setDraft(f.value);
                setEditing(f);
              }}
            />
          ) : null}
          <GhostButton
            title="Forget"
            variant="danger"
            style={{ flex: 1 }}
            onPress={() => {
              const run = open?.forget;
              setOpen(null);
              run?.();
            }}
          />
        </View>
      </GhostSheet>
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

/**
 * What Ghost keeps about the owner's life besides memories: the people in it,
 * their documents, their finances, their trips, what they read and study. One door each, with a live line (how many,
 * what needs attention, what went out this month).
 */
function LifeDoors() {
  const router = useRouter();
  const config = useGhostStore((s) => s.config);
  const [lines, setLines] = useState<{ people?: string; vault?: string; vaultAlert?: boolean; finances?: string; trips?: string; knowledge?: string }>({});
  useEffect(() => {
    if (!config) return;
    let live = true;
    void Promise.all([fetchPeople(config), fetchVault(config), fetchFinances(config), fetchTrips(config), fetchKnowledge(config)]).then(([p, v, m, t, k]) => {
      if (!live) return;
      const due = v.ok ? v.data.papers.filter((x) => x.days_left !== undefined && x.days_left <= 90).length : 0;
      setLines({
        people: p.ok ? (p.data.people.length === 0 ? "No one yet" : `${p.data.people.length} ${p.data.people.length === 1 ? "person" : "people"}`) : undefined,
        vault: v.ok ? (due > 0 ? `${due} ${due === 1 ? "needs" : "need"} attention` : v.data.papers.length === 0 ? "Nothing yet" : `${v.data.papers.length} kept`) : undefined,
        vaultAlert: due > 0,
        finances: m.ok ? (m.data.summary.currency ? `${formatCurrency(m.data.summary.spent, m.data.summary.currency, { short: true })} this month` : "Nothing yet") : undefined,
        trips: t.ok ? (() => {
          const next = t.data.trips.find((x) => x.state !== "past");
          return next ? `${next.destination || next.title}${next.state === "now" ? ", now" : ""}` : t.data.trips.length ? "None coming up" : "Nothing yet";
        })() : undefined,
        knowledge: k.ok ? (() => {
          const now = k.data.items.filter((x) => x.status === "active");
          if (now.length === 0) return k.data.items.length ? `${k.data.items.length} kept` : "Nothing yet";
          const first = now[0];
          const at = progressText(first);
          return now.length === 1 ? `${first.title}${at ? `, ${at.toLowerCase()}` : ""}` : `${first.title} and ${now.length - 1} more`;
        })() : undefined,
      });
    });
    return () => { live = false; };
  }, [config]);
  const doors = [
    { key: "people", label: "People", line: lines.people, Icon: Users, tint: Ghost.accent.primary, go: "/people" },
    { key: "vault", label: "Documents", line: lines.vault, Icon: FileText, tint: Ghost.status.warning, go: "/vault", alert: lines.vaultAlert },
    { key: "finances", label: "Finances", line: lines.finances, Icon: Wallet, tint: Ghost.status.success, go: "/finances" },
    { key: "trips", label: "Trips", line: lines.trips, Icon: Plane, tint: Ghost.status.info, go: "/trips" },
    { key: "knowledge", label: "Knowledge", line: lines.knowledge, Icon: BookOpen, tint: "#9C95FF", go: "/knowledge" },
  ];
  return (
    <View style={doorStyles.row}>
      {doors.map((d) => (
        <Pressable
          key={d.key}
          onPress={() => router.push(d.go as never)}
          style={({ pressed }) => [doorStyles.door, pressed && { opacity: 0.75, transform: [{ scale: 0.98 }] }]}
          accessibilityRole="button"
          accessibilityLabel={`${d.label}${d.line ? `. ${d.line}` : ""}`}
        >
          <View style={[doorStyles.icon, { backgroundColor: alpha(d.tint, 0.13), borderColor: alpha(d.tint, 0.3) }]}>
            <d.Icon size={16} color={d.tint} strokeWidth={1.9} />
          </View>
          <Text style={doorStyles.label}>{d.label}</Text>
          <Text style={[doorStyles.line, d.alert && { color: Ghost.status.warning }]} numberOfLines={1}>{d.line ?? " "}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const doorStyles = StyleSheet.create({
  // Two by two: each door wide enough for its line.
  row: { flexDirection: "row", flexWrap: "wrap", gap: Space.sm, marginHorizontal: Space.lg, marginBottom: Space.md },
  door: { flexBasis: "47%", flexGrow: 1, gap: 4, padding: Space.md, borderRadius: 20, borderCurve: "continuous", backgroundColor: Ghost.glass.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  icon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, marginBottom: 4 },
  label: { fontSize: 14.5, fontWeight: "500", color: Ghost.text.primary },
  line: { fontSize: 12, lineHeight: 16, color: Ghost.text.tertiary },
});

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
  onPress,
}: {
  /** A field's name ("Name"), shown small above its value. */
  label?: string;
  title: string;
  value?: string;
  meta?: string;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Animated.View exiting={FadeOut.duration(180)} layout={LinearTransition.duration(200)}>
      <Pressable
        onPress={onPress}
        disabled={busy}
        style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
        accessibilityRole="button"
        accessibilityLabel={[label, title].filter(Boolean).join(": ")}
        accessibilityHint="Correct or forget it"
      >
        <View style={styles.itemText}>
          {label ? <Text style={styles.itemLabel}>{label}</Text> : null}
          <Text style={label ? styles.itemField : styles.itemTitle}>{title}</Text>
          {value ? <Text style={styles.itemValue}>{value}</Text> : null}
          {meta ? <Text style={styles.itemMeta}>{meta}</Text> : null}
        </View>
        {busy ? <ActivityIndicator size="small" color={Ghost.text.tertiary} /> : <MoreHorizontal size={18} color={Ghost.text.tertiary} strokeWidth={1.8} />}
      </Pressable>
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
  itemPressed: { backgroundColor: Ghost.glass.fill },
  sheetText: { fontSize: 17, lineHeight: 24, color: Ghost.text.primary },
  sheetActions: { flexDirection: "row", gap: Space.sm },
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
