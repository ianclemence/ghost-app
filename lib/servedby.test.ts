import { describe, expect, test } from "bun:test";
import { parseStreamLine, phaseLabel, servedByLabel } from "./ghostApi";

describe("runtime frames", () => {
  test("served_by is parsed from the runtime, never inferred", () => {
    const ev = parseStreamLine('data: {"type":"served_by","provider":"deepseek","model":"deepseek-flash","local":false}');
    expect(ev).toEqual({ kind: "served", served: { provider: "deepseek", model: "deepseek-flash", local: false } });
    expect(servedByLabel(ev.kind === "served" ? ev.served : null)).toBe("deepseek-flash via deepseek");
    expect(servedByLabel({ provider: "ollama", model: "qwen3:8b", local: true })).toBe("On your Pod · qwen3:8b");
    expect(parseStreamLine('data: {"type":"served_by"}').kind).toBe("unknown");
    expect(servedByLabel(null)).toBeNull();
  });

  test("phase frames become owner words, not machinery", () => {
    const ev = parseStreamLine('data: {"type":"phase","phase":"retrieving","detail":"memory"}');
    expect(ev).toEqual({ kind: "phase", phase: "retrieving", detail: "memory" });
    expect(phaseLabel("retrieving", "memory")).toBe("Checking memory");
    expect(phaseLabel("thinking")).toBe("Thinking");
    expect(phaseLabel("something_internal")).toBeNull();
  });
});
