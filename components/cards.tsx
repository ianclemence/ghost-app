import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { CircleCheck } from "lucide-react-native";
import { Fonts, Ghost, Space } from "@/constants/theme";
import { GlassCard } from "@/components/glass";
import { PresentCard } from "@/components/present-card";
import * as Haptics from "expo-haptics";
import { GhostButton } from "@/components/ghost";
import { GhostText } from "@/components/themed-text";
import { Text } from "@/components/text";
import type { CardAction, RichCard } from "@/lib/cards";
import type { GhostConfig } from "@/lib/ghostApi";
import { checkCardItem, decideIdea, editDraft, resolveApproval, resolveCard, respondCard } from "@/lib/ghostApi";
import { DraftCard } from "@/components/draft-card";

function CardShell({ title, body, children }: { title: string; body?: string; children?: React.ReactNode }) {
  return (
    <GlassCard style={styles.card} accessibilityRole="summary">
      <GhostText type="headline" style={styles.title}>{title}</GhostText>
      {body ? <GhostText type="body" style={styles.body}>{body}</GhostText> : null}
      {children}
    </GlassCard>
  );
}

/**
 * What the owner chose on a card is remembered by the Pod, or the card comes
 * back from the next fetch (every time the app opens) as if nothing had been
 * done. Fire and forget: the card is already put away on this phone, and the
 * Pod's copy only needs to catch up.
 */
function remember(config: GhostConfig, card: RichCard, actionId: string) {
  void resolveCard(config, card.id, actionId);
}

function isDestructive(a: CardAction): boolean {
  return a.style === "destructive" || /deny|reject|dismiss|cancel/i.test(a.id) || /deny|reject|dismiss|cancel/i.test(a.label);
}

function ActionRow({ card, config, onDone }: { card: RichCard; config: GhostConfig; onDone: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!card.actions || card.actions.length === 0) return null;
  return (
    <View style={styles.actionsWrap}>
      <View style={styles.actions}>
        {card.actions.map((a, i, all) => {
          const destructive = isDestructive(a);
          // One action glows: the first one that goes ahead. The rest are glass.
          const lead = !destructive && all.findIndex((x) => !isDestructive(x)) === i;
          return (
            <GhostButton
              key={a.id}
              size="sm"
              title={busy ? "Working…" : a.label}
              variant={destructive ? "danger" : lead ? "primary" : "secondary"}
              disabled={busy}
              onPress={() => {
                // A proposal is decided by identity: Ghost mints and records the
                // permission decision at approval time, so the card never
                // carries a perishable authorization token.
                const ideaId = typeof card.data?.idea_id === "string" ? card.data.idea_id : "";
                setBusy(true);
                setError(null);
                if (ideaId) {
                  decideIdea(config, ideaId, destructive ? "dismiss" : "approve")
                    .then((r) => {
                      setBusy(false);
                      // The Pod puts away the proposal's cards when it decides.
                      // A suggestion that is no longer answerable has nothing
                      // left to offer. Anything else (no signal, it could not
                      // be applied) leaves the buttons, with the reason.
                      if (!r.ok && !r.gone) {
                        setError(r.error ?? "That didn't go through. Try again.");
                        return;
                      }
                      remember(config, card, a.id);
                      onDone(card.id);
                    });
                  return;
                }
                const reqId = a.request_id || card.request_id;
                if (!reqId) {
                  setBusy(false);
                  remember(config, card, a.id);
                  onDone(card.id);
                  return;
                }
                resolveApproval(config, reqId, destructive ? "deny" : "allow_once")
                  .then((r) => {
                    setBusy(false);
                    // Clear the card only when the runtime actually took the
                    // answer. Clearing it on a failure would show the owner a
                    // green light for an approval that never landed.
                    if (r.ok) {
                      remember(config, card, a.id);
                      onDone(card.id);
                    } else {
                      setError(r.error ?? "That didn't go through. Try again.");
                    }
                  })
                  .catch(() => {
                    setBusy(false);
                    setError("Couldn't reach Ghost. Try again.");
                  });
              }}
            />
          );
        })}
      </View>
      {error ? <GhostText type="footnote" style={styles.error} accessibilityLiveRegion="polite">{error}</GhostText> : null}
    </View>
  );
}

/**
 * Taps on a card that carries only choices (a reply, a dismissal, or an act the
 * Pod carries out). The card answers at once, so the tap feels instant, and the
 * Pod's copy wins when it replies: a Snooze that failed puts the buttons back
 * with the reason instead of leaving a card that looks done and is not.
 */
function useCardChoice(
  card: RichCard,
  config: GhostConfig,
  onReply?: (text: string) => void,
  onResolved?: (card: RichCard) => void,
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const act = useCallback(async (a: CardAction) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    Haptics.selectionAsync().catch(() => {});
    const label = a.kind === "dismiss" ? "Dismissed" : a.label;
    onResolved?.({ ...card, resolved: { action_id: a.id, label } });
    // A reply is the owner's own message: it goes whatever the Pod says about the card.
    if (a.kind === "reply" && a.text) onReply?.(a.text);
    const r = await resolveCard(config, card.id, a.id);
    if (r.card) onResolved?.(r.card);
    else if (!r.ok) onResolved?.(card); // never reached the Pod: put the buttons back
    if (alive.current) {
      if (!r.ok && !r.card?.resolved && a.kind !== "reply") setError(r.error ?? null);
      setBusy(false);
    }
  }, [busy, card, config, onReply, onResolved]);
  return { busy, error, act };
}

/**
 * A presented card (a question, the morning digest) with its choices wired up.
 * Answers go to the Pod first and count only when it takes them: the card is
 * put away with the Pod's copy, and the answer then reaches Ghost (straight to
 * the turn that asked, or as the owner's next message). A refused answer keeps
 * the card open with the reason. Ticks on a list ticked as you go are kept by
 * the Pod one by one, and a tick it did not keep is undone on screen.
 */
function PresentHost({
  card,
  config,
  onReply,
  onResolved,
}: {
  card: RichCard;
  config: GhostConfig;
  onReply?: (text: string) => void;
  onResolved?: (card: RichCard) => void;
}) {
  const { busy, error, act } = useCardChoice(card, config, onReply, onResolved);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = useCallback(async (answers: Record<string, unknown>) => {
    if (sending) return;
    setSending(true);
    setProblem(null);
    Haptics.selectionAsync().catch(() => {});
    const r = await respondCard(config, card.id, answers);
    setSending(false);
    if (r.card) onResolved?.(r.card);
    if (!r.ok) {
      if (r.error) setProblem(r.error);
      return;
    }
    if (r.deliver === "message" && r.text) onReply?.(r.text);
  }, [sending, config, card.id, onResolved, onReply]);
  const check = useCallback(async (key: string, item: string, done: boolean) => {
    const r = await checkCardItem(config, card.id, key, item, done);
    // The Pod's copy wins either way: on a failure it puts the tick back.
    if (r.card) onResolved?.(r.card);
    else if (!r.ok) onResolved?.({ ...card });
    if (!r.ok && r.error) setProblem(r.error);
  }, [config, card, onResolved]);
  return (
    <PresentCard
      card={card}
      busy={busy || sending}
      error={problem ?? error}
      onAction={act}
      onSubmit={(a) => void submit(a)}
      onCheck={(k, i, d) => void check(k, i, d)}
    />
  );
}

/**
 * A draft: edits are saved to the Pod (which checks them), Send asks the Pod to
 * carry it out, and the card shows what the Pod says happened. Nothing is
 * marked sent on the phone's word.
 */
function DraftHost({ card, config, onResolved }: { card: RichCard; config: GhostConfig; onResolved?: (card: RichCard) => void }) {
  const [busy, setBusy] = useState<"send" | "save" | "discard" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const resolve = async (actionId: "send" | "discard") => {
    setBusy(actionId);
    setError(null);
    const r = await resolveCard(config, card.id, actionId);
    if (r.card) onResolved?.(r.card);
    if (!alive.current) return;
    setBusy(null);
    if (!r.ok && r.error) setError(r.error);
    else if (r.ok && actionId === "send") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };
  const edit = async (fields: Record<string, string>) => {
    setBusy("save");
    setError(null);
    const r = await editDraft(config, card.id, fields);
    if (!alive.current) return false;
    setBusy(null);
    if (r.card) onResolved?.(r.card);
    if (!r.ok) {
      setError(r.error ?? "That change wasn't saved.");
      return false;
    }
    return true;
  };
  return (
    <DraftCard
      card={card}
      busy={busy}
      error={error}
      onSend={() => void resolve("send")}
      onDiscard={() => void resolve("discard")}
      onEdit={edit}
    />
  );
}

/**
 * A reminder that went off. Its words are already in the conversation above, so
 * the card is only what can be done about it (Done, a snooze); once chosen it is
 * one quiet line saying what was done ("Snoozed until 3:14 PM").
 */
function ReminderHost({
  card,
  config,
  onResolved,
}: {
  card: RichCard;
  config: GhostConfig;
  onResolved?: (card: RichCard) => void;
}) {
  const { busy, error, act } = useCardChoice(card, config, undefined, onResolved);
  if (card.resolved) {
    return (
      <View style={styles.receipt} accessible accessibilityLabel={`${card.title}. ${card.resolved.label}`}>
        <CircleCheck size={15} color={Ghost.status.success} strokeWidth={1.9} />
        <Text style={styles.receiptText} numberOfLines={1}>{card.resolved.label}</Text>
      </View>
    );
  }
  return (
    <View style={styles.actionsWrap}>
      <View style={styles.actions}>
        {(card.actions ?? []).map((a) => (
          <GhostButton
            key={a.id}
            title={a.label}
            size="sm"
            variant={a.style === "primary" ? "primary" : "secondary"}
            disabled={busy}
            onPress={() => void act(a)}
          />
        ))}
      </View>
      {error ? <GhostText type="footnote" style={styles.error} accessibilityLiveRegion="polite">{error}</GhostText> : null}
    </View>
  );
}

export function RichCardView({
  card,
  config,
  onDone,
  onReply,
  onResolved,
}: {
  card: RichCard;
  config: GhostConfig;
  onDone: (id: string) => void;
  onReply?: (text: string) => void;
  onResolved?: (card: RichCard) => void;
}) {
  switch (card.kind) {
    case "present":
    case "digest":
    case "question":
      return <PresentHost card={card} config={config} onReply={onReply} onResolved={onResolved} />;
    case "draft":
      return <DraftHost card={card} config={config} onResolved={onResolved} />;
    case "reminder":
      return <ReminderHost card={card} config={config} onResolved={onResolved} />;
    case "suggestion":
      return (
        <CardShell title={card.title} body={card.body}>
          <ActionRow card={card} config={config} onDone={onDone} />
        </CardShell>
      );
    case "goal_update": {
      const verb = typeof card.data?.verb === "string" ? card.data.verb : "";
      return (
        <CardShell title={card.title} body={card.body}>
          {verb ? <GhostText type="footnote" style={styles.meta}>Goal {verb}</GhostText> : null}
          <View style={styles.actions}>
            <GhostButton title="Dismiss" size="sm" variant="secondary" onPress={() => { remember(config, card, "dismiss"); onDone(card.id); }} />
          </View>
        </CardShell>
      );
    }
    case "cart": {
      const items = Array.isArray(card.data?.items) ? card.data.items : [];
      return (
        <CardShell title={card.title} body={card.body}>
          {items.length > 0 ? (
            <View style={styles.items}>
              {items.map((it, i) => {
                const r = (it && typeof it === "object" ? it : { name: it }) as Record<string, unknown>;
                return (
                  <View key={i} style={[styles.itemRow, i < items.length - 1 && styles.itemLine]}>
                    <Text style={styles.itemName} numberOfLines={2}>{String(r.name ?? "")}</Text>
                    {r.price ? <Text style={styles.itemPrice}>{String(r.price)}</Text> : null}
                  </View>
                );
              })}
            </View>
          ) : null}
          <ActionRow card={card} config={config} onDone={onDone} />
        </CardShell>
      );
    }
    case "memory_receipt": {
      const quote = typeof card.data?.quote === "string" ? card.data.quote : "";
      const confidence = typeof card.data?.confidence === "number" ? card.data.confidence : 0;
      const source = typeof card.data?.source === "string" ? card.data.source : "";
      const learned = typeof card.data?.learned === "string" ? card.data.learned : "";
      const status = typeof card.data?.status === "string" ? card.data.status : "current";
      const bits: string[] = [];
      if (confidence > 0) bits.push(`${Math.round(confidence * 100)}% confident`);
      if (learned) bits.push(`learned ${learned}`);
      if (source) bits.push(`from message ${source}`);
      return (
        <CardShell title={card.title}>
          {quote ? (
            <View style={styles.quoteBox}>
              <GhostText type="body" style={styles.quote}>{quote}</GhostText>
            </View>
          ) : (
            <GhostText type="footnote" style={styles.meta}>Saved before Ghost kept quotes, so there are no exact words on file.</GhostText>
          )}
          {bits.length ? <GhostText type="footnote" style={styles.meta}>{bits.join("  ·  ")}</GhostText> : null}
          {status === "replaced" ? <GhostText type="footnote" style={styles.meta}>Replaced by a newer memory.</GhostText> : null}
          {status === "forgotten" ? <GhostText type="footnote" style={styles.meta}>Forgotten — this won’t be used again.</GhostText> : null}
        </CardShell>
      );
    }
    case "browser_recovery":
      return (
        <CardShell title={card.title} body={card.body}>
          <GhostText type="footnote" style={styles.meta}>Nothing was lost — ask again and I&apos;ll retry.</GhostText>
        </CardShell>
      );
    case "browser_view":
      return (
        <CardShell title={card.title} body={card.body ?? "Ghost is showing you its browser."}>
          <ActionRow card={card} config={config} onDone={onDone} />
        </CardShell>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  card: {},
  title: {
    fontFamily: Fonts.voice,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "400",
    letterSpacing: -0.5,
    color: Ghost.text.primary,
  },
  body: {
    fontSize: 15.5,
    lineHeight: 23,
    fontWeight: "300",
    color: "rgba(255,255,255,0.78)",
  },
  meta: {
    color: Ghost.text.tertiary,
  },
  items: {
    marginTop: Space.xs,
    borderRadius: 18,
    borderCurve: "continuous",
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
    overflow: "hidden",
  },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  itemLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Ghost.border.subtle },
  itemName: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: "400", color: Ghost.text.primary },
  itemPrice: { fontSize: 14.5, fontWeight: "500", color: Ghost.text.secondary, fontVariant: ["tabular-nums"] },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: Space.sm,
    flexWrap: "wrap",
  },
  actionsWrap: { gap: 6 },
  error: { color: Ghost.status.error },
  receipt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 32,
    marginTop: Space.xs,
  },
  receiptText: { flex: 1, fontSize: 13.5, color: Ghost.text.tertiary },
  quoteBox: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 18,
    borderCurve: "continuous",
    paddingVertical: Space.md,
    paddingHorizontal: Space.lg,
    marginTop: 2,
  },
  quote: {
    fontSize: 15.5,
    lineHeight: 23,
    fontWeight: "300",
    color: Ghost.text.primary,
    fontStyle: "italic",
  },
});
