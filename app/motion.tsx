import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, LinearTransition, useReducedMotion } from "react-native-reanimated";
import { Check, ChevronDown, Film } from "lucide-react-native";
import { Text } from "@/components/text";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { EdgeScrollView } from "@/components/scroll-edge";
import { CanvasView } from "@/components/canvas-view";
import { GhostButton, GhostSheet } from "@/components/ghost";
import { showDialog } from "@/lib/dialog";
import { lifeStyles } from "@/components/life-ui";
import { alpha, Ghost, Inter, Space } from "@/constants/theme";
import { deleteArtifact, fetchMotion, fetchVersions, motionVideo, saveMotion, startMotionVideo, type Artifact, type MotionSpec, type MotionVideo } from "@/lib/ghostApi";
import { clock, motionFields, motionVersion, setField, type MotionField } from "@/lib/motion";
import { shareExport } from "@/lib/documents";
import { useGhostStore } from "@/lib/store";
import { clockTime } from "@/lib/thread";

/**
 * A motion, full screen: it plays at the top; below, the video is made (and
 * saved or shared once it is), and every word, number and timing can be
 * changed, scene by scene. Saving a change is the next version, played at once.
 */
export default function MotionScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const reduce = useReducedMotion();
  const config = useGhostStore((s) => s.config);
  const [id, setId] = useState(typeof params.id === "string" ? params.id : "");
  const [spec, setSpec] = useState<MotionSpec | null>(null);
  const [draft, setDraft] = useState<MotionSpec | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [video, setVideo] = useState<MotionVideo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [openScene, setOpenScene] = useState<number | null>(0);
  const [reload, setReload] = useState(0);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const [versions, setVersions] = useState<Artifact[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);

  const load = useCallback(async () => {
    if (!config || !id) return;
    const r = await fetchMotion(config, id);
    if (!r.ok) return setError(r.error);
    setSpec(r.data.spec);
    setDraft(r.data.spec);
    setHtml(r.data.html);
    setDuration(r.data.duration);
    setVideo(r.data.video);
    setError(null);
    const v = await fetchVersions(config, id);
    // Oldest first, numbered by the file each was saved as.
    if (v.ok) setVersions([...v.data.versions].sort((a, b) => motionVersion(a.path) - motionVersion(b.path)));
  }, [config, id]);
  useEffect(() => { void load(); }, [load]);

  // While a video is being made, ask how it is going.
  useEffect(() => {
    if (!config || !id || !video || (video.state !== "queued" && video.state !== "rendering")) return;
    poll.current = setInterval(async () => {
      const r = await motionVideo(config, id);
      if (r.ok) {
        setVideo(r.data.video);
        if (r.data.video.state === "done") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    }, 1500);
    return () => { if (poll.current) clearInterval(poll.current); };
  }, [config, id, video]);

  const changed = !!spec && !!draft && JSON.stringify(spec) !== JSON.stringify(draft);

  const save = async () => {
    if (!config || !draft) return;
    setSaving(true);
    const r = await saveMotion(config, id, draft);
    setSaving(false);
    if (!r.ok) return setError(r.error);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setId(r.data.artifact.id);
    router.setParams({ id: r.data.artifact.id } as never);
    setReload((n) => n + 1);
  };

  const make = async () => {
    if (!config) return;
    const r = await startMotionVideo(config, id);
    if (!r.ok) return setError(r.error);
    setVideo(r.data.video);
  };

  const share = async () => {
    if (!config) return;
    setSharing(true);
    const why = await shareExport(config, id, "mp4");
    setSharing(false);
    if (why) setError(why);
  };

  const current = versions.find((v) => v.id === id);
  const n = current ? motionVersion(current.path) : 0;
  const latest = versions.length ? motionVersion(versions[versions.length - 1].path) : 0;

  const pickVersion = (a: Artifact) => {
    setVersionsOpen(false);
    if (a.id === id) return;
    setHtml(null);
    setId(a.id);
    router.setParams({ id: a.id } as never);
  };

  const removeVersion = () => {
    if (!config || !current) return;
    showDialog(`Delete version ${n}?`, "It leaves the conversation and Made by Ghost, with its video. The other versions stay.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        const r = await deleteArtifact(config, id);
        if (!r.ok) return setError(r.error);
        setVersionsOpen(false);
        const next = versions.filter((v) => v.id !== id).pop();
        if (!next) return router.back();
        setHtml(null);
        setId(next.id);
        router.setParams({ id: next.id } as never);
      } },
    ]);
  };

  const rendering = video?.state === "queued" || video?.state === "rendering";
  const pct = video?.total ? Math.round(((video.done ?? 0) / video.total) * 100) : 0;
  const scenes = draft ? motionFields(draft) : [];

  return (
    <View style={styles.container}>
      <ScreenBackground variant="calm" />
      <ScreenHeader title={spec?.title ?? "Motion"} subtitle={duration ? `An animation · ${clock(duration)}` : "An animation"} />
      <EdgeScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" fade={false}>
        {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
        {!html && !error ? <ActivityIndicator style={{ marginTop: Space.xxxl }} color={Ghost.text.tertiary} /> : null}
        {html ? (
          <View style={styles.player} key={`${id}-${reload}`}>
            <CanvasView html={html} mode="inline" />
          </View>
        ) : null}

        {versions.length > 1 && current ? (
          <Pressable
            onPress={() => setVersionsOpen(true)}
            style={({ pressed }) => [styles.versionBar, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={`Version ${n} of ${versions.length}. Choose a version`}
          >
            <Text style={styles.versionText}>Version {n}{n === latest ? " · latest" : ""}</Text>
            <Text style={styles.versionCount}>{versions.length} versions</Text>
            <ChevronDown size={15} color={Ghost.text.tertiary} />
          </Pressable>
        ) : null}

        {html ? (
          <View style={[lifeStyles.group, styles.videoBox]}>
            <View style={styles.videoHead}>
              <View style={styles.icon}>
                <Film size={17} color={Ghost.accent.primary} strokeWidth={1.9} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.videoTitle}>
                  {video?.state === "done" ? "The video is ready" : rendering ? "Making the video…" : "Make it a video"}
                </Text>
                <Text style={styles.videoSub}>
                  {video?.state === "done"
                    ? "An MP4 to keep, send or post."
                    : rendering
                      ? `${pct}% · your Pod draws every frame`
                      : video?.state === "failed"
                        ? video.error ?? "It didn't work. Try again."
                        : `An MP4, made on your Pod in about ${Math.max(1, Math.round((duration * 3) / 60))} min.`}
                </Text>
              </View>
            </View>
            {rendering ? (
              <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
                <Animated.View layout={reduce ? undefined : LinearTransition.duration(400)} style={[styles.fill, { width: `${Math.max(3, pct)}%` }]} />
              </View>
            ) : null}
            {video?.state === "done" ? (
              <GhostButton title={sharing ? "Getting it…" : "Save or share the video"} disabled={sharing} onPress={() => void share()} />
            ) : !rendering ? (
              <GhostButton title={video?.state === "failed" ? "Try again" : "Make the video"} variant="secondary" disabled={changed} onPress={() => void make()} />
            ) : null}
            {changed && video?.state !== "done" ? <Text style={styles.videoSub}>Save your changes first, so the video has them.</Text> : null}
          </View>
        ) : null}

        {draft ? (
          <>
            <Text style={lifeStyles.eyebrow}>Change it</Text>
            {scenes.map((sc) => {
              const open = openScene === sc.scene;
              return (
                <Animated.View key={sc.scene} layout={reduce ? undefined : LinearTransition.duration(200)} style={[lifeStyles.group, styles.scene]}>
                  <Pressable onPress={() => setOpenScene(open ? null : sc.scene)} style={styles.sceneHead} accessibilityRole="button" accessibilityState={{ expanded: open }}>
                    <Text style={styles.sceneNum}>{sc.scene + 1}</Text>
                    <Text style={styles.sceneTitle} numberOfLines={1}>{sc.title}</Text>
                    <Text style={styles.sceneDur}>{draft.scenes[sc.scene].duration}s</Text>
                    <ChevronDown size={16} color={Ghost.text.tertiary} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
                  </Pressable>
                  {open ? (
                    <Animated.View entering={reduce ? undefined : FadeIn.duration(160)} style={styles.fields}>
                      {sc.fields.map((f) => (
                        <FieldRow key={f.path.join(".")} f={f} onSet={(raw) => {
                          const r = setField(draft, f, raw);
                          if ("error" in r) return r.error;
                          setDraft(r.spec);
                          return null;
                        }} />
                      ))}
                    </Animated.View>
                  ) : null}
                </Animated.View>
              );
            })}
            {changed ? (
              <View style={styles.saveRow}>
                <GhostButton title={saving ? "Saving…" : "Save as the next version"} disabled={saving} onPress={() => void save()} />
                <GhostButton title="Undo changes" variant="secondary" disabled={saving} onPress={() => setDraft(spec)} />
              </View>
            ) : null}
          </>
        ) : null}
      </EdgeScrollView>
      <GhostSheet visible={versionsOpen} onClose={() => setVersionsOpen(false)} title="Versions" message="Each change you or Ghost save is a new version. Play any of them, or delete one you don't need.">
        <View style={lifeStyles.sheetGroup}>
          {[...versions].reverse().map((a, i) => {
            const v = motionVersion(a.path);
            const on = a.id === id;
            const t = a.created_at ? Date.parse(a.created_at) : NaN;
            return (
              <Pressable
                key={a.id}
                onPress={() => pickVersion(a)}
                style={({ pressed }) => [styles.version, i > 0 && styles.versionLine, pressed && { opacity: 0.7 }]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.versionName, on && { color: Ghost.text.primary }]}>Version {v}{v === latest ? " · latest" : ""}</Text>
                  {a.summary ? <Text style={styles.versionSub} numberOfLines={1}>{a.summary.replace(/ · version \d+$/, "")}</Text> : null}
                </View>
                {Number.isFinite(t) ? <Text style={styles.versionSub}>{clockTime(t)}</Text> : null}
                <View style={{ width: 18 }}>{on ? <Check size={16} color={Ghost.accent.primary} strokeWidth={2.2} /> : null}</View>
              </Pressable>
            );
          })}
        </View>
        <GhostButton title={`Delete version ${n}`} variant="danger" fullWidth style={{ marginTop: Space.md }} onPress={removeVersion} />
      </GhostSheet>
    </View>
  );
}

/** One word, number or timing: typed freely, checked when it's left. */
function FieldRow({ f, onSet }: { f: MotionField; onSet: (raw: string) => string | null }) {
  const [v, setV] = useState(f.value);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setV(f.value), [f.value]);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{f.label}</Text>
      <TextInput
        value={v}
        onChangeText={setV}
        onEndEditing={() => {
          if (v === f.value) return;
          const e = onSet(v);
          setErr(e);
          if (e) setV(f.value);
        }}
        keyboardType={f.kind === "text" ? "default" : "decimal-pad"}
        style={[styles.input, f.kind !== "text" && styles.inputNum]}
        placeholderTextColor={Ghost.text.tertiary}
        selectionColor={Ghost.accent.primary}
        multiline={f.kind === "text" && f.value.length > 36}
        accessibilityLabel={f.label}
      />
      {err ? <Text style={styles.fieldErr}>{err}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  content: { paddingBottom: 96, paddingHorizontal: Space.lg, gap: Space.md },
  player: { borderRadius: 24, borderCurve: "continuous", overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  videoBox: { padding: Space.lg, gap: Space.md },
  videoHead: { flexDirection: "row", alignItems: "center", gap: Space.md },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: alpha(Ghost.accent.primary, 0.13), borderWidth: StyleSheet.hairlineWidth, borderColor: alpha(Ghost.accent.primary, 0.32) },
  videoTitle: { fontSize: 16, fontWeight: "500", color: Ghost.text.primary },
  videoSub: { fontSize: 13, lineHeight: 18, color: Ghost.text.tertiary },
  track: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  fill: { height: 4, borderRadius: 2, backgroundColor: Ghost.accent.primary },
  scene: { overflow: "hidden" },
  sceneHead: { flexDirection: "row", alignItems: "center", gap: Space.md, minHeight: 54, paddingHorizontal: Space.lg },
  sceneNum: { width: 22, fontSize: 13, fontWeight: "600", color: Ghost.text.tertiary, fontVariant: ["tabular-nums"] },
  sceneTitle: { flex: 1, fontSize: 15, fontWeight: "500", color: Ghost.text.primary },
  sceneDur: { fontSize: 13, color: Ghost.text.tertiary, fontVariant: ["tabular-nums"] },
  fields: { paddingHorizontal: Space.lg, paddingBottom: Space.lg, gap: Space.md },
  field: { gap: 6 },
  fieldLabel: { fontSize: 11.5, fontWeight: "500", letterSpacing: 0.9, textTransform: "uppercase", color: Ghost.text.tertiary },
  input: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.045)", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border, color: Ghost.text.primary, fontFamily: Inter.regular, fontSize: 15 },
  inputNum: { fontVariant: ["tabular-nums"], maxWidth: 200 },
  fieldErr: { fontSize: 12.5, color: Ghost.status.error },
  saveRow: { gap: Space.sm, marginTop: Space.xs },
  error: { fontSize: 13.5, lineHeight: 19, color: Ghost.status.error, textAlign: "center" },
  versionBar: { flexDirection: "row", alignItems: "center", gap: Space.sm, height: 44, paddingHorizontal: Space.lg, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.42)", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  versionText: { flex: 1, fontSize: 14.5, fontWeight: "500", color: Ghost.text.primary },
  versionCount: { fontSize: 13, color: Ghost.text.tertiary },
  version: { flexDirection: "row", alignItems: "center", gap: Space.md, minHeight: 56, paddingHorizontal: 14 },
  versionLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Ghost.border.subtle },
  versionName: { fontSize: 15, fontWeight: "500", color: Ghost.text.secondary },
  versionSub: { fontSize: 12.5, color: Ghost.text.tertiary },
});
