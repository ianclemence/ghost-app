import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import { showDialog } from "@/lib/dialog";
import { Text } from "@/components/text";
import { PdfPages } from "@/components/pdf-pages";
import { Download, Trash2 } from "lucide-react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Fonts, Ghost, Space } from "@/constants/theme";
import { GhostButton } from "@/components/ghost";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { deleteFile, fetchFileContent, fetchFilePreview, type FilePreview } from "@/lib/ghostApi";
import { fileSize } from "@/lib/attachments";
import { writeCacheFile } from "@/lib/localFiles";
import { friendlyFileName } from "@/lib/fileKinds";
import { useGhostStore } from "@/lib/store";
import { EdgeScrollView } from "@/components/scroll-edge";

/**
 * One file the owner sent Ghost: shown as itself when it is a photo, a PDF
 * (its real pages, as printed) or text; as the text Ghost reads from it when
 * it is another document or a spreadsheet; and always downloadable.
 */
export default function FileScreen() {
  const router = useRouter();
  const config = useGhostStore((s) => s.config);
  const { id, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const [p, setP] = useState<FilePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"download" | "delete" | null>(null);
  const [pdfPages, setPdfPages] = useState<number | null>(null);
  // A PDF is shown as its pages; if they can't be drawn, as its text.
  const [pdfFailed, setPdfFailed] = useState(false);
  const onPdfFail = useCallback(() => setPdfFailed(true), []);

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

  const download = useCallback(async () => {
    if (!config || !id || busy) return;
    setBusy("download");
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
      setError("Couldn't download that file.");
    } finally {
      setBusy(null);
    }
  }, [config, id, busy]);

  const remove = () => {
    if (!config || !id) return;
    showDialog(`Delete “${p?.name ?? name ?? "this file"}”?`, "It is removed from your Pod. This can't be undone.", [
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

  const isPdf = !!p && !pdfFailed && (p.mime === "application/pdf" || /\.pdf$/i.test(p.name));
  const title = friendlyFileName(p?.name ?? (typeof name === "string" ? name : "File"));
  return (
    <View style={styles.container}>
      <ScreenBackground variant="calm" />
      <ScreenHeader title={title} subtitle={p ? (isPdf ? `PDF · ${fileSize(p.size)}${pdfPages ? ` · ${pdfPages} ${pdfPages === 1 ? "page" : "pages"}` : ""}` : `${fileSize(p.size)}${p.extracted ? " · the text Ghost reads from it" : ""}`) : undefined} />
      {!p && !error ? (
        <ActivityIndicator style={{ marginTop: Space.xxxl }} color={Ghost.text.tertiary} />
      ) : p ? (
        <>
          <EdgeScrollView contentContainerStyle={styles.content}>
            {isPdf && config && id ? <PdfPages config={config} id={id} onPages={setPdfPages} onFail={onPdfFail} /> : null}
            {!isPdf && p.previewable && p.image_base64 ? (
              <Image
                source={{ uri: `data:${p.mime};base64,${p.image_base64}` }}
                style={styles.image}
                resizeMode="contain"
                accessibilityLabel={`Preview of ${p.name}`}
              />
            ) : null}
            {!isPdf && p.previewable && p.content !== undefined ? (
              <>
                <Text style={styles.text} selectable>{p.content}</Text>
                {p.truncated ? <Text style={styles.note}>Showing the first part. Download the file to see all of it.</Text> : null}
              </>
            ) : null}
            {!isPdf && !p.previewable ? <Text style={[styles.note, { textAlign: "center" }]}>{p.reason ?? "There is no preview for this file. Download it instead."}</Text> : null}
          </EdgeScrollView>
          <View style={styles.actions}>
            <GhostButton
              title={busy === "download" ? "Downloading…" : p ? `Download · ${fileSize(p.size)}` : "Download"}
              variant="secondary"
              onPress={download}
              disabled={!!busy}
              leftIcon={<Download size={16} color={Ghost.text.primary} strokeWidth={2} />}
            />
            <GhostButton
              title={busy === "delete" ? "Deleting…" : "Delete"}
              variant="danger"
              onPress={remove}
              disabled={!!busy}
              leftIcon={<Trash2 size={16} color={Ghost.status.error} strokeWidth={2} />}
            />
          </View>
        </>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  content: { padding: Space.lg, gap: Space.md },
  actions: { flexDirection: "row", gap: Space.sm, justifyContent: "center", paddingHorizontal: Space.xl, paddingTop: Space.md, paddingBottom: Space.xl },
  image: { width: "100%", height: 420 },
  text: { fontSize: 13.5, lineHeight: 20, color: Ghost.text.primary, fontFamily: Fonts.mono },
  note: { fontSize: 14, lineHeight: 20, fontWeight: "300", color: Ghost.text.secondary },
  error: { fontSize: 14, color: Ghost.status.error, paddingHorizontal: Space.xl, marginTop: Space.sm },
});
