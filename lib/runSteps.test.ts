import { describe, expect, test } from "bun:test";
import { endStep, formatDuration, legacyStep, liveLine, settleSteps, startStep, stepKind, summarize, type RunStep } from "./runSteps";

const run = (...evs: (["s", string, string, string?] | ["e", string, boolean, string?])[]): RunStep[] => {
  let steps: RunStep[] = [];
  let t = 1000;
  for (const e of evs) {
    t += 500;
    steps = e[0] === "s"
      ? startStep(steps, { id: e[1], tool: e[2], detail: e[3], now: t })
      : endStep(steps, { id: e[1], ok: e[2], note: e[3], now: t });
  }
  return steps;
};

describe("steps", () => {
  test("kinds follow the tool, unknown tools are 'other'", () => {
    expect(stepKind("web_search")).toBe("search");
    expect(stepKind("browser_click")).toBe("browser");
    expect(stepKind("exec")).toBe("command");
    expect(stepKind("something_new")).toBe("other");
  });

  test("a step runs, then ends with a duration; a repeated start is ignored", () => {
    let steps = startStep([], { id: "a", tool: "web_search", detail: "q", now: 1000 });
    steps = startStep(steps, { id: "a", tool: "web_search", now: 1100 });
    expect(steps).toHaveLength(1);
    expect(liveLine(steps)).toBe("Searching the web");
    steps = endStep(steps, { id: "a", ok: true, ms: 800, now: 2000 });
    expect(steps[0]).toMatchObject({ state: "done", ms: 800 });
    expect(liveLine(steps)).toBe("Working on it");
  });

  test("a failure keeps its note; success drops one", () => {
    const steps = run(["s", "a", "exec", "php -v"], ["e", "a", false, "exit status 1"]);
    expect(steps[0]).toMatchObject({ state: "failed", note: "exit status 1" });
  });

  test("ending an unknown id changes nothing", () => {
    const steps = run(["s", "a", "exec"]);
    expect(endStep(steps, { id: "zzz", ok: true, now: 9 })).toBe(steps);
  });

  test("settling closes whatever still runs", () => {
    const steps = settleSteps(run(["s", "a", "exec"], ["s", "b", "web_search"], ["e", "a", true]), 99_999);
    expect(steps.every((s) => s.state !== "running")).toBe(true);
    expect(settleSteps(steps, 5)).toBe(steps);
  });

  test("legacy status frames become steps that end when the next begins", () => {
    let steps = legacyStep([], { tool: "web_search", now: 1000 });
    steps = legacyStep(steps, { tool: "web_fetch", now: 3000 });
    expect(steps.map((s) => s.state)).toEqual(["done", "running"]);
    expect(steps[0].ms).toBe(2000);
  });
});

describe("summary", () => {
  test("empty is empty", () => expect(summarize([])).toBe(""));

  test("counts by kind in the order they happened", () => {
    const steps = run(
      ["s", "1", "web_search"], ["e", "1", true],
      ["s", "2", "exec"], ["e", "2", true],
      ["s", "3", "exec"], ["e", "3", true],
      ["s", "4", "browser_navigate"], ["e", "4", true],
    );
    expect(summarize(steps)).toBe("Searched the web, ran 2 commands, browsed the web");
  });

  test("a failure is named on its kind", () => {
    const steps = run(["s", "1", "exec"], ["e", "1", true], ["s", "2", "exec"], ["e", "2", false, "x"]);
    expect(summarize(steps)).toBe("Ran 2 commands (1 failed)");
    const one = run(["s", "1", "exec"], ["e", "1", false]);
    expect(summarize(one)).toBe("Ran a command (1 failed)");
  });

  test("a long run is capped at three phrases", () => {
    const steps = run(
      ["s", "1", "web_search"], ["s", "2", "exec"], ["s", "3", "remember"], ["s", "4", "read_file"], ["s", "5", "foo"],
    );
    expect(summarize(steps)).toBe("Searched the web, ran a command, checked memory, and 2 more");
  });
});

describe("duration", () => {
  test("reads like a person would", () => {
    expect(formatDuration(300)).toBe("<1s");
    expect(formatDuration(3200)).toBe("3.2s");
    expect(formatDuration(14_000)).toBe("14s");
    expect(formatDuration(79_000)).toBe("1m 19s");
    expect(formatDuration(-1)).toBe("");
  });
});
