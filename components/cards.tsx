import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Fonts, Ghost, Space } from "@/constants/theme";
import { GlassCard } from "@/components/glass";
import { GhostButton } from "@/components/ghost";
import { GhostText } from "@/components/themed-text";
import type { RichCard } from "@/lib/cards";
import type { GhostConfig } from "@/lib/ghostApi";
import { decideIdea, resolveApproval } from "@/lib/ghostApi";

function CardShell({ title, body, children }: { title: string; body?: string; children?: React.ReactNode }) {
  return (
    <GlassCard style={styles.card} accessibilityRole="summary">
      <GhostText type="headline" style={styles.title}>{title}</GhostText>
      {body ? <GhostText type="body" style={styles.body}>{body}</GhostText> : null}
      {children}
    </GlassCard>
  );
}

function ActionRow({ card, config, onDone }: { card: RichCard; config: GhostConfig; onDone: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  if (!card.actions || card.actions.length === 0) return null;
  return (
    <View style={styles.actions}>
      {card.actions.map((a) => {
        const destructive = a.style === "destructive" || /deny|reject|dismiss|cancel/i.test(a.id) || /deny|reject|dismiss|cancel/i.test(a.label);
        return (
          <GhostButton
            key={a.id}
            title={busy ? "Working…" : a.label}
            variant={destructive ? "danger" : "primary"}
            disabled={busy}
            onPress={() => {
              // A proposal is decided by identity: Ghost mints and records the
              // permission decision at approval time, so the card never
              // carries a perishable authorization token.
              const ideaId = typeof card.data?.idea_id === "string" ? card.data.idea_id : "";
              setBusy(true);
              if (ideaId) {
                decideIdea(config, ideaId, destructive ? "dismiss" : "approve")
                  .catch(() => null)
                  .finally(() => {
                    setBusy(false);
                    onDone(card.id);
                  });
                return;
              }
              const reqId = a.request_id || card.request_id;
              if (!reqId) {
                setBusy(false);
                onDone(card.id);
                return;
              }
              resolveApproval(config, reqId, destructive ? "deny" : "allow_once")
                .then((r) => {
                  setBusy(false);
                  // Clear the card only when the runtime actually took the
                  // answer. Clearing it on a failure would show the owner a
                  // green light for an approval that never landed.
                  if (r.ok) onDone(card.id);
                })
                .catch(() => {
                  setBusy(false);
                });
            }}
          />
        );
      })}
    </View>
  );
}

export function RichCardView({ card, config, onDone }: { card: RichCard; config: GhostConfig; onDone: (id: string) => void }) {
  switch (card.kind) {
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
            <GhostButton title="Dismiss" variant="ghost" onPress={() => onDone(card.id)} />
          </View>
        </CardShell>
      );
    }
    case "cart": {
      const items = Array.isArray(card.data?.items) ? card.data.items : [];
      return (
        <CardShell title={card.title} body={card.body}>
          {items.map((it, i) => {
            const r = it as Record<string, unknown>;
            return (
              <GhostText key={i} type="body" style={styles.item}>
                • {String(r?.name ?? r ?? "")}{r?.price ? `: ${String(r.price)}` : ""}
              </GhostText>
            );
          })}
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
  card: {
    marginVertical: Space.sm,
  },
  title: {
    fontFamily: Fonts.voice,
    fontSize: 25,
    lineHeight: 28,
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
  item: {
    color: Ghost.text.primary,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: Space.sm,
    flexWrap: "wrap",
  },
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
