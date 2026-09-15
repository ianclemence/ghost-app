import React, { useState } from "react";
import { Image, Linking, StyleSheet, Text, View } from "react-native";
import { Ghost, Space } from "@/constants/theme";
import { GhostButton } from "@/components/ghost";
import { MarkdownBubble } from "@/components/markdown-bubble";
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
      const FS = await import("expo-file-system");
      const write = (FS as unknown as { writeAsStringAsync?: (u: string, c: string, o?: unknown) => Promise<void> }).writeAsStringAsync;
      const cache = (FS as unknown as { cacheDirectory?: string }).cacheDirectory;
      if (!write || !cache) {
        setPreviewError("Downloads aren't supported on this device.");
        return;
      }
      const name = artifact.path.split("/").pop() ?? "ghost-file";
      const uri = `${cache}${name}`;
      if (p?.image_base64) {
        await write(uri, p.image_base64, { encoding: "base64" });
      } else if (p?.content) {
        await write(uri, p.content.slice(0, 262144), { encoding: "utf8" });
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
      <View style={styles.card} accessibilityLabel={`${artifact.title}. Details unavailable.`}>
        <Text style={styles.title} numberOfLines={2}>{artifact.title}</Text>
        {artifact.summary ? <Text style={styles.summary} numberOfLines={3}>{artifact.summary}</Text> : null}
      </View>
    );
  }

  if (artifact.state !== "available") {
    return (
      <View style={styles.card} accessibilityLabel={`${artifact.title}. ${unavailableReasonOf(artifact)}`}>
        <Text style={styles.title} numberOfLines={2}>{artifact.title}</Text>
        <Text style={styles.unavailable}>{unavailableReasonOf(artifact)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.card} accessibilityLabel={`Result from Ghost: ${artifact.title}`}>
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
            onPress={() => {
              const next = !expanded;
              setExpanded(next);
              if (next && artifact.kind === "file" && preview === null && previewImage === null) void loadPreview();
            }}
          />
        ) : null}
        {artifact.kind === "link" ? (
          <GhostButton title="Open" variant="primary" onPress={openLink} />
        ) : null}
        {actions.some((a) => a.kind === "download") && artifact.kind === "file" ? (
          <GhostButton title="Download" variant="primary" onPress={() => void download()} />
        ) : null}
      </View>
      {previewBusy ? <Text style={styles.status}>Loading preview…</Text> : null}
      {previewError ? <Text style={styles.error}>{previewError}</Text> : null}
      {expanded && previewImage ? (
        <Image source={{ uri: previewImage }} style={styles.image} accessibilityLabel={`Preview of ${artifact.title}`} />
      ) : null}
      {expanded && preview ? (
        <MarkdownBubble content={preview} streaming={false} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: Ghost.border.default,
    borderRadius: 14,
    borderCurve: "continuous",
    backgroundColor: Ghost.bg.raised,
    padding: Space.md,
    gap: Space.xs,
    marginVertical: Space.xs,
  },
  kicker: {
    fontSize: 12,
    color: Ghost.text.tertiary,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: Ghost.text.primary,
  },
  summary: {
    fontSize: 14,
    lineHeight: 20,
    color: Ghost.text.secondary,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: Ghost.text.primary,
  },
  url: {
    fontSize: 14,
    color: Ghost.text.secondary,
    textDecorationLine: "underline",
  },
  unavailable: {
    fontSize: 14,
    color: Ghost.text.tertiary,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Space.sm,
    marginTop: Space.xs,
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
    borderRadius: 10,
    backgroundColor: Ghost.bg.sunken,
    marginTop: Space.xs,
  },
});
