import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ghost, Space } from "@/constants/theme";
import { ScreenHeader } from "@/components/screen-header";
import { deleteFile, fetchFileContent, fetchFilePreview, type FilePreview } from "@/lib/ghostApi";
import { fileSize } from "@/lib/attachments";
import { writeCacheFile } from "@/lib/localFiles";
import { useGhostStore } from "@/lib/store";
import { EdgeScrollView } from "@/components/scroll-edge";

/**
 * One file the owner sent Ghost: shown as itself when it is a photo or text,
 * as the text Ghost reads from it when it is a document or spreadsheet, and
 * always openable in the phone's own viewer (where a PDF is a real PDF).
 */
export default function FileScreen() {
  const router = useRouter();
  const config = useGhostStore((s) => s.config);
  const { id, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const [p, setP] = useState<FilePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"open" | "delete" | null>(null);

  useEffect(() => {
    if (!config || !id) return;
    let live = true;
    fetchFilePreview(config, id)
      .then((r) => live && setP(r))
      .catch(() => live && setError("Couldn't reach your Pod to load this file."));
    return () => {
      live = false;
    };
  }, [config, id]);

  const open = useCallback(async () => {
    if (!config || !id || busy) return;
    setBusy("open");
    setError(null);
    try {
      const f = await fetchFileContent(config, id);
      const Sharing = await import("expo-sharing");
      if (!(await Sharing.isAvailableAsync())) {
        setError("This device can't open files from here.");
        return;
      }
      const uri = await writeCacheFile(f.name, f.base64, "base64");
      await Sharing.shareAsync(uri, f.mime ? { mimeType: f.mime } : undefined);
    } catch {
      setError("Couldn't open that file.");
    } finally {
      setBusy(null);
    }
  }, [config, id, busy]);

  const remove = () => {
    if (!config || !id) return;
    Alert.alert(`Delete “${p?.name ?? name ?? "this file"}”?`, "It is removed from your Pod. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusy("delete");
          try {
            await deleteFile(config, id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            router.back();
          } catch {
            setError("Couldn't delete that. Try again.");
            setBusy(null);
          }
        },
      },
    ]);
  };

  const title = p?.name ?? (typeof name === "string" ? name : "File");
  return (
    <View style={styles.container}>
      <ScreenHeader title={title} subtitle={p ? `${fileSize(p.size)}${p.extracted ? " · text Ghost reads from it" : ""}` : undefined} />
      <View style={styles.actions}>
        <Pressable onPress={open} disabled={!!busy} style={[styles.btn, styles.btnPrimary]} accessibilityRole="button" accessibilityLabel="Open in another app">
          {busy === "open" ? <ActivityIndicator size="small" color={Ghost.text.inverse} /> : <Text style={styles.btnPrimaryText}>Open</Text>}
        </Pressable>
        <Pressable onPress={remove} disabled={!!busy} style={styles.btn} accessibilityRole="button" accessibilityLabel="Delete file">
          <Text style={styles.btnDangerText}>Delete</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!p && !error ? (
        <ActivityIndicator style={{ marginTop: Space.xxxl }} color={Ghost.text.tertiary} />
      ) : p ? (
        <EdgeScrollView contentContainerStyle={styles.content}>
          {p.previewable && p.image_base64 ? (
            <Image
              source={{ uri: `data:${p.mime};base64,${p.image_base64}` }}
              style={styles.image}
              resizeMode="contain"
              accessibilityLabel={`Preview of ${p.name}`}
            />
          ) : null}
          {p.previewable && p.content !== undefined ? (
            <>
              <Text style={styles.text} selectable>{p.content}</Text>
              {p.truncated ? <Text style={styles.note}>Showing the first part. Open the file to see all of it.</Text> : null}
            </>
          ) : null}
          {!p.previewable ? <Text style={styles.note}>{p.reason ?? "There is no preview for this file. Open it instead."}</Text> : null}
        </EdgeScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  content: { padding: Space.xl, paddingBottom: Space.huge, gap: Space.md },
  actions: { flexDirection: "row", gap: Space.sm, paddingHorizontal: Space.xl, paddingBottom: Space.sm },
  btn: {
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: Space.lg,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Ghost.bg.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.border.default,
  },
  btnPrimary: { backgroundColor: Ghost.accent.primary, borderColor: Ghost.accent.primary },
  btnPrimaryText: { color: Ghost.text.inverse, fontWeight: "600", fontSize: 15 },
  btnDangerText: { color: Ghost.status.error, fontWeight: "600", fontSize: 15 },
  image: { width: "100%", height: 420, borderRadius: 12, backgroundColor: Ghost.bg.sunken },
  text: { fontSize: 14, lineHeight: 21, color: Ghost.text.primary, fontFamily: "Menlo" },
  note: { fontSize: 14, lineHeight: 20, color: Ghost.text.secondary },
  error: { fontSize: 14, color: Ghost.status.error, paddingHorizontal: Space.xl, marginTop: Space.sm },
});
