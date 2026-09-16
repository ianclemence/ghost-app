import { describe, expect, test } from "bun:test";
import { DEFAULT_VOICE, VOICES, isLiveVoice } from "./voices";

describe("live voices", () => {
  test("default voice is in the catalog", () => {
    expect(VOICES.some((v) => v.id === DEFAULT_VOICE)).toBe(true);
  });

  test("voice guard rejects unknown voices", () => {
    expect(isLiveVoice("marin")).toBe(true);
    expect(isLiveVoice("ghost-voice")).toBe(false);
    expect(isLiveVoice("")).toBe(false);
  });
});
