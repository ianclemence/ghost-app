import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { BadgeCheck, Car, FileSignature, FileText, HeartPulse, Home, IdCard, Plane, Receipt, ShieldCheck, Stamp, Ticket, Wrench } from "lucide-react-native";
import { Text } from "@/components/text";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { EdgeScrollView } from "@/components/scroll-edge";
import { GhostButton, GhostSheet } from "@/components/ghost";
import { Empty, Field, InfoRow, lifeStyles, Pill, SourceLine } from "@/components/life-ui";
import { alpha, Fonts, Ghost, Space } from "@/constants/theme";
import { editPaper, fetchVault, fetchWorkspacePreview, removePaper, type Paper } from "@/lib/ghostApi";
import { paperStatus } from "@/lib/life";
import { showDialog } from "@/lib/dialog";
import { useGhostStore } from "@/lib/store";

const ICON: Record<string, typeof FileText> = {
  passport: Plane, id: IdCard, visa: Stamp, license: IdCard, insurance: ShieldCheck, warranty: Wrench, lease: Home,
  contract: FileSignature, vehicle: Car, medical: HeartPulse, certificate: BadgeCheck, ticket: Ticket, receipt: Receipt, other: FileText,
};
const KIND_WORD: Record<string, string> = {
  passport: "Passport", id: "ID", visa: "Visa", license: "Licence", insurance: "Insurance", warranty: "Warranty", lease: "Lease",
  contract: "Contract", vehicle: "Vehicle", medical: "Medical", certificate: "Certificate", ticket: "Ticket", receipt: "Receipt", other: "Document",
};

/**
 * The owner's important documents, as Ghost keeps them: what each is, the
 * facts read off it, and when it expires or renews, with the photo it was read
 * from. What needs attention (expired, or due within three months) comes first.
 */
export default function VaultScreen() {
  const config = useGhostStore((s) => s.config);
  const [papers, setPapers] = useState<Paper[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Paper | null>(null);
  const load = useCallback(async () => {
    if (!config) return;
    const r = await fetchVault(config);
    if (r.ok) {
      setPapers(r.data.papers);
      setError(null);
      setOpen((o) => (o ? r.data.papers.find((p) => p.id === o.id) ?? null : null));
    } else setError(r.error);
  }, [config]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const attention = (papers ?? []).filter((p) => p.days_left !== undefined && p.days_left <= 90);
  const rest = (papers ?? []).filter((p) => !attention.includes(p));

  return (
    <View style={styles.container}>
      <ScreenBackground variant="calm" />
      <ScreenHeader title="Documents" subtitle="Passports, policies, warranties" />
      {!config ? (
        <Empty title="Not connected." text="Your documents live on your Pod. Connect one to see them." />
      ) : (
        <EdgeScrollView contentContainerStyle={styles.content}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {papers === null && !error ? <ActivityIndicator style={{ marginTop: Space.xxxl }} color={Ghost.text.tertiary} /> : null}
          {papers && papers.length === 0 ? (
            <Empty title="Nothing kept yet." text="Send Ghost a photo of your passport, an insurance policy or a warranty. It keeps the details that matter and reminds you before anything runs out." />
          ) : null}
          {attention.length > 0 ? (
            <>
              <Text style={lifeStyles.eyebrow}>Needs attention</Text>
              <View style={lifeStyles.group}>{attention.map((p, i) => <Row key={p.id} p={p} first={i === 0} onPress={() => setOpen(p)} />)}</View>
            </>
          ) : null}
          {rest.length > 0 ? (
            <>
              {attention.length > 0 ? <Text style={lifeStyles.eyebrow}>Everything else</Text> : null}
              <View style={lifeStyles.group}>{rest.map((p, i) => <Row key={p.id} p={p} first={i === 0} onPress={() => setOpen(p)} />)}</View>
            </>
          ) : null}
        </EdgeScrollView>
      )}
      {config ? <PaperSheet paper={open} onClose={() => setOpen(null)} onChanged={load} /> : null}
    </View>
  );
}

function Tile({ kind, tone }: { kind: string; tone: string }) {
  const Icon = ICON[kind] ?? FileText;
  return (
    <View style={[styles.tile, { backgroundColor: alpha(tone, 0.12), borderColor: alpha(tone, 0.32) }]}>
      <Icon size={19} color={tone} strokeWidth={1.8} />
    </View>
  );
}

function toneColor(t: "bad" | "warn" | "neutral" | undefined) {
  return t === "bad" ? Ghost.status.error : t === "warn" ? Ghost.status.warning : Ghost.status.info;
}

function Row({ p, first, onPress }: { p: Paper; first: boolean; onPress: () => void }) {
  const st = paperStatus(p);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !first && styles.rowLine, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={[p.title, p.holder, st?.text].filter(Boolean).join(", ")}>
      <Tile kind={p.kind} tone={toneColor(st?.tone)} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={2}>{p.title}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{[KIND_WORD[p.kind] ?? "Document", p.holder ? `${p.holder}'s` : null].filter(Boolean).join(" · ")}</Text>
      </View>
      {st ? <Pill text={st.text} tone={st.tone} centered /> : null}
    </Pressable>
  );
}

function PaperSheet({ paper, onClose, onChanged }: { paper: Paper | null; onClose: () => void; onChanged: () => Promise<void> }) {
  const config = useGhostStore((s) => s.config)!;
  const [photo, setPhoto] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: "", holder: "", expires: "", renews: "", facts: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setPhoto(null);
    if (!paper?.file || !/\.(png|jpe?g|webp)$/i.test(paper.file)) return;
    let live = true;
    fetchWorkspacePreview(config, paper.file).then((p) => {
      if (live && p?.image_base64) setPhoto(`data:${p.mime_type ?? "image/jpeg"};base64,${p.image_base64}`);
    }).catch(() => {});
    return () => { live = false; };
  }, [paper?.file, config]);
  const close = () => { setEditing(false); setError(null); onClose(); };
  const begin = () => {
    if (!paper) return;
    setForm({ title: paper.title, holder: paper.holder ?? "", expires: paper.expires ?? "", renews: paper.renews ?? "", facts: (paper.facts ?? []).map((f) => `${f.label}: ${f.value}`).join("\n") });
    setError(null);
    setEditing(true);
  };
  const save = async () => {
    if (!paper) return;
    const facts = form.facts.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.indexOf(":");
      return i > 0 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : { label: "Note", value: l };
    });
    setBusy(true);
    const r = await editPaper(config, paper.id, { kind: paper.kind, title: form.title, holder: form.holder, facts, expires: form.expires.trim(), renews: form.renews.trim() });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setEditing(false);
    await onChanged();
  };
  const remove = () => {
    if (!paper) return;
    showDialog(`Remove ${paper.title}?`, "Ghost stops keeping it and won't remind you about it. Any photo of it stays in your files.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        const r = await removePaper(config, paper.id);
        if (!r.ok) return setError(r.error);
        close();
        await onChanged();
      } },
    ]);
  };
  const p = paper;
  const st = p ? paperStatus(p) : null;
  return (
    <GhostSheet visible={p !== null} onClose={close}>
      {p ? (
        editing ? (
          <View style={{ gap: Space.md }}>
            <Text style={styles.sheetTitle}>Edit</Text>
            <Field label="Name" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
            <Field label="Whose" value={form.holder} onChange={(v) => setForm({ ...form, holder: v })} placeholder="Leave empty if it's yours" />
            <Field label="Expires" value={form.expires} onChange={(v) => setForm({ ...form, expires: v })} placeholder="2030-02-01" />
            <Field label="Renews" value={form.renews} onChange={(v) => setForm({ ...form, renews: v })} placeholder="2026-11-01" />
            <Field label="Details" value={form.facts} onChange={(v) => setForm({ ...form, facts: v })} placeholder={"Number: AK123456"} hint="One per line: label, a colon, the value." />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <GhostButton title={busy ? "Saving…" : "Save"} size="sm" disabled={busy} onPress={() => void save()} />
              <GhostButton title="Cancel" size="sm" variant="secondary" disabled={busy} onPress={() => setEditing(false)} />
            </View>
          </View>
        ) : (
          <View style={{ gap: Space.md }}>
            <View style={styles.head}>
              <Tile kind={p.kind} tone={toneColor(st?.tone)} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.sheetTitle}>{p.title}</Text>
                {st ? <Pill text={st.text} tone={st.tone} /> : null}
              </View>
            </View>
            {photo ? <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" accessibilityLabel={`Photo of ${p.title}`} /> : null}
            {(p.facts ?? []).length > 0 || p.holder || p.expires || p.renews ? (
              <View style={lifeStyles.sheetGroup}>
                {p.holder ? <InfoRow first label="Whose" value={p.holder} /> : null}
                {(p.facts ?? []).map((f, i) => <InfoRow key={i} first={!p.holder && i === 0} label={f.label} value={f.value} />)}
                {p.expires ? <InfoRow first={!p.holder && !(p.facts ?? []).length} label="Expires" value={new Date(p.expires).toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" })} /> : null}
                {p.renews ? <InfoRow first={!p.holder && !(p.facts ?? []).length && !p.expires} label="Renews" value={new Date(p.renews).toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" })} /> : null}
              </View>
            ) : null}
            <SourceLine source={p.source} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <GhostButton title="Edit" size="sm" variant="secondary" onPress={begin} />
              <GhostButton title="Remove" size="sm" variant="danger" onPress={remove} />
            </View>
          </View>
        )
      ) : null}
    </GhostSheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  content: { paddingBottom: 96, paddingHorizontal: Space.lg },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 66, paddingLeft: 12, paddingRight: 14, paddingVertical: 10 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Ghost.border.subtle },
  pressed: { backgroundColor: "rgba(255,255,255,0.04)" },
  tile: { width: 44, height: 44, borderRadius: 14, borderCurve: "continuous", borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 15.5, lineHeight: 20, fontWeight: "500", letterSpacing: -0.15, color: Ghost.text.primary },
  rowSub: { fontSize: 13, lineHeight: 17, color: Ghost.text.tertiary },
  head: { flexDirection: "row", alignItems: "center", gap: Space.md },
  sheetTitle: { fontFamily: Fonts.voice, fontSize: 28, lineHeight: 33, letterSpacing: -0.5, color: Ghost.text.primary },
  photo: { width: "100%", aspectRatio: 1.5, borderRadius: 16, backgroundColor: Ghost.bg.sunken },
  actions: { flexDirection: "row", gap: Space.sm, marginTop: Space.xs },
  error: { fontSize: 13.5, color: Ghost.status.error },
});
