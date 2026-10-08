import { describe, expect, test } from "bun:test";
import { AT_END_PX, FollowController, distanceFromEnd } from "./follow";

function make() {
  const frames: (() => void)[] = [];
  const log = { snaps: 0, lastAnimated: false, changes: [] as { following: boolean; away: boolean }[] };
  const c = new FollowController({
    scrollToEnd: (animated: boolean) => { log.snaps++; log.lastAnimated = animated; },
    raf: (fn) => frames.push(fn),
    caf: () => {},
    onChange: (s) => log.changes.push(s),
  });
  const flush = () => { const f = frames.splice(0); f.forEach((fn) => fn()); };
  return { c, log, flush, frames };
}
const at = (offset: number, byHand: boolean, content = 2000, viewport = 600) => ({ offset, viewport, content, byHand });

describe("follow", () => {
  test("distance is clamped at zero", () => {
    expect(distanceFromEnd({ offset: 1500, viewport: 600, content: 2000 })).toBe(0);
    expect(distanceFromEnd({ offset: 1000, viewport: 600, content: 2000 })).toBe(400);
  });

  test("growth is answered with one snap per frame, however many times it grows", () => {
    const { c, log, flush } = make();
    for (let i = 0; i < 40; i++) c.onGrow();
    expect(log.snaps).toBe(0);
    flush();
    expect(log.snaps).toBe(1);
    c.onGrow();
    flush();
    expect(log.snaps).toBe(2);
  });

  test("content outgrowing the viewport is not the owner leaving: still following", () => {
    const { c } = make();
    c.onScroll(at(1400, false, 2000)); // at end
    c.onScroll(at(1400, false, 2600)); // reply grew, no hand
    expect(c.following).toBe(true);
    expect(c.away).toBe(false);
  });

  test("a finger holding the thread while it grows does not stop following", () => {
    const { c } = make();
    c.onScroll(at(1400, true, 2000));
    c.onScroll(at(1400, true, 2600)); // same offset, content grew under the finger
    expect(c.following).toBe(true);
  });

  test("scrolling up by hand stops following and offers the way back", () => {
    const { c, log, flush } = make();
    c.onScroll(at(1400, true));
    c.onScroll(at(1000, true));
    expect(c.following).toBe(false);
    expect(c.away).toBe(true);
    c.onGrow();
    flush();
    expect(log.snaps).toBe(0); // never dragged back down
  });

  test("a small nudge up still counts, so a reader is never yanked", () => {
    const { c } = make();
    c.onScroll(at(1400, true));
    c.onScroll(at(1385, true));
    expect(c.following).toBe(false);
    expect(c.away).toBe(false); // close to the end: no button yet
  });

  test("coming back to the end by hand resumes following", () => {
    const { c } = make();
    c.onScroll(at(1400, true));
    c.onScroll(at(900, true));
    c.onScroll(at(1000, true)); // moving down, still far: unchanged
    expect(c.following).toBe(false);
    c.onScroll(at(2000 - 600 - AT_END_PX + 1, true));
    expect(c.following).toBe(true);
    expect(c.away).toBe(false);
  });

  test("a scroll the list made itself never changes the choice", () => {
    const { c } = make();
    c.onScroll(at(1400, true));
    c.onScroll(at(900, true)); // reading back
    c.onScroll(at(1990 - 600, false)); // programmatic or layout-driven
    expect(c.following).toBe(false);
  });

  test("the jump button follows again, snaps now, and hides itself", () => {
    const { c, log, flush } = make();
    c.onScroll(at(1400, true));
    c.onScroll(at(500, true));
    c.follow();
    expect(c.following).toBe(true);
    expect(c.away).toBe(false);
    expect(log.snaps).toBe(1);
    flush();
    expect(log.snaps).toBe(2); // and once more after the layout it triggered
  });

  test("the jump button glides and does not queue a second snap over it", () => {
    const { c, log, flush } = make();
    c.onScroll(at(1400, true));
    c.onScroll(at(500, true));
    c.follow({ animated: true });
    expect(log.lastAnimated).toBe(true);
    flush();
    expect(log.snaps).toBe(1);
  });

  test("onChange fires only when something changed", () => {
    const { c, log } = make();
    c.onScroll(at(1400, false));
    c.onScroll(at(1400, false));
    expect(log.changes).toHaveLength(0);
    c.onScroll(at(800, true));
    expect(log.changes).toHaveLength(1);
    c.onScroll(at(700, true));
    expect(log.changes).toHaveLength(1);
  });
});
