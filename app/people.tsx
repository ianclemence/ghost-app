import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { Cake, Search, X } from "lucide-react-native";
import { Text } from "@/components/text";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { EdgeScrollView } from "@/components/scroll-edge";
import { GhostButton, GhostSheet } from "@/components/ghost";
import { Empty, Field, InfoRow, lifeStyles, SourceLine } from "@/components/life-ui";
import { Fonts, Ghost, Space } from "@/constants/theme";
import { editPerson, fetchPeople, forgetPerson, type Person } from "@/lib/ghostApi";
import { birthdayLine, initials, personHue } from "@/lib/life";
import { showDialog } from "@/lib/dialog";
import { useGhostStore } from "@/lib/store";

/**
 * The people in the owner's life, as Ghost knows them: who they are to the
 * owner, their birthday, how to reach them, what they like, and where each
 * thing came from. Birthdays coming up sit first. Anything can be changed or
 * forgotten here, and forgetting removes it from the Pod.
 */
export default function PeopleScreen() {
  const config = useGhostStore((s) => s.config);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Person | null>(null);

  const load = useCallback(async () => {
    if (!config) return;
    const r = await fetchPeople(config);
    if (r.ok) {
      setPeople(r.data.people);
      setError(null);
      setOpen((o) => (o ? r.data.people.find((p) => p.id === o.id) ?? null : null));
    } else setError(r.error);
  }, [config]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => (people ?? []).filter((p) => !q || [p.name, p.relation, ...(p.aliases ?? [])].some((x) => x?.toLowerCase().includes(q))), [people, q]);
  const soon = shown.filter((p) => p.days_to_birthday !== undefined && p.days_to_birthday <= 30).sort((a, b) => (a.days_to_birthday ?? 0) - (b.days_to_birthday ?? 0));
  const rest = shown.filter((p) => !soon.includes(p));

  return (
    <View style={styles.container}>
      <ScreenBackground variant="calm" />
      <ScreenHeader title="People" subtitle="Who matters to you" />
      {!config ? (
        <Empty title="Not connected." text="The people Ghost knows live on your Pod. Connect one to see them." />
      ) : (
        <EdgeScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {people && people.length > 6 ? (
            <View style={styles.search}>
              <Search size={16} color={Ghost.text.tertiary} strokeWidth={2} />
              <TextInput value={query} onChangeText={setQuery} placeholder="Search" placeholderTextColor={Ghost.text.tertiary} style={styles.searchInput} accessibilityLabel="Search people" selectionColor={Ghost.accent.primary} />
              {query ? <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear"><X size={16} color={Ghost.text.tertiary} /></Pressable> : null}
            </View>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {people === null && !error ? <ActivityIndicator style={{ marginTop: Space.xxxl }} color={Ghost.text.tertiary} /> : null}
          {people && people.length === 0 ? (
            <Empty title="No one yet." text={"Tell Ghost about the people in your life (“my sister Wanjiru’s birthday is 3 May”, “Mum loves orchids”) and it keeps them here, with a word before their birthdays."} />
          ) : null}
          {soon.length > 0 ? (
            <>
              <Text style={lifeStyles.eyebrow}>Coming up</Text>
              <View style={lifeStyles.group}>{soon.map((p, i) => <Row key={p.id} p={p} first={i === 0} onPress={() => setOpen(p)} />)}</View>
            </>
          ) : null}
          {rest.length > 0 ? (
            <>
              {soon.length > 0 ? <Text style={lifeStyles.eyebrow}>Everyone</Text> : null}
              <View style={lifeStyles.group}>{rest.map((p, i) => <Row key={p.id} p={p} first={i === 0} onPress={() => setOpen(p)} />)}</View>
            </>
          ) : null}
        </EdgeScrollView>
      )}
      {config ? <PersonSheet person={open} onClose={() => setOpen(null)} onChanged={load} /> : null}
    </View>
  );
}

function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const hue = personHue(name);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: `hsla(${hue}, 70%, 62%, 0.16)`, borderColor: `hsla(${hue}, 80%, 72%, 0.38)` }]}>
      <Text style={[styles.avatarText, { color: `hsl(${hue}, 85%, 80%)`, fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </View>
  );
}

function Row({ p, first, onPress }: { p: Person; first: boolean; onPress: () => void }) {
  const bday = birthdayLine(p);
  const soon = p.days_to_birthday !== undefined && p.days_to_birthday <= 7;
  const relation = p.relation ? p.relation.charAt(0).toUpperCase() + p.relation.slice(1) : null;
  const sub = [relation, soon ? null : bday].filter(Boolean).join(" · ");
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !first && styles.rowLine, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={[p.name, p.relation, bday].filter(Boolean).join(", ")}>
      <Avatar name={p.name} />
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>{p.name}</Text>
        {sub ? <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {soon && bday ? (
        <View style={styles.bday}>
          <Cake size={13} color={Ghost.ember} strokeWidth={2} />
          <Text style={styles.bdayText}>{p.days_to_birthday === 0 ? "Today" : p.days_to_birthday === 1 ? "Tomorrow" : `${p.days_to_birthday} days`}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function PersonSheet({ person, onClose, onChanged }: { person: Person | null; onClose: () => void; onChanged: () => Promise<void> }) {
  const config = useGhostStore((s) => s.config)!;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", relation: "", birthday: "", phone: "", email: "", likes: "", keep: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const begin = () => {
    if (!person) return;
    setForm({ name: person.name, relation: person.relation ?? "", birthday: person.birthday ?? "", phone: person.phone ?? "", email: person.email ?? "", likes: (person.likes ?? []).join(", "), keep: person.keep_in_touch_days ? String(person.keep_in_touch_days) : "" });
    setError(null);
    setEditing(true);
  };
  const close = () => { setEditing(false); setError(null); onClose(); };
  const save = async () => {
    if (!person) return;
    setBusy(true);
    const r = await editPerson(config, person.id, {
      name: form.name, relation: form.relation, birthday: form.birthday.trim(), phone: form.phone.trim(), email: form.email.trim(),
      likes: form.likes.split(",").map((x) => x.trim()).filter(Boolean), keep_in_touch_days: Number(form.keep) || 0,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setEditing(false);
    await onChanged();
  };
  const forget = () => {
    if (!person) return;
    showDialog(`Forget ${person.name}?`, "Ghost forgets everything it knew about them. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Forget", style: "destructive", onPress: async () => {
        const r = await forgetPerson(config, person.id);
        if (!r.ok) return setError(r.error);
        close();
        await onChanged();
      } },
    ]);
  };
  const p = person;
  const bday = p ? birthdayLine(p) : null;
  return (
    <GhostSheet visible={p !== null} onClose={close}>
      {p ? (
        editing ? (
          <View style={{ gap: Space.md }}>
            <Text style={styles.sheetTitle}>Edit {p.name}</Text>
            <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Field label="Who they are to you" value={form.relation} onChange={(v) => setForm({ ...form, relation: v })} placeholder="Sister, friend, colleague" />
            <Field label="Birthday" value={form.birthday} onChange={(v) => setForm({ ...form, birthday: v })} placeholder="1990-05-03, or 05-03" hint="Year, month and day; or just month and day." />
            <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} keyboard="phone-pad" />
            <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} keyboard="email-address" />
            <Field label="Likes" value={form.likes} onChange={(v) => setForm({ ...form, likes: v })} placeholder="Orchids, jazz, tea" hint="Separate them with commas." />
            <Field label="Remind me to stay in touch every" value={form.keep} onChange={(v) => setForm({ ...form, keep: v.replace(/[^0-9]/g, "") })} keyboard="numeric" placeholder="Days (leave empty for never)" />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <GhostButton title={busy ? "Saving…" : "Save"} size="sm" disabled={busy} onPress={() => void save()} />
              <GhostButton title="Cancel" size="sm" variant="secondary" disabled={busy} onPress={() => setEditing(false)} />
            </View>
          </View>
        ) : (
          <View style={{ gap: Space.md }}>
            <View style={styles.head}>
              <Avatar name={p.name} size={56} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.sheetTitle}>{p.name}</Text>
                {p.relation || (p.aliases ?? []).length ? <Text style={styles.headSub}>{[p.relation, ...(p.aliases ?? []).map((a) => `“${a}”`)].filter(Boolean).join(" · ")}</Text> : null}
              </View>
            </View>
            {bday || p.phone || p.email || p.last_contact || p.keep_in_touch_days ? (
              <View style={lifeStyles.sheetGroup}>
                {bday ? <InfoRow first label="Birthday" value={bday} /> : null}
                {p.phone ? <InfoRow first={!bday} label="Phone" value={p.phone} onPress={() => Linking.openURL(`tel:${p.phone!.replace(/\s/g, "")}`).catch(() => {})} /> : null}
                {p.email ? <InfoRow first={!bday && !p.phone} label="Email" value={p.email} onPress={() => Linking.openURL(`mailto:${p.email}`).catch(() => {})} /> : null}
                {p.last_contact ? <InfoRow first={!bday && !p.phone && !p.email} label="Last in touch" value={new Date(p.last_contact).toLocaleDateString([], { day: "numeric", month: "long" })} /> : null}
                {p.keep_in_touch_days ? <InfoRow first={!bday && !p.phone && !p.email && !p.last_contact} label="Stay in touch" value={`Every ${p.keep_in_touch_days} days`} /> : null}
              </View>
            ) : null}
            {(p.likes ?? []).length > 0 ? (
              <View style={{ gap: Space.sm }}>
                <Text style={styles.label}>Likes</Text>
                <View style={styles.chips}>{p.likes!.map((l) => <View key={l} style={styles.chip}><Text style={styles.chipText}>{l}</Text></View>)}</View>
              </View>
            ) : null}
            {(p.notes ?? []).length > 0 ? (
              <View style={{ gap: Space.sm }}>
                <Text style={styles.label}>What Ghost knows</Text>
                <View style={lifeStyles.sheetGroup}>
                  {p.notes!.map((n, i) => (
                    <View key={i} style={[styles.note, i > 0 && styles.rowLine]}>
                      <Text style={styles.noteText}>{n.text}</Text>
                      <SourceLine source={n.source} />
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            <SourceLine source={p.source} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <GhostButton title="Edit" size="sm" variant="secondary" onPress={begin} />
              <GhostButton title="Forget" size="sm" variant="danger" onPress={forget} />
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
  search: { flexDirection: "row", alignItems: "center", gap: 10, height: 46, paddingHorizontal: 16, borderRadius: 23, backgroundColor: "rgba(0,0,0,0.42)", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border, marginTop: Space.xs, marginBottom: Space.xs },
  searchInput: { flex: 1, fontSize: 15.5, color: Ghost.text.primary, paddingVertical: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 66, paddingHorizontal: 12, paddingVertical: 10 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Ghost.border.subtle },
  pressed: { backgroundColor: "rgba(255,255,255,0.04)" },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowName: { fontSize: 15.5, lineHeight: 20, fontWeight: "500", letterSpacing: -0.15, color: Ghost.text.primary },
  rowSub: { fontSize: 13, lineHeight: 17, color: Ghost.text.tertiary },
  avatar: { alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
  avatarText: { fontWeight: "600", letterSpacing: 0.3 },
  bday: { flexDirection: "row", alignItems: "center", gap: 5, height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: "rgba(255,169,40,0.12)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,169,40,0.34)" },
  bdayText: { fontSize: 12.5, fontWeight: "500", color: Ghost.ember },
  head: { flexDirection: "row", alignItems: "center", gap: Space.md },
  sheetTitle: { fontFamily: Fonts.voice, fontSize: 30, lineHeight: 35, letterSpacing: -0.5, color: Ghost.text.primary },
  headSub: { fontSize: 14, color: Ghost.text.secondary },
  label: { fontSize: 11.5, fontWeight: "500", letterSpacing: 1.1, textTransform: "uppercase", color: Ghost.text.tertiary, marginLeft: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { height: 30, paddingHorizontal: 12, borderRadius: 15, justifyContent: "center", backgroundColor: Ghost.glass.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  chipText: { fontSize: 13.5, color: Ghost.text.secondary },
  note: { paddingHorizontal: 14, paddingVertical: 11, gap: 2 },
  noteText: { fontSize: 15, lineHeight: 21, fontWeight: "300", color: Ghost.text.primary },
  actions: { flexDirection: "row", gap: Space.sm, marginTop: Space.xs },
  error: { fontSize: 13.5, color: Ghost.status.error },
});
