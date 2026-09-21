// Reasoning isolation for the phone runtime.
//
// Ghost never surfaces a model's chain-of-thought. Small local models
// (Qwen/GPT-OSS style) sometimes emit reasoning inline as <think>…</think>
// tags in the same token stream as the answer. This filter removes those
// blocks — even when a tag is split across tokens — so the phone path can
// never render reasoning. The Pod path strips reasoning at the appliance;
// this is the on-device guarantee.

const TAG_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["<thinking>", "</thinking>"],
  ["<think>", "</think>"],
];

function earliestTag(s: string, open: boolean): { index: number; tag: string } | null {
  let best: { index: number; tag: string } | null = null;
  for (const pair of TAG_PAIRS) {
    const tag = open ? pair[0] : pair[1];
    const i = s.indexOf(tag);
    if (i >= 0 && (best === null || i < best.index)) {
      best = { index: i, tag };
    }
  }
  return best;
}

// tail returns the longest suffix of s that is a proper prefix of a tag, so it
// can be held until the next token.
function tagSuffix(s: string, open: boolean): string {
  let best = "";
  for (const pair of TAG_PAIRS) {
    const tag = open ? pair[0] : pair[1];
    const max = Math.min(s.length, tag.length - 1);
    for (let n = max; n > 0; n--) {
      if (s.endsWith(tag.slice(0, n)) && n > best.length) {
        best = tag.slice(0, n);
      }
    }
  }
  return best;
}

function isPartialTag(s: string, open: boolean): boolean {
  for (const pair of TAG_PAIRS) {
    const tag = open ? pair[0] : pair[1];
    if (s.length < tag.length && tag.startsWith(s)) return true;
  }
  return false;
}

/** ReasoningStreamFilter strips inline reasoning tags from a token stream. */
export class ReasoningStreamFilter {
  private inThink = false;
  private hold = "";

  /** write consumes a token and returns visible text safe to emit. */
  write(chunk: string): string {
    this.hold += chunk;
    let out = "";
    while (this.hold.length > 0) {
      if (this.inThink) {
        const close = earliestTag(this.hold, false);
        if (!close) {
          this.hold = tagSuffix(this.hold, false);
          return out;
        }
        this.hold = this.hold.slice(close.index + close.tag.length);
        this.inThink = false;
        continue;
      }
      const open = earliestTag(this.hold, true);
      if (!open) {
        const keep = tagSuffix(this.hold, true);
        out += this.hold.slice(0, this.hold.length - keep.length);
        this.hold = keep;
        return out;
      }
      out += this.hold.slice(0, open.index);
      this.hold = this.hold.slice(open.index + open.tag.length);
      this.inThink = true;
    }
    return out;
  }

  /** flush releases buffered non-reasoning text at end of stream. */
  flush(): string {
    let out = "";
    if (!this.inThink && this.hold.length > 0 && !isPartialTag(this.hold, true)) {
      out = this.hold;
    }
    this.hold = "";
    return out;
  }
}

/** stripReasoningTags removes inline reasoning tags from a complete string. */
export function stripReasoningTags(s: string): string {
  const f = new ReasoningStreamFilter();
  return f.write(s) + f.flush();
}
