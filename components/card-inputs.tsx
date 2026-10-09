import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, { runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock, X } from "lucide-react-native";
import { Text } from "@/components/text";
import { GhostButton, GhostSheet } from "@/components/ghost";
import { alpha, Fonts, Ghost, Inter, Space } from "@/constants/theme";
import type { InputBlock } from "@/lib/blocks";
import { dateKey, formatValue, humanValue, MONTH_NAMES, monthGrid, parseLocal, snap, type AnswerValue } from "@/lib/cardAnswers";

/**
 * The ways a card asks. Each control is the owner's answer, held by the card
 * until they send it; nothing here talks to the Pod. Every control is at least
 * 44 tall, says what it is to a screen reader, and shows the answer once the
 * card is answered (read-only, from what the Pod kept).
 */

type Props<B extends InputBlock> = {
  block: B;
  value: AnswerValue;
  onChange: (v: AnswerValue) => void;
  disabled?: boolean;
};

export function CardInput(props: Props<InputBlock>) {
  const { block } = props;
  switch (block.type) {
    case "choice":
      return <ChoiceInput {...(props as Props<Extract<InputBlock, { type: "choice" }>>)} />;
    case "datetime":
      return <DateTimeInput {...(props as Props<Extract<InputBlock, { type: "datetime" }>>)} />;
    case "slider":
      return <SliderInput {...(props as Props<Extract<InputBlock, { type: "slider" }>>)} />;
    case "field":
      return <FieldInput {...(props as Props<Extract<InputBlock, { type: "field" }>>)} />;
    case "checklist":
      return <ChecklistInput {...(props as Props<Extract<InputBlock, { type: "checklist" }>>)} />;
  }
}

function Label({ text, optional }: { text?: string; optional?: boolean }) {
  if (!text) return null;
  return (
    <Text style={styles.label}>
      {text}
      {optional ? <Text style={styles.optional}>{"  ·  Optional"}</Text> : null}
    </Text>
  );
}

/* ── choice: one tap each ──────────────────────────────────────────── */

function ChoiceInput({ block, value, onChange, disabled }: Props<Extract<InputBlock, { type: "choice" }>>) {
  const picked = new Set(Array.isArray(value) ? value : typeof value === "string" ? [value] : []);
  const toggle = (id: string) => {
    if (disabled) return;
    Haptics.selectionAsync().catch(() => {});
    if (block.multiple) {
      const next = new Set(picked);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onChange(block.options.filter((o) => next.has(o.id)).map((o) => o.id));
    } else {
      onChange(id);
    }
  };
  return (
    <View>
      <Label text={block.label} />
      <View style={styles.group} accessibilityRole={block.multiple ? undefined : "radiogroup"}>
        {block.options.map((o, i) => {
          const on = picked.has(o.id);
          return (
            <Pressable
              key={o.id}
              onPress={() => toggle(o.id)}
              disabled={disabled}
              style={({ pressed }) => [styles.option, i > 0 && styles.rowLine, on && styles.optionOn, pressed && !disabled && styles.pressed]}
              accessibilityRole={block.multiple ? "checkbox" : "radio"}
              accessibilityState={{ checked: on, disabled }}
              accessibilityLabel={[o.label, o.detail].filter(Boolean).join(", ")}
            >
              <View style={[block.multiple ? styles.box : styles.radio, on && styles.markOn]}>
                {on ? block.multiple ? <Check size={13} color="#0B0B10" strokeWidth={3} /> : <View style={styles.radioDot} /> : null}
              </View>
              <View style={styles.optionText}>
                <Text style={[styles.optionLabel, on && { color: Ghost.text.primary }]}>{o.label}</Text>
                {o.detail ? <Text style={styles.optionDetail}>{o.detail}</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ── datetime: a calendar and a clock in a sheet ───────────────────── */

function DateTimeInput({ block, value, onChange, disabled }: Props<Extract<InputBlock, { type: "datetime" }>>) {
  const [open, setOpen] = useState(false);
  const v = typeof value === "string" ? value : undefined;
  const shown = humanValue(block.mode, v);
  const Icon = block.mode === "time" ? Clock : CalendarDays;
  return (
    <View>
      <Label text={block.label} optional={block.optional} />
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        style={({ pressed }) => [styles.picker, pressed && !disabled && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${block.label}: ${shown || "not chosen"}`}
        accessibilityHint={disabled ? undefined : "Opens a picker"}
      >
        <Icon size={17} color={shown ? Ghost.accent.primary : Ghost.text.tertiary} strokeWidth={1.9} />
        <Text style={[styles.pickerText, !shown && styles.placeholder]}>
          {shown || (block.mode === "time" ? "Choose a time" : block.mode === "date" ? "Choose a date" : "Choose a date and time")}
        </Text>
        {disabled ? null : block.optional && shown ? (
          // Left empty again: the owner doesn't know it after all.
          <Pressable onPress={() => onChange("")} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Clear ${block.label}`}>
            <X size={16} color={Ghost.text.tertiary} strokeWidth={2} />
          </Pressable>
        ) : (
          <ChevronRight size={16} color={Ghost.text.tertiary} />
        )}
      </Pressable>
      <DateTimeSheet
        visible={open}
        mode={block.mode}
        title={block.label}
        value={v}
        earliest={block.earliest}
        onClose={() => setOpen(false)}
        onDone={(next) => { onChange(next); setOpen(false); }}
      />
    </View>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const WEEK = ["M", "T", "W", "T", "F", "S", "S"];
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Picking a day and a time without leaving the conversation: a month you can
 * page through (days before the earliest allowed are dimmed and can't be
 * picked) and the hours and minutes as chips a thumb can hit.
 */
export function DateTimeSheet({
  visible,
  mode,
  title,
  value,
  earliest,
  onClose,
  onDone,
}: {
  visible: boolean;
  mode: "date" | "time" | "datetime";
  title: string;
  value?: string;
  earliest?: string;
  onClose: () => void;
  onDone: (value: string) => void;
}) {
  const start = useMemo(() => {
    const parsed = parseLocal(value);
    if (parsed) return parsed;
    const d = new Date();
    d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
    if (mode === "datetime") d.setHours(d.getHours() + 1);
    return d;
  }, [value, mode]);
  const [day, setDay] = useState(start);
  const [month, setMonth] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const [hour, setHour] = useState(start.getHours());
  const [minute, setMinute] = useState(Math.round(start.getMinutes() / 5) * 5 % 60);
  useEffect(() => {
    if (!visible) return;
    setDay(start);
    setMonth({ y: start.getFullYear(), m: start.getMonth() });
    setHour(start.getHours());
    setMinute(Math.round(start.getMinutes() / 5) * 5 % 60);
  }, [visible, start]);
  const floor = earliest ? parseLocal(earliest) : null;
  const floorDay = floor ? dateKey(floor) : null;
  const today = dateKey(new Date());
  const grid = monthGrid(month.y, month.m);
  const step = (n: number) => setMonth(({ y, m }) => {
    const d = new Date(y, m + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const result = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
  const chosen = formatValue(mode, result);
  const tooEarly = earliest ? chosen < earliest : false;
  return (
    <GhostSheet visible={visible} onClose={onClose} title={title}>
      {mode !== "time" ? (
        <View>
          <View style={styles.monthHead}>
            <Pressable onPress={() => step(-1)} hitSlop={10} style={styles.round} accessibilityRole="button" accessibilityLabel="Previous month">
              <ChevronLeft size={18} color={Ghost.text.primary} />
            </Pressable>
            <Text style={styles.monthName} accessibilityRole="header">{MONTH_NAMES[month.m]} {month.y}</Text>
            <Pressable onPress={() => step(1)} hitSlop={10} style={styles.round} accessibilityRole="button" accessibilityLabel="Next month">
              <ChevronRight size={18} color={Ghost.text.primary} />
            </Pressable>
          </View>
          <View style={styles.week}>
            {WEEK.map((w, i) => <Text key={i} style={styles.weekDay}>{w}</Text>)}
          </View>
          {grid.map((row, r) => (
            <View key={r} style={styles.week}>
              {row.map((d, c) => {
                if (!d) return <View key={c} style={styles.dayCell} />;
                const key = dateKey(d);
                const off = floorDay !== null && key < floorDay;
                const on = key === dateKey(day);
                return (
                  <Pressable
                    key={c}
                    onPress={() => { setDay(d); Haptics.selectionAsync().catch(() => {}); }}
                    disabled={off}
                    style={styles.dayCell}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on, disabled: off }}
                    accessibilityLabel={humanValue("date", key)}
                  >
                    <View style={[styles.dayDot, on && styles.dayOn, key === today && !on && styles.dayToday]}>
                      <Text style={[styles.dayText, off && styles.dayOff, on && styles.dayTextOn]}>{d.getDate()}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      ) : null}
      {mode !== "date" ? (
        <View style={{ marginTop: mode === "datetime" ? Space.lg : 0, gap: Space.sm }}>
          <Text style={styles.label}>Hour</Text>
          <View style={styles.chips}>
            {HOURS.map((h) => (
              <Chip key={h} label={pad(h)} on={h === hour} onPress={() => setHour(h)} />
            ))}
          </View>
          <Text style={[styles.label, { marginTop: Space.xs }]}>Minute</Text>
          <View style={styles.chips}>
            {MINUTES.map((m) => (
              <Chip key={m} label={`:${pad(m)}`} on={m === minute} onPress={() => setMinute(m)} />
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.sheetFoot}>
        <Text style={[styles.sheetChosen, tooEarly && { color: Ghost.status.warning }]} numberOfLines={1}>
          {tooEarly ? "That's earlier than allowed" : humanValue(mode, chosen)}
        </Text>
        <GhostButton title="Done" size="sm" disabled={tooEarly} onPress={() => onDone(chosen)} />
      </View>
    </GhostSheet>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => { onPress(); Haptics.selectionAsync().catch(() => {}); }}
      style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

/* ── slider: an amount, dragged or tapped ──────────────────────────── */

const KNOB = 26;

function SliderInput({ block, value, onChange, disabled }: Props<Extract<InputBlock, { type: "slider" }>>) {
  const reduce = useReducedMotion();
  const v = typeof value === "number" ? value : block.number;
  const [width, setWidth] = useState(0);
  const frac = (n: number) => (n - block.min) / (block.max - block.min);
  const x = useSharedValue(0);
  const lastStep = useSharedValue(v);
  useEffect(() => {
    if (width > 0) x.set(reduce ? frac(v) * width : withTiming(frac(v) * width, { duration: 120 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, width, reduce]);
  const commit = (px: number) => {
    const next = snap(block.min + (Math.min(width, Math.max(0, px)) / Math.max(1, width)) * (block.max - block.min), block.min, block.max, block.step);
    if (next !== lastStep.get()) {
      lastStep.set(next);
      Haptics.selectionAsync().catch(() => {});
    }
    onChange(next);
  };
  const pan = Gesture.Pan()
    .enabled(!disabled && width > 0)
    .minDistance(0)
    .onBegin((e) => { x.set(Math.min(width, Math.max(0, e.x))); runOnJS(commit)(e.x); })
    .onUpdate((e) => { x.set(Math.min(width, Math.max(0, e.x))); runOnJS(commit)(e.x); })
    .onFinalize(() => { runOnJS(settle)(); });
  function settle() {
    if (width > 0) x.set(withTiming(frac(lastStep.get()) * width, { duration: 120 }));
  }
  const fill = useAnimatedStyle(() => ({ width: x.get() }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() - KNOB / 2 }] }));
  const shown = `${Number.isInteger(v) ? v : v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}${block.unit ? (block.unit.length > 2 ? ` ${block.unit}` : block.unit) : ""}`;
  const stepBy = (n: number) => onChange(snap(v + n * block.step, block.min, block.max, block.step));
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={block.label}
      accessibilityValue={{ min: block.min, max: block.max, now: v, text: shown }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => !disabled && stepBy(e.nativeEvent.actionName === "increment" ? 1 : -1)}
    >
      <View style={styles.sliderHead}>
        <Text style={styles.label}>{block.label}</Text>
        <Text style={styles.sliderValue}>{shown}</Text>
      </View>
      <GestureDetector gesture={pan}>
        <View style={styles.sliderHit} onLayout={(e) => setWidth(e.nativeEvent.layout.width - KNOB)}>
          <View style={styles.track}>
            <Animated.View style={[styles.trackFill, fill, disabled && { backgroundColor: Ghost.text.tertiary }]} />
          </View>
          <Animated.View style={[styles.knob, knob, disabled && styles.knobOff]} />
        </View>
      </GestureDetector>
      <View style={styles.sliderEnds}>
        <Text style={styles.sliderEnd}>{block.min}</Text>
        <Text style={styles.sliderEnd}>{block.max}</Text>
      </View>
    </View>
  );
}

/* ── field: a few words ────────────────────────────────────────────── */

function FieldInput({ block, value, onChange, disabled }: Props<Extract<InputBlock, { type: "field" }>>) {
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <Label text={block.label} optional={block.optional} />
      <TextInput
        value={typeof value === "string" ? value : ""}
        onChangeText={(t) => onChange(t)}
        editable={!disabled}
        placeholder={block.placeholder ?? ""}
        placeholderTextColor={Ghost.text.tertiary}
        multiline={block.multiline}
        maxLength={400}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.field, block.multiline && styles.fieldMulti, focused && styles.fieldFocus, disabled && styles.fieldOff]}
        accessibilityLabel={block.label}
        selectionColor={Ghost.accent.primary}
      />
    </View>
  );
}

/* ── checklist: tick as you go ─────────────────────────────────────── */

function ChecklistInput({ block, value, onChange, disabled }: Props<Extract<InputBlock, { type: "checklist" }>>) {
  const done = new Set(Array.isArray(value) ? value : []);
  const count = block.checks.filter((c) => done.has(c.id)).length;
  return (
    <View>
      {block.label || block.checks.length > 3 ? (
        <View style={styles.sliderHead}>
          <Label text={block.label ?? ""} />
          <Text style={styles.count}>{count} of {block.checks.length}</Text>
        </View>
      ) : null}
      <View style={styles.group}>
        {block.checks.map((c, i) => {
          const on = done.has(c.id);
          return (
            <Pressable
              key={c.id}
              onPress={() => {
                if (disabled) return;
                Haptics.selectionAsync().catch(() => {});
                const next = new Set(done);
                if (on) next.delete(c.id);
                else next.add(c.id);
                onChange(block.checks.filter((x) => next.has(x.id)).map((x) => x.id));
              }}
              disabled={disabled}
              style={({ pressed }) => [styles.option, i > 0 && styles.rowLine, pressed && !disabled && styles.pressed]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled }}
              accessibilityLabel={c.label}
            >
              <View style={[styles.circle, on && styles.circleOn]}>
                {on ? <Check size={13} color="#0B0B10" strokeWidth={3} /> : null}
              </View>
              <Text style={[styles.optionLabel, on && styles.struck]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11.5, fontWeight: "500", letterSpacing: 1.1, textTransform: "uppercase", color: Ghost.text.tertiary, marginBottom: 8 },
  optional: { fontWeight: "400", color: Ghost.text.tertiary, textTransform: "none", letterSpacing: 0 },
  group: { borderRadius: 20, borderCurve: "continuous", backgroundColor: "rgba(255,255,255,0.045)", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border, overflow: "hidden" },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Ghost.border.subtle },
  pressed: { opacity: 0.7 },
  // choice
  option: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 50, paddingHorizontal: 14, paddingVertical: 10 },
  optionOn: { backgroundColor: alpha(Ghost.accent.primary, 0.1) },
  optionText: { flex: 1, gap: 1 },
  optionLabel: { flex: 1, fontSize: 15.5, lineHeight: 21, fontWeight: "400", color: Ghost.text.secondary },
  optionDetail: { fontSize: 13, lineHeight: 18, fontWeight: "300", color: Ghost.text.tertiary },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.32)", alignItems: "center", justifyContent: "center" },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#0B0B10" },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.32)", alignItems: "center", justifyContent: "center" },
  markOn: { backgroundColor: Ghost.accent.primary, borderColor: Ghost.accent.primary },
  // checklist
  circle: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.32)", alignItems: "center", justifyContent: "center" },
  circleOn: { backgroundColor: Ghost.status.success, borderColor: Ghost.status.success },
  struck: { color: Ghost.text.tertiary, textDecorationLine: "line-through" },
  count: { fontSize: 12.5, color: Ghost.text.tertiary, fontVariant: ["tabular-nums"], marginBottom: 8 },
  // datetime
  picker: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 50, paddingHorizontal: 14, borderRadius: 18, borderCurve: "continuous", backgroundColor: "rgba(255,255,255,0.045)", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  pickerText: { flex: 1, fontSize: 15.5, color: Ghost.text.primary },
  placeholder: { color: Ghost.text.tertiary },
  monthHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Space.md },
  monthName: { fontFamily: Fonts.voice, fontSize: 24, lineHeight: 28, color: Ghost.text.primary, letterSpacing: -0.4 },
  round: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: Ghost.glass.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  week: { flexDirection: "row" },
  weekDay: { flex: 1, textAlign: "center", fontSize: 11.5, fontWeight: "500", color: Ghost.text.tertiary, paddingBottom: 6 },
  dayCell: { flex: 1, height: 44, alignItems: "center", justifyContent: "center" },
  dayDot: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  dayOn: { backgroundColor: Ghost.accent.primary },
  dayToday: { borderWidth: 1, borderColor: alpha(Ghost.accent.primary, 0.5) },
  dayText: { fontFamily: Inter.regular, fontSize: 15, color: Ghost.text.primary, fontVariant: ["tabular-nums"] },
  dayTextOn: { color: "#0B0B10", fontFamily: Inter.semibold },
  dayOff: { color: "rgba(255,255,255,0.2)" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  // Six to a row, filling it: hours are four rows, minutes two.
  chip: { flexBasis: "14%", flexGrow: 1, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: Ghost.glass.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  chipOn: { backgroundColor: Ghost.accent.primary, borderColor: Ghost.accent.primary },
  chipText: { fontFamily: Inter.regular, fontSize: 14, color: Ghost.text.secondary, fontVariant: ["tabular-nums"] },
  chipTextOn: { color: "#0B0B10", fontFamily: Inter.semibold },
  sheetFoot: { flexDirection: "row", alignItems: "center", gap: Space.md, marginTop: Space.lg },
  sheetChosen: { flex: 1, fontSize: 15, color: Ghost.text.secondary },
  // slider
  sliderHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  sliderValue: { fontFamily: Fonts.voice, fontSize: 28, lineHeight: 32, letterSpacing: -0.5, color: Ghost.text.primary, fontVariant: ["tabular-nums"] },
  sliderHit: { height: 44, justifyContent: "center", paddingHorizontal: KNOB / 2 },
  track: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
  trackFill: { height: 6, borderRadius: 3, backgroundColor: Ghost.accent.primary },
  knob: { position: "absolute", left: KNOB / 2, top: (44 - KNOB) / 2, width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: "#FFFFFF", boxShadow: "0 2px 10px rgba(0,0,0,0.45)" },
  knobOff: { backgroundColor: Ghost.text.tertiary },
  sliderEnds: { flexDirection: "row", justifyContent: "space-between", marginTop: -2 },
  sliderEnd: { fontSize: 11.5, color: Ghost.text.tertiary, fontVariant: ["tabular-nums"] },
  // field
  field: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18, borderCurve: "continuous", backgroundColor: "rgba(255,255,255,0.045)", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border, color: Ghost.text.primary, fontFamily: Inter.regular, fontSize: 15.5 },
  fieldMulti: { minHeight: 92, textAlignVertical: "top" },
  fieldFocus: { borderColor: alpha(Ghost.accent.primary, 0.6), backgroundColor: "rgba(255,255,255,0.06)" },
  fieldOff: { color: Ghost.text.secondary },
});
