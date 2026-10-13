/**
 * Motions on the phone: which artifacts are motions, and the editor's view of
 * one: every word, number and timing as a field, and the spec with a field
 * changed. Pure, so it is testable.
 */
import type { Artifact, MotionElement, MotionScene, MotionSpec } from "./ghostApi";

const MOTION_PATH = /^motion\/[a-z0-9-]+-v\d+\.json$/;
const VIDEO_PATH = /^motion\/[a-z0-9-]+-v\d+\.mp4$/;

export function isMotionArtifact(a: Pick<Artifact, "kind" | "path" | "state">): boolean {
  return a.kind === "file" && a.state === "available" && typeof a.path === "string" && MOTION_PATH.test(a.path);
}

export function isMotionVideo(a: Pick<Artifact, "path">): boolean {
  return typeof a.path === "string" && VIDEO_PATH.test(a.path);
}

/** One thing the owner can change. */
export interface MotionField {
  /** Where it is: [scene, element?, key, index?]. */
  path: (string | number)[];
  label: string;
  kind: "text" | "number" | "seconds";
  value: string;
}

const KIND_WORD: Record<MotionElement["type"], string> = {
  title: "Title", text: "Text", number: "Number", bars: "Bars", line: "Line", donut: "Shares", list: "List", steps: "Steps", compare: "Compare", quote: "Quote",
  flow: "Diagram", hub: "Diagram", gauge: "Gauge", timeline: "Timeline", table: "Table", sketch: "Sketch",
};

/** A motion's version, from its file (motion/name-v3.json → 3). */
export function motionVersion(path: string | undefined): number {
  const m = /-v(\d+)\.json$/.exec(path ?? "");
  return m ? parseInt(m[1], 10) : 1;
}

/** Every word, number and timing in a motion, scene by scene. */
export function motionFields(spec: MotionSpec): { scene: number; title: string; focus: string | null; fields: MotionField[] }[] {
  return spec.scenes.map((sc, si) => {
    const fields: MotionField[] = [
      { path: [si, "duration"], label: "Seconds", kind: "seconds", value: String(sc.duration) },
      { path: [si, "teaches"], label: "Teaches", kind: "text", value: sc.teaches ?? "" },
      { path: [si, "voice"], label: "Voice", kind: "text", value: sc.voice ?? "" },
      { path: [si, "sound"], label: "Sound cue", kind: "text", value: sc.sound ?? "" },
      { path: [si, "check"], label: "Viewer can now say", kind: "text", value: sc.check ?? "" },
    ];
    sc.elements.forEach((e, ei) => {
      const w = KIND_WORD[e.type];
      const add = (key: keyof MotionElement, label: string, kind: MotionField["kind"] = "text") => {
        const v = e[key];
        if (v === undefined || v === "") return;
        fields.push({ path: [si, ei, key], label: `${w}: ${label}`, kind, value: String(v) });
      };
      add("text", e.type === "hub" ? "the centre" : "words");
      add("sub", "second line");
      add("label", "label");
      if (e.type === "gauge") {
        add("to", "value", "number");
        add("max", "out of", "number");
        add("suffix", "after it");
      }
      if (e.type === "number") {
        add("to", "number", "number");
        add("prefix", "before it");
        add("suffix", "after it");
      }
      (e.labels ?? []).forEach((l, i) => {
        fields.push({ path: [si, ei, "labels", i], label: `${w}: name ${i + 1}`, kind: "text", value: l });
        const v = e.values?.[i];
        if (v !== undefined && e.type !== "line") fields.push({ path: [si, ei, "values", i], label: `${w}: ${l}`, kind: "number", value: String(v) });
      });
      if (e.type === "line") (e.values ?? []).forEach((v, i) => fields.push({ path: [si, ei, "values", i], label: `${w}: point ${i + 1}`, kind: "number", value: String(v) }));
      (e.items ?? []).forEach((it, i) => fields.push({ path: [si, ei, "items", i], label: `${w}: ${e.type === "steps" ? "step" : e.type === "flow" || e.type === "sketch" ? "box" : e.type === "hub" ? "part" : e.type === "timeline" ? "milestone" : e.type === "table" ? "row" : "item"} ${i + 1}`, kind: "text", value: it }));
      if (ei > 0 || (e.at ?? 0) > 0) fields.push({ path: [si, ei, "at"], label: `${w}: enters at (s)`, kind: "seconds", value: String(e.at ?? 0) });
    });
    if (sc.caption !== undefined) fields.push({ path: [si, "caption"], label: "Caption", kind: "text", value: sc.caption });
    else fields.push({ path: [si, "caption"], label: "Caption (source)", kind: "text", value: "" });
    return { scene: si, title: sceneTitle(sc.elements), focus: sceneFocus(sc.elements), fields };
  });
}

function sceneTitle(els: MotionElement[]): string {
  const e = els[0];
  if (!e) return "Scene";
  const t = e.text || e.label || e.items?.[0] || KIND_WORD[e.type];
  return t.length > 40 ? `${t.slice(0, 39)}…` : t;
}

/** Which element holds the one focal action, if any: "Bars is focal". Focus is set by Ghost; the editor shows it, never breaks it. */
export function sceneFocus(els: MotionElement[]): string | null {
  const e = els.find((x) => x.focus);
  return e ? `${KIND_WORD[e.type]} is focal` : null;
}

/** The brief above the scenes: one question, who it is for, what changes, the hook, and where the numbers came from. */
export function motionStoryFields(spec: MotionSpec): MotionField[] {
  return [
    { path: ["question"], label: "Question", kind: "text", value: spec.question ?? "" },
    { path: ["audience"], label: "Audience", kind: "text", value: spec.audience ?? "" },
    { path: ["outcome"], label: "Outcome", kind: "text", value: spec.outcome ?? "" },
    { path: ["hook"], label: "Hook (the wrong belief)", kind: "text", value: spec.hook ?? "" },
    { path: ["sources"], label: "Sources (one per line)", kind: "text", value: (spec.sources ?? []).join("\n") },
  ];
}

/** What a muted watch reads on a scene: the voice line, else the source caption, else the first on-screen words. */
export function cueText(sc: MotionScene): string {
  if (sc.voice?.trim()) return sc.voice.trim();
  if (sc.caption?.trim()) return sc.caption.trim();
  for (const e of sc.elements) {
    if ((e.type === "title" || e.type === "text" || e.type === "quote") && e.text) {
      return e.sub ? `${e.text} — ${e.sub}` : e.text;
    }
    if (e.label) return e.label;
  }
  return "";
}

/** One cue per scene, for the captions preview. */
export function sceneCues(spec: MotionSpec): { scene: number; cue: string }[] {
  return spec.scenes.map((sc, i) => ({ scene: i, cue: cueText(sc) }));
}

/** Where a motion's captions live (motion/x-v2.json → motion/x-v2.srt), or "" when it isn't a motion. */
export function captionsPath(motionPath: string | undefined): string {
  return typeof motionPath === "string" && motionPath.endsWith(".json") ? motionPath.replace(/\.json$/, ".srt") : "";
}

const DATA_TYPES = new Set(["number", "bars", "line", "donut", "compare", "gauge", "table"]);

/**
 * The studio gate, run on the phone before export: caption coverage, 390 px
 * lines, sources, one focus, sane timings. Determinism (same frame twice) is
 * the Pod's gate and is checked there, not here.
 */
export function studioCheck(spec: MotionSpec): { ok: boolean; passed: string[]; failed: string[] } {
  const passed: string[] = [];
  const failed: string[] = [];
  const cues = spec.scenes.map(cueText);
  // Captions are opt-in: a clean picture has no cues and skips both gates.
  if (spec.captions !== "on") {
    passed.push("Captions off: a clean picture, nothing to read");
  } else {
    if (cues.every((c) => c.trim())) passed.push(`A cue at every beat (${cues.length}/${spec.scenes.length})`);
    else failed.push("A cue at every beat (a scene has no voice, caption or words)");
    const long = cues.flatMap((c) => c.split("\n")).filter((l) => [...l].length > 48).length;
    if (!long) passed.push("Every line reads at phone width");
    else failed.push(`${long} caption ${long === 1 ? "line is" : "lines are"} too long for phone width`);
  }
  if (!spec.question?.trim()) {
    passed.push("Sources: legacy motion, studio rule skipped");
  } else {
    if (spec.scenes.length < 3) failed.push("A question needs at least 3 scenes (open it, show it, close it)");
    else passed.push("Room for the arc (open it, show it, close it)");
    const noTeach = spec.scenes.filter((s) => !s.teaches?.trim()).length;
    if (!noTeach) passed.push("Every scene says what it teaches");
    else failed.push(`${noTeach} ${noTeach === 1 ? "scene says" : "scenes say"} nothing it teaches`);
    const unsourced = spec.scenes.filter(
      (s) => s.elements.some((e) => DATA_TYPES.has(e.type)) && !s.caption?.trim() && !(spec.sources ?? []).length,
    ).length;
    if (!unsourced) passed.push("Every number has a source");
    else failed.push(`${unsourced} data ${unsourced === 1 ? "scene names" : "scenes name"} no source`);
  }
  const multi = spec.scenes.filter((s) => s.elements.filter((e) => e.focus).length > 1).length;
  if (!multi) passed.push("One focal action at a time");
  else failed.push(`${multi} ${multi === 1 ? "scene has" : "scenes have"} two focal actions`);
  const badDur = spec.scenes.filter((s) => !(s.duration >= 1 && s.duration <= 20)).length;
  if (!badDur) passed.push("No flashes, steady beats");
  else failed.push(`${badDur} ${badDur === 1 ? "scene beats" : "scenes beat"} outside 1–20 seconds`);
  return { ok: !failed.length, passed, failed };
}

/**
 * The spec with one field set from what the owner typed, or an error in their
 * words. Numbers must be numbers; seconds must be sensible.
 */
export function setField(spec: MotionSpec, f: MotionField, raw: string): { spec: MotionSpec } | { error: string } {
  const next: MotionSpec = JSON.parse(JSON.stringify(spec));
  // Sources: one per line; blank lines are dropped, never saved empty.
  if (f.path.length === 1 && f.path[0] === "sources") {
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > 12) return { error: "A dozen sources is plenty." };
    if (lines.some((l) => [...l].length > 160)) return { error: "A source is one short line." };
    next.sources = lines;
    return { spec: next };
  }
  // The brief above the scenes: one short line each; empty clears it.
  if (f.path.length === 1 && typeof f.path[0] === "string") {
    const key = f.path[0] as "question" | "audience" | "outcome" | "hook";
    if (!["question", "audience", "outcome", "hook"].includes(key)) return { error: "That can't be changed here." };
    const v = raw.trim();
    if ([...v].length > 140) return { error: "One short line — 140 characters at most." };
    (next as unknown as Record<string, unknown>)[key] = v;
    return { spec: next };
  }
  // The voice line is spoken: at most 48 words, the sentence lives there.
  if (f.path.length === 2 && f.path[1] === "voice" && raw.trim().split(/\s+/).filter(Boolean).length > 48) {
    return { error: "Spoken, so 48 words at most — the rest is cut." };
  }
  let value: string | number = raw;
  if (f.kind !== "text") {
    const n = Number(raw.replace(/,/g, "").trim());
    if (!Number.isFinite(n)) return { error: "That isn't a number." };
    if (f.kind === "seconds" && f.path[1] === "duration" && (n < 1 || n > 20)) return { error: "A scene lasts 1 to 20 seconds." };
    if (f.kind === "seconds" && n < 0) return { error: "Seconds can't be negative." };
    value = n;
  } else if (raw.trim() === "" && f.path[2] === "text") {
    return { error: "It needs some words." };
  }
  const [si, a, b, c] = f.path as [number, number | string, string?, number?];
  const scene = next.scenes[si] as unknown as Record<string, unknown>;
  if (typeof a === "string") {
    scene[a] = value;
    return { spec: next };
  }
  const el = next.scenes[si].elements[a] as unknown as Record<string, unknown>;
  if (c !== undefined && b) {
    const arr = [...((el[b] as unknown[]) ?? [])];
    arr[c] = value;
    el[b] = arr;
  } else if (b) {
    el[b] = value;
  }
  return { spec: next };
}

/** "0:23" */
export function clock(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
