import { writeCacheFile } from "@/lib/localFiles";
import React, { useEffect, useState } from "react";
import { Image, Linking, Pressable, StyleSheet, View } from "react-native";
import { PhotoViewer } from "@/components/photo-viewer";
import { Text } from "@/components/text";
import { Fonts, Ghost, Space } from "@/constants/theme";
import { GlassCard } from "@/components/glass";
import { GhostButton } from "@/components/ghost";
import { MarkdownBubble } from "@/components/markdown-bubble";
import { CodeBlock } from "@/components/code-block";
import { previewRender } from "@/lib/fileKinds";
import {
  fetchWorkspacePreview,
  type Artifact,
  type GhostConfig,
} from "@/lib/ghostApi";
import { artifactActionsOf, artifactViewOf, unavailableReasonOf } from "@/lib/artifacts";

interface Props {
  config: GhostConfig;
  artifact: Artifact;
}

export function ArtifactCard({ config, artifact }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sharing, setSharing] = useState<boolean | null>(null);
  const view = artifactViewOf(artifact);
  const actions = artifactActionsOf(artifact);
  // A picture (a screenshot the owner asked for, an image Ghost made) is
  // shown, not filed: the thing they asked to see, with a caption, full
  // screen on a tap. It used to be a "File" card behind a Preview button.
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

  const checkSharing = async () => {
    if (sharing !== null) return sharing;
    try {
      const Sharing = await import("expo-sharing");
      const ok = await Sharing.isAvailableAsync();
      setSharing(ok);
      return ok;
    } catch {
      setSharing(false);
      return false;
    }
  };

  const download = async () => {
    if (artifact.kind !== "file" || !artifact.path) return;
    try {
      const ok = await checkSharing();
      if (!ok) {
        setPreviewError("Downloads aren't supported on this device.");
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
        setPreviewError("This file can't be downloaded.");
        return;
      }
      const Sharing = await import("expo-sharing");
      await Sharing.shareAsync(uri);
    } catch {
      setPreviewError("Couldn't download that file.");
    }
  };

  const openLink = () => {
    if (artifact.kind === "link" && artifact.url) {
      Linking.openURL(artifact.url).catch(() => setPreviewError("Couldn't open that link."));
    }
  };

  if (view === "unknown") {
    return (
      <GlassCard style={styles.card} accessibilityLabel={`${artifact.title}. Details unavailable.`}>
        <Text style={styles.title} numberOfLines={2}>{artifact.title}</Text>
        {artifact.summary ? <Text style={styles.summary} numberOfLines={3}>{artifact.summary}</Text> : null}
      </GlassCard>
    );
  }

  if (artifact.state !== "available") {
    return (
      <GlassCard style={styles.card} accessibilityLabel={`${artifact.title}. ${unavailableReasonOf(artifact)}`}>
        <Text style={styles.title} numberOfLines={2}>{artifact.title}</Text>
        <Text style={styles.unavailable}>{unavailableReasonOf(artifact)}</Text>
      </GlassCard>
    );
  }

  if (isPicture) {
    return (
      <View style={styles.picture}>
        <Pressable
          onPress={() => previewImage && setViewer(0)}
          accessibilityRole="imagebutton"
          accessibilityLabel={`${artifact.title}. Tap to see it full screen`}
          style={({ pressed }) => [pressed && { opacity: 0.85 }]}
        >
          {previewImage ? (
            <Image source={{ uri: previewImage }} style={styles.pictureImage} resizeMode="cover" />
          ) : (
            <View style={[styles.pictureImage, styles.pictureEmpty]}>
              <Text style={styles.status}>{previewError ?? "Getting the picture…"}</Text>
            </View>
          )}
        </Pressable>
        <View style={styles.captionRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.caption} numberOfLines={1}>{artifact.title}</Text>
            {artifact.summary ? <Text style={styles.captionSub} numberOfLines={1}>{artifact.summary}</Text> : null}
          </View>
          {actions.some((a) => a.kind === "download") ? (
            <GhostButton title="Save" variant="secondary" size="sm" onPress={() => void download()} />
          ) : null}
        </View>
        {previewImage ? <PhotoViewer uris={[previewImage]} start={viewer} onClose={() => setViewer(null)} /> : null}
      </View>
    );
  }

  return (
    <GlassCard style={styles.card} accessibilityLabel={`Result from Ghost: ${artifact.title}`}>
      <Text style={styles.kicker}>{artifact.kind === "file" ? "File" : artifact.kind === "link" ? "Link" : "Result"}</Text>
      <Text style={styles.title} numberOfLines={2}>{artifact.title}</Text>
      {artifact.summary ? <Text style={styles.summary} numberOfLines={expanded ? undefined : 3}>{artifact.summary}</Text> : null}
      {artifact.kind === "text" && artifact.text ? (
        expanded ? (
          <MarkdownBubble content={artifact.text.slice(0, 4000)} streaming={false} />
        ) : (
          <Text style={styles.body} numberOfLines={6}>{artifact.text.slice(0, 4000)}</Text>
        )
      ) : null}
      {artifact.kind === "link" && artifact.url ? (
        <Text style={styles.url} numberOfLines={1}>{artifact.url}</Text>
      ) : null}
      <View style={styles.actions}>
        {actions.some((a) => a.kind === "preview" || a.kind === "open") ? (
          <GhostButton
            title={expanded ? "Collapse" : "Preview"}
            variant="secondary"
            size="sm"
            onPress={() => {
              const next = !expanded;
              setExpanded(next);
              if (next && artifact.kind === "file" && preview === null && previewImage === null) void loadPreview();
            }}
          />
        ) : null}
        {artifact.kind === "link" ? (
          <GhostButton title="Open" variant="secondary" onPress={openLink} />
        ) : null}
        {actions.some((a) => a.kind === "download") && artifact.kind === "file" ? (
          <GhostButton title="Download" variant="secondary" size="sm" onPress={() => void download()} />
        ) : null}
      </View>
      {previewBusy ? <Text style={styles.status}>Loading preview…</Text> : null}
      {previewError ? <Text style={styles.error}>{previewError}</Text> : null}
      {expanded && previewImage ? (
        <Image source={{ uri: previewImage }} style={styles.image} accessibilityLabel={`Preview of ${artifact.title}`} />
      ) : null}
      {expanded && preview ? (
        // A file is shown as itself: Markdown only for Markdown, everything
        // else as code (HTML source as HTML, a script as a script).
        previewRender(artifact.path).kind === "markdown" ? (
          <MarkdownBubble content={preview} streaming={false} />
        ) : (
          <CodeBlock language={(previewRender(artifact.path) as { language: string }).language} code={preview.replace(/\n$/, "")} />
        )
      ) : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  picture: {
    marginVertical: Space.xs,
    gap: Space.sm,
  },
  pictureImage: {
    width: "100%",
    aspectRatio: 16 / 10,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: Ghost.bg.sunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.border.default,
  },
  pictureEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  captionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
  },
  caption: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "500",
    color: Ghost.text.primary,
  },
  captionSub: {
    fontSize: 12.5,
    lineHeight: 17,
    color: Ghost.text.tertiary,
  },
  // Past files are part of the history, not the headline: a compact card, so a
  // screenshot from last week no longer takes a third of the screen.
  card: {
    marginVertical: Space.xs,
    padding: 14,
    gap: 4,
  },
  kicker: {
    fontSize: 12.5,
    fontWeight: "500",
    color: Ghost.text.tertiary,
  },
  title: {
    fontFamily: Fonts.voice,
    fontSize: 21,
    lineHeight: 25,
    letterSpacing: -0.3,
    color: Ghost.text.primary,
  },
  summary: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "300",
    color: "rgba(255,255,255,0.78)",
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "300",
    color: "rgba(255,255,255,0.86)",
  },
  url: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    fontSize: 13.5,
    color: Ghost.accent.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: Ghost.accent.soft,
  },
  unavailable: {
    fontSize: 14,
    color: Ghost.text.tertiary,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Space.sm,
    marginTop: Space.sm,
  },
  status: {
    fontSize: 13,
    color: Ghost.text.tertiary,
  },
  error: {
    fontSize: 13,
    color: Ghost.status.error,
  },
  image: {
    width: "100%",
    height: 240,
    borderRadius: 20,
    backgroundColor: Ghost.bg.sunken,
    marginTop: Space.sm,
  },
});
