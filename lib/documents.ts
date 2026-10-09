/**
 * Documents Ghost made: which artifacts are documents (a PDF to look through),
 * which can also be had as Word (Ghost's own, laid out from Markdown on the
 * Pod), and handing one to the phone's share sheet.
 */
import type { Artifact, GhostConfig } from "./ghostApi";
import { exportArtifact } from "./ghostApi";
import { writeCacheFile } from "./localFiles";

/** A PDF Ghost handed over: shown as its pages, not filed. */
export function isDocumentArtifact(a: Pick<Artifact, "kind" | "path" | "state">): boolean {
  return a.kind === "file" && a.state === "available" && typeof a.path === "string" && /\.pdf$/i.test(a.path);
}

/** Ghost's own document (laid out from Markdown): it also comes as Word. */
export function hasWordCopy(a: Pick<Artifact, "path">): boolean {
  return typeof a.path === "string" && /^documents\/[^/]+\.pdf$/i.test(a.path);
}

/** A page of A4 is this much taller than it is wide. */
export const A4 = Math.SQRT2;

/**
 * Fetch a file from the Pod and open the share sheet with it. Returns why it
 * did not, in the owner's words, or null when the sheet opened.
 */
export async function shareExport(cfg: GhostConfig, id: string, format: "pdf" | "docx"): Promise<string | null> {
  const Sharing = await import("expo-sharing");
  if (!(await Sharing.isAvailableAsync())) return "This device can't share files from here.";
  const r = await exportArtifact(cfg, id, format);
  if (!r.ok) return r.error;
  const uri = await writeCacheFile(r.name, r.base64, "base64");
  await Sharing.shareAsync(uri, { mimeType: r.mime, dialogTitle: r.name });
  return null;
}
