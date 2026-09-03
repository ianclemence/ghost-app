export function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Strip characters that can never render: lone UTF-16 surrogates (left
 * behind when a title is sliced mid-emoji), control chars, and U+FFFD.
 * Valid emoji and scripts pass through untouched.
 */
export function cleanTitleText(value: string): string {
  let out = "";
  for (const ch of value || "") {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0xfffd) continue;
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    if (cp < 0x20 && cp !== 0x0a) continue;
    out += ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

export function timeAgo(timestampMs: number): string {
  const diff = Date.now() - timestampMs;
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
