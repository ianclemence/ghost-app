/**
 * Inline code as a rounded pill. A pill cannot wrap and an inline View is not
 * measured with the monospace font on Android, so it is given an exact width
 * from its length, and only short, plain, one-line snippets qualify. Anything
 * else is drawn as a wrapping run of text (see components/markdown-rules.tsx).
 */
export const INLINE_CODE = {
  fontSize: 13.5,
  /** Advance of one character, as a share of the font size (monospace). */
  advance: 0.6,
  /** A hair of slack so a slightly wider system face is never clipped. */
  slack: 1.015,
  padX: 7,
  height: 22,
  radius: 8,
  /**
   * An inline view sits with its bottom on the line's baseline, so the code
   * inside it (centred in the pill) rides about 8px above the words around it.
   * The pill is lowered by that much so both share one baseline.
   */
  drop: 8,
  /** Longer than this wraps like text instead. */
  maxChars: 36,
};

/** Whether a snippet can be drawn as a pill: short, one line, plain ASCII. */
export function canPillInlineCode(code: string): boolean {
  return code.length > 0 && code.length <= INLINE_CODE.maxChars && /^[\x20-\x7e]+$/.test(code);
}

/** The pill's width for a snippet, from its length. */
export function inlinePillWidth(code: string): number {
  const text = Math.ceil(code.length * INLINE_CODE.fontSize * INLINE_CODE.advance * INLINE_CODE.slack);
  return text + INLINE_CODE.padX * 2 + 2; // 2 for the hairline edges
}
