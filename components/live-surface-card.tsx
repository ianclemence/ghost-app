import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, FadeIn, useReducedMotion } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Check, ChevronDown, ChevronUp, Globe, Monitor, TriangleAlert } from "lucide-react-native";
import { Text } from "@/components/text";
import { GlassCard } from "@/components/glass";
import { GhostButton } from "@/components/ghost";
import { EmberDot } from "@/components/ember-dot";
import { Ghost, Space } from "@/constants/theme";
import {
  fetchSurfaceObservation,
  mintBrowserScreencast,
  resolveApproval,
  wsURL,
  releaseSurfaceControl,
  requestSurfaceTakeover,
  resumeSurfaceGhost,
  watchSurface,
  type ApprovalGrant,
  type GhostConfig,
  type LiveSurface,
  type PendingApproval,
} from "@/lib/ghostApi";
import { presentSurface, surfacePlace, surfaceRecord, type SurfaceActionId } from "@/lib/surfaces";
import { surfacePhase } from "@/lib/turnSurfaces";
import { formatDuration } from "@/lib/runSteps";
import { parseFrame, screencastSocketURL } from "@/lib/browserInput";

const EASE = Easing.bezier(0.23, 1, 0.32, 1);

interface Props {
  config: GhostConfig;
  surface: LiveSurface;
  ownDeviceId?: string;
  /** The approval this surface is waiting on, answered right on the card. */
  approval: PendingApproval | null;
  /** Ghost has finished browsing and is writing the answer below. */
  answering?: boolean;
  /** This is the newest work in the conversation: nothing has been asked since. */
  latest?: boolean;
  /** An approval was answered here: refresh approvals and the thread. */
  onApprovalResolved?: () => void;
  /** A newer state from the Pod (watch stream or an action's answer). */
  onSurface: (s: LiveSurface) => void;
  onGone: (id: string) => void;
}

/**
 * Ghost's browser, in the conversation, under the request that opened it.
 *
 * While the work runs it is a card that says where Ghost is and what it is
 * doing, with Watch and Take over. When the work is over the SAME card stays:
 * the last picture of the page, what was done, how long it took. Finished work
 * is evidence of what Ghost just did, so it is not put away the moment it ends
 * (a quick task used to be gone before it could be seen). It folds into one
 * quiet line only when it is no longer the latest work in the conversation (and
 * a few seconds have passed), or when the owner folds it; the owner's choice
 * always wins over the automatic one, in both directions.
 * Everything shown is the Pod's state; nothing is inferred here.
 */
export function LiveSurfaceCard({ config, surface, ownDeviceId, approval, answering, latest = true, onApprovalResolved, onSurface, onGone }: Props) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const kind = surface.kind;
  const surfaceId = surface.id;
  const phase = surfacePhase(surface);
  const [watching, setWatching] = useState(false);
  const [picture, setPicture] = useState<string | null>(null);
  const [pictureMissing, setPictureMissing] = useState(false);
  const [busy, setBusy] = useState<SurfaceActionId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamFailed, setStreamFailed] = useState(false);
  const [answer, setAnswer] = useState<ApprovalGrant | null>(null);
  const [live, setLive] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const liveRef = useRef<WebSocket | null>(null);
  const watchingRef = useRef(false);
  watchingRef.current = watching;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const closeStreams = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    liveRef.current?.close();
    liveRef.current = null;
  }, []);

  const stopWatch = useCallback(() => {
    closeStreams();
    setWatching(false);
  }, [closeStreams]);

  useEffect(() => closeStreams, [closeStreams]);

  // The live picture and state stream only make sense while work runs. When
  // the work settles, close them; the last picture stays.
  useEffect(() => {
    if (phase !== "live") closeStreams();
  }, [phase, closeStreams]);

  // Finished work stays in view while it is the latest, and for a few seconds
  // after it stops being the latest, so a task that ends as the owner sends
  // the next message is not snatched away mid-glance. After that it folds,
  // unless the owner has chosen either way.
  const [owner, setOwner] = useState<boolean | null>(null);
  const [grace, setGrace] = useState(true);
  const settled = phase !== "live";
  useEffect(() => {
    if (!settled || latest) {
      setGrace(true);
      return;
    }
    const t = setTimeout(() => setGrace(false), 6000);
    return () => clearTimeout(t);
  }, [settled, latest]);
  const expanded = owner ?? (!settled || latest || grace);
  // Folded away, nothing should keep streaming into it.
  useEffect(() => {
    if (!expanded) stopWatch();
  }, [expanded, stopWatch]);

  // The page, as a picture, whenever the Pod has a new one while the card is
  // open: the card's preview while Ghost works, the last state once it is done.
  // The live view replaces it on Watch.
  const obsStamp = surface.observation?.timestamp ?? "";
  const hasPicture = !!surface.observation?.picture;
  useEffect(() => {
    if (!expanded || !hasPicture || liveRef.current) return;
    let current = true;
    fetchSurfaceObservation(config, kind, surfaceId)
      .then((obs) => {
        if (current && obs?.imageBase64) setPicture(`data:${obs.mimeType ?? "image/png"};base64,${obs.imageBase64}`);
      })
      .catch(() => {});
    return () => { current = false; };
  }, [config, kind, surfaceId, obsStamp, hasPicture, expanded]);

  const answerApproval = useCallback(async (grant: ApprovalGrant) => {
    if (!approval || answer) return;
    setError(null);
    setAnswer(grant);
    const r = await resolveApproval(config, approval.id, grant);
    setAnswer(null);
    if (!r.ok) setError(r.error ?? "That answer didn't go through. Try again.");
    onApprovalResolved?.();
  }, [approval, answer, config, onApprovalResolved]);

  const startWatch = useCallback(async () => {
    setError(null);
    setStreamFailed(false);
    setPictureMissing(false);
    setWatching(true);
    watchingRef.current = true;
    const obs = await fetchSurfaceObservation(config, kind, surfaceId).catch(() => null);
    if (!watchingRef.current) return;
    if (obs?.imageBase64) setPicture(`data:${obs.mimeType ?? "image/png"};base64,${obs.imageBase64}`);
    else setPictureMissing(true);
    if (phaseRef.current !== "live") return;
    // Live: the page as Ghost uses it, a few frames a second, view only. The
    // still picture stays until the first frame arrives.
    if (kind === "browser") {
      void (async () => {
        const ticket = await mintBrowserScreencast(config, surfaceId);
        if (!ticket.ok || !watchingRef.current || phaseRef.current !== "live") return;
        const ws = new WebSocket(screencastSocketURL(wsURL(config), ticket.wsPath, 4));
        liveRef.current?.close();
        liveRef.current = ws;
        setLive(true);
        ws.onclose = () => {
          if (liveRef.current === ws) liveRef.current = null;
          setLive(false);
        };
        ws.onmessage = (e) => {
          const f = typeof e.data === "string" ? parseFrame(e.data) : null;
          if (!f) return;
          setPicture(`data:image/jpeg;base64,${f.data}`);
          setPictureMissing(false);
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
      onUpdate: onSurface,
      onClosed: () => onGone(surfaceId),
      onError: () => {
        if (!ctrl.signal.aborted) setStreamFailed(true);
      },
    });
  }, [config, kind, surfaceId, onSurface, onGone]);

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
      if (r.error && /not exist|not_found/i.test(r.error)) onGone(surfaceId);
      else setError(r.error ?? "That didn't work. What the card shows is current.");
      return;
    }
    onSurface(r.surface);
  }, [config, kind, surfaceId, watching, startWatch, stopWatch, onGone, onSurface, router]);

  const Icon = kind === "browser" ? Globe : Monitor;
  const steps = surface.steps ?? [];
  const stepsView = (list: string[], hiddenCount = 0) => list.length ? (
    <View style={styles.steps} accessibilityLabel={`Done so far: ${list.join(", ")}`}>
      {hiddenCount > 0 ? <Text style={styles.note}>{hiddenCount} earlier</Text> : null}
      {list.map((st, i) => (
        <View key={`${hiddenCount + i}-${st}`} style={styles.stepRow}>
          <View style={[styles.stepDot, phase === "live" && i === list.length - 1 && styles.stepDotLast]} />
          <Text style={styles.stepText} numberOfLines={1}>{st}</Text>
        </View>
      ))}
    </View>
  ) : null;
  const showPicture = expanded && (watching || !!picture || (hasPicture && phase !== "live"));
  const pictureView = showPicture ? (
    // A fixed box: the picture arriving, or being replaced by a newer one,
    // never changes the card's height.
    <Animated.View entering={reduce ? undefined : FadeIn.duration(180).easing(EASE)} style={styles.pictureWrap}>
      {picture ? (
        <Image
          source={{ uri: picture }}
          style={styles.picture}
          resizeMode="cover"
          accessibilityLabel={phase === "live" ? `What Ghost's ${kind} shows now` : `What Ghost's ${kind} last showed`}
        />
      ) : (
        <View style={[styles.picture, styles.pictureEmpty]}>
          <Text style={styles.note}>{pictureMissing ? "No picture of this page was kept." : "Getting the picture…"}</Text>
        </View>
      )}
      {live ? (
        <View style={styles.liveTag}>
          <EmberDot size={5} />
          <Text style={styles.liveText}>Live</Text>
        </View>
      ) : null}
      {streamFailed && phase === "live" ? <Text style={styles.note}>Live updates paused. The picture may be a moment old.</Text> : null}
    </Animated.View>
  ) : null;

  const place = surfacePlace(surface);
  const title = surface.observation?.title?.trim() || null;
  const started = Date.parse(surface.started ?? "");
  const ended = Date.parse(surface.updated ?? "");
  const took = settled && Number.isFinite(started) && Number.isFinite(ended) && ended > started ? formatDuration(ended - started) : "";

  // ── Folded: one line, a record of what was done ─────────────────────────
  if (!expanded) {
    const line = surfaceRecord(surface);
    return (
      <View style={styles.record}>
        <Pressable
          onPress={() => setOwner(true)}
          style={({ pressed }) => [styles.recordRow, pressed && styles.pressed]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${line}. See the last picture`}
        >
          <Icon size={14} color={phase === "stopped" ? Ghost.status.warning : Ghost.text.tertiary} strokeWidth={2} />
          <Text style={styles.recordText} numberOfLines={1}>{line}</Text>
          <ChevronDown size={15} color={Ghost.text.tertiary} />
        </Pressable>
      </View>
    );
  }

  // ── Open: where Ghost is (or was) and what it is (or was) doing ─────────
  const view = presentSurface(surface, ownDeviceId, { approvalWaiting: !!approval, answering });
  const headline = phase === "done" ? `Done${took ? ` · ${took}` : ""}` : phase === "stopped" ? "Didn't finish" : view.headline;
  const detail = phase === "stopped" ? surfaceRecord(surface) : phase === "done" ? null : view.detail;
  const actionLabels: Record<SurfaceActionId, string> = {
    watch: watching ? (live ? "Stop live view" : "Hide") : picture ? "Watch live" : "Watch",
    // The words Ghost uses when it asks ("tap Take over and steer").
    takeover: kind === "browser" ? "Take over and steer" : "Take over",
    giveback: "Give control back",
    resume: "Give control back",
  };
  const actions = phase === "live" ? view.actions : [];
  return (
    <Animated.View entering={reduce ? undefined : FadeIn.duration(220).easing(EASE)}>
      <GlassCard
        tone={view.attention && phase === "live" ? "attention" : "default"}
        style={styles.card}
        accessibilityLabel={`${kind === "browser" ? "Ghost's browser" : "Ghost's computer"}${place ? ` on ${place}` : ""}. ${headline}`}
      >
        <View style={styles.top}>
          <View style={styles.icon}>
            <Icon size={17} color={Ghost.text.secondary} strokeWidth={1.8} />
          </View>
          <View style={styles.titles}>
            <Text style={styles.kicker} numberOfLines={1}>
              {kind === "browser" ? "Browser" : "Computer"}{place ? ` · ${place}` : ""}
            </Text>
            {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}
            <View style={styles.statusRow} accessibilityLiveRegion="polite">
              {phase === "done" ? (
                <Check size={13} color={Ghost.status.success} strokeWidth={2.4} />
              ) : phase === "stopped" ? (
                <TriangleAlert size={13} color={Ghost.status.warning} strokeWidth={2.2} />
              ) : (
                <EmberDot size={6} active={view.working} />
              )}
              <Animated.Text
                key={headline}
                entering={reduce ? undefined : FadeIn.duration(160)}
                style={[styles.status, view.attention && phase === "live" && styles.statusAttention, phase === "stopped" && { color: Ghost.status.warning }]}
                numberOfLines={1}
              >
                {headline}
              </Animated.Text>
            </View>
            {detail ? <Text style={styles.detail}>{detail}</Text> : null}
          </View>
          {settled ? (
            <Pressable
              onPress={() => setOwner(false)}
              hitSlop={12}
              style={({ pressed }) => [styles.fold, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Fold this away"
            >
              <ChevronUp size={17} color={Ghost.text.tertiary} />
            </Pressable>
          ) : null}
        </View>
        {pictureView}
        {phase === "live" ? stepsView(steps.slice(-3)) : stepsView(steps.slice(-6), Math.max(0, steps.length - 6))}
        {approval && surface.state === "waiting" ? (
          <View style={styles.actions}>
            {/* A search or a booking is several steps (type, press, click):
                "for this task" is the answer that finishes what was asked, as
                in the terminal. "Once" covered one keystroke, and Ghost then
                stopped at the next one. */}
            <GhostButton size="sm" variant="primary" title={answer === "allow_task" ? "One moment" : "Allow for this task"} onPress={() => void answerApproval("allow_task")} disabled={answer !== null} />
            <GhostButton size="sm" variant="secondary" title={answer === "allow_once" ? "One moment" : "Once"} onPress={() => void answerApproval("allow_once")} disabled={answer !== null} />
            <GhostButton size="sm" variant="ghost" title={answer === "deny" ? "One moment" : "Deny"} onPress={() => void answerApproval("deny")} disabled={answer !== null} />
          </View>
        ) : null}
        {actions.length > 0 && !(approval && surface.state === "waiting") ? (
          <View style={styles.actions}>
            {actions.map((a) => (
              <GhostButton
                key={a}
                size="sm"
                variant="secondary"
                title={busy === a ? "One moment" : actionLabels[a]}
                onPress={() => void runAction(a)}
                disabled={busy !== null}
              />
            ))}
          </View>
        ) : null}
        {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
      </GlassCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: Space.lg,
    padding: 14,
    gap: Space.sm,
  },
  top: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Ghost.glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  titles: {
    flex: 1,
    gap: 3,
  },
  kicker: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "500",
    color: Ghost.text.tertiary,
  },
  title: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "500",
    color: Ghost.text.primary,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 1,
  },
  status: {
    fontSize: 13.5,
    lineHeight: 18,
    color: Ghost.text.secondary,
    flexShrink: 1,
  },
  statusAttention: {
    color: Ghost.emberBright,
  },
  detail: {
    fontSize: 13.5,
    lineHeight: 19,
    color: Ghost.text.tertiary,
  },
  pictureWrap: {
    gap: Space.xs,
  },
  picture: {
    width: "100%",
    aspectRatio: 16 / 10,
    borderRadius: 12,
    borderCurve: "continuous",
    backgroundColor: Ghost.bg.sunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.border.subtle,
  },
  pictureEmpty: {
    alignItems: "center",
    justifyContent: "center",
    padding: Space.md,
  },
  note: {
    fontSize: 12.5,
    lineHeight: 17,
    color: Ghost.text.tertiary,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Space.sm,
  },
  error: {
    fontSize: 13,
    color: Ghost.status.error,
  },
  steps: {
    gap: 5,
    paddingLeft: 2,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  stepDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Ghost.border.strong,
  },
  stepDotLast: {
    backgroundColor: Ghost.text.secondary,
  },
  stepText: {
    fontSize: 13,
    lineHeight: 18,
    color: Ghost.text.tertiary,
    flexShrink: 1,
  },
  liveTag: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  liveText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: Ghost.text.primary,
  },
  fold: { alignSelf: "flex-start", padding: 2 },
  record: {
    marginTop: Space.sm,
    gap: Space.sm,
  },
  recordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start",
    maxWidth: "100%",
    minHeight: 32,
    paddingVertical: 4,
  },
  recordText: {
    fontSize: 13.5,
    lineHeight: 18,
    color: Ghost.text.tertiary,
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.6,
  },
});
