import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeInUp, useReducedMotion } from "react-native-reanimated";
import { Ghost, Space } from "@/constants/theme";
import { GhostButton } from "@/components/ghost";
import { isValidGrant, resolveApproval, type GhostConfig, type PendingApproval } from "@/lib/ghostApi";
import { riskCaution, riskNote } from "@/lib/permission-risk";

const CARD_ENTER = FadeInUp.duration(250).easing(Easing.bezier(0.23, 1, 0.32, 1));

export function PermissionCard({ item, config, onResolved }: { item: PendingApproval; config: GhostConfig; onResolved: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const card = item.card;
  const title = card?.title ?? "Ghost needs approval";
  const desc = card?.description ?? "Ghost is waiting for your approval to continue.";
  const note = riskNote(card?.risk);
  const caution = riskCaution(card?.risk);
  const offersAlways = (card?.actions ?? []).some((a) => /always/i.test(a.id));
  const actions = card?.actions ?? [
    { id: "allow_once", label: "Allow once", style: "primary" },
    { id: "deny", label: "Deny", style: "danger" },
  ];
  const act = async (id: string) => {
    if (!isValidGrant(id)) return;
    setBusy(id);
    setError(null);
    const r = await resolveApproval(config, item.id, id);
    setBusy(null);
    if (r.ok) onResolved();
    else setError(r.error ?? "That approval is no longer answerable.");
  };
  return (
    <Animated.View
      entering={reduceMotion ? undefined : CARD_ENTER}
      style={[styles.card, caution ? styles.cardCaution : null]}
      accessibilityLabel="Permission request from Ghost"
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.kicker}>{caution ? "Needs your approval. Review carefully" : "Needs your approval"}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.desc}>{desc}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      {caution ? <Text style={styles.caution}>{caution}</Text> : null}
      {offersAlways ? (
        <Text style={styles.note}>“Always” means Ghost won’t ask again for this.</Text>
      ) : null}
      <View style={styles.row}>
        {actions.map((a) => {
          const destructive = a.style === "danger" || /deny|reject/i.test(a.id);
          return (
            <GhostButton
              key={a.id}
              title={busy === a.id ? "Working" : a.label}
              variant={destructive ? "danger" : "primary"}
              disabled={busy !== null}
              loading={busy === a.id}
              onPress={() => void act(a.id)}
            />
          );
        })}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: Ghost.border.default,
    borderRadius: 14,
    borderCurve: "continuous",
    backgroundColor: Ghost.bg.raised,
    padding: Space.md,
    gap: Space.xs,
    marginVertical: Space.xs,
  },
  cardCaution: {
    borderColor: Ghost.status.warning,
  },
  kicker: {
    fontSize: 12,
    color: Ghost.text.tertiary,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: Ghost.text.primary,
  },
  desc: {
    fontSize: 14,
    lineHeight: 20,
    color: Ghost.text.secondary,
  },
  note: {
    fontSize: 13,
    lineHeight: 19,
    color: Ghost.text.tertiary,
    fontStyle: "italic",
  },
  caution: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    color: Ghost.status.warning,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Space.sm,
    marginTop: Space.sm,
  },
  error: {
    fontSize: 13,
    color: Ghost.status.error,
  },
});
