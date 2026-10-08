/**
 * Staying with the end of a conversation while it grows.
 *
 * The rule a good chat follows, in one place so it is the same everywhere
 * (a reply streaming in, a tool step appearing, a card opening, the keyboard
 * moving) and so it can be tested without a phone:
 *
 *   Following is a choice the owner makes with their finger and nothing else.
 *   Content growing, a layout settling, the keyboard rising: none of these are
 *   the owner leaving the end, so none of them stop following. Moving the
 *   thread upward by hand does. Coming back to within a thumb of the end, by
 *   hand or by the jump button, resumes it.
 *
 * While following, growth is answered with ONE unanimated snap to the end per
 * frame, however many times the content changed in it. A snap per token would
 * fall behind a fast stream and fight the layout; one per frame cannot.
 */

/** Within this many px of the end still counts as being at the end. */
export const AT_END_PX = 72;
/** Further than this from the end, offer the way back. */
export const AWAY_PX = 160;

export interface ScrollSample {
  /** Current scroll offset. */
  offset: number;
  /** Visible height. */
  viewport: number;
  /** Total content height. */
  content: number;
  /** True while the owner's finger (or its momentum) is driving the scroll. */
  byHand: boolean;
}

export function distanceFromEnd(s: Pick<ScrollSample, "offset" | "viewport" | "content">): number {
  return Math.max(0, s.content - (s.viewport + s.offset));
}

export interface FollowHooks {
  /** Go to the end. Unanimated while following, so a fast stream cannot outrun it. */
  scrollToEnd: (animated: boolean) => void;
  /** One call per frame at most. Defaults to requestAnimationFrame. */
  raf?: (fn: () => void) => number;
  caf?: (id: number) => void;
  /** Following or distance-from-end changed. */
  onChange?: (state: { following: boolean; away: boolean }) => void;
}

export class FollowController {
  following = true;
  away = false;
  private lastOffset = 0;
  private frame: number | null = null;
  private readonly raf: (fn: () => void) => number;
  private readonly caf: (id: number) => void;

  constructor(private readonly hooks: FollowHooks) {
    this.raf = hooks.raf ?? ((fn) => requestAnimationFrame(fn) as unknown as number);
    this.caf = hooks.caf ?? ((id) => cancelAnimationFrame(id));
  }

  private emit(following: boolean, away: boolean) {
    if (following === this.following && away === this.away) return;
    this.following = following;
    this.away = away;
    this.hooks.onChange?.({ following, away });
  }

  /** A scroll event. Only a scroll by hand can change whether we follow. */
  onScroll(s: ScrollSample) {
    const dist = distanceFromEnd(s);
    let following = this.following;
    if (s.byHand) {
      if (s.offset < this.lastOffset - 1) following = false; // moved up: leaving the end
      else if (dist <= AT_END_PX) following = true; // back at the end
    }
    this.lastOffset = s.offset;
    // The way back is offered when the owner is away, never because the
    // content outgrew the viewport for a frame while we are still following.
    this.emit(following, !following && dist > AWAY_PX);
  }

  /** Content or viewport changed size. Follow it, once per frame. */
  onGrow() {
    if (!this.following || this.frame !== null) return;
    this.frame = this.raf(() => {
      this.frame = null;
      if (this.following) this.hooks.scrollToEnd(false);
    });
  }

  /**
   * Sending a message, or the jump button: the owner wants the end. A glide for
   * the button (a long way), a snap for a send (the new rows are not laid out
   * yet, so it snaps again once they are).
   */
  follow(opts: { animated?: boolean } = {}) {
    this.emit(true, false);
    if (this.frame !== null) this.caf(this.frame);
    this.frame = null;
    this.hooks.scrollToEnd(!!opts.animated);
    if (!opts.animated) this.onGrow();
  }

  dispose() {
    if (this.frame !== null) this.caf(this.frame);
    this.frame = null;
  }
}
