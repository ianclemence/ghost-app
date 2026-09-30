import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Maximize2, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alpha, Ghost, Radius, Space } from "@/constants/theme";
import { fitWidths, isWiderThan, type TableModel } from "@/lib/tables";

/**
 * A table in a reply. Columns are as wide as what is in them and it scrolls
 * sideways when it has to, with a soft edge on the right that says there is
 * more. Wide tables can also open full screen. Numbers align right.
 */

const Ctx = createContext<{ widths: number[]; numeric: boolean[] }>({ widths: [], numeric: [] });

export function MdTable({ model, children }: { model: TableModel; children: React.ReactNode }) {
  const [available, setAvailable] = useState(0);
  const [atEnd, setAtEnd] = useState(false);
  const [open, setOpen] = useState(false);
  const widths = useMemo(() => fitWidths(model.widths, available), [model.widths, available]);
  const wide = isWiderThan(widths, available);
  const total = widths.reduce((a, b) => a + b, 0);
  const value = useMemo(() => ({ widths, numeric: model.numeric }), [widths, model.numeric]);

  const onLayout = useCallback((e: LayoutChangeEvent) => setAvailable(Math.floor(e.nativeEvent.layout.width)), []);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      setAtEnd(contentOffset.x + layoutMeasurement.width >= contentSize.width - 6);
    },
    [],
  );

  return (
    <Ctx.Provider value={value}>
      <View style={styles.wrap} onLayout={onLayout}>
        <View style={styles.card}>
          <ScrollView
            horizontal
            nestedScrollEnabled
            directionalLockEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={32}
            onScroll={onScroll}
            accessibilityLabel={wide ? "Table. Scroll sideways for more columns." : "Table"}
          >
            <View style={{ width: total || undefined }}>{children}</View>
          </ScrollView>
          {wide && !atEnd ? (
            <LinearGradient
              pointerEvents="none"
              colors={[alpha(Ghost.bg.raised, 0), Ghost.bg.raised]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.edge}
            />
          ) : null}
        </View>
        {wide ? (
          <Pressable
            onPress={() => setOpen(true)}
            hitSlop={10}
            style={styles.expand}
            accessibilityRole="button"
            accessibilityLabel="Open the table full screen"
          >
            <Maximize2 size={13} color={Ghost.text.tertiary} />
            <Text style={styles.expandText}>Full screen</Text>
          </Pressable>
        ) : null}
      </View>
      {open ? <FullTable widths={model.widths} numeric={model.numeric} onClose={() => setOpen(false)}>{children}</FullTable> : null}
    </Ctx.Provider>
  );
}

/** The same table with room to look at it: it scrolls both ways. */
function FullTable({
  widths,
  numeric,
  onClose,
  children,
}: {
  widths: number[];
  numeric: boolean[];
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const value = useMemo(() => ({ widths, numeric }), [widths, numeric]);
  const total = widths.reduce((a, b) => a + b, 0);
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.full, { paddingTop: insets.top + Space.sm, paddingBottom: insets.bottom }]}>
        <View style={styles.fullBar}>
          <Text style={styles.fullTitle}>Table</Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
            <X size={20} color={Ghost.text.primary} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.fullBody} nestedScrollEnabled>
          <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
            <Ctx.Provider value={value}>
              <View style={[styles.card, { width: total, marginHorizontal: Space.lg }]}>{children}</View>
            </Ctx.Provider>
          </ScrollView>
        </ScrollView>
      </View>
    </Modal>
  );
}

export function MdRow({ header, last, children }: { header: boolean; last: boolean; children: React.ReactNode }) {
  return (
    <View
      style={[
        styles.row,
        header && styles.headerRow,
        !header && !last && styles.rowLine,
      ]}
    >
      {children}
    </View>
  );
}

export function MdCell({
  column,
  header,
  children,
}: {
  column: number;
  header: boolean;
  children: React.ReactNode;
}) {
  const { widths, numeric } = useContext(Ctx);
  const right = numeric[column] && true;
  return (
    <View style={[styles.cell, { width: widths[column] ?? 120 }, header && styles.headerCell]}>
      <View style={right ? styles.right : undefined}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: Space.sm, alignSelf: "stretch" },
  card: {
    backgroundColor: Ghost.bg.raised,
    borderRadius: Radius.lg,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.border.default,
    overflow: "hidden",
  },
  edge: { position: "absolute", top: 0, bottom: 0, right: 0, width: 36 },
  row: { flexDirection: "row" },
  headerRow: { backgroundColor: Ghost.bg.sunken },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Ghost.border.subtle },
  cell: { paddingHorizontal: 14, paddingVertical: 11, justifyContent: "center" },
  headerCell: { paddingVertical: 9 },
  right: { alignItems: "flex-end" },
  expand: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-end", marginTop: 6, minHeight: 24 },
  expandText: { fontSize: 12, color: Ghost.text.tertiary, fontWeight: "500" },
  full: { flex: 1, backgroundColor: Ghost.bg.base },
  fullBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: Space.lg, paddingBottom: Space.md },
  fullTitle: { fontSize: 17, fontWeight: "600", color: Ghost.text.primary },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: Ghost.bg.sunken },
  fullBody: { paddingBottom: Space.huge },
});
