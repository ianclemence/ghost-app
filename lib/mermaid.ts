/**
 * Mermaid diagram helpers (pure, UI-agnostic).
 *
 * Model-generated diagram source is untrusted content. These helpers keep
 * the dangerous parts out of the renderer: oversized input never reaches
 * the WebView, and the diagram HTML is built with a locked-down Mermaid
 * configuration (strict security, no HTML labels, no external resources
 * beyond the pinned Mermaid runtime itself).
 */

export const MERMAID_MAX_SOURCE_CHARS = 20000;
export const MERMAID_CDN_URL =
  "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js";

/** True when a fence info string names a Mermaid block. */
export function isMermaidLanguage(info: string | null | undefined): boolean {
  return (info ?? "").trim().split(/\s+/)[0]?.toLowerCase() === "mermaid";
}

/** True when the source fits the render budget (else show code). */
export function mermaidSourceFits(source: string): boolean {
  return source.length <= MERMAID_MAX_SOURCE_CHARS;
}

function escapeForScript(source: string): string {
  return source.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
}

/**
 * Standalone diagram document. Rendered in a WebView with navigation
 * locked down by the host component (see MermaidDiagram):
 * - Mermaid runs with securityLevel "strict" and htmlLabels off, so
 *   labels cannot inject HTML or script.
 * - No clickable links inside diagrams (link handling disabled).
 * - Posts its content height back; renders nothing on failure (the host
 *   falls back to a code block).
 */
export function buildMermaidHtml(source: string): string {
  const safe = escapeForScript(source);
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<style>html,body{margin:0;padding:8px;background:transparent;}svg{max-width:100%;height:auto;}</style>` +
    `</head><body><div id="d"></div>` +
    `<script src="${MERMAID_CDN_URL}"></script>` +
    `<script>(function(){try{` +
    `mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'neutral',` +
    `flowchart:{htmlLabels:false},sequence:{showSequenceNumbers:false},` +
    `themeVariables:{fontFamily:'system-ui,-apple-system,sans-serif',fontSize:'14px'}});` +
    `mermaid.render('g',\`${safe}\`).then(function(r){` +
    `document.getElementById('d').innerHTML=r.svg;` +
    `var h=document.getElementById('d').scrollHeight;` +
    `window.ReactNativeWebView.postMessage(JSON.stringify({type:'height',height:h}));` +
    `}).catch(function(e){` +
    `window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',message:String(e&&e.message||e)}));` +
    `});}catch(e){` +
    `window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',message:String(e&&e.message||e)}));` +
    `}})();</script></body></html>`;
}
