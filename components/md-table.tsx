import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Ghost, Radius, Space } from "@/constants/theme";
import { fitWidths, type TableModel } from "@/lib/tables";

/**
 * A table in a reply. It never scrolls sideways: columns share the screen
 * and wrap their text, and a table with too many columns for that is shown as
 * stacked rows, one small record each. Numbers align right.
 */

const Ctx = createContext<{ widths: number[]; numeric: boolean[] }>({ widths: [], numeric: [] });

export function MdTable({ model, children }: { model: TableModel; children: React.ReactNode }) {
  const [available, setAvailable] = useState(0);
  const widths = useMemo(() => fitWidths(model.widths, available), [model.widths, available]);
  const value = useMemo(() => ({ widths: widths ?? model.widths, numeric: model.numeric }), [widths, model.widths, model.numeric]);
  const onLayout = useCallback((e: LayoutChangeEvent) => setAvailable(Math.floor(e.nativeEvent.layout.width)), []);

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      {widths ? (
        <Ctx.Provider value={value}>
          <View style={styles.card}>{children}</View>
        </Ctx.Provider>
      ) : (
        <Stacked rows={model.rows} />
      )}
    </View>
  );
}

/** A table with too many columns for the screen: each row becomes a small record. */
function Stacked({ rows }: { rows: string[][] }) {
  const [head, ...body] = rows;
  return (
    <View style={styles.card} accessibilityLabel="Table">
      {body.map((row, r) => (
        <View key={r} style={[styles.record, r < body.length - 1 && styles.rowLine]}>
          <Text style={styles.recordTitle}>{row[0]}</Text>
          {row.slice(1).map((cell, c) =>
            cell ? (
              <Text key={c} style={styles.recordLine}>
                <Text style={styles.recordLabel}>{head?.[c + 1] ?? ""}</Text>
                {head?.[c + 1] ? "  " : ""}
                {cell}
              </Text>
            ) : null,
          )}
        </View>
      ))}
    </View>
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
  row: { flexDirection: "row" },
  headerRow: { backgroundColor: Ghost.bg.sunken },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Ghost.border.subtle },
  cell: { paddingHorizontal: 14, paddingVertical: 11, justifyContent: "center" },
  headerCell: { paddingVertical: 9 },
  right: { alignItems: "flex-end" },
  record: { paddingHorizontal: 14, paddingVertical: 12, gap: 3 },
  recordTitle: { fontSize: 14.5, lineHeight: 20, fontWeight: "600", color: Ghost.text.primary },
  recordLine: { fontSize: 14, lineHeight: 20, color: Ghost.text.primary },
  recordLabel: { fontSize: 12.5, fontWeight: "600", color: Ghost.text.tertiary },
});
