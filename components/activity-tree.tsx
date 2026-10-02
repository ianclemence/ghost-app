import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { ChevronDown } from "lucide-react-native";
import { Ghost, Space } from "@/constants/theme";
import { activityTone, groupActivityByDay, type ActivityTone } from "@/lib/activity";
import type { ActivityChip } from "@/lib/ghostApi";
import { clockTime, dayLabel } from "@/lib/thread";

// Outcome words from the runtime's own state, not the model's account.
const STATE_WORD: Record<string, string> = {
  done: "Done",
  completed: "Done",
  succeeded: "Done",
  verified: "Verified",
  changed: "Changed",
  unchanged: "No change",
  waiting: "Waiting on you",
  pending: "Waiting on you",
  denied: "You said no",
  failed: "Didn't work",
  error: "Didn't work",
  cancelled: "Stopped",
};

const LIGHT: Record<ActivityTone, string> = {
  bad: Ghost.status.error,
  attention: Ghost.ember,
  ok: Ghost.status.success,
  quiet: "rgba(255,255,255,0.32)",
};

/**
 * What Ghost did, as a tree. Each day is a branch with a count, and what Ghost
 * did that day hangs from it: a node coloured by the outcome the runtime
 * recorded, the time, what happened, and why. Days can fold away. The same
 * tree as the web console.
 */
export function ActivityTree({
  items,
  foldable = false,
  limit,
}: {
  items: ActivityChip[];
  /** Days fold with their caret (the Activity screen). Off where the tree is a glance. */
  foldable?: boolean;
  /** Show only the newest this many, however many days that spans. */
  limit?: number;
}) {
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const shown = limit ? [...items].sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0)).slice(0, limit) : items;
  const days = groupActivityByDay(shown, dayLabel);
  const toggle = (label: string) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  return (
    <View>
      {days.map((d) => {
        const closed = foldable && folded.has(d.label);
        return (
          <View key={d.label} style={styles.branch}>
            <Pressable
              onPress={foldable ? () => toggle(d.label) : undefined}
              disabled={!foldable}
              style={styles.dayRow}
              accessibilityRole={foldable ? "button" : "header"}
              accessibilityLabel={`${d.label}, ${d.items.length} ${d.items.length === 1 ? "thing" : "things"}`}
              accessibilityState={foldable ? { expanded: !closed } : undefined}
            >
              {foldable ? (
                <View style={{ transform: [{ rotate: closed ? "-90deg" : "0deg" }] }}>
                  <ChevronDown size={16} color={Ghost.text.tertiary} strokeWidth={1.8} />
                </View>
              ) : null}
              <Text style={styles.day}>{d.label}</Text>
              <View style={styles.count}>
                <Text style={styles.countText}>{d.items.length}</Text>
              </View>
            </Pressable>
            {closed ? null : d.items.map((it, i) => <Leaf key={it.id} item={it} last={i === d.items.length - 1} />)}
          </View>
        );
      })}
    </View>
  );
}

function Leaf({ item, last }: { item: ActivityChip; last: boolean }) {
  const t = Date.parse(item.timestamp);
  const tone = activityTone(item.state);
  const mapped = STATE_WORD[item.state?.toLowerCase()] ?? null;
  // Never say the same thing twice ("No change" / "No change").
  const word = mapped && mapped.toLowerCase() !== (item.summary ?? "").trim().toLowerCase() ? mapped : null;
  return (
    <View
      style={styles.leaf}
      accessible
      accessibilityLabel={[item.title, word, item.summary, item.why].filter(Boolean).join(". ")}
    >
      <View style={styles.rail} pointerEvents="none">
        <View style={[styles.trunk, last && styles.trunkEnd]} />
        <View style={[styles.node, { backgroundColor: LIGHT[tone], boxShadow: tone === "attention" ? "0 0 8px rgba(255,169,40,0.7)" : undefined }]} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.time}>{Number.isFinite(t) ? clockTime(t) : ""}</Text>
        </View>
        {item.summary ? <Text style={styles.summary}>{item.summary}</Text> : null}
        {word ? <Text style={[styles.state, { color: LIGHT[tone] === LIGHT.quiet ? Ghost.text.tertiary : LIGHT[tone] }]}>{word}</Text> : null}
        {item.why ? <Text style={styles.why}>{item.why}</Text> : null}
      </View>
    </View>
  );
}

const RAIL = 28;

const styles = StyleSheet.create({
  branch: { marginBottom: Space.sm },
  dayRow: { flexDirection: "row", alignItems: "center", gap: Space.sm, minHeight: 40 },
  day: { fontSize: 15, fontWeight: "500", color: Ghost.text.primary, letterSpacing: -0.15 },
  count: {
    minWidth: 22,
    height: 20,
    paddingHorizontal: 7,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Ghost.glass.fillStrong,
  },
  countText: { fontSize: 11.5, fontWeight: "500", color: Ghost.text.secondary, fontVariant: ["tabular-nums"] },
  leaf: { flexDirection: "row", paddingBottom: Space.lg },
  rail: { width: RAIL, alignItems: "center" },
  // The trunk runs the leaf's full height so the days read as one branch; the
  // last leaf stops at its own node.
  trunk: { position: "absolute", top: 0, bottom: -Space.lg, width: StyleSheet.hairlineWidth * 2, backgroundColor: "rgba(255,255,255,0.14)" },
  trunkEnd: { bottom: undefined, height: 9 },
  node: { marginTop: 5, width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: "#000" },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: Space.md },
  title: { flex: 1, fontSize: 15.5, lineHeight: 21, fontWeight: "500", color: Ghost.text.primary, letterSpacing: -0.15 },
  time: { fontSize: 12.5, lineHeight: 21, color: Ghost.text.tertiary, fontVariant: ["tabular-nums"] },
  summary: { fontSize: 14, lineHeight: 20, fontWeight: "300", color: Ghost.text.secondary },
  state: { fontSize: 12.5, lineHeight: 18, fontWeight: "500" },
  why: { fontSize: 13, lineHeight: 18, fontWeight: "300", color: Ghost.text.tertiary },
});
