/**
 * URL policy for model-generated content (pure, dependency-free).
 *
 * Model output is untrusted: a link may point at javascript:, data:, a
 * file, or an app-escaping custom scheme. Only http(s) is ever allowed to
 * leave the chat, and only https images are ever fetched. Keeping the
 * policy in its own module (no React Native imports) makes it directly
 * unit-testable.
 */

/** True only for http:// and https:// URLs. */
export function isSafeExternalUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const t = url.trim();
  return /^https?:\/\/[^/\s]/i.test(t);
}

/** True only for https:// image sources (no http leaks, no data: blobs). */
export function isSafeImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /^https:\/\/[^/\s]/i.test(url.trim());
}
