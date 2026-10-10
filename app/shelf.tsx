import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Check, ChevronDown, Layers, MoreHorizontal, Search, X } from "lucide-react-native";
import { Text } from "@/components/text";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { EdgeScrollView } from "@/components/scroll-edge";
import { GhostButton, GhostSheet } from "@/components/ghost";
import { lifeStyles as lifeSheet } from "@/components/life-ui";
import { showDialog } from "@/lib/dialog";
import { ArtifactCard } from "@/components/artifact-card";
import { alpha, Fonts, Ghost, Space } from "@/constants/theme";
import { deleteArtifact, fetchShelf, fetchWorkspacePreview, pinArtifact, type ShelfItem, type ShelfKind } from "@/lib/ghostApi";
import { isDocumentArtifact } from "@/lib/documents";
import { isCanvasArtifact } from "@/lib/canvas";
import { isMotionArtifact, isMotionVideo } from "@/lib/motion";
import { isDashboardArtifact } from "@/lib/dashboards";
import { shelfKindOf, shelfMeta } from "@/lib/shelf";
import { useGhostStore } from "@/lib/store";
import { MADE_LOOK } from "@/components/made-look";

const FILTERS: { id: ShelfKind | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pages", label: "Pages" },
  { id: "motion", label: "Motion" },
  { id: "dashboards", label: "Dashboards" },
  { id: "documents", label: "Documents" },
  { id: "pictures", label: "Pictures" },
  { id: "links", label: "Links" },
  { id: "notes", label: "Notes" },
];

const KIND = MADE_LOOK;

/**
 * Everything Ghost has made for the owner, in every conversation, in one
 * place: pages that run, documents to read and send, pictures, links, written
 * results. What they pin stays on top; versions of the same thing are one
 * entry. Each opens the way it is meant to be used: a page runs, a document
 * shows its pages, a link opens, the rest open in place.
 */
export default function ShelfScreen() {
  const router = useRouter();
  const config = useGhostStore((s) => s.config);
  const [items, setItems] = useState<ShelfItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ShelfKind | "all">("all");
  const [query, setQuery] = useState("");
  const [peek, setPeek] = useState<ShelfItem | null>(null);
  const [acting, setActing] = useState<ShelfItem | null>(null);
  const [choosing, setChoosing] = useState(false);
  const asked = useRef(0);

  const load = useCallback(async () => {
    if (!config) return;
    const n = ++asked.current;
    try {
      // Every kind for the words typed: the filter and its counts are worked out here.
      const list = await fetchShelf(config, { q: query, limit: 200 });
      if (n !== asked.current) return; // a newer search is on its way
      setItems(list);
      setError(null);
    } catch {
      if (n === asked.current) setError("Couldn't reach your Pod to read the shelf.");
    }
  }, [config, query]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  // Typing searches after a breath, not on every letter.
  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [query, load]);

  const togglePin = async (it: ShelfItem) => {
    if (!config) return;
    Haptics.selectionAsync().catch(() => {});
    const next = !it.pinned;
    // Shown at once, and put back if the Pod did not keep it.
    setItems((list) => (list ?? []).map((x) => (x.id === it.id ? { ...x, pinned: next } : x)));
    const ok = await pinArtifact(config, it.id, next);
    if (!ok) {
      setItems((list) => (list ?? []).map((x) => (x.id === it.id ? { ...x, pinned: it.pinned } : x)));
      setError("That pin wasn't saved. Try again.");
      return;
    }
    void load();
  };

  const open = (it: ShelfItem) => {
    if (isMotionArtifact(it) || isMotionVideo(it)) router.push({ pathname: "/motion", params: { id: it.id } } as never);
    else if (isDashboardArtifact(it)) router.push({ pathname: "/dashboard", params: { id: it.id } } as never);
    else if (isCanvasArtifact(it)) router.push({ pathname: "/canvas", params: { id: it.id } } as never);
    else if (isDocumentArtifact(it)) router.push({ pathname: "/document", params: { id: it.id } } as never);
    else if (it.kind === "link" && it.url) Linking.openURL(it.url).catch(() => setError("Couldn't open that link."));
    else setPeek(it);
  };

  const counts = (items ?? []).reduce<Record<string, number>>((m, it) => {
    const k = shelfKindOf(it);
    m[k] = (m[k] ?? 0) + 1;
    return m;
  }, {});
  const shown = (items ?? []).filter((it) => filter === "all" || shelfKindOf(it) === filter);
  const pinned = shown.filter((i) => i.pinned);
  const rest = shown.filter((i) => !i.pinned);
  const current = FILTERS.find((f) => f.id === filter)!;

  const remove = (it: ShelfItem, all: boolean) => {
    const what = all && it.versions > 1 ? `all ${it.versions} versions of “${it.title}”` : it.versions > 1 ? `the latest version of “${it.title}”` : `“${it.title}”`;
    showDialog(`Delete ${what}?`, it.path?.startsWith("uploads/") ? "It leaves the shelf and the conversation. The file stays in your Files." : "It leaves the shelf and the conversation, and Ghost's copy is deleted. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        if (!config) return;
        setActing(null);
        const r = await deleteArtifact(config, it.id, all);
        if (!r.ok) return setError(r.error);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        await load();
      } },
    ]);
  };
  const searching = query.trim().length > 0 || filter !== "all";

  return (
    <View style={styles.container}>
      <ScreenBackground variant="calm" />
      <ScreenHeader title="Made by Ghost" subtitle="Everything Ghost has made for you" />
      {!config ? (
        <Text style={styles.empty}>What Ghost makes lives on your Pod. Connect one to see it.</Text>
      ) : (
        <EdgeScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.bar}>
            <View style={styles.search}>
              <Search size={16} color={Ghost.text.tertiary} strokeWidth={2} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search"
                placeholderTextColor={Ghost.text.tertiary}
                style={styles.searchInput}
                returnKeyType="search"
                accessibilityLabel="Search what Ghost made"
                selectionColor={Ghost.accent.primary}
              />
              {query ? (
                <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear the search">
                  <X size={16} color={Ghost.text.tertiary} strokeWidth={2} />
                </Pressable>
              ) : null}
            </View>
            <Pressable
              onPress={() => setChoosing(true)}
              style={({ pressed }) => [styles.filter, filter !== "all" && styles.filterOn, pressed && { opacity: 0.75 }]}
              accessibilityRole="button"
              accessibilityLabel={`Showing ${current.label.toLowerCase()}. Change what is shown`}
            >
              <Text style={[styles.filterText, filter !== "all" && { color: Ghost.text.primary }]} numberOfLines={1}>{current.label}</Text>
              <ChevronDown size={15} color={filter !== "all" ? Ghost.text.primary : Ghost.text.tertiary} strokeWidth={2} />
            </Pressable>
          </View>

          {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
          {items === null && !error ? <ActivityIndicator style={{ marginTop: Space.xxxl }} color={Ghost.text.tertiary} /> : null}

          {items && shown.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>{searching ? "Nothing here." : "Nothing yet."}</Text>
              <Text style={styles.emptyText}>
                {searching
                  ? "Nothing Ghost made matches that. Try other words, or another kind."
                  : "Ask Ghost to build a page, write a document or make a picture. What it makes gathers here, to open again."}
              </Text>
            </View>
          ) : null}

          {pinned.length > 0 ? <Section title="Pinned" items={pinned} onOpen={open} onMore={setActing} config={config} /> : null}
          {rest.length > 0 ? <Section title={pinned.length > 0 ? "Everything else" : undefined} items={rest} onOpen={open} onMore={setActing} config={config} /> : null}
        </EdgeScrollView>
      )}
      <GhostSheet visible={choosing} onClose={() => setChoosing(false)} title="Show">
        <View style={lifeSheet.group}>
          {FILTERS.filter((f) => f.id === "all" || f.id === filter || (counts[f.id] ?? 0) > 0).map((f, i) => {
            const n = f.id === "all" ? (items ?? []).length : counts[f.id] ?? 0;
            const on = filter === f.id;
            const k = f.id === "all" ? null : KIND[f.id];
            return (
              <Pressable
                key={f.id}
                onPress={() => { setFilter(f.id); setChoosing(false); Haptics.selectionAsync().catch(() => {}); }}
                style={({ pressed }) => [styles.option, i > 0 && styles.rowLine, pressed && styles.pressed]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: n === 0 && f.id !== "all" }}
                disabled={n === 0 && f.id !== "all"}
              >
                <View style={[styles.optionIcon, k && { backgroundColor: alpha(toHex(k.tint), 0.12), borderColor: alpha(toHex(k.tint), 0.3) }]}>
                  {k ? <k.Icon size={15} color={k.tint} strokeWidth={1.9} /> : <Layers size={15} color={Ghost.text.secondary} strokeWidth={1.9} />}
                </View>
                <Text style={[styles.optionText, n === 0 && f.id !== "all" && { color: Ghost.text.tertiary }]}>{f.label}</Text>
                <Text style={styles.optionCount}>{n}</Text>
                <View style={styles.optionCheck}>{on ? <Check size={16} color={Ghost.accent.primary} strokeWidth={2.2} /> : null}</View>
              </Pressable>
            );
          })}
        </View>
      </GhostSheet>
      <GhostSheet visible={acting !== null} onClose={() => setActing(null)} title={acting?.title} message={acting ? shelfMeta(acting) : undefined}>
        {acting ? (
          <View style={{ gap: Space.sm }}>
            <GhostButton title="Open" fullWidth onPress={() => { const it = acting; setActing(null); open(it); }} />
            <GhostButton title={acting.pinned ? "Unpin" : "Pin to the top"} fullWidth variant="secondary" onPress={() => { const it = acting; setActing(null); void togglePin(it); }} />
            {acting.versions > 1 ? (
              <>
                <GhostButton title="Delete the latest version" fullWidth variant="danger" onPress={() => remove(acting, false)} />
                <GhostButton title={`Delete all ${acting.versions} versions`} fullWidth variant="danger" onPress={() => remove(acting, true)} />
              </>
            ) : (
              <GhostButton title="Delete" fullWidth variant="danger" onPress={() => remove(acting, true)} />
            )}
          </View>
        ) : null}
      </GhostSheet>
      <GhostSheet visible={peek !== null} onClose={() => setPeek(null)} title={peek?.title}>
        {peek && config ? <ArtifactCard config={config} artifact={peek} /> : null}
      </GhostSheet>
    </View>
  );
}

function Section({
  title,
  items,
  onOpen,
  onMore,
  config,
}: {
  title?: string;
  items: ShelfItem[];
  onOpen: (it: ShelfItem) => void;
  onMore: (it: ShelfItem) => void;
  config: NonNullable<ReturnType<typeof useGhostStore.getState>["config"]>;
}) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.eyebrow}>{title}</Text> : null}
      <View style={styles.group}>
        {items.map((it, i) => (
          <Row key={it.id} item={it} first={i === 0} onOpen={() => onOpen(it)} onMore={() => onMore(it)} config={config} />
        ))}
      </View>
    </View>
  );
}

// Picture thumbnails are fetched once a session.
const thumbs = new Map<string, string>();

function Row({ item, first, onOpen, onMore, config }: { item: ShelfItem; first: boolean; onOpen: () => void; onMore: () => void; config: NonNullable<ReturnType<typeof useGhostStore.getState>["config"]> }) {
  const kind = shelfKindOf(item);
  const k = KIND[kind];
  const [thumb, setThumb] = useState<string | null>(thumbs.get(item.id) ?? null);
  useEffect(() => {
    if (kind !== "pictures" || thumb || !item.path) return;
    let live = true;
    fetchWorkspacePreview(config, item.path).then((p) => {
      if (!live || !p?.image_base64) return;
      const uri = `data:${p.mime_type ?? "image/png"};base64,${p.image_base64}`;
      thumbs.set(item.id, uri);
      setThumb(uri);
    }).catch(() => {});
    return () => { live = false; };
  }, [kind, thumb, item.path, item.id, config]);
  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [styles.row, !first && styles.rowLine, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${shelfMeta(item)}`}
    >
      <View style={[styles.tile, { backgroundColor: alpha(toHex(k.tint), 0.12), borderColor: alpha(toHex(k.tint), 0.3) }]}>
        {thumb ? <Image source={{ uri: thumb }} style={styles.thumb} /> : <k.Icon size={19} color={k.tint} strokeWidth={1.8} />}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>{shelfMeta(item)}</Text>
      </View>
      <Pressable
        onPress={onMore}
        hitSlop={10}
        style={({ pressed }) => [styles.pin, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel={`More for ${item.title}: open, pin or delete`}
      >
        <MoreHorizontal size={18} color={Ghost.text.tertiary} strokeWidth={1.9} />
      </Pressable>
    </Pressable>
  );
}

function toHex(c: string) {
  return /^#[0-9a-f]{6}$/i.test(c) ? c : "#FFFFFF";
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  content: { paddingBottom: 96, paddingHorizontal: Space.lg, gap: Space.md },
  bar: { flexDirection: "row", alignItems: "center", gap: Space.sm, marginTop: Space.xs },
  search: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, height: 46, paddingHorizontal: 16, borderRadius: 23, backgroundColor: "rgba(0,0,0,0.42)", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  filter: { flexDirection: "row", alignItems: "center", gap: 6, height: 46, maxWidth: 150, paddingLeft: 16, paddingRight: 12, borderRadius: 23, backgroundColor: "rgba(0,0,0,0.42)", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  filterOn: { backgroundColor: alpha(Ghost.accent.primary, 0.16), borderColor: alpha(Ghost.accent.primary, 0.45) },
  filterText: { fontSize: 14.5, fontWeight: "500", color: Ghost.text.secondary, flexShrink: 1 },
  option: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 14 },
  optionIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border, backgroundColor: Ghost.glass.fill },
  optionText: { flex: 1, fontSize: 15.5, color: Ghost.text.primary },
  optionCount: { fontSize: 14, color: Ghost.text.tertiary, fontVariant: ["tabular-nums"] },
  optionCheck: { width: 20, alignItems: "flex-end" },
  searchInput: { flex: 1, fontSize: 15.5, color: Ghost.text.primary, paddingVertical: 0 },
  section: { gap: Space.sm, marginTop: Space.xs },
  eyebrow: { fontSize: 11.5, fontWeight: "500", letterSpacing: 1.1, textTransform: "uppercase", color: Ghost.text.tertiary, marginLeft: 4 },
  group: { borderRadius: 24, borderCurve: "continuous", backgroundColor: "rgba(0,0,0,0.42)", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 66, paddingLeft: 12, paddingRight: 8, paddingVertical: 10 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Ghost.border.subtle },
  pressed: { backgroundColor: "rgba(255,255,255,0.04)" },
  tile: { width: 44, height: 44, borderRadius: 14, borderCurve: "continuous", borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  thumb: { width: "100%", height: "100%" },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 15.5, lineHeight: 20, fontWeight: "500", letterSpacing: -0.15, color: Ghost.text.primary },
  rowMeta: { fontSize: 12.5, lineHeight: 17, color: Ghost.text.tertiary },
  pin: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  error: { fontSize: 13.5, color: Ghost.status.error, textAlign: "center" },
  empty: { textAlign: "center", color: Ghost.text.tertiary, fontSize: 14.5, marginTop: Space.xxxl, paddingHorizontal: Space.xl },
  emptyWrap: { alignItems: "center", paddingTop: Space.huge, paddingHorizontal: Space.xl, gap: Space.sm },
  emptyTitle: { fontFamily: Fonts.voice, fontSize: 34, lineHeight: 40, color: Ghost.text.primary },
  emptyText: { fontSize: 15, lineHeight: 22, fontWeight: "300", color: Ghost.text.secondary, textAlign: "center" },
});
