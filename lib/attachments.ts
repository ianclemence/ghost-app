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
