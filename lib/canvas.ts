/**
 * Canvas: something Ghost built that the owner can see and use, running in the
 * chat.
 *
 * Ghost writes one self-contained HTML document (the Pod's `canvas` tool) and the
 * Pod saves it as a numbered version and publishes it as an artifact. The phone
 * runs it in a sandbox: no network, no storage, no navigation, scripts and styles
 * only from a short list of CDNs. This module is everything about that which is
 * not drawing: the document the sandbox loads, what a page may say back to the
 * app, which artifacts are canvases and which version each one is.
 *
 * The code is model output and untrusted. Nothing the page sends back is acted
 * on except two strictly checked messages: its height (clamped) and an error
 * text (cut short and only ever shown, or sent to Ghost by the owner's tap).
 */
import type { Artifact } from "./ghostApi";

/** A canvas bigger than this is not loaded (the Pod refuses to make one). */
export const CANVAS_MAX_CHARS = 262_144;

/** Where scripts, styles and fonts may come from. Nothing else loads. */
export const CANVAS_HOSTS = [
  "https://cdnjs.cloudflare.com",
  "https://cdn.jsdelivr.net",
  "https://unpkg.com",
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
] as const;

/** The page's own height is trusted only between these (px). */
export const CANVAS_MIN_HEIGHT = 120;
export const CANVAS_MAX_INLINE_HEIGHT = 520;
const CANVAS_MAX_REPORTED_HEIGHT = 20_000;

/**
 * What the sandbox allows. The page cannot reach the network (connect-src
 * none: no fetch, XHR or WebSocket), cannot submit a form, embed a frame or an
 * object, or change its base. Images, fonts and media may be inline or https.
 * 'unsafe-eval' is for the libraries that compile templates (Tailwind's CDN
 * build, Alpine, Vue); with no network and no storage there is nothing for
 * eval to reach.
 */
export function canvasCsp(): string {
  const hosts = CANVAS_HOSTS.join(" ");
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' ${hosts}`,
    `style-src 'unsafe-inline' ${hosts}`,
    "img-src data: blob: https:",
    `font-src data: ${hosts}`,
    "media-src data: blob: https:",
    "connect-src 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "worker-src blob:",
  ].join("; ");
}

/**
 * The look every canvas starts from: Ghost's dark base, a clean face, and named
 * colours the model is told to use (so what it builds sits well in the app).
 * Wrapped in :where() so it has no specificity: anything the page sets wins.
 */
const BASE_CSS = `
:root{color-scheme:dark;--bg:#0b0b10;--surface:#14141b;--fg:#f4f3fa;--muted:#a3a1b0;--accent:#9c95ff;--ok:#6fe3a0;--warn:#ffc24d;--bad:#ff7a7a;--line:rgba(255,255,255,.14);--radius:14px}
:where(html){background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent}
:where(body){margin:0;padding:16px}
:where(*,*::before,*::after){box-sizing:border-box}
:where(button,input,select,textarea){font:inherit;color:inherit}
:where(button){min-height:44px;padding:0 16px;border-radius:var(--radius);border:1px solid var(--line);background:var(--surface);cursor:pointer}
:where(a){color:var(--accent)}
`.replace(/\n/g, "");

/**
 * Runs first in the page. It tells the app the page's height and any error it
 * throws, and nothing else: no way to ask the app for anything.
 *
 * The height is what the content needs, not the document's scrollHeight: a page
 * that sets `html, body { height: 100% }` and centres a card lets the card
 * overflow its own padding, and scrollHeight never sees the padding, so the
 * window shrank to the card's edges. So it is the span of the body's children
 * plus the body's own padding, border and margins. A child as tall as the
 * viewport (100vh) is measured by what is inside it, so the window does not
 * chase its own height.
 */
const BRIDGE_JS = `(function(){
var P=window.ReactNativeWebView;
function say(o){try{P&&P.postMessage(JSON.stringify(o))}catch(e){}}
function err(m){say({type:"error",message:String(m||"Error").slice(0,300)})}
window.addEventListener("error",function(e){err(e.message||(e.error&&e.error.message))});
window.addEventListener("unhandledrejection",function(e){err((e.reason&&e.reason.message)||e.reason||"Unhandled rejection")});
var ce=console.error;console.error=function(){try{err(Array.prototype.join.call(arguments," "))}catch(e){}return ce&&ce.apply(console,arguments)};
function lum(c){var m=/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/.exec(c||"");if(!m)return null;if(m[4]!==undefined&&parseFloat(m[4])<0.05)return null;var v=[m[1],m[2],m[3]].map(function(x){x=x/255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4)});return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2]}
function surface(){if(!window.__GHOST_INLINE__)return;var d=document.documentElement,b=document.body;if(!b)return;var cb=getComputedStyle(b).backgroundColor,cd=getComputedStyle(d).backgroundColor;var l=lum(cb);var col=cb;if(l===null){l=lum(cd);col=cd}
if(l===null){say({type:"surface",dark:true})}else{say({type:"surface",dark:l<0.25,color:col})}}
var last=0;
function px(cs,a){return parseFloat(cs[a])||0}
function box(el){var cs=getComputedStyle(el);return px(cs,"paddingTop")+px(cs,"paddingBottom")+px(cs,"borderTopWidth")+px(cs,"borderBottomWidth")}
function ext(el,depth){var top=Infinity,bot=-Infinity,k=el.children;for(var i=0;i<k.length;i++){var c=k[i],cs=getComputedStyle(c);if(cs.display==="none"||cs.position==="fixed"||c.tagName==="SCRIPT"||c.tagName==="STYLE")continue;var r=c.getBoundingClientRect(),h=r.height;if(depth<3&&h>=innerHeight-1&&c.children.length){var e=ext(c,depth+1);if(e>0)h=Math.min(h,e+box(c))}top=Math.min(top,r.top-px(cs,"marginTop"));bot=Math.max(bot,r.top+h+px(cs,"marginBottom"))}return bot>top?bot-top:0}
function height(){var d=document.documentElement,b=document.body;if(!b)return;var v;var e=ext(b,0);if(e>0){var bs=getComputedStyle(b);v=e+box(b)+px(bs,"marginTop")+px(bs,"marginBottom")+box(d)}else{v=Math.max(d.scrollHeight,b.scrollHeight)}v=Math.ceil(v);if(Math.abs(v-last)>1){last=v;say({type:"height",value:v})}}
function watch(){height();window.addEventListener("resize",height);try{var r=new ResizeObserver(height);r.observe(document.documentElement);if(document.body)r.observe(document.body)}catch(e){}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",watch);else watch();
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",surface);else surface();
window.addEventListener("load",function(){surface();height();say({type:"ready"})});
document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(a){var h=a.getAttribute("href")||"";if(h.charAt(0)!=="#")e.preventDefault()}},true);
window.open=function(){return null};
})();`.replace(/\n/g, "");

const HEAD_OPEN = /<head(\s[^>]*)?>/i;
const HTML_OPEN = /<html(\s[^>]*)?>/i;
const HAS_VIEWPORT = /<meta[^>]+name\s*=\s*["']viewport["']/i;

/**
 * The document the sandbox loads: the model's HTML with the policy, the base
 * look and the bridge placed before anything of the model's own runs. Null when
 * it is too large to load.
 */
export function buildCanvasDocument(html: string, opts: { inline?: boolean } = {}): string | null {
  const source = html ?? "";
  if (source.length === 0 || source.length > CANVAS_MAX_CHARS) return null;
  const inject =
    // In the chat the page runs in a window whose frame takes the page's own
    // ground colour (see surface()), so its edges and bar match what it drew.
    (opts.inline ? `<script>window.__GHOST_INLINE__=true</script>` : "") +
    `<meta http-equiv="Content-Security-Policy" content="${canvasCsp().replace(/"/g, "&quot;")}">` +
    (HAS_VIEWPORT.test(source) ? "" : `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">`) +
    `<style id="ghost-base">${BASE_CSS}</style><script id="ghost-bridge">${BRIDGE_JS}</script>`;
  if (HEAD_OPEN.test(source)) return source.replace(HEAD_OPEN, (m) => m + inject);
  if (HTML_OPEN.test(source)) return source.replace(HTML_OPEN, (m) => `${m}<head>${inject}</head>`);
  // A fragment: give it a document to live in.
  return `<!doctype html><html><head><meta charset="utf-8">${inject}</head><body>${source}</body></html>`;
}

export type CanvasMessage =
  | { type: "height"; value: number }
  | { type: "surface"; dark: boolean; color?: string }
  | { type: "error"; message: string }
  | { type: "ready" };

/**
 * One message from the page, or null. The page is untrusted: only these three
 * shapes are accepted, a height is clamped to something a layout can take, and
 * an error is plain text cut short. Anything else is ignored.
 */
export function parseCanvasMessage(raw: unknown): CanvasMessage | null {
  if (typeof raw !== "string" || raw.length > 2000) return null;
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== "object") return null;
  const o = m as Record<string, unknown>;
  if (o.type === "ready") return { type: "ready" };
  if (o.type === "surface" && typeof o.dark === "boolean") {
    // The page's own ground colour, only ever a plain rgb()/rgba() value.
    const ok = typeof o.color === "string" && /^rgba?\(\d{1,3},\s*\d{1,3},\s*\d{1,3}(,\s*[\d.]+)?\)$/.test(o.color);
    if (!ok) return { type: "surface", dark: true };
    return { type: "surface", dark: o.dark, color: o.color as string };
  }
  if (o.type === "height" && typeof o.value === "number" && Number.isFinite(o.value) && o.value >= 0) {
    return { type: "height", value: Math.min(Math.round(o.value), CANVAS_MAX_REPORTED_HEIGHT) };
  }
  if (o.type === "error" && typeof o.message === "string") {
    const message = o.message.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
    return message ? { type: "error", message } : null;
  }
  return null;
}

/**
 * A page's ground colour (an rgb()/rgba() value it reported, or a #hex) at
 * another opacity, for the fade where a long page runs on below its window.
 */
export function withAlpha(color: string, a: number): string {
  const rgb = /^rgba?\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})/.exec(color);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${a})`;
  const h = color.replace("#", "");
  const hex = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(hex)) return `rgba(11, 11, 16, ${a})`;
  const n = parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** The height the inline card gives the page: its own, within what a chat can hold. */
export function inlineHeight(reported: number | null): number {
  if (reported === null) return CANVAS_MIN_HEIGHT + 60;
  return Math.min(Math.max(reported, CANVAS_MIN_HEIGHT), CANVAS_MAX_INLINE_HEIGHT);
}

// ─── which artifacts are canvases, and which version ──────────────────────

const HTML_PATH = /\.html?$/i;

/** A Pod artifact that is an HTML page Ghost made to be run. */
export function isCanvasArtifact(a: Pick<Artifact, "kind" | "path" | "state">): boolean {
  return a.kind === "file" && a.state === "available" && typeof a.path === "string" && HTML_PATH.test(a.path);
}

export interface CanvasInfo {
  /** 1 for the first time Ghost made this title, then 2, 3… */
  version: number;
  /** How many versions of this title exist. */
  total: number;
  /** The newest version of this title. */
  newestOfTitle: boolean;
  /** The newest canvas in the conversation: the one that runs on its own. */
  latest: boolean;
}

const titleKey = (a: Artifact) => (a.title ?? "").trim().toLowerCase();
const madeAt = (a: Artifact) => (a.created_at ? Date.parse(a.created_at) || 0 : 0);

/**
 * Version numbers and which canvas is the live one, for every canvas in the
 * conversation. Versions are counted by title (Ghost reuses a title to make
 * the next version); the order is when each was made.
 */
export function canvasInfos(artifacts: Artifact[]): Record<string, CanvasInfo> {
  const canvases = artifacts.filter(isCanvasArtifact).sort((a, b) => madeAt(a) - madeAt(b));
  const byTitle = new Map<string, Artifact[]>();
  for (const a of canvases) byTitle.set(titleKey(a), [...(byTitle.get(titleKey(a)) ?? []), a]);
  const newest = canvases[canvases.length - 1];
  const out: Record<string, CanvasInfo> = {};
  for (const group of byTitle.values()) {
    group.forEach((a, i) => {
      out[a.id] = { version: i + 1, total: group.length, newestOfTitle: i === group.length - 1, latest: a.id === newest?.id };
    });
  }
  return out;
}

/** Every version of the canvas this artifact belongs to, oldest first. */
export function canvasVersions(artifacts: Artifact[], of: Artifact): Artifact[] {
  return artifacts
    .filter((a) => isCanvasArtifact(a) && titleKey(a) === titleKey(of))
    .sort((a, b) => madeAt(a) - madeAt(b));
}

// ─── code the owner is reading that can also be run ───────────────────────

/** A fenced block of this language can be run as it stands. */
export function isRunnableFence(language: string): boolean {
  return /^(html?|svg)$/i.test(language.trim());
}

/** The document for a fenced block: an SVG is shown centred on the page. */
export function documentFromFence(code: string, language: string): string {
  if (/^svg$/i.test(language.trim())) {
    return `<!doctype html><html><body style="display:grid;place-items:center;min-height:100vh;margin:0">${code}</body></html>`;
  }
  return code;
}

// ─── asking Ghost to change or fix it ─────────────────────────────────────

/** What the owner's "fix it" tap sends: the error, and what to do about it. */
export function fixPrompt(title: string, message: string): string {
  return `The "${title}" canvas hit an error when it ran: ${message}\nFix it and show the new version.`;
}

/** What "Change it" starts the message with, for the owner to finish. */
export function changeStarter(title: string): string {
  return `Change the "${title}" canvas: `;
}
