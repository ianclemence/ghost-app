import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ghost, Space, Type } from "@/constants/theme";
import { GhostButton } from "@/components/ghost";
import { GhostText } from "@/components/themed-text";
import type { RichCard } from "@/lib/cards";
import type { GhostConfig } from "@/lib/ghostApi";
import { resolveApproval } from "@/lib/ghostApi";

function CardShell({ title, body, children }: { title: string; body?: string; children?: React.ReactNode }) {
  return (
    <View style={styles.card} accessibilityRole="summary">
      <GhostText type="headline" style={styles.title}>{title}</GhostText>
      {body ? <GhostText type="body" style={styles.body}>{body}</GhostText> : null}
      {children}
    </View>
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
              const reqId = a.request_id || card.request_id;
              if (!reqId) {
                onDone(card.id);
                return;
              }
              setBusy(true);
              const grant = destructive ? "deny" : "allow_once";
              resolveApproval(config, reqId, grant)
                .catch(() => null)
                .finally(() => {
                  setBusy(false);
                  onDone(card.id);
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
    backgroundColor: Ghost.bg.raised,
    borderRadius: 14,
    padding: Space.lg,
    gap: 6,
    marginVertical: Space.sm,
  },
  title: {
    ...Type.headline,
    color: Ghost.text.primary,
  },
  body: {
    color: Ghost.text.secondary,
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
    marginTop: 6,
    flexWrap: "wrap",
  },
});
