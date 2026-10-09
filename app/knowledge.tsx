import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { BookOpen, FileText, GraduationCap, Headphones, Lightbulb, Newspaper, Plus, Presentation, Video } from "lucide-react-native";
import { Text } from "@/components/text";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { EdgeScrollView } from "@/components/scroll-edge";
import { GhostButton, GhostSheet } from "@/components/ghost";
import { Empty, Field, InfoRow, lifeStyles, Pill, SourceLine } from "@/components/life-ui";
import { alpha, Fonts, Ghost, Space } from "@/constants/theme";
import { addLearning, editLearning, fetchKnowledge, removeLearning, type Learning } from "@/lib/ghostApi";
import { dueText, fraction, KIND_WORD, progressText, sections } from "@/lib/knowledge";
import { showDialog } from "@/lib/dialog";
import { useGhostStore } from "@/lib/store";

const ICON: Record<string, typeof BookOpen> = {
  book: BookOpen, course: Presentation, subject: GraduationCap, article: Newspaper, podcast: Headphones, video: Video, paper: FileText, other: Lightbulb,
};
const TINT: Record<string, string> = {
  book: "#FFC24D", course: "#8FB8FF", subject: "#9C95FF", article: "#B3B1BD", podcast: "#6FE3A0", video: "#FF9A1A", paper: "#B3B1BD", other: "#9C95FF",
};

/**
 * What the owner reads and studies, as Ghost keeps it: where they are in each
 * (a thin line fills as they go), what it is for, when an exam or deadline is,
 * and the notes and lines they kept. Ghost fills it from what they say; here
 * they can move it on, add one, or ask Ghost to quiz them.
 */
export default function KnowledgeScreen() {
  const config = useGhostStore((s) => s.config);
  const [items, setItems] = useState<Learning[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Learning | null>(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(async () => {
    if (!config) return;
    const r = await fetchKnowledge(config);
    if (r.ok) {
      setItems(r.data.items);
      setError(null);
      setOpen((o) => (o ? r.data.items.find((x) => x.id === o.id) ?? null : null));
    } else setError(r.error);
  }, [config]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <View style={styles.container}>
      <ScreenBackground variant="calm" />
      <ScreenHeader title="Knowledge" subtitle="What you read and study" />
      {!config ? (
        <Empty title="Not connected." text="What you read and study lives on your Pod. Connect one to see it." />
      ) : (
        <EdgeScrollView contentContainerStyle={styles.content}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {items === null && !error ? <ActivityIndicator style={{ marginTop: Space.xxxl }} color={Ghost.text.tertiary} /> : null}
          {items && items.length === 0 ? (
            <Empty
              title="Nothing yet."
              text="Tell Ghost what you're reading or studying (“I started Sapiens”, “my exam is on 15 March”) and it keeps your place, your notes and the lines you liked."
            />
          ) : null}
          {items ? (
            <Pressable onPress={() => setAdding(true)} style={({ pressed }) => [styles.add, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Add something to read or learn">
              <Plus size={16} color={Ghost.text.primary} strokeWidth={2} />
              <Text style={styles.addText}>Add a book, course or subject</Text>
            </Pressable>
          ) : null}
          {sections(items ?? []).map((sec) => (
            <View key={sec.title}>
              <Text style={lifeStyles.eyebrow}>{sec.title}</Text>
              <View style={lifeStyles.group}>
                {sec.items.map((l, i) => <Row key={l.id} l={l} first={i === 0} onPress={() => setOpen(l)} />)}
              </View>
            </View>
          ))}
        </EdgeScrollView>
      )}
      {config ? <LearningSheet item={open} onClose={() => setOpen(null)} onChanged={load} /> : null}
      {config ? <AddSheet visible={adding} onClose={() => setAdding(false)} onAdded={load} /> : null}
    </View>
  );
}

function Tile({ kind, size = 44 }: { kind: string; size?: number }) {
  const Icon = ICON[kind] ?? Lightbulb;
  const tint = TINT[kind] ?? Ghost.accent.primary;
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: size * 0.32, backgroundColor: alpha(tint, 0.12), borderColor: alpha(tint, 0.32) }]}>
      <Icon size={size * 0.43} color={tint} strokeWidth={1.8} />
    </View>
  );
}

function Bar({ value, tint }: { value: number; tint: string }) {
  return (
    <View style={styles.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}>
      <View style={[styles.barFill, { width: `${Math.max(3, value * 100)}%`, backgroundColor: tint }]} />
    </View>
  );
}

function Row({ l, first, onPress }: { l: Learning; first: boolean; onPress: () => void }) {
  const prog = progressText(l);
  const f = fraction(l);
  const due = l.status !== "done" ? dueText(l.due) : null;
  const sub = [l.author, l.status === "done" ? (l.finished ? `Finished ${new Date(l.finished).toLocaleDateString([], { day: "numeric", month: "short" })}` : "Finished") : prog]
    .filter(Boolean)
    .join(" · ") || KIND_WORD[l.kind];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !first && styles.rowLine, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={[l.title, l.author, prog, due?.text].filter(Boolean).join(", ")}>
      <Tile kind={l.kind} />
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, l.status === "done" && { color: Ghost.text.secondary }]} numberOfLines={2}>{l.title}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text>
        {l.status === "active" && f !== null ? <Bar value={f} tint={TINT[l.kind] ?? Ghost.accent.primary} /> : null}
      </View>
      {due ? <Pill text={due.text} tone={due.tone} centered /> : null}
    </Pressable>
  );
}

function LearningSheet({ item, onClose, onChanged }: { item: Learning | null; onClose: () => void; onChanged: () => Promise<void> }) {
  const config = useGhostStore((s) => s.config)!;
  const router = useRouter();
  const [at, setAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => { setAt(null); setError(null); onClose(); };
  const l = item;
  const body = (x: Learning, patch: Partial<Learning>) => {
    const n = { ...x, ...patch };
    return { kind: n.kind, title: n.title, author: n.author ?? "", status: n.status, current: n.current ?? 0, total: n.total ?? 0, unit: n.unit ?? "", goal: n.goal ?? "", due: n.due ?? "" };
  };
  const save = async (patch: Partial<Learning>) => {
    if (!l) return;
    setBusy(true);
    const r = await editLearning(config, l.id, body(l, patch));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    Haptics.selectionAsync().catch(() => {});
    setAt(null);
    await onChanged();
  };
  const moveTo = () => {
    if (!l || at === null) return;
    const n = parseInt(at, 10);
    if (!Number.isFinite(n) || n < 0) return setError("A number, please.");
    const done = l.total ? n >= l.total : l.unit === "percent" && n >= 100;
    void save({ current: n, status: done ? "done" : "active" });
  };
  const ask = (text: string) => {
    useGhostStore.getState().setIntent({ text, send: true });
    close();
    router.replace("/" as never);
  };
  const remove = () => {
    if (!l) return;
    showDialog(`Forget ${l.title}?`, "Ghost stops keeping your place and your notes for it.", [
      { text: "Cancel", style: "cancel" },
      { text: "Forget", style: "destructive", onPress: async () => {
        const r = await removeLearning(config, l.id);
        if (!r.ok) return setError(r.error);
        close();
        await onChanged();
      } },
    ]);
  };
  const prog = l ? progressText(l) : null;
  const f = l ? fraction(l) : null;
  const due = l && l.status !== "done" ? dueText(l.due) : null;
  const unitWord = l?.unit === "percent" ? "Percent" : l?.unit ? l.unit.charAt(0).toUpperCase() + l.unit.slice(1) : "Page";
  return (
    <GhostSheet visible={l !== null} onClose={close}>
      {l ? (
        <View style={{ gap: Space.md }}>
          <View style={styles.head}>
            <Tile kind={l.kind} size={52} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.sheetTitle}>{l.title}</Text>
              <Text style={styles.rowSub}>{[KIND_WORD[l.kind], l.author].filter(Boolean).join(" · ")}</Text>
            </View>
          </View>
          {prog || due ? (
            <View style={{ gap: Space.sm }}>
              <View style={styles.progLine}>
                {prog ? <Text style={styles.progText}>{prog}</Text> : null}
                {due ? <Pill text={due.text} tone={due.tone} /> : null}
              </View>
              {f !== null ? <Bar value={f} tint={TINT[l.kind] ?? Ghost.accent.primary} /> : null}
            </View>
          ) : null}
          {l.status !== "done" ? (
            at === null ? (
              <GhostButton title={l.status === "want" ? "Start it" : `I'm on ${unitWord.toLowerCase()}…`} size="sm" variant="secondary" style={{ alignSelf: "flex-start" }}
                onPress={() => (l.status === "want" ? void save({ status: "active" }) : setAt(String(l.current ?? "")))} />
            ) : (
              <View style={{ gap: Space.sm }}>
                <Field label={unitWord} value={at} onChange={setAt} keyboard="numeric" placeholder={l.total ? `of ${l.total}` : undefined} />
                <View style={styles.actions}>
                  <GhostButton title={busy ? "Saving…" : "Save"} size="sm" disabled={busy} onPress={moveTo} />
                  <GhostButton title="Cancel" size="sm" variant="secondary" disabled={busy} onPress={() => setAt(null)} />
                </View>
              </View>
            )
          ) : null}
          {l.goal ? (
            <View style={lifeStyles.sheetGroup}>
              <InfoRow first label="For" value={l.goal} />
            </View>
          ) : null}
          {(l.notes ?? []).length > 0 ? (
            <View style={{ gap: Space.sm }}>
              <Text style={styles.notesTitle}>{l.notes!.length === 1 ? "1 note" : `${l.notes!.length} notes`}</Text>
              {l.notes!.slice(-6).reverse().map((n, i) =>
                n.quote ? (
                  <View key={i} style={styles.quote}>
                    <Text style={styles.quoteText}>{`“${n.text}”`}</Text>
                    {n.where ? <Text style={styles.quoteWhere}>{n.where}</Text> : null}
                  </View>
                ) : (
                  <Text key={i} style={styles.note}>{n.text}</Text>
                ),
              )}
            </View>
          ) : null}
          <SourceLine source={l.source} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            {(l.notes ?? []).length > 0 || l.status === "active" ? (
              <GhostButton title="Quiz me" size="sm" onPress={() => ask(`Quiz me on ${l.title}: a few quick questions on a card, from my notes and what I've read so far.`)} />
            ) : null}
            {l.status === "active" ? <GhostButton title="Pause" size="sm" variant="secondary" disabled={busy} onPress={() => void save({ status: "paused" })} /> : null}
            {l.status === "paused" ? <GhostButton title="Pick it up" size="sm" variant="secondary" disabled={busy} onPress={() => void save({ status: "active" })} /> : null}
            {l.status !== "done" ? <GhostButton title="Finished" size="sm" variant="secondary" disabled={busy} onPress={() => void save({ status: "done", current: l.total || l.current })} /> : null}
            <GhostButton title="Forget" size="sm" variant="danger" onPress={remove} />
          </View>
        </View>
      ) : null}
    </GhostSheet>
  );
}

const KINDS: Learning["kind"][] = ["book", "course", "subject", "article", "podcast"];

function AddSheet({ visible, onClose, onAdded }: { visible: boolean; onClose: () => void; onAdded: () => Promise<void> }) {
  const config = useGhostStore((s) => s.config)!;
  const [form, setForm] = useState({ kind: "book" as Learning["kind"], title: "", author: "", total: "", goal: "", due: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => { setError(null); setForm({ kind: "book", title: "", author: "", total: "", goal: "", due: "" }); onClose(); };
  const unit = form.kind === "course" ? "lesson" : form.kind === "podcast" ? "episode" : form.kind === "book" ? "page" : "";
  const save = async () => {
    setBusy(true);
    const total = parseInt(form.total, 10);
    const r = await addLearning(config, { kind: form.kind, title: form.title, author: form.author, goal: form.goal, due: form.due.trim(), status: "want", ...(Number.isFinite(total) && total > 0 ? { total, unit } : {}) });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    close();
    await onAdded();
  };
  return (
    <GhostSheet visible={visible} onClose={close} title="Add">
      <View style={{ gap: Space.md }}>
        <View style={styles.kinds}>
          {KINDS.map((k) => (
            <Pressable key={k} onPress={() => setForm({ ...form, kind: k })} style={[styles.kind, form.kind === k && styles.kindOn]} accessibilityRole="radio" accessibilityState={{ selected: form.kind === k }}>
              <Text style={[styles.kindText, form.kind === k && { color: Ghost.text.primary }]}>{KIND_WORD[k]}</Text>
            </Pressable>
          ))}
        </View>
        <Field label="Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder={form.kind === "subject" ? "Organic chemistry" : "Sapiens"} />
        {form.kind !== "subject" ? <Field label="By" value={form.author} onChange={(v) => setForm({ ...form, author: v })} placeholder="Optional" /> : null}
        {unit ? <Field label={`How many ${unit}s`} value={form.total} onChange={(v) => setForm({ ...form, total: v })} keyboard="numeric" placeholder="Optional" /> : null}
        {form.kind === "subject" || form.kind === "course" ? (
          <>
            <Field label="For" value={form.goal} onChange={(v) => setForm({ ...form, goal: v })} placeholder="Pass the exam in March" />
            <Field label="Exam or deadline" value={form.due} onChange={(v) => setForm({ ...form, due: v })} placeholder="2027-03-15" />
          </>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <GhostButton title={busy ? "Adding…" : "Add"} fullWidth disabled={busy || !form.title.trim()} onPress={() => void save()} />
      </View>
    </GhostSheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  content: { paddingBottom: 96, paddingHorizontal: Space.lg },
  add: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 23, borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border, borderStyle: "dashed", marginTop: Space.xs, marginBottom: Space.xs },
  addText: { fontSize: 14.5, fontWeight: "500", color: Ghost.text.primary },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 70, paddingLeft: 12, paddingRight: 14, paddingVertical: 11 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Ghost.border.subtle },
  pressed: { backgroundColor: "rgba(255,255,255,0.04)" },
  tile: { borderCurve: "continuous", borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, minWidth: 0, gap: 3 },
  rowTitle: { fontSize: 15.5, lineHeight: 20, fontWeight: "500", letterSpacing: -0.15, color: Ghost.text.primary },
  rowSub: { fontSize: 13, lineHeight: 17, color: Ghost.text.tertiary },
  bar: { height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 4 },
  barFill: { height: 3, borderRadius: 2 },
  head: { flexDirection: "row", alignItems: "center", gap: Space.md },
  sheetTitle: { fontFamily: Fonts.voice, fontSize: 28, lineHeight: 33, letterSpacing: -0.5, color: Ghost.text.primary },
  progLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Space.sm },
  progText: { fontSize: 15, fontWeight: "500", color: Ghost.text.primary, fontVariant: ["tabular-nums"] },
  notesTitle: { fontSize: 11.5, fontWeight: "500", letterSpacing: 1.1, textTransform: "uppercase", color: Ghost.text.tertiary, marginLeft: 2 },
  note: { fontSize: 15, lineHeight: 22, fontWeight: "300", color: Ghost.text.secondary },
  quote: { borderLeftWidth: 2, borderLeftColor: alpha(Ghost.accent.primary, 0.5), paddingLeft: 12, gap: 2 },
  quoteText: { fontFamily: Fonts.voice, fontSize: 19, lineHeight: 25, color: Ghost.text.primary },
  quoteWhere: { fontSize: 12.5, color: Ghost.text.tertiary },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: Space.sm, marginTop: Space.xs },
  kinds: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  kind: { height: 34, paddingHorizontal: 13, borderRadius: 17, justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  kindOn: { backgroundColor: alpha(Ghost.accent.primary, 0.18), borderColor: alpha(Ghost.accent.primary, 0.5) },
  kindText: { fontSize: 13.5, fontWeight: "500", color: Ghost.text.secondary },
  error: { fontSize: 13.5, color: Ghost.status.error },
});
