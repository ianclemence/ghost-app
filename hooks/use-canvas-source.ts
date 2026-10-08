import { useCallback, useEffect, useState } from "react";
import { fetchWorkspacePreview, type Artifact, type GhostConfig } from "@/lib/ghostApi";
import { CANVAS_MAX_CHARS } from "@/lib/canvas";

/**
 * A canvas's HTML is fetched once and kept for the session: the thread redraws
 * and recycles its rows constantly, and a page must not be re-downloaded (or
 * flash) each time one scrolls back into view. A saved version never changes,
 * so the cache needs no expiry.
 */
const cache = new Map<string, string>();
const MAX_CACHED = 24;

function remember(id: string, html: string) {
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value as string);
  cache.set(id, html);
}

export type CanvasSource =
  | { state: "loading" }
  | { state: "ready"; html: string }
  | { state: "error"; reason: string };

export function useCanvasSource(config: GhostConfig | null, artifact: Pick<Artifact, "id" | "path"> | null, enabled = true) {
  const id = artifact?.id ?? "";
  const path = artifact?.path ?? "";
  const [source, setSource] = useState<CanvasSource>(() => {
    const hit = id ? cache.get(id) : undefined;
    return hit !== undefined ? { state: "ready", html: hit } : { state: "loading" };
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || !config || !id || !path) return;
    const hit = cache.get(id);
    if (hit !== undefined) {
      setSource({ state: "ready", html: hit });
      return;
    }
    let live = true;
    setSource({ state: "loading" });
    fetchWorkspacePreview(config, path).then((p) => {
      if (!live) return;
      if (!p || !p.previewable || p.kind !== "text" || typeof p.content !== "string") {
        setSource({ state: "error", reason: p ? "This page can't be opened." : "Couldn't reach your Pod to load this page." });
        return;
      }
      if (p.truncated || p.content.length > CANVAS_MAX_CHARS) {
        setSource({ state: "error", reason: "This page is too large to run here." });
        return;
      }
      remember(id, p.content);
      setSource({ state: "ready", html: p.content });
    });
    return () => {
      live = false;
    };
  }, [config, id, path, enabled, attempt]);

  const retry = useCallback(() => {
    if (id) cache.delete(id);
    setAttempt((n) => n + 1);
  }, [id]);
  return { source, retry };
}
