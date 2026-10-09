import React, { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, { Easing, FadeIn, FadeInDown, LinearTransition, useReducedMotion } from "react-native-reanimated";
import { CalendarPlus, ChevronDown, CircleCheck, Mail, MapPin, MessageSquare, Pencil } from "lucide-react-native";
import { Text } from "@/components/text";
import { GlassCard } from "@/components/glass";
import { GhostButton } from "@/components/ghost";
import { DateTimeSheet } from "@/components/card-inputs";
import { alpha, Fonts, Ghost, Inter, Space } from "@/constants/theme";
import { humanValue } from "@/lib/cardAnswers";
import { draftFields, smsUrl, type DraftKind } from "@/lib/drafts";
import type { RichCard } from "@/lib/cards";

const EASE = Easing.bezier(0.23, 1, 0.32, 1);

const KIND: Record<DraftKind, { label: string; Icon: typeof Mail }> = {
  email: { label: "Draft email", Icon: Mail },
  event: { label: "Draft event", Icon: CalendarPlus },
  sms: { label: "Draft text", Icon: MessageSquare },
};

/**
 * Something Ghost wrote for the owner to send, shown the way it will go out:
 * an email as an email (who it is to, the subject, the words), an event with
 * its when and where, a text as a text. Every field can be changed before it
 * goes, and the Pod checks the change. Nothing leaves until the owner taps the
 * button, and afterwards the card says what really happened ("Sent 10:42"), or
 * why it did not, with the draft still there to try again.
 *
 * A text is opened in the phone's own Messages, ready to send: the owner sends
 * it there, and the card says only that it was opened.
 */
export function DraftCard({
  card,
  busy,
  error,
  onSend,
  onDiscard,
  onEdit,
}: {
  card: RichCard;
  busy: "send" | "save" | "discard" | null;
  error: string | null;
  onSend: () => void;
  onDiscard: () => void;
  onEdit: (fields: Record<string, string>) => Promise<boolean>;
}) {
  const reduce = useReducedMotion();
  const fields = draftFields(card);
  const kind = fields.kind;
  const meta = KIND[kind];
  const resolved = card.resolved;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [picking, setPicking] = useState<"start" | "end" | null>(null);
  useEffect(() => {
    if (!editing) setEdit({});
  }, [editing, card]);
  const value = (k: string) => (k in edit ? edit[k] : fields.values[k] ?? "");
  const set = (k: string, v: string) => setEdit((e) => ({ ...e, [k]: v }));
  const save = async () => {
    if (Object.keys(edit).length === 0) {
      setEditing(false);
      return;
    }
    if (await onEdit(edit)) setEditing(false);
  };
  const send = () => {
    if (kind === "sms") {
      // The phone's own Messages, filled in: the owner sends it there.
      Linking.openURL(smsUrl(value("to"), value("body"))).then(onSend).catch(() => onSend());
      return;
    }
    onSend();
  };
  const layout = reduce ? undefined : LinearTransition.duration(200).easing(EASE);
  const discarded = resolved?.action_id === "discard";

  if (resolved && !open) {
    return (
      <Animated.View layout={layout}>
        <Pressable
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.collapsed, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={`${meta.label}: ${card.title}. ${discarded ? "Discarded" : resolved.label}. Tap to see it again.`}
        >
          {discarded ? <meta.Icon size={15} color={Ghost.text.tertiary} strokeWidth={1.9} /> : <CircleCheck size={16} color={Ghost.status.success} strokeWidth={1.9} />}
          <Text style={styles.collapsedTitle} numberOfLines={1}>{card.title}</Text>
          <Text style={styles.collapsedLabel} numberOfLines={1}>{discarded ? "Discarded" : resolved.label}</Text>
          <ChevronDown size={15} color={Ghost.text.tertiary} strokeWidth={1.8} />
        </Pressable>
      </Animated.View>
    );
  }

  const sendAction = (card.actions ?? []).find((a) => a.id === "send");
  const allDay = value("all_day") === "true";
  return (
    <Animated.View layout={layout} entering={reduce ? undefined : FadeInDown.duration(240).easing(EASE)}>
      <GlassCard style={styles.card} accessibilityLabel={`${meta.label}: ${card.title}`}>
        <View style={styles.head}>
          <View style={styles.badge}>
            <meta.Icon size={15} color={Ghost.accent.primary} strokeWidth={1.9} />
          </View>
          <Text style={styles.kicker}>{meta.label}</Text>
          {resolved ? (
            <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Put it away">
              <Text style={styles.resolvedTag}>{discarded ? "Discarded" : resolved.label}</Text>
            </Pressable>
          ) : !editing ? (
            <Pressable
              onPress={() => setEditing(true)}
              hitSlop={8}
              style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="Edit the draft"
            >
              <Pencil size={13} color={Ghost.text.secondary} strokeWidth={2} />
              <Text style={styles.editText}>Edit</Text>
            </Pressable>
          ) : null}
        </View>

        {kind === "email" ? (
          <View style={styles.sheet}>
            <Row label="To" value={value("to")} editing={editing} onChange={(v) => set("to", v)} keyboard="email-address" />
            {editing || value("cc") ? <Row label="Cc" value={value("cc")} editing={editing} onChange={(v) => set("cc", v)} keyboard="email-address" placeholder="Optional" /> : null}
            <Row label="Subject" value={value("subject")} editing={editing} onChange={(v) => set("subject", v)} strong />
            <Body value={value("body")} editing={editing} onChange={(v) => set("body", v)} />
          </View>
        ) : kind === "event" ? (
          <View style={styles.sheet}>
            {editing ? (
              <Row label="Title" value={value("subject")} editing onChange={(v) => set("subject", v)} strong />
            ) : (
              <Text style={styles.eventTitle}>{value("subject")}</Text>
            )}
            <WhenRow
              label="Starts"
              text={humanValue(allDay ? "date" : "datetime", value("start")) || value("start")}
              editing={editing}
              onPress={() => setPicking("start")}
            />
            {value("end") || editing ? (
              <WhenRow
                label="Ends"
                text={value("end") ? humanValue(allDay ? "date" : "datetime", value("end")) || value("end") : "Optional"}
                editing={editing}
                onPress={() => setPicking("end")}
              />
            ) : null}
            {editing ? (
              <Row label="Where" value={value("location")} editing onChange={(v) => set("location", v)} placeholder="Optional" />
            ) : value("location") ? (
              <View style={styles.where}>
                <MapPin size={14} color={Ghost.text.tertiary} strokeWidth={1.9} />
                <Text style={styles.whereText}>{value("location")}</Text>
              </View>
            ) : null}
            {editing || value("body") ? <Body value={value("body")} editing={editing} onChange={(v) => set("body", v)} placeholder="Notes (optional)" /> : null}
          </View>
        ) : (
          <View style={styles.sheet}>
            <Row label="To" value={value("to")} editing={editing} onChange={(v) => set("to", v)} keyboard="phone-pad" />
            <View style={styles.bubbleWrap}>
              {editing ? (
                <Body value={value("body")} editing onChange={(v) => set("body", v)} />
              ) : (
                <View style={styles.bubble}>
                  <Text style={styles.bubbleText}>{value("body")}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {error ? (
          <Animated.Text entering={reduce ? undefined : FadeIn.duration(160)} style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Animated.Text>
        ) : null}

        {!resolved ? (
          <View style={styles.actions}>
            {editing ? (
              <>
                <GhostButton title={busy === "save" ? "Saving…" : "Save changes"} size="sm" variant="primary" disabled={busy !== null} onPress={() => void save()} />
                <GhostButton title="Cancel" size="sm" variant="secondary" disabled={busy !== null} onPress={() => setEditing(false)} />
              </>
            ) : (
              <>
                <GhostButton
                  title={busy === "send" ? (kind === "event" ? "Adding…" : kind === "sms" ? "Opening…" : "Sending…") : sendAction?.label ?? "Send"}
                  size="sm"
                  variant="primary"
                  disabled={busy !== null}
                  onPress={send}
                />
                <GhostButton title="Discard" size="sm" variant="secondary" disabled={busy !== null} onPress={onDiscard} />
              </>
            )}
          </View>
        ) : null}
      </GlassCard>
      {kind === "event" ? (
        <DateTimeSheet
          visible={picking !== null}
          mode={allDay ? "date" : "datetime"}
          title={picking === "end" ? "Ends" : "Starts"}
          value={picking ? value(picking) || value("start") : undefined}
          earliest={picking === "end" ? value("start") || undefined : undefined}
          onClose={() => setPicking(null)}
          onDone={(v) => { if (picking) set(picking, v); setPicking(null); }}
        />
      ) : null}
    </Animated.View>
  );
}

function Row({
  label,
  value,
  editing,
  onChange,
  strong,
  placeholder,
  keyboard,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
  strong?: boolean;
  placeholder?: string;
  keyboard?: "email-address" | "phone-pad";
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {editing ? (
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={Ghost.text.tertiary}
          keyboardType={keyboard}
          autoCapitalize={keyboard ? "none" : "sentences"}
          autoCorrect={!keyboard}
          style={[styles.rowInput, strong && styles.rowStrong]}
          accessibilityLabel={label}
          selectionColor={Ghost.accent.primary}
        />
      ) : (
        <Text style={[styles.rowValue, strong && styles.rowStrong]} selectable>{value}</Text>
      )}
    </View>
  );
}

function WhenRow({ label, text, editing, onPress }: { label: string; text: string; editing: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={editing ? onPress : undefined} disabled={!editing} style={styles.row} accessibilityRole={editing ? "button" : "text"} accessibilityLabel={`${label}: ${text}`}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, editing && { color: Ghost.accent.primary }]}>{text}</Text>
    </Pressable>
  );
}

function Body({ value, editing, onChange, placeholder }: { value: string; editing: boolean; onChange: (v: string) => void; placeholder?: string }) {
  if (!editing) return <Text style={styles.bodyText} selectable>{value}</Text>;
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      multiline
      placeholder={placeholder ?? "Message"}
      placeholderTextColor={Ghost.text.tertiary}
      style={styles.bodyInput}
      accessibilityLabel="Message"
      selectionColor={Ghost.accent.primary}
    />
  );
}

const styles = StyleSheet.create({
  card: { gap: Space.md, padding: 18 },
  head: { flexDirection: "row", alignItems: "center", gap: 9 },
  badge: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: alpha(Ghost.accent.primary, 0.14), borderWidth: StyleSheet.hairlineWidth, borderColor: alpha(Ghost.accent.primary, 0.34) },
  kicker: { flex: 1, fontSize: 11.5, fontWeight: "500", letterSpacing: 1.1, textTransform: "uppercase", color: Ghost.text.tertiary },
  resolvedTag: { fontSize: 12.5, fontWeight: "500", color: Ghost.status.success },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 5, height: 30, paddingHorizontal: 11, borderRadius: 15, backgroundColor: Ghost.glass.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  editText: { fontSize: 12.5, fontWeight: "500", color: Ghost.text.secondary },
  sheet: { borderRadius: 18, borderCurve: "continuous", backgroundColor: "rgba(255,255,255,0.04)", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Ghost.border.subtle },
  rowLabel: { width: 58, fontSize: 13, color: Ghost.text.tertiary },
  rowValue: { flex: 1, fontSize: 14.5, lineHeight: 20, color: Ghost.text.secondary },
  rowStrong: { color: Ghost.text.primary, fontWeight: "500" },
  rowInput: { flex: 1, fontFamily: Inter.regular, fontSize: 14.5, color: Ghost.text.primary, paddingVertical: 4 },
  bodyText: { fontSize: 15.5, lineHeight: 23, fontWeight: "300", color: "rgba(255,255,255,0.9)", paddingHorizontal: 14, paddingVertical: 12 },
  bodyInput: { minHeight: 120, fontFamily: Inter.light, fontSize: 15.5, lineHeight: 23, color: Ghost.text.primary, paddingHorizontal: 14, paddingVertical: 12, textAlignVertical: "top" },
  eventTitle: { fontFamily: Fonts.voice, fontSize: 26, lineHeight: 31, letterSpacing: -0.45, color: Ghost.text.primary, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
  where: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Ghost.border.subtle },
  whereText: { flex: 1, fontSize: 14.5, color: Ghost.text.secondary },
  bubbleWrap: { padding: 12, alignItems: "flex-end" },
  bubble: { maxWidth: "88%", backgroundColor: alpha(Ghost.accent.primary, 0.22), borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleText: { fontSize: 15.5, lineHeight: 22, color: Ghost.text.primary },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: Space.sm },
  error: { fontSize: 13.5, lineHeight: 19, color: Ghost.status.error },
  collapsed: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderCurve: "continuous",
    backgroundColor: "rgba(0,0,0,0.38)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  collapsedTitle: { flexShrink: 1, fontSize: 14.5, fontWeight: "500", color: Ghost.text.secondary },
  collapsedLabel: { flex: 1, fontSize: 14, fontWeight: "300", color: Ghost.text.tertiary },
});
