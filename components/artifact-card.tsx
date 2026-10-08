import { writeCacheFile } from "@/lib/localFiles";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, FadeIn, useReducedMotion } from "react-native-reanimated";
import { ArrowDownToLine, ArrowUpRight, ChevronDown, ChevronUp, FileText, Link2, Maximize2 } from "lucide-react-native";
import { PhotoViewer } from "@/components/photo-viewer";
import { Text } from "@/components/text";
import { alpha, Fonts, Ghost, Space } from "@/constants/theme";
import { GlassCard } from "@/components/glass";
import { MarkdownBubble } from "@/components/markdown-bubble";
import { CodeBlock } from "@/components/code-block";
import { TONE } from "@/components/file-card";
import { previewRender } from "@/lib/fileKinds";
import { fileKind } from "@/lib/attachments";
import {
  fetchWorkspacePreview,
  type Artifact,
  type GhostConfig,
} from "@/lib/ghostApi";
import { artifactActionsOf, artifactViewOf, unavailableReasonOf } from "@/lib/artifacts";

const EASE = Easing.bezier(0.23, 1, 0.32, 1);

interface Props {
  config: GhostConfig;
  artifact: Artifact;
}

/**
 * Something Ghost handed over that is not a page to run: a file, a link, a
 * written result, a picture.
 *
 * A file looks the way a file looks everywhere in the app (the attachment
 * card: a badge tinted by its kind, the name, what it is), so a report Ghost
 * wrote and a PDF you sent read as the same kind of thing. Tapping it opens the
 * file in place; the round button saves it. A link is the same row and opens
 * in the browser. A written result keeps its words, a few lines until opened.
 * A picture is shown, not filed. Nothing here offers an action the Pod did not.
 */
export function ArtifactCard({ config, artifact }: Props) {
  const reduce = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const view = artifactViewOf(artifact);
  const actions = artifactActionsOf(artifact);
  const canPreview = actions.some((a) => a.kind === "preview" || a.kind === "open");
  const canSave = artifact.kind === "file" && actions.some((a) => a.kind === "download");
  const isPicture = artifact.kind === "file" && /\.(png|jpe?g|webp|gif)$/i.test(artifact.path ?? "") && artifact.state === "available";
  const [viewer, setViewer] = useState<number | null>(null);

  const loadPreview = async () => {
    if (artifact.kind !== "file" || !artifact.path) return;
    setPreviewBusy(true);
    setPreviewError(null);
    const p = await fetchWorkspacePreview(config, artifact.path);
    setPreviewBusy(false);
    if (!p || !p.previewable) {
      setPreviewError(p?.reason ?? "This file can't be previewed.");
      return;
    }
    if (p.kind === "image" && p.image_base64) {
      setPreviewImage(`data:${p.mime_type ?? "image/png"};base64,${p.image_base64}`);
      setPreview(null);
    } else {
      setPreview((p.content ?? "").slice(0, 8000));
      setPreviewImage(null);
    }
  };

  useEffect(() => {
    if (isPicture && previewImage === null && !previewBusy && !previewError) void loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPicture]);

  const download = async () => {
    if (artifact.kind !== "file" || !artifact.path || saving) return;
    setSaving(true);
    setPreviewError(null);
    try {
      const Sharing = await import("expo-sharing");
      if (!(await Sharing.isAvailableAsync())) {
        setPreviewError("Saving files isn't supported on this device.");
        return;
      }
      const p = await fetchWorkspacePreview(config, artifact.path);
      const name = artifact.path.split("/").pop() ?? "ghost-file";
      let uri: string;
      if (p?.image_base64) {
        uri = await writeCacheFile(name, p.image_base64, "base64");
      } else if (p?.content) {
        uri = await writeCacheFile(name, p.content.slice(0, 262144), "utf8");
      } else {
        setPreviewError("This file can't be saved from here.");
        return;
      }
      await Sharing.shareAsync(uri);
    } catch {
      setPreviewError("Couldn't save that file.");
    } finally {
      setSaving(false);
    }
  };

  const openLink = () => {
    if (artifact.kind === "link" && artifact.url) {
      Linking.openURL(artifact.url).catch(() => setPreviewError("Couldn't open that link."));
    }
  };

  const togglePreview = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && artifact.kind === "file" && preview === null && previewImage === null) void loadPreview();
  };

  // ── Nothing to act on: what it was, and why it is not here ──────────────
  if (view === "unknown" || artifact.state !== "available") {
    const why = artifact.state !== "available" ? unavailableReasonOf(artifact) : artifact.summary ?? "";
    return (
      <GlassCard style={styles.rowCard} accessibilityLabel={`${artifact.title}. ${why}`}>
        <View style={styles.row}>
          <Badge tint={Ghost.text.tertiary} icon={<FileText size={18} color={Ghost.text.tertiary} strokeWidth={1.8} />} />
          <View style={styles.titles}>
            <Text style={[styles.name, { color: Ghost.text.secondary }]} numberOfLines={1}>{artifact.title}</Text>
            {why ? <Text style={styles.meta} numberOfLines={2}>{why}</Text> : null}
          </View>
        </View>
      </GlassCard>
    );
  }

  // ── A picture: shown, with its name under it ────────────────────────────
  if (isPicture) {
    return (
      <View style={styles.picture}>
        <Pressable
          onPress={() => previewImage && setViewer(0)}
          accessibilityRole="imagebutton"
          accessibilityLabel={`${artifact.title}. Tap to see it full screen`}
          style={({ pressed }) => [pressed && { opacity: 0.88 }]}
        >
          {previewImage ? (
            <Image source={{ uri: previewImage }} style={styles.pictureImage} resizeMode="cover" />
          ) : (
            <View style={[styles.pictureImage, styles.pictureEmpty]}>
              {previewError ? null : <ActivityIndicator size="small" color={Ghost.text.tertiary} />}
              <Text style={styles.status}>{previewError ?? "Getting the picture…"}</Text>
            </View>
          )}
          {previewImage ? (
            <View style={styles.pictureExpand} pointerEvents="none">
              <Maximize2 size={13} color={Ghost.text.primary} strokeWidth={2.1} />
            </View>
          ) : null}
        </Pressable>
        <View style={styles.captionRow}>
          <View style={styles.titles}>
            <Text style={styles.name} numberOfLines={1}>{artifact.title}</Text>
            {artifact.summary ? <Text style={styles.meta} numberOfLines={1}>{artifact.summary}</Text> : null}
          </View>
          {canSave ? <RoundButton label="Save the picture" busy={saving} onPress={() => void download()} /> : null}
        </View>
        {previewImage ? <PhotoViewer uris={[previewImage]} start={viewer} onClose={() => setViewer(null)} /> : null}
      </View>
    );
  }

  // ── A link: the same row, and it opens ──────────────────────────────────
  if (artifact.kind === "link") {
    const host = hostOf(artifact.url);
    return (
      <GlassCard style={styles.rowCard} accessibilityLabel={`Link: ${artifact.title}${host ? `, ${host}` : ""}`}>
        <Pressable
          onPress={openLink}
          disabled={!artifact.url}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          accessibilityRole="link"
          accessibilityHint="Opens in your browser"
        >
          <Badge tint={Ghost.status.info} icon={<Link2 size={18} color={Ghost.status.info} strokeWidth={1.9} />} />
          <View style={styles.titles}>
            <Text style={styles.name} numberOfLines={2}>{artifact.title}</Text>
            <Text style={styles.meta} numberOfLines={1}>{artifact.summary || host || artifact.url}</Text>
          </View>
          <View style={styles.round} pointerEvents="none">
            <ArrowUpRight size={16} color={Ghost.text.primary} strokeWidth={2} />
          </View>
        </Pressable>
        {previewError ? <Text style={[styles.error, styles.inset]}>{previewError}</Text> : null}
      </GlassCard>
    );
  }

  // ── A written result: its words, a few lines until opened ───────────────
  if (artifact.kind === "text") {
    const text = (artifact.text ?? "").slice(0, 4000);
    const long = text.length > 280 || text.split("\n").length > 6;
    return (
      <GlassCard style={styles.textCard} accessibilityLabel={`Result from Ghost: ${artifact.title}`}>
        <View style={styles.kickerRow}>
          <FileText size={13} color={Ghost.text.tertiary} strokeWidth={2} />
          <Text style={styles.kicker}>Result</Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>{artifact.title}</Text>
        {artifact.summary ? <Text style={styles.summary} numberOfLines={expanded ? undefined : 2}>{artifact.summary}</Text> : null}
        {text ? (
          expanded ? (
            <MarkdownBubble content={text} streaming={false} />
          ) : (
            <Text style={styles.body} numberOfLines={6}>{text}</Text>
          )
        ) : null}
        {long ? (
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            hitSlop={8}
            style={({ pressed }) => [styles.more, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.moreText}>{expanded ? "Show less" : "Show all"}</Text>
            {expanded ? <ChevronUp size={14} color={Ghost.accent.primary} strokeWidth={2} /> : <ChevronDown size={14} color={Ghost.accent.primary} strokeWidth={2} />}
          </Pressable>
        ) : null}
      </GlassCard>
    );
  }

  // ── A file: the attachment row; it opens in place, the button saves it ──
  const fileName = artifact.path?.split("/").pop() ?? artifact.title;
  const kind = fileKind(fileName);
  const tint = TONE[kind.tone];
  const sub = artifact.summary?.trim() || (fileName !== artifact.title ? fileName : "");
  const render = previewRender(artifact.path);
  return (
    <GlassCard style={styles.rowCard} accessibilityLabel={`File from Ghost: ${artifact.title}`}>
      <Pressable
        onPress={canPreview ? togglePreview : undefined}
        disabled={!canPreview}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityHint={canPreview ? (expanded ? "Hides the file" : "Shows the file here") : undefined}
      >
        <Badge tint={tint} label={kind.label} />
        <View style={styles.titles}>
          <Text style={styles.name} numberOfLines={2}>{artifact.title}</Text>
          <Text style={styles.meta} numberOfLines={1} ellipsizeMode="middle">{[kind.label, sub].filter(Boolean).join(" · ")}</Text>
        </View>
        {canPreview ? (
          <View style={styles.chevron} pointerEvents="none">
            {expanded ? <ChevronUp size={17} color={Ghost.text.tertiary} strokeWidth={2} /> : <ChevronDown size={17} color={Ghost.text.tertiary} strokeWidth={2} />}
          </View>
        ) : null}
        {canSave ? <RoundButton label={`Save ${fileName}`} busy={saving} onPress={() => void download()} /> : null}
      </Pressable>
      {expanded || previewError ? (
        <Animated.View entering={reduce ? undefined : FadeIn.duration(180).easing(EASE)} style={styles.preview}>
          {previewBusy ? (
            <View style={styles.previewState}>
              <ActivityIndicator size="small" color={Ghost.text.tertiary} />
              <Text style={styles.status}>Opening the file…</Text>
            </View>
          ) : null}
          {previewError ? <Text style={styles.error}>{previewError}</Text> : null}
          {expanded && previewImage ? (
            <Image source={{ uri: previewImage }} style={styles.image} resizeMode="contain" accessibilityLabel={`Preview of ${artifact.title}`} />
          ) : null}
          {expanded && preview ? (
            // A file is shown as itself: Markdown only for Markdown, everything
            // else as code (HTML source as HTML, a script as a script).
            render.kind === "markdown" ? (
              <MarkdownBubble content={preview} streaming={false} />
            ) : (
              <CodeBlock language={render.language} code={preview.replace(/\n$/, "")} />
            )
          ) : null}
        </Animated.View>
      ) : null}
    </GlassCard>
  );
}

/** The kind of thing, as a small tinted tile: a file's type, or an icon. */
function Badge({ tint, label, icon }: { tint: string; label?: string; icon?: React.ReactNode }) {
  return (
    <View style={[styles.badge, { backgroundColor: alpha(toHex(tint), 0.13), borderColor: alpha(toHex(tint), 0.3) }]}>
      {icon ?? (
        <Text style={[styles.badgeText, { color: tint }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {(label ?? "FILE").slice(0, 4)}
        </Text>
      )}
    </View>
  );
}

function RoundButton({ label, busy, onPress }: { label: string; busy: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      hitSlop={6}
      style={({ pressed }) => [styles.round, pressed && styles.roundPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy }}
    >
      {busy ? <ActivityIndicator size="small" color={Ghost.text.secondary} /> : <ArrowDownToLine size={16} color={Ghost.text.primary} strokeWidth={2} />}
    </Pressable>
  );
}

/** Theme colours are #hex; the tertiary text is too. Anything else falls back to white. */
function toHex(c: string): string {
  return /^#[0-9a-f]{3,6}$/i.test(c) ? c : "#FFFFFF";
}

function hostOf(url: string | undefined): string {
  if (!url) return "";
  const m = /^[a-z]+:\/\/([^/?#]+)/i.exec(url);
  return m ? m[1].replace(/^www\./, "") : "";
}

const styles = StyleSheet.create({
  // A row card: the badge, the words and the controls on one line, the way
  // an attached file sits in the composer and under your messages.
  rowCard: { padding: 0, gap: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingLeft: 10, paddingRight: 12, minHeight: 66 },
  pressed: { opacity: 0.7 },
  badge: {
    width: 46,
    height: 46,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { fontSize: 11.5, fontWeight: "600", letterSpacing: 0.4 },
  titles: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 15, lineHeight: 20, fontWeight: "500", letterSpacing: -0.1, color: Ghost.text.primary },
  meta: { fontSize: 12.5, lineHeight: 17, color: Ghost.text.tertiary },
  chevron: { width: 20, alignItems: "center" },
  round: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Ghost.glass.fillStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  roundPressed: { opacity: 0.8, transform: [{ scale: 0.95 }] },
  preview: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Ghost.border.subtle,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 10,
    gap: Space.sm,
  },
  previewState: { flexDirection: "row", alignItems: "center", gap: Space.sm, minHeight: 36 },
  inset: { paddingHorizontal: 14, paddingBottom: 12 },
  // A written result: a heading in the voice, its words light.
  textCard: { padding: 18, gap: 6 },
  kickerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  kicker: { fontSize: 11.5, fontWeight: "500", letterSpacing: 1.1, textTransform: "uppercase", color: Ghost.text.tertiary },
  title: { fontFamily: Fonts.voice, fontSize: 24, lineHeight: 29, letterSpacing: -0.4, color: Ghost.text.primary },
  summary: { fontSize: 14.5, lineHeight: 21, fontWeight: "300", color: Ghost.text.secondary },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "300", color: "rgba(255,255,255,0.86)" },
  more: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 4, minHeight: 32, marginTop: 2 },
  moreText: { fontSize: 13.5, fontWeight: "500", color: Ghost.accent.primary },
  // A picture: the thing itself, with its name under it.
  picture: { gap: Space.sm },
  pictureImage: {
    width: "100%",
    aspectRatio: 16 / 10,
    borderRadius: 24,
    borderCurve: "continuous",
    backgroundColor: Ghost.bg.sunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  pictureEmpty: { alignItems: "center", justifyContent: "center", gap: Space.sm },
  pictureExpand: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  captionRow: { flexDirection: "row", alignItems: "center", gap: Space.md, paddingLeft: 4 },
  status: { fontSize: 13, color: Ghost.text.tertiary },
  error: { fontSize: 13, lineHeight: 18, color: Ghost.status.error },
  image: { width: "100%", height: 240, borderRadius: 16, backgroundColor: Ghost.bg.sunken },
});
