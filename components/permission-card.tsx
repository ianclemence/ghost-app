import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, { Easing, FadeInUp, useReducedMotion } from "react-native-reanimated";
import { Ghost, Space } from "@/constants/theme";
import { isValidGrant, resolveApproval, type GhostConfig, type PendingApproval } from "@/lib/ghostApi";

const CARD_ENTER = FadeInUp.duration(250).easing(Easing.bezier(0.23, 1, 0.32, 1));

export function PermissionCard({ item, config, onResolved }: { item: PendingApproval; config: GhostConfig; onResolved: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const card = item.card;
  const title = card?.title ?? "Ghost needs approval";
  const desc = card?.description ?? "Ghost is waiting for your approval to continue.";
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
      style={styles.card}
      accessibilityLabel="Permission request from Ghost"
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.kicker}>Needs your approval</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.desc}>{desc}</Text>
      <View style={styles.row}>
        {actions.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={[styles.btn, a.style === "danger" && styles.btnDanger, busy === a.id && styles.btnBusy]}
              onPress={() => void act(a.id)}
              disabled={busy !== null}
              accessibilityLabel={a.label}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy !== null, busy: busy === a.id }}
            >
            <Text style={[styles.btnText, a.style === "danger" && styles.btnTextDanger]}>
              {busy === a.id ? "Working" : a.label}
            </Text>
          </TouchableOpacity>
        ))}
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
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Space.sm,
    marginTop: Space.sm,
  },
  btn: {
    borderWidth: 1,
    borderColor: Ghost.border.default,
    borderRadius: 999,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    minHeight: 44,
    justifyContent: "center",
  },
  btnDanger: {
    borderColor: Ghost.status.error,
  },
  btnBusy: {
    opacity: 0.6,
  },
  btnText: {
    fontSize: 14,
    fontWeight: "600",
    color: Ghost.text.primary,
  },
  btnTextDanger: {
    color: Ghost.status.error,
  },
  error: {
    fontSize: 13,
    color: Ghost.status.error,
  },
});
