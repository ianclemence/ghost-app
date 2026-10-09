/**
 * Motions on the phone: which artifacts are motions, and the editor's view of
 * one: every word, number and timing as a field, and the spec with a field
 * changed. Pure, so it is testable.
 */
import type { Artifact, MotionElement, MotionSpec } from "./ghostApi";

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
  flow: "Diagram", hub: "Diagram", gauge: "Gauge",
};

/** A motion's version, from its file (motion/name-v3.json → 3). */
export function motionVersion(path: string | undefined): number {
  const m = /-v(\d+)\.json$/.exec(path ?? "");
  return m ? parseInt(m[1], 10) : 1;
}

/** Every word, number and timing in a motion, scene by scene. */
export function motionFields(spec: MotionSpec): { scene: number; title: string; fields: MotionField[] }[] {
  return spec.scenes.map((sc, si) => {
    const fields: MotionField[] = [{ path: [si, "duration"], label: "Seconds", kind: "seconds", value: String(sc.duration) }];
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
      (e.items ?? []).forEach((it, i) => fields.push({ path: [si, ei, "items", i], label: `${w}: ${e.type === "steps" ? "step" : e.type === "flow" ? "box" : e.type === "hub" ? "part" : "item"} ${i + 1}`, kind: "text", value: it }));
      if (ei > 0 || (e.at ?? 0) > 0) fields.push({ path: [si, ei, "at"], label: `${w}: enters at (s)`, kind: "seconds", value: String(e.at ?? 0) });
    });
    if (sc.caption !== undefined) fields.push({ path: [si, "caption"], label: "Caption", kind: "text", value: sc.caption });
    return { scene: si, title: sceneTitle(sc.elements), fields };
  });
}

function sceneTitle(els: MotionElement[]): string {
  const e = els[0];
  if (!e) return "Scene";
  const t = e.text || e.label || e.items?.[0] || KIND_WORD[e.type];
  return t.length > 40 ? `${t.slice(0, 39)}…` : t;
}

/**
 * The spec with one field set from what the owner typed, or an error in their
 * words. Numbers must be numbers; seconds must be sensible.
 */
export function setField(spec: MotionSpec, f: MotionField, raw: string): { spec: MotionSpec } | { error: string } {
  const next: MotionSpec = JSON.parse(JSON.stringify(spec));
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
