// What the owner can send with a message: photos and files, up to ten at a
// time. The Pod detects each file's real type; the phone only enforces the
// limits the Pod would enforce anyway, so an oversize file fails here, at the
// picker, instead of after a long upload.

export type Attachment = {
  uri: string;
  b64: string;
  mime: string;
  name: string;
  kind: "image" | "file";
  size: number;
};

/** Must match the Pod's uploads.MaxBytes. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;
/** Everything in one message. The Pod accepts a little more; this keeps an upload quick. */
export const MAX_TOTAL_BYTES = 60 * 1024 * 1024;

/** "1.4 MB", "320 KB", "88 B". */
export function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Why a file can't be attached, in the owner's words, or null when it can. */
export function attachmentProblem(
  size: number | undefined,
  count: number,
  usedBytes = 0,
): string | null {
  if (count >= MAX_ATTACHMENTS) return `You can attach up to ${MAX_ATTACHMENTS} files at a time.`;
  if (size === 0) return "That file is empty.";
  if (size && size > MAX_ATTACHMENT_BYTES) {
    return `That file is ${fileSize(size)}. The limit is ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB.`;
  }
  if (size && usedBytes + size > MAX_TOTAL_BYTES) {
    return `That would make this message ${fileSize(usedBytes + size)}. Send the rest in another message; the limit is ${MAX_TOTAL_BYTES / (1024 * 1024)} MB together.`;
  }
  return null;
}

/** The wire shape the Pod's /v1/chat takes under media_items. */
export function toMediaItems(list: Attachment[]) {
  return list.map((a) => ({ base64: a.b64, mime_type: a.mime, filename: a.name }));
}

/** Base64 length to bytes, for pickers that don't report a size. */
export function base64Bytes(b64: string): number {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

/** A name for a photo the picker didn't name. */
export function photoName(uri: string, mime: string, index: number): string {
  const tail = uri.split("/").pop() ?? "";
  if (/\.[A-Za-z0-9]{2,5}$/.test(tail)) return tail;
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  return `photo-${index + 1}.${ext}`;
}

// ─── How an attachment is shown ────────────────────────────────────────────

/** The file's extension in capitals, or "" when it has none. */
export function extOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(name);
  return m ? m[1].toUpperCase() : "";
}

export type FileTone = "error" | "info" | "success" | "ember" | "warning" | "muted";

/**
 * What kind of file this is, for its badge: a short label and a tone, so a
 * PDF, a spreadsheet and an archive are told apart at a glance by colour as
 * well as by name.
 */
export function fileKind(name: string, mime = ""): { label: string; tone: FileTone } {
  const ext = extOf(name);
  const m = mime.toLowerCase();
  if (ext === "PDF" || m === "application/pdf") return { label: "PDF", tone: "error" };
  if (["DOC", "DOCX", "ODT", "RTF", "PAGES"].includes(ext) || m.includes("wordprocessingml") || m.includes("msword")) return { label: ext || "DOC", tone: "info" };
  if (["XLS", "XLSX", "CSV", "TSV", "NUMBERS", "ODS"].includes(ext) || m.includes("spreadsheetml") || m === "text/csv") return { label: ext || "CSV", tone: "success" };
  if (["PPT", "PPTX", "KEY", "ODP"].includes(ext) || m.includes("presentationml")) return { label: ext || "PPT", tone: "ember" };
  if (["ZIP", "RAR", "7Z", "TAR", "GZ"].includes(ext) || m === "application/zip") return { label: ext || "ZIP", tone: "warning" };
  if (["MP3", "M4A", "WAV", "AAC", "OGG", "FLAC"].includes(ext) || m.startsWith("audio/")) return { label: ext || "AUDIO", tone: "ember" };
  if (["MP4", "MOV", "M4V", "WEBM"].includes(ext) || m.startsWith("video/")) return { label: ext || "VIDEO", tone: "info" };
  return { label: ext || "FILE", tone: "muted" };
}

/** "3 attached · 4.2 MB", or "" for none. */
export function attachmentSummary(list: { size: number }[]): string {
  if (list.length === 0) return "";
  const total = list.reduce((n, a) => n + a.size, 0);
  return `${list.length} attached · ${fileSize(total)}`;
}
