/**
 * Code the owner is reading that they chose to run (a ```html block in a
 * reply). It has no artifact behind it, so the full-screen viewer reads it from
 * here: too large for a route parameter, and not worth the Pod's storage.
 */
export interface CanvasDraft {
  title: string;
  html: string;
}

let current: CanvasDraft | null = null;

export function setCanvasDraft(d: CanvasDraft | null) {
  current = d;
}

export function getCanvasDraft(): CanvasDraft | null {
  return current;
}
