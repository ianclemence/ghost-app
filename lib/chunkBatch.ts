/**
 * Streamed text arrives in many small pieces, sometimes dozens a second. Every
 * piece used to rebuild the thread and re-parse the reply's markdown, which is
 * more work than a phone can do between frames and the reason a fast stream
 * stutters. The pieces are gathered and handed over together a few times a
 * second; the text is the same, only the number of renders changes.
 */
export interface ChunkBatcher {
  push: (chunk: string) => void;
  /** Hand over what is gathered now (before anything that must see all of it). */
  flush: () => void;
  /** Drop what is gathered without handing it over. */
  cancel: () => void;
}

export function createChunkBatcher(
  emit: (text: string) => void,
  intervalMs = 50,
  timers: { set: (fn: () => void, ms: number) => unknown; clear: (t: unknown) => void } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
  },
): ChunkBatcher {
  let pending = "";
  let timer: unknown = null;
  const flush = () => {
    if (timer !== null) {
      timers.clear(timer);
      timer = null;
    }
    if (!pending) return;
    const out = pending;
    pending = "";
    emit(out);
  };
  return {
    push(chunk) {
      pending += chunk;
      if (timer === null) timer = timers.set(() => { timer = null; flush(); }, intervalMs);
    },
    flush,
    cancel() {
      if (timer !== null) timers.clear(timer);
      timer = null;
      pending = "";
    },
  };
}
