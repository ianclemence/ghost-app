import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCanvasSaved, putCanvasSaved, type Artifact, type GhostConfig } from "@/lib/ghostApi";
import { canvasSavedKey } from "@/lib/canvas";

/**
 * What a canvas keeps with ghost.save, loaded before the page runs (so the page
 * starts from it) and sent to the Pod shortly after each save, the latest
 * winning. Kept here too, per canvas, so opening it full screen (or another of
 * its versions) starts from the newest save without asking the Pod again.
 */
const latest = new Map<string, string>();
const SAVE_MS = 700;

export function useCanvasSaved(config: GhostConfig | null, artifact: Pick<Artifact, "id" | "path"> | null, enabled = true) {
  const id = artifact?.id ?? "";
  const key = canvasSavedKey(artifact?.path ?? "");
  const [saved, setSaved] = useState<string | null | undefined>(() => (key && latest.has(key) ? latest.get(key) : key ? undefined : null));
  const pending = useRef<{ json: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  useEffect(() => {
    if (!key) {
      setSaved(null);
      return;
    }
    if (latest.has(key)) {
      setSaved(latest.get(key));
      return;
    }
    if (!enabled || !config || !id) return;
    let live = true;
    // A Pod that can't say means the page starts fresh, never that it waits.
    fetchCanvasSaved(config, id).then((json) => {
      if (!live) return;
      if (json !== null) latest.set(key, json);
      setSaved(json ?? "null");
    });
    return () => {
      live = false;
    };
  }, [config, id, key, enabled]);

  const flush = useCallback(() => {
    const p = pending.current;
    if (!p || !config || !id) return;
    clearTimeout(p.timer);
    pending.current = null;
    void putCanvasSaved(config, id, p.json);
  }, [config, id]);
  useEffect(() => flush, [flush]);

  const save = useCallback(
    (json: string) => {
      if (!key) return;
      latest.set(key, json);
      setSaved(json);
      if (pending.current) clearTimeout(pending.current.timer);
      pending.current = { json, timer: setTimeout(flush, SAVE_MS) };
    },
    [key, flush],
  );

  return { saved, ready: saved !== undefined, save };
}
