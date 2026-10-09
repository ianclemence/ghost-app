import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { ChevronLeft, ChevronRight, Repeat, Zap } from "lucide-react-native";
import { Text } from "@/components/text";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { EdgeScrollView } from "@/components/scroll-edge";
import { Chart } from "@/components/card-views";
import { Empty, lifeStyles, Pill } from "@/components/life-ui";
import { alpha, Aurora, Fonts, Ghost, Space } from "@/constants/theme";
import { fetchMoney, removeMoney, setRecurringActive, type MoneyView, type Recurring } from "@/lib/ghostApi";
import { formatMoney, minorDigits, monthName, shiftMonth } from "@/lib/life";
import { showDialog } from "@/lib/dialog";
import { useGhostStore } from "@/lib/store";

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * The owner's money, as they have told Ghost about it (no bank connection):
 * one month at a glance (what went out, against the month before, week by week,
 * by kind of thing), what is still to come, the subscriptions and bills it
 * keeps an eye on, and every entry, each removable. Amounts in another currency
 * are kept beside, never converted.
 */
export default function MoneyScreen() {
  const config = useGhostStore((s) => s.config);
  const [month, setMonth] = useState(thisMonth());
  const [view, setView] = useState<MoneyView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!config) return;
    setLoading(true);
    const r = await fetchMoney(config, month);
    setLoading(false);
    if (r.ok) {
      setView(r.data);
      setError(null);
    } else setError(r.error);
  }, [config, month]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const s = view?.summary;
  const cur = s?.currency ?? "";
  const nothing = view && !cur && view.recurring.length === 0;
  const delta = s && s.prev_spent > 0 ? Math.round(((s.spent - s.prev_spent) / s.prev_spent) * 100) : null;
  const top = (s?.by_category ?? []).slice(0, 6);
  const topMax = Math.max(1, ...top.map((c) => c.amount));
  const major = (minor: number) => minor / 10 ** minorDigits(cur || "KES");

  const remove = (id: string, what: string) => {
    if (!config) return;
    showDialog(`Remove ${what}?`, "It leaves your records on the Pod.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        const r = await removeMoney(config, id);
        if (!r.ok) return setError(r.error);
        await load();
      } },
    ]);
  };
  const toggle = async (r: Recurring) => {
    if (!config) return;
    Haptics.selectionAsync().catch(() => {});
    const res = await setRecurringActive(config, r.id, !r.active);
    if (!res.ok) return setError(res.error);
    await load();
  };

  return (
    <View style={styles.container}>
      <ScreenBackground variant="calm" />
      <ScreenHeader title="Finances" subtitle="What you spend, earn, and what's due" />
      {!config ? (
        <Empty title="Not connected." text="Your money records live on your Pod. Connect one to see them." />
      ) : (
        <EdgeScrollView contentContainerStyle={styles.content}>
          <View style={styles.monthBar}>
            <Pressable onPress={() => setMonth((m) => shiftMonth(m, -1))} hitSlop={10} style={styles.round} accessibilityRole="button" accessibilityLabel="Previous month">
              <ChevronLeft size={18} color={Ghost.text.primary} />
            </Pressable>
            <Text style={styles.month} accessibilityRole="header">{monthName(month)}</Text>
            <Pressable
              onPress={() => setMonth((m) => shiftMonth(m, 1))}
              disabled={month >= thisMonth()}
              hitSlop={10}
              style={[styles.round, month >= thisMonth() && { opacity: 0.35 }]}
              accessibilityRole="button"
              accessibilityLabel="Next month"
            >
              <ChevronRight size={18} color={Ghost.text.primary} />
            </Pressable>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!view && !error ? <ActivityIndicator style={{ marginTop: Space.xxxl }} color={Ghost.text.tertiary} /> : null}
          {nothing ? (
            <Empty title="Nothing yet." text={"Tell Ghost what you spend (“450 on lunch”), send it a receipt, a subscription or a bank or M-Pesa statement, and your month appears here."} />
          ) : null}

          {s && cur ? (
            <View style={[lifeStyles.group, styles.hero, loading && { opacity: 0.6 }]}>
              <Text style={styles.micro}>Spent</Text>
              <Text style={styles.big} adjustsFontSizeToFit numberOfLines={1}>{formatMoney(s.spent, cur)}</Text>
              <View style={styles.heroLine}>
                {delta !== null ? <Pill text={`${delta > 0 ? "+" : ""}${delta}% on ${monthName(shiftMonth(month, -1))}`} tone={delta > 10 ? "warn" : delta < -5 ? "good" : "neutral"} /> : null}
                {s.earned > 0 ? <Text style={styles.earned}>Earned {formatMoney(s.earned, cur)}</Text> : null}
              </View>
              {s.spent > 0 ? (
                <View style={{ marginTop: Space.md }}>
                  <Chart showLatest={false} highlight={month === thisMonth() ? Math.min(4, Math.floor((new Date().getDate() - 1) / 7)) : -1} block={{ type: "chart", chart: "bar", label: "By week", unit: undefined, points: s.by_week.map((v, i) => ({ label: ["1–7", "8–14", "15–21", "22–28", "29+"][i], value: major(v) })) }} />
                </View>
              ) : null}
              {s.other_currencies ? (
                <Text style={styles.other}>Also {Object.entries(s.other_currencies).map(([c, a]) => formatMoney(a, c)).join(", ")} (kept apart, not converted)</Text>
              ) : null}
            </View>
          ) : null}

          {top.length > 0 ? (
            <>
              <Text style={lifeStyles.eyebrow}>Where it went</Text>
              <View style={[lifeStyles.group, { padding: Space.md, gap: 12 }]}>
                {top.map((c, i) => (
                  <View key={c.category} style={{ gap: 6 }}>
                    <View style={styles.catHead}>
                      <Text style={styles.catName}>{c.category.charAt(0).toUpperCase() + c.category.slice(1)}</Text>
                      <Text style={styles.catAmount}>{formatMoney(c.amount, cur)}</Text>
                    </View>
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${Math.max(3, (c.amount / topMax) * 100)}%`, backgroundColor: i === 0 ? Ghost.accent.primary : alpha(Aurora.violet, 0.55) }]} />
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {view && view.recurring.length > 0 ? (
            <>
              <Text style={lifeStyles.eyebrow}>Subscriptions and bills</Text>
              <View style={lifeStyles.group}>
                {view.recurring.map((r, i) => (
                  <Pressable
                    key={r.id}
                    onLongPress={() => remove(r.id, r.name)}
                    delayLongPress={400}
                    style={[styles.row, i > 0 && styles.rowLine, !r.active && { opacity: 0.55 }]}
                    accessibilityLabel={`${r.name}, ${formatMoney(r.amount, r.currency)} every ${r.every}${r.active ? `, next ${r.next}` : ", not tracked"}`}
                    accessibilityHint="Long press to remove"
                  >
                    <View style={[styles.tile, { backgroundColor: alpha(r.kind === "bill" ? Ghost.status.warning : Ghost.accent.primary, 0.12) }]}>
                      {r.kind === "bill" ? <Zap size={17} color={Ghost.status.warning} strokeWidth={1.8} /> : <Repeat size={17} color={Ghost.accent.primary} strokeWidth={1.8} />}
                    </View>
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{r.name}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {r.active ? `${formatMoney(r.amount, r.currency)} every ${r.every} · next ${new Date(r.next).toLocaleDateString([], { day: "numeric", month: "short" })}` : "Not tracked"}
                      </Text>
                    </View>
                    <Pressable onPress={() => void toggle(r)} hitSlop={8} style={({ pressed }) => [styles.smallBtn, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel={r.active ? `Stop tracking ${r.name}` : `Track ${r.name} again`}>
                      <Text style={styles.smallBtnText}>{r.active ? "Stop" : "Track"}</Text>
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {view && view.entries.length > 0 ? (
            <>
              <Text style={lifeStyles.eyebrow}>Entries</Text>
              <View style={lifeStyles.group}>
                {view.entries.slice(0, 60).map((e, i) => (
                  <Pressable
                    key={e.id}
                    onLongPress={() => remove(e.id, e.merchant || "this entry")}
                    delayLongPress={400}
                    style={({ pressed }) => [styles.entry, i > 0 && styles.rowLine, pressed && { backgroundColor: "rgba(255,255,255,0.03)" }]}
                    accessibilityLabel={`${e.merchant || e.category}, ${formatMoney(e.amount, e.currency)}, ${e.date}`}
                    accessibilityHint="Long press to remove"
                  >
                    <View style={styles.rowText}>
                      <Text style={styles.entryName} numberOfLines={1}>{e.merchant || e.category}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>{[e.category.charAt(0).toUpperCase() + e.category.slice(1), new Date(e.date).toLocaleDateString([], { day: "numeric", month: "short" })].join(" · ")}</Text>
                    </View>
                    <Text style={[styles.entryAmount, e.kind === "income" && { color: Ghost.status.success }]}>
                      {e.kind === "income" ? "+" : ""}{formatMoney(e.amount, e.currency)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.foot}>Long press an entry to remove it.</Text>
            </>
          ) : null}
        </EdgeScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  content: { paddingBottom: 96, paddingHorizontal: Space.lg },
  monthBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: Space.xs, marginBottom: Space.md },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: Ghost.glass.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  month: { fontFamily: Fonts.voice, fontSize: 26, lineHeight: 30, letterSpacing: -0.4, color: Ghost.text.primary },
  hero: { padding: Space.lg, gap: 4 },
  micro: { fontSize: 11.5, fontWeight: "500", letterSpacing: 1.1, textTransform: "uppercase", color: Ghost.text.tertiary },
  big: { fontFamily: Fonts.voice, fontSize: 48, lineHeight: 56, letterSpacing: -1.2, color: Ghost.text.primary },
  heroLine: { flexDirection: "row", alignItems: "center", gap: Space.md, flexWrap: "wrap" },
  earned: { fontSize: 13.5, color: Ghost.text.secondary },
  other: { fontSize: 12.5, color: Ghost.text.tertiary, marginTop: Space.sm },
  catHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  catName: { fontSize: 14.5, color: Ghost.text.primary },
  catAmount: { fontSize: 14, color: Ghost.text.secondary, fontVariant: ["tabular-nums"] },
  track: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.07)", overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingLeft: 12, paddingRight: 12, paddingVertical: 10 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Ghost.border.subtle },
  tile: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 15.5, lineHeight: 20, fontWeight: "500", color: Ghost.text.primary },
  rowSub: { fontSize: 12.5, lineHeight: 17, color: Ghost.text.tertiary },
  smallBtn: { height: 32, paddingHorizontal: 13, borderRadius: 16, justifyContent: "center", backgroundColor: Ghost.glass.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  smallBtnText: { fontSize: 13, fontWeight: "500", color: Ghost.text.secondary },
  entry: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 9 },
  entryName: { fontSize: 15, lineHeight: 20, color: Ghost.text.primary },
  entryAmount: { fontSize: 15, fontVariant: ["tabular-nums"], color: Ghost.text.primary },
  foot: { fontSize: 12, color: Ghost.text.tertiary, textAlign: "center", marginTop: Space.sm },
  error: { fontSize: 13.5, color: Ghost.status.error, textAlign: "center" },
});
