import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Ghost, Space } from "@/constants/theme";
import { ScreenHeader } from "@/components/screen-header";
import { deleteFile, fetchFiles, type StoredFile } from "@/lib/ghostApi";
import { fileSize } from "@/lib/attachments";
import { useGhostStore } from "@/lib/store";
import { whenAgo } from "@/lib/when";

const KIND_WORD: Record<string, string> = {
  image: "Photo",
  document: "Document",
  spreadsheet: "Spreadsheet",
  text: "Text",
  audio: "Audio",
  video: "Video",
  archive: "Archive",
};

/**
 * Everything the owner has sent Ghost, kept on their Pod. Deleting removes the
 * file itself. Old files also leave on their own after the retention window.
 */
export default function FilesScreen() {
  const router = useRouter();
  const config = useGhostStore((s) => s.config);
  const [files, setFiles] = useState<StoredFile[] | null>(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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

  useEffect(() => {
    void load();
  }, [load]);

  const confirmDelete = (f: StoredFile) => {
    Alert.alert(`Delete “${f.name}”?`, "It is removed from your Pod. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusy(f.id);
          try {
            await deleteFile(config!, f.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            await load();
          } catch {
            setError("Couldn't delete that. Try again.");
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Files"
        subtitle={files ? (files.length === 0 ? "Nothing yet" : `${files.length} on your Pod, kept ${days} days`) : undefined}
      />
      {!config ? (
        <Text style={styles.empty}>Files live on your Ghost Pod. Connect one to see them.</Text>
      ) : !files && !error ? (
        <ActivityIndicator style={{ marginTop: Space.xxxl }} color={Ghost.text.tertiary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {files && files.length === 0 ? (
            <Text style={styles.empty}>
              Photos and files you send Ghost appear here. Ghost keeps them for {days} days, or until you delete them.
            </Text>
          ) : null}
          {files && files.length > 0 ? (
            <View style={styles.card}>
              {files.map((f) => (
                <View key={f.id} style={styles.item}>
                  <Pressable
                    style={styles.itemText}
                    onPress={() => router.push({ pathname: "/file", params: { id: f.id, name: f.name } } as never)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${f.name}`}
                  >
                    <Text style={styles.itemTitle} numberOfLines={1}>{f.name}</Text>
                    <Text style={styles.itemMeta}>
                      {[KIND_WORD[f.kind] ?? "File", fileSize(f.size), whenAgo(f.created_at)].filter(Boolean).join(" · ")}
                    </Text>
                  </Pressable>
                  {busy === f.id ? (
                    <ActivityIndicator size="small" color={Ghost.text.tertiary} />
                  ) : (
                    <Pressable onPress={() => confirmDelete(f)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Delete ${f.name}`} style={styles.delete}>
                      <Text style={styles.deleteText}>Delete</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  content: { paddingBottom: Space.huge },
  card: {
    marginHorizontal: Space.lg,
    marginTop: Space.lg,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: Ghost.bg.raised,
    overflow: "hidden",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Ghost.border.subtle,
  },
  itemText: { flex: 1, gap: 2 },
  itemTitle: { fontSize: 16, lineHeight: 21, color: Ghost.text.primary },
  itemMeta: { fontSize: 13, lineHeight: 18, color: Ghost.text.tertiary },
  delete: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  deleteText: { fontSize: 14, fontWeight: "600", color: Ghost.status.error },
  empty: { fontSize: 15, lineHeight: 22, color: Ghost.text.secondary, paddingHorizontal: Space.xl, marginTop: Space.lg },
  error: { fontSize: 14, color: Ghost.status.error, paddingHorizontal: Space.xl, marginTop: Space.md },
});
