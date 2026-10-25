import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { ChevronRight, Plus, ShieldCheck } from "lucide-react-native";
import { Text } from "@/components/text";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { EdgeScrollView } from "@/components/scroll-edge";
import { Empty, InfoRow, lifeStyles, Pill } from "@/components/life-ui";
import { GhostButton, GhostSheet } from "@/components/ghost";
import { VaultMark } from "@/components/vault-icon";
import { VaultForm } from "@/components/vault-form";
import { alpha, Fonts, Ghost, Space } from "@/constants/theme";
import { showDialog } from "@/lib/dialog";
import { deleteVaultItem, fetchVaultItems } from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";
import {
  brandLabel,
  kindOfTab,
  kindPlural,
  kindWord,
  tabCount,
  VAULT_TABS,
  vaultStatus,
  type VaultCounts,
  type VaultItem,
  type VaultKind,
  type VaultTab,
} from "@/lib/vault";

type Editor = { item: VaultItem | null; kind: VaultKind };

/**
 * The Vault: what the owner keeps for Ghost to use on their behalf — website
 * logins, payment cards, contact details and API keys. Sealed on the Pod. The
 * phone lists what each is and never a secret; a card's number and security
 * code, a login's password and a key's value are not in any response.
 *
 * The line under the tabs is the promise the screen makes, in the same words
 * everywhere: Ghost never sees a saved card's number or security code; it can
 * see logins and contact details so it can type them in.
 */
export default function VaultScreen() {
  const config = useGhostStore((s) => s.config);
  const [items, setItems] = useState<VaultItem[] | null>(null);
  const [counts, setCounts] = useState<VaultCounts>({});
  const [tab, setTab] = useState<VaultTab>("all");
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!config) return;
    try {
      const r = await fetchVaultItems(config);
      setItems(r.items);
      setCounts(r.counts);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach your Pod to read your Vault.");
    }
  }, [config]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const detail = detailId ? (items ?? []).find((i) => i.id === detailId) ?? null : null;

  const groups = useMemo(() => {
    const all = items ?? [];
    const kind = kindOfTab(tab);
    if (kind) return [{ kind, items: all.filter((i) => i.kind === kind) }];
    return (["login", "card", "contact", "key"] as VaultKind[])
      .map((k) => ({ kind: k, items: all.filter((i) => i.kind === k) }))
      .filter((g) => g.items.length > 0);
  }, [items, tab]);

  const total = items?.length ?? 0;
  const shown = groups.reduce((n, g) => n + g.items.length, 0);
  const addKind = kindOfTab(tab) ?? "login";

  const remove = (item: VaultItem) => {
    if (!config) return;
    showDialog(`Remove ${titleOf(item)}?`, "Ghost stops using it and forgets it. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteVaultItem(config, item.kind, item.id);
            setDetailId(null);
            await load();
          } catch (e) {
            showDialog("Couldn't remove that", e instanceof Error ? e.message : undefined);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <ScreenBackground variant="calm" />
      <ScreenHeader
        title="Vault"
        subtitle="Logins, cards and details Ghost can use"
        trailing={config ? <HeaderAdd onPress={() => setEditor({ item: null, kind: addKind })} /> : undefined}
      />
      {!config ? (
        <Empty title="Not connected." text="Your Vault lives on your Ghost Pod. Connect one to use it." />
      ) : (
        <EdgeScrollView contentContainerStyle={styles.content}>
          <View style={styles.seg} accessibilityRole="tablist">
            {VAULT_TABS.map((t) => {
              const on = tab === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTab(t.id)}
                  style={[styles.segBtn, on && styles.segOn]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${t.label}, ${tabCount(t.id, counts)}`}
                >
                  <Text style={[styles.segText, on && styles.segTextOn]} numberOfLines={1}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {items === null && !error ? <ActivityIndicator style={{ marginTop: Space.xxxl }} color={Ghost.text.tertiary} /> : null}

          {items && total === 0 ? (
            <View style={styles.emptyWrap}>
              <Empty
                title="Nothing kept yet."
                text="Save a website login, a card, a contact or an API key. Ghost uses it for you and never puts a secret in the conversation."
              />
              <GhostButton title="Add your first item" onPress={() => setEditor({ item: null, kind: "login" })} />
            </View>
          ) : null}

          {items && total > 0 && shown === 0 ? (
            <Text style={styles.emptyLine}>
              No {kindPlural(kindOfTab(tab) ?? "login").toLowerCase()} saved yet. Add one with the + above.
            </Text>
          ) : null}

          {groups.map((g) => (
            <View key={g.kind}>
              {tab === "all" ? <Text style={lifeStyles.eyebrow}>{kindPlural(g.kind)}</Text> : null}
              <View style={lifeStyles.group}>
                {g.items.map((item, i) => (
                  <Row key={`${item.kind}:${item.id}`} item={item} first={i === 0} onPress={() => setDetailId(item.id)} />
                ))}
              </View>
            </View>
          ))}

          {items ? (
            <View style={styles.note}>
              <ShieldCheck size={17} color={Ghost.status.success} strokeWidth={1.8} />
              <Text style={styles.noteText}>
                Ghost never sees a saved card&apos;s number or security code. It can see logins and contact info so it can type them in for you.
              </Text>
            </View>
          ) : null}
        </EdgeScrollView>
      )}

      <GhostSheet visible={editor !== null} onClose={() => setEditor(null)}>
        {editor ? (
          <VaultForm
            key={editor.item?.id ?? `new-${editor.kind}`}
            editing={editor.item}
            initialKind={editor.kind}
            onCancel={() => setEditor(null)}
            onSaved={() => {
              setEditor(null);
              void load();
            }}
          />
        ) : null}
      </GhostSheet>

      <GhostSheet visible={detail !== null} onClose={() => setDetailId(null)}>
        {detail ? (
          <Detail
            item={detail}
            onEdit={() => {
              setDetailId(null);
              setEditor({ item: detail, kind: detail.kind });
            }}
            onRemove={() => remove(detail)}
          />
        ) : null}
      </GhostSheet>
    </View>
  );
}

function HeaderAdd({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.add, pressed && { opacity: 0.65 }]}
      accessibilityRole="button"
      accessibilityLabel="Add something to the Vault"
    >
      <Plus size={19} color={Ghost.text.primary} strokeWidth={1.9} />
    </Pressable>
  );
}

function titleOf(item: VaultItem): string {
  if (item.title) return item.title;
  switch (item.kind) {
    case "card":
      return `${brandLabel(item.brand)}${item.last4 ? ` •••• ${item.last4}` : ""}`;
    case "contact":
      return item.name || item.company || "Contact";
    case "key":
      return item.service || "Key";
    case "login":
      return item.host || "Login";
  }
}

function Row({ item, first, onPress }: { item: VaultItem; first: boolean; onPress: () => void }) {
  const status = vaultStatus(item);
  const commands = item.kind === "key" && item.use_in_commands ? "Commands" : null;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, !first && styles.rowLine, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={[titleOf(item), item.subtitle, status ?? commands].filter(Boolean).join(", ")}
    >
      <VaultMark item={item} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={2}>{titleOf(item)}</Text>
        {item.subtitle ? <Text style={styles.rowSub} numberOfLines={1}>{item.subtitle}</Text> : null}
      </View>
      {status ? <Pill text={status} tone={status === "Expired" ? "bad" : "warn"} /> : commands ? <Pill text={commands} tone="neutral" /> : null}
      <ChevronRight size={16} color={Ghost.text.tertiary} strokeWidth={1.7} />
    </Pressable>
  );
}

function Detail({ item, onEdit, onRemove }: { item: VaultItem; onEdit: () => void; onRemove: () => void }) {
  const rows: { label: string; value: string }[] = [];
  if (item.kind === "login") {
    rows.push({ label: "Site", value: item.host ?? "" });
    rows.push({ label: "Username", value: item.username || "—" });
    rows.push({ label: "Password", value: item.has_password ? "Saved" : "—" });
  } else if (item.kind === "card") {
    rows.push({ label: "Brand", value: brandLabel(item.brand) });
    rows.push({ label: "Number", value: `•••• •••• •••• ${item.last4 || "••••"}` });
    rows.push({ label: "Expires", value: item.exp_month ? `${String(item.exp_month).padStart(2, "0")}/${String((item.exp_year ?? 0) % 100).padStart(2, "0")}` : "—" });
    if (item.holder) rows.push({ label: "Name on card", value: item.holder });
    rows.push({ label: "Security code", value: item.has_cvc ? "Saved" : "—" });
  } else if (item.kind === "contact") {
    if (item.name) rows.push({ label: "Name", value: item.name });
    if (item.company) rows.push({ label: "Company", value: item.company });
    if (item.email) rows.push({ label: "Email", value: item.email });
    if (item.phone) rows.push({ label: "Phone", value: item.phone });
    const address = [item.street, item.city, item.region, item.postal, item.country].filter(Boolean).join(", ");
    if (address) rows.push({ label: "Address", value: address });
  } else {
    if (item.service) rows.push({ label: "Service", value: item.service });
    rows.push({ label: "Key", value: item.key_hint ? `••••${item.key_hint}` : "Saved" });
    if (item.env_name) rows.push({ label: "Variable", value: `$${item.env_name}` });
    rows.push({ label: "Commands", value: item.use_in_commands ? "May use it when named" : "Not allowed" });
  }

  return (
    <View style={styles.detail}>
      <View style={styles.detailHead}>
        <VaultMark item={item} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={styles.detailTitle} numberOfLines={2}>{titleOf(item)}</Text>
          <Text style={styles.detailKind}>{kindWord(item.kind)}</Text>
        </View>
      </View>

      {rows.length > 0 ? (
        <View style={lifeStyles.sheetGroup}>
          {rows.map((r, i) => (
            <InfoRow key={`${r.label}-${i}`} first={i === 0} label={r.label} value={r.value} />
          ))}
        </View>
      ) : null}

      {item.notes ? (
        <View style={styles.notes}>
          <Text style={styles.notesLabel}>Notes</Text>
          <Text style={styles.notesBody}>{item.notes}</Text>
        </View>
      ) : null}

      <View style={styles.security}>
        <ShieldCheck size={16} color={Ghost.status.success} strokeWidth={1.8} />
        <Text style={styles.securityText}>{securityNote(item.kind)}</Text>
      </View>

      <View style={styles.actions}>
        <GhostButton title="Edit" variant="secondary" onPress={onEdit} />
        <GhostButton title="Remove" variant="danger" onPress={onRemove} />
      </View>
    </View>
  );
}

function securityNote(kind: VaultKind): string {
  switch (kind) {
    case "card":
      return "Ghost never sees this card's number or security code. It can only fill them at a checkout, with your OK.";
    case "login":
      return "Ghost sees the site and username. It can use the password to sign in, but never sees it.";
    case "contact":
      return "Ghost can see contact details so it can type them into a form for you.";
    case "key":
      return "Ghost sees this key's name, never its value. A command gets it only when it names the variable and you allow it.";
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  content: { paddingBottom: 96, paddingHorizontal: Space.lg },
  add: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.38)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  seg: {
    flexDirection: "row",
    gap: 2,
    padding: 3,
    marginTop: Space.xs,
    marginBottom: Space.md,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.42)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  segBtn: { flex: 1, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18 },
  segOn: { backgroundColor: Ghost.glass.fillStrong },
  segText: { fontSize: 13.5, fontWeight: "500", color: Ghost.text.secondary },
  segTextOn: { color: Ghost.text.primary },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 68, paddingLeft: 12, paddingRight: 10, paddingVertical: 10 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Ghost.border.subtle },
  rowPressed: { backgroundColor: "rgba(255,255,255,0.04)" },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 15.5, lineHeight: 20, fontWeight: "500", letterSpacing: -0.15, color: Ghost.text.primary },
  rowSub: { fontSize: 13, lineHeight: 17, color: Ghost.text.tertiary },
  error: { fontSize: 14, lineHeight: 20, color: Ghost.status.error, textAlign: "center", marginTop: Space.md },
  emptyWrap: { alignItems: "center", gap: Space.lg, marginTop: Space.lg },
  emptyLine: { fontSize: 15, lineHeight: 22, fontWeight: "300", color: Ghost.text.secondary, textAlign: "center", marginTop: Space.xxl, paddingHorizontal: Space.xl },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: Space.xxl,
    paddingHorizontal: Space.xs,
  },
  noteText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontWeight: "300", color: Ghost.text.tertiary },
  detail: { gap: Space.md },
  detailHead: { flexDirection: "row", alignItems: "center", gap: Space.md },
  detailTitle: { fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: Ghost.text.primary, fontFamily: Fonts.voice },
  detailKind: { fontSize: 13, fontWeight: "500", color: Ghost.text.tertiary, textTransform: "uppercase", letterSpacing: 1.1 },
  notes: { gap: 4, paddingHorizontal: 4 },
  notesLabel: { fontSize: 11.5, fontWeight: "500", letterSpacing: 1.1, textTransform: "uppercase", color: Ghost.text.tertiary },
  notesBody: { fontSize: 14.5, lineHeight: 21, fontWeight: "300", color: Ghost.text.secondary },
  security: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: alpha(Ghost.status.success, 0.06),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha(Ghost.status.success, 0.18),
  },
  securityText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontWeight: "300", color: Ghost.text.secondary },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: Space.sm, marginTop: Space.xs },
});
