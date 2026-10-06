import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { Text } from "@/components/text";
import { useFocusEffect, useRouter } from "expo-router";
import { Ghost, Space } from "@/constants/theme";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { TONE } from "@/components/file-card";
import { fetchFiles, fetchFileThumb, type StoredFile } from "@/lib/ghostApi";
import { fileKind, fileSize } from "@/lib/attachments";
import { alpha } from "@/constants/theme";
import { useGhostStore } from "@/lib/store";
import { whenAgo } from "@/lib/when";
import { EdgeScrollView } from "@/components/scroll-edge";

type Filter = "all" | "photos" | "documents";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "photos", label: "Photos" },
  { id: "documents", label: "Documents" },
];

const isPhoto = (f: StoredFile) => f.kind === "image" || f.mime.startsWith("image/");

/**
 * Everything the owner has sent Ghost, kept on their Pod, as a gallery: photos
 * as themselves, everything else as a tile that says what it is. Tap one to
 * open it; deleting lives in the viewer. Old files also leave on their own
 * after the retention window. The same layout as the console.
 */
export default function FilesScreen() {
  const router = useRouter();
  const config = useGhostStore((s) => s.config);
  const { width } = useWindowDimensions();
  const [files, setFiles] = useState<StoredFile[] | null>(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    if (!config) return;
    try {
      const r = await fetchFiles(config);
      setFiles(r.files);
      setDays(r.retentionDays);
      setError(null);
    } catch {
      setError("Couldn't reach your Pod to read your files.");
    }
  }, [config]);

  // On every return, not just the first visit: a file deleted from its own
  // screen stayed in this list after Back until the screen was reopened.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const shown = useMemo(
    () => (files ?? []).filter((f) => (filter === "all" ? true : filter === "photos" ? isPhoto(f) : !isPhoto(f))),
    [files, filter],
  );
  const photos = (files ?? []).filter(isPhoto).length;

  const GAP = Space.md;
  const cardW = Math.floor((width - Space.lg * 2 - GAP) / 2);

  return (
    <View style={styles.container}>
      <ScreenBackground variant="calm" />
      <ScreenHeader
        title="Files"
        subtitle={files ? (files.length === 0 ? "Nothing yet" : `${files.length} on your Pod, kept ${days} days`) : undefined}
      />
      {!config ? (
        <Text style={styles.empty}>Files live on your Ghost Pod. Connect one to see them.</Text>
      ) : !files && !error ? (
        <ActivityIndicator style={{ marginTop: Space.xxxl }} color={Ghost.text.tertiary} />
      ) : (
        <EdgeScrollView contentContainerStyle={styles.content}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {files && files.length === 0 ? (
            <Text style={styles.empty}>
              Photos and files you send Ghost appear here. Ghost keeps them for {days} days, or until you delete them.
            </Text>
          ) : null}
          {files && files.length > 0 ? (
            <>
              <View style={styles.seg} accessibilityRole="tablist">
                {FILTERS.map((f) => {
                  const on = filter === f.id;
                  const count = f.id === "all" ? files.length : f.id === "photos" ? photos : files.length - photos;
                  return (
                    <Pressable
                      key={f.id}
                      onPress={() => setFilter(f.id)}
                      style={[styles.segBtn, on && styles.segOn]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.segText, on && styles.segTextOn]}>{f.label}</Text>
                      <Text style={[styles.segCount, on && styles.segTextOn]}>{count}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={[styles.grid, { gap: GAP }]}>
                {shown.map((f) => (
                  <Tile
                    key={f.id}
                    file={f}
                    width={cardW}
                    onPress={() => router.push({ pathname: "/file", params: { id: f.id, name: f.name } } as never)}
                  />
                ))}
              </View>
              {shown.length === 0 ? <Text style={styles.empty}>Nothing in this view.</Text> : null}
            </>
          ) : null}
        </EdgeScrollView>
      )}
    </View>
  );
}

function Tile({ file, width, onPress }: { file: StoredFile; width: number; onPress: () => void }) {
  const config = useGhostStore((s) => s.config);
  const [thumb, setThumb] = useState<string | null>(null);
  const kind = fileKind(file.name, file.mime);
  const color = TONE[kind.tone];
  useEffect(() => {
    if (!config || !isPhoto(file)) return;
    let live = true;
    fetchFileThumb(config, file.id).then((u) => live && setThumb(u));
    return () => {
      live = false;
    };
  }, [config, file]);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { width }, pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] }]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${file.name}, ${kind.label}, ${fileSize(file.size)}`}
    >
      <View style={[styles.thumb, { backgroundColor: alpha(color, 0.1) }]}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[styles.badge, { borderColor: alpha(color, 0.35), backgroundColor: alpha(color, 0.14) }]}>
            <Text style={[styles.badgeText, { color }]} numberOfLines={1}>{kind.label.slice(0, 4)}</Text>
          </View>
        )}
      </View>
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={1} ellipsizeMode="middle">{file.name}</Text>
        <Text style={styles.sub} numberOfLines={1}>{[fileSize(file.size), whenAgo(file.created_at)].filter(Boolean).join(" · ")}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  content: { paddingBottom: 96, paddingHorizontal: Space.lg },
  seg: {
    alignSelf: "center",
    flexDirection: "row",
    gap: 2,
    padding: 3,
    marginTop: Space.xs,
    marginBottom: Space.lg,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.42)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  segBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18 },
  segOn: { backgroundColor: Ghost.glass.fillStrong },
  segText: { fontSize: 14, fontWeight: "500", color: Ghost.text.secondary },
  segTextOn: { color: Ghost.text.primary },
  segCount: { fontSize: 12, color: Ghost.text.tertiary, fontVariant: ["tabular-nums"] },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  tile: {
    borderRadius: 22,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.42)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  thumb: { aspectRatio: 4 / 3, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  badge: {
    minWidth: 56,
    height: 56,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  badgeText: { fontSize: 14, fontWeight: "600", letterSpacing: 0.5 },
  meta: { paddingHorizontal: 12, paddingVertical: 10, gap: 1 },
  name: { fontSize: 14, lineHeight: 19, fontWeight: "500", color: Ghost.text.primary },
  sub: { fontSize: 12, lineHeight: 16, color: Ghost.text.tertiary },
  empty: {
    fontSize: 15.5,
    lineHeight: 23,
    fontWeight: "300",
    color: Ghost.text.secondary,
    textAlign: "center",
    paddingHorizontal: Space.xl,
    marginTop: Space.lg,
  },
  error: { fontSize: 14, color: Ghost.status.error, textAlign: "center", marginTop: Space.md },
});
