/**
 * Steering Ghost's browser from the phone.
 *
 * Some steps only a person can do: tick a "Verify you are human" box, solve a
 * CAPTCHA, enter a two-factor code. Ghost stops and says so instead of trying to
 * get past them. The owner takes over the live browser, does that step with
 * their own taps and typing, and hands it back. This module is the pure part:
 * turning a tap on the picture into a click on the page, and text into key
 * events, in the message format the browser's stream understands.
 */

export interface Size {
  width: number;
  height: number;
}

/** One frame of the live view, as the browser stream sends it. */
export interface Frame {
  seq: number;
  /** Base64 JPEG. */
  data: string;
  device: Size;
}

/** Reads a stream message, returning a frame or null for anything else. */
export function parseFrame(raw: string): Frame | null {
  try {
    const m = JSON.parse(raw) as {
      type?: string;
      seq?: number;
      data?: string;
      metadata?: { deviceWidth?: number; deviceHeight?: number };
    };
    if (m.type !== "frame" || typeof m.data !== "string" || typeof m.seq !== "number") return null;
    const w = m.metadata?.deviceWidth ?? 0;
    const h = m.metadata?.deviceHeight ?? 0;
    if (!(w > 0) || !(h > 0)) return null;
    return { seq: m.seq, data: m.data, device: { width: w, height: h } };
  } catch {
    return null;
  }
}

/**
 * A tap at (x, y) on the picture as shown, to the matching point on the page.
 * The live view letterboxes the page inside its frame (the page keeps its own
 * aspect ratio), so the tap is first un-letterboxed against the drawn image
 * rect, then clamped to the page: a finger on the edge is still on the page.
 */
export function tapToPageContained(tap: { x: number; y: number }, shown: Size, device: Size): { x: number; y: number } {
  if (!(shown.width > 0) || !(shown.height > 0) || !(device.width > 0) || !(device.height > 0)) {
    return { x: 0, y: 0 };
  }
  const scale = Math.min(shown.width / device.width, shown.height / device.height);
  const drawnW = device.width * scale;
  const drawnH = device.height * scale;
  const offX = (shown.width - drawnW) / 2;
  const offY = (shown.height - drawnH) / 2;
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max - 1, v));
  return {
    x: Math.round(clamp((tap.x - offX) / scale, device.width)),
    y: Math.round(clamp((tap.y - offY) / scale, device.height)),
  };
}

/**
 * A tap at (x, y) on the picture as shown, to the matching point on the page.
 * The picture is drawn to fit, so the position scales by the ratio of the page
 * to the picture. A tap is clamped to the page: a finger on the edge is still
 * on the page.
 */
export function tapToPage(tap: { x: number; y: number }, shown: Size, device: Size): { x: number; y: number } {
  if (!(shown.width > 0) || !(shown.height > 0)) return { x: 0, y: 0 };
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max - 1, v));
  return {
    x: Math.round(clamp((tap.x / shown.width) * device.width, device.width)),
    y: Math.round(clamp((tap.y / shown.height) * device.height, device.height)),
  };
}

export type StreamInput = Record<string, unknown>;

/** A click: move there, press, release. */
export function clickMessages(x: number, y: number): StreamInput[] {
  return [
    { type: "input_mouse", eventType: "mouseMoved", x, y },
    { type: "input_mouse", eventType: "mousePressed", x, y, button: "left", clickCount: 1 },
    { type: "input_mouse", eventType: "mouseReleased", x, y, button: "left", clickCount: 1 },
  ];
}

/** Scrolling the page by moving the wheel over a point. */
export function scrollMessage(x: number, y: number, deltaY: number): StreamInput {
  return { type: "input_mouse", eventType: "mouseWheel", x, y, deltaX: 0, deltaY };
}

const NAMED_KEYS: Record<string, { key: string; code: string; text?: string; keyCode: number }> = {
  Enter: { key: "Enter", code: "Enter", text: "\r", keyCode: 13 },
  Tab: { key: "Tab", code: "Tab", keyCode: 9 },
  Backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
  Escape: { key: "Escape", code: "Escape", keyCode: 27 },
};

/** Press and release one named key (Enter, Tab, Backspace, Escape). */
export function namedKeyMessages(name: keyof typeof NAMED_KEYS): StreamInput[] {
  const k = NAMED_KEYS[name];
  const base = { type: "input_keyboard", key: k.key, code: k.code, windowsVirtualKeyCode: k.keyCode };
  return [
    { ...base, eventType: "keyDown", ...(k.text ? { text: k.text } : {}) },
    { ...base, eventType: "keyUp" },
  ];
}

/**
 * Text as key presses. A newline is the Enter key. Each character is a press
 * and a release, so it reaches a page the way typing does.
 */
export function typeMessages(text: string, max = 500): StreamInput[] {
  const out: StreamInput[] = [];
  for (const ch of Array.from(text).slice(0, max)) {
    if (ch === "\n") {
      out.push(...namedKeyMessages("Enter"));
      continue;
    }
    out.push({ type: "input_keyboard", eventType: "keyDown", key: ch, text: ch });
    out.push({ type: "input_keyboard", eventType: "keyUp", key: ch });
  }
  return out;
}

/** The address of a stream ticket's socket, asking for one frame at a time. */
export function screencastSocketURL(wsBase: string, wsPath: string, maxFps = 8): string {
  const sep = wsPath.includes("?") ? "&" : "?";
  return `${wsBase}${wsPath}${sep}pacing=ack&maxFps=${maxFps}`;
}
