import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { Database, HardDrive, Plus } from "lucide-react-native";
import { Text } from "@/components/text";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { EdgeScrollView } from "@/components/scroll-edge";
import { GhostButton, GhostInput, GhostSheet } from "@/components/ghost";
import { Field, lifeStyles } from "@/components/life-ui";
import { alpha, Ghost, Space } from "@/constants/theme";
import { connectDatabase, fetchDataSources, forgetDatabase, type DatabaseMeta, type DataSource } from "@/lib/ghostApi";
import { showDialog } from "@/lib/dialog";
import { useGhostStore } from "@/lib/store";

const OWN_WORDS: Record<string, string> = {
  finance_entries: "Spending and income",
  subscriptions: "Subscriptions and bills",
  health_days: "Health",
  knowledge: "Reading and study",
  trips: "Trips",
};

/**
 * What Ghost's dashboards can read: the owner's own data on the Pod and the
 * spreadsheets they sent (always), and any database they connect. Reading
 * only. A database's address is sent once, kept sealed on the Pod, and never
 * shown again or given to the model.
 */
export default function DataSourcesScreen() {
  const config = useGhostStore((s) => s.config);
  const [sources, setSources] = useState<DataSource[] | null>(null);
  const [dbs, setDbs] = useState<DatabaseMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(async () => {
    if (!config) return;
    const r = await fetchDataSources(config);
    if (r.ok) {
      setSources(r.data.sources);
      setDbs(r.data.databases ?? []);
      setError(null);
    } else setError(r.error);
  }, [config]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const pod = sources?.find((s) => s.kind === "pod");
  const files = (pod?.tables ?? []).filter((t) => t.name.startsWith("file_"));
  const own = (pod?.tables ?? []).filter((t) => !t.name.startsWith("file_"));
  const remove = (d: DatabaseMeta) =>
    showDialog(`Disconnect ${d.name}?`, "Ghost forgets its address and password. Dashboards that read it will say so.", [
      { text: "Cancel", style: "cancel" },
      { text: "Disconnect", style: "destructive", onPress: async () => {
        const r = await forgetDatabase(config!, d.name);
        if (!r.ok) return setError(r.error);
        await load();
      } },
    ]);

  return (
    <View style={styles.container}>
      <ScreenBackground variant="calm" />
      <ScreenHeader title="Data sources" subtitle="What dashboards can read" />
      <EdgeScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lead}>Ask Ghost a question about your data (“how did sales do by month?”) and it writes the query and keeps a live dashboard. It only ever reads.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {sources === null && !error ? <ActivityIndicator style={{ marginTop: Space.xxxl }} color={Ghost.text.tertiary} /> : null}

        {pod ? (
          <>
            <Text style={lifeStyles.eyebrow}>On your Pod</Text>
            <View style={lifeStyles.group}>
              <Row Icon={HardDrive} title="Your own data" sub={own.map((t) => `${OWN_WORDS[t.name] ?? t.name.replace(/_/g, " ")} (${t.rows})`).join(" · ")} />
              <Row Icon={HardDrive} title="Spreadsheets you sent" sub={files.length ? files.map((t) => `${t.name.replace(/^file_/, "").replace(/_/g, " ")} (${t.rows} rows)`).join(" · ") : "Send Ghost a CSV file and it becomes a table here."} line />
            </View>
          </>
        ) : null}

        {sources ? (
          <>
            <Text style={lifeStyles.eyebrow}>Databases</Text>
            {dbs.length > 0 ? (
              <View style={lifeStyles.group}>
                {dbs.map((d, i) => {
                  const s = sources.find((x) => x.name === d.name);
                  return (
                    <Row key={d.name} Icon={Database} title={d.name} line={i > 0}
                      sub={s?.error ? `Can't be reached: ${s.error}` : `${d.database} on ${d.host} · ${(s?.tables ?? []).length} tables`}
                      warn={!!s?.error} onPress={() => remove(d)} action="Disconnect" />
                  );
                })}
              </View>
            ) : null}
            <Pressable onPress={() => setAdding(true)} style={({ pressed }) => [styles.add, pressed && { opacity: 0.75 }]} accessibilityRole="button">
              <Plus size={16} color={Ghost.text.primary} strokeWidth={2} />
              <Text style={styles.addText}>Connect a database</Text>
            </Pressable>
            <Text style={styles.small}>Postgres, including Supabase, Neon and most hosted databases. Use a read-only user if you can.</Text>
          </>
        ) : null}
      </EdgeScrollView>
      {config ? <ConnectSheet visible={adding} onClose={() => setAdding(false)} onDone={load} /> : null}
    </View>
  );
}

function Row({ Icon, title, sub, line, warn, onPress, action }: { Icon: typeof Database; title: string; sub: string; line?: boolean; warn?: boolean; onPress?: () => void; action?: string }) {
  return (
    <View style={[styles.row, line && styles.rowLine]}>
      <View style={styles.icon}><Icon size={17} color={Ghost.accent.primary} strokeWidth={1.8} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={[styles.rowSub, warn && { color: Ghost.status.warning }]} numberOfLines={3}>{sub}</Text>
      </View>
      {onPress && action ? <GhostButton title={action} size="sm" variant="secondary" onPress={onPress} /> : null}
    </View>
  );
}

function ConnectSheet({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const config = useGhostStore((s) => s.config)!;
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => { setName(""); setUrl(""); setError(null); onClose(); };
  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await connectDatabase(config, name, url);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    close();
    await onDone();
  };
  return (
    <GhostSheet visible={visible} onClose={close} title="Connect a database" message="Ghost tries it before keeping it, and only ever reads.">
      <View style={{ gap: Space.md }}>
        <Field label="Name" value={name} onChange={setName} placeholder="shop" />
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>Address</Text>
          <GhostInput value={url} onChangeText={setUrl} placeholder="postgres://user:password@host:5432/database" autoCapitalize="none" autoCorrect={false} secureTextEntry accessibilityLabel="Database address" />
          <Text style={styles.small}>Kept sealed on your Pod. It is never shown again or shared with the model.</Text>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <GhostButton title={busy ? "Trying it…" : "Connect"} fullWidth disabled={busy || !name.trim() || !url.trim()} onPress={() => void save()} />
      </View>
    </GhostSheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  content: { paddingBottom: 96, paddingHorizontal: Space.lg },
  lead: { fontSize: 15, lineHeight: 22, fontWeight: "300", color: Ghost.text.secondary, textAlign: "center", marginBottom: Space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Ghost.border.subtle },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: alpha(Ghost.accent.primary, 0.12), borderWidth: StyleSheet.hairlineWidth, borderColor: alpha(Ghost.accent.primary, 0.3) },
  rowTitle: { fontSize: 15.5, fontWeight: "500", color: Ghost.text.primary },
  rowSub: { fontSize: 13, lineHeight: 18, color: Ghost.text.tertiary },
  add: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 23, borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border, borderStyle: "dashed", marginTop: Space.md },
  addText: { fontSize: 14.5, fontWeight: "500", color: Ghost.text.primary },
  small: { fontSize: 12.5, lineHeight: 17, color: Ghost.text.tertiary, marginTop: Space.sm, marginLeft: 2 },
  label: { fontSize: 11.5, fontWeight: "500", letterSpacing: 1.1, textTransform: "uppercase", color: Ghost.text.tertiary, marginLeft: 2 },
  error: { fontSize: 13.5, lineHeight: 19, color: Ghost.status.error },
});
