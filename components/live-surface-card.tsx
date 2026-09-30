import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Ghost, Space } from "@/constants/theme";
import {
  fetchLiveSurface,
  fetchSurfaceObservation,
  mintBrowserScreencast,
  wsURL,
  releaseSurfaceControl,
  requestSurfaceTakeover,
  resumeSurfaceGhost,
  watchSurface,
  type GhostConfig,
  type LiveSurface,
  type SurfaceKind,
} from "@/lib/ghostApi";
import { presentSurface, surfaceTitle, type SurfaceActionId } from "@/lib/surfaces";
import { parseFrame, screencastSocketURL } from "@/lib/browserInput";

interface Props {
  config: GhostConfig;
  kind: SurfaceKind;
  surfaceId: string;
  ownDeviceId?: string;
  onGone: (id: string) => void;
}

export function LiveSurfaceCard({ config, kind, surfaceId, ownDeviceId, onGone }: Props) {
  const router = useRouter();
  const [surface, setSurface] = useState<LiveSurface | null>(null);
  const [watching, setWatching] = useState(false);
  const [obsText, setObsText] = useState<string | null>(null);
  const [obsImage, setObsImage] = useState<string | null>(null);
  const [obsTitle, setObsTitle] = useState<string | null>(null);
  const [busy, setBusy] = useState<SurfaceActionId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamFailed, setStreamFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const liveRef = useRef<WebSocket | null>(null);
  const retriedRef = useRef(false);
  const watchingRef = useRef(false);
  watchingRef.current = watching;

  const load = useCallback(async () => {
    const s = await fetchLiveSurface(config, kind, surfaceId);
    if (!s) {
      onGone(surfaceId);
      return;
    }
    setSurface(s);
  }, [config, kind, surfaceId, onGone]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      liveRef.current?.close();
    };
  }, []);

  const stopWatch = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    liveRef.current?.close();
    liveRef.current = null;
    setWatching(false);
  }, []);

  const startWatch = useCallback(async () => {
    setError(null);
    setStreamFailed(false);
    retriedRef.current = false;
    const obs = await fetchSurfaceObservation(config, kind, surfaceId);
    if (!obs) {
      setError("Nothing to show yet. Ghost hasn't recorded an observation.");
      return;
    }
    setObsText(obs.observation.text ?? null);
    setObsTitle(obs.observation.title ?? obs.observation.url ?? null);
    setObsImage(
      obs.imageBase64 ? `data:${obs.mimeType ?? "image/png"};base64,${obs.imageBase64}` : null,
    );
    setWatching(true);
    // Watching a browser is live when the Pod can stream it: the page as Ghost
    // uses it, a few frames a second, view only. The still picture above is the
    // fallback and stays on screen until the first frame arrives.
    if (kind === "browser") {
      void (async () => {
        const ticket = await mintBrowserScreencast(config, surfaceId);
        if (!ticket.ok || !watchingRef.current) return;
        const ws = new WebSocket(screencastSocketURL(wsURL(config), ticket.wsPath, 4));
        liveRef.current?.close();
        liveRef.current = ws;
        ws.onmessage = (e) => {
          const f = typeof e.data === "string" ? parseFrame(e.data) : null;
          if (!f) return;
          setObsImage(`data:image/jpeg;base64,${f.data}`);
          ws.send(JSON.stringify({ type: "ack", seq: f.seq }));
        };
        ws.onerror = () => {
          if (liveRef.current === ws) liveRef.current = null;
        };
      })();
    }
    const ctrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctrl;
    void watchSurface(config, kind, surfaceId, {
      signal: ctrl.signal,
      onUpdate: (s) => setSurface(s),
      onClosed: () => onGone(surfaceId),
      onError: () => {
        // One automatic reconnect: transient network loss must not strand
        // a watching user. A second failure surfaces honestly instead.
        if (!retriedRef.current && watchingRef.current) {
          retriedRef.current = true;
          setTimeout(() => {
            if (!watchingRef.current || ctrl.signal.aborted) return;
            const retry = new AbortController();
            abortRef.current = retry;
            void watchSurface(config, kind, surfaceId, {
              signal: retry.signal,
              onUpdate: (s) => setSurface(s),
              onClosed: () => onGone(surfaceId),
              onError: () => setStreamFailed(true),
            });
          }, 3000);
          return;
        }
        setStreamFailed(true);
      },
    });
  }, [config, kind, surfaceId, onGone]);

  const runAction = useCallback(async (action: SurfaceActionId) => {
    if (action === "watch") {
      if (watching) stopWatch();
      else void startWatch();
      return;
    }
    // For a browser, taking over means steering it: the screen takes control
    // itself, shows the live page, and hands it back when you are done.
    if (action === "takeover" && kind === "browser") {
      stopWatch();
      router.push({ pathname: "/browser", params: { id: surfaceId } } as never);
      return;
    }
    setError(null);
    setBusy(action);
    const call =
      action === "takeover"
        ? requestSurfaceTakeover(config, kind, surfaceId)
        : action === "giveback"
          ? releaseSurfaceControl(config, kind, surfaceId)
          : resumeSurfaceGhost(config, kind, surfaceId);
    const r = await call;
    setBusy(null);
    if (!r.ok || !r.surface) {
      // A failed or conflicting request never becomes local state.
      // 404 means the surface is gone from the runtime.
      if (r.error && /not exist|not_found/i.test(r.error)) onGone(surfaceId);
      else setError(r.error ?? "That didn't work. The surface state below is current.");
      return;
    }
    setSurface(r.surface);
  }, [config, kind, surfaceId, watching, startWatch, stopWatch, onGone, router]);

  if (!surface) return null;
  const view = presentSurface(surface, ownDeviceId);
  const actionLabels: Record<SurfaceActionId, string> = {
    watch: watching ? "Hide" : "Watch",
    takeover: kind === "browser" ? "Take over and steer" : "Take over",
    giveback: "Give control back",
    resume: "Give control back",
  };

  return (
    <View style={styles.card} accessibilityLabel={`${surfaceTitle(surface)}. ${view.headline}`}>
      <View style={styles.topRow}>
        <View style={styles.dot} />
        <View style={styles.titles}>
          <Text style={styles.kind} accessibilityRole="header">
            {surface.kind === "browser" ? "Browser" : "Computer"} · {surfaceTitle(surface)}
          </Text>
          <Text style={styles.headline} accessibilityLiveRegion="polite">{view.headline}</Text>
          {view.detail ? <Text style={styles.detail}>{view.detail}</Text> : null}
        </View>
      </View>
      {view.actions.includes("takeover") ? (
        <Text style={styles.credential}>Ghost needs you to sign in. Your password stays private.</Text>
      ) : null}
      {watching ? (
        <View style={styles.obs}>
          {obsTitle ? <Text style={styles.obsTitle} numberOfLines={1}>{obsTitle}</Text> : null}
          {obsImage ? (
            <Image source={{ uri: obsImage }} style={styles.shot} accessibilityLabel="Latest surface screenshot" />
          ) : null}
          {obsText ? (
            <Text style={styles.obsText} selectable>{obsText.slice(0, 2000)}</Text>
          ) : !obsImage ? (
            <Text style={styles.obsEmpty}>No observation recorded yet.</Text>
          ) : null}
          {streamFailed ? <Text style={styles.streamNote}>Live updates unavailable. State above is current.</Text> : null}
        </View>
      ) : null}
      {view.actions.length > 0 ? (
        <View style={styles.actions}>
          {view.actions.map((a) => (
            <TouchableOpacity
              key={a}
              style={[styles.btn, busy === a && styles.btnBusy]}
              onPress={() => void runAction(a)}
              disabled={busy !== null}
              accessibilityLabel={actionLabels[a]}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy !== null, busy: busy === a }}
            >
              <Text style={styles.btnText}>{busy === a ? "Working" : actionLabels[a]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
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
    gap: Space.sm,
    marginVertical: Space.xs,
  },
  topRow: {
    flexDirection: "row",
    gap: Space.sm,
    alignItems: "flex-start",
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Ghost.text.primary,
    marginTop: 2,
  },
  titles: {
    flex: 1,
    gap: 2,
  },
  kind: {
    fontSize: 12,
    color: Ghost.text.tertiary,
  },
  headline: {
    fontSize: 15,
    fontWeight: "700",
    color: Ghost.text.primary,
  },
  detail: {
    fontSize: 14,
    lineHeight: 20,
    color: Ghost.text.secondary,
  },
  credential: {
    fontSize: 12,
    color: Ghost.text.tertiary,
  },
  obs: {
    gap: Space.xs,
    borderTopWidth: 1,
    borderTopColor: Ghost.border.subtle,
    paddingTop: Space.sm,
  },
  obsTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Ghost.text.primary,
  },
  obsText: {
    fontSize: 14,
    lineHeight: 20,
    color: Ghost.text.secondary,
  },
  obsEmpty: {
    fontSize: 14,
    color: Ghost.text.tertiary,
  },
  shot: {
    width: "100%",
    height: 220,
    borderRadius: 10,
    backgroundColor: Ghost.bg.sunken,
  },
  streamNote: {
    fontSize: 12,
    color: Ghost.text.tertiary,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Space.sm,
  },
  btn: {
    borderWidth: 1,
    borderColor: Ghost.border.default,
    borderRadius: 999,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    minHeight: 44,
    justifyContent: "center",
  },
  btnBusy: {
    opacity: 0.6,
  },
  btnText: {
    fontSize: 14,
    fontWeight: "600",
    color: Ghost.text.primary,
  },
  error: {
    fontSize: 13,
    color: Ghost.status.error,
  },
});
