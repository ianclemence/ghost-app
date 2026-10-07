import { describe, expect, test } from "bun:test";
import { checkTitle, filterChoices, friendlyModel, isChatModel, groupChoices, pickerChoices, providerName, resolveActive, sourceNote, splitModelRef, type ModelOption } from "./models";

const opt = (over: Partial<ModelOption> & { provider: string; model: string }): ModelOption => ({
  name: over.model,
  target: `${over.provider}:${over.model}`,
  kind: "provider",
  available: true,
  ...over,
});

// A Pod with no named presets, one connected provider and one active model:
// the case the Intelligence screen got wrong ("deepseek-flash" shown as active
// right above "No models configured yet").
const DEEPSEEK = [
  opt({ provider: "deepseek", model: "deepseek-flash" }),
  opt({ provider: "deepseek", model: "deepseek-pro" }),
  opt({ provider: "openai", model: "gpt-4o", available: false, unavailable_reason: "Needs an API key" }),
];

describe("the active model is found among what the Pod offers", () => {
  test("a bare model id with no presets resolves", () => {
    expect(resolveActive("deepseek-flash", DEEPSEEK)?.model).toBe("deepseek-flash");
  });
  test("a provider:model reference and a target resolve", () => {
    expect(resolveActive("deepseek:deepseek-pro", DEEPSEEK)?.model).toBe("deepseek-pro");
  });
  test("a named preset resolves by its name", () => {
    const presets = [opt({ provider: "deepseek", model: "deepseek-flash", name: "Fast", kind: "preset", target: "Fast" })];
    expect(resolveActive("Fast", presets)?.model).toBe("deepseek-flash");
  });
  test("nothing matching is null, never a guess", () => {
    expect(resolveActive("mystery", DEEPSEEK)).toBeNull();
    expect(resolveActive("", DEEPSEEK)).toBeNull();
  });
});

describe("what can be chosen", () => {
  test("only usable models of connected providers, grouped, the active one first", () => {
    const g = groupChoices(DEEPSEEK, "deepseek-flash", { deepseek: { configured: true, source: "live" }, openai: { configured: false } });
    expect(g).toHaveLength(1);
    expect(g[0].provider).toBe("deepseek");
    expect(g[0].models.map((m) => m.model)).toEqual(["deepseek-flash", "deepseek-pro"]);
    expect(g[0].models[0].active).toBe(true);
    expect(g[0].models[1].active).toBe(false);
    expect(g[0].source).toBe("live");
  });

  test("a preset's name wins over the bare id, and the same model is listed once", () => {
    const opts = [
      opt({ provider: "deepseek", model: "deepseek-flash" }),
      opt({ provider: "deepseek", model: "deepseek-flash", name: "Fast", kind: "preset", target: "Fast" }),
    ];
    const g = groupChoices(opts, "Fast", {});
    expect(g[0].models).toHaveLength(1);
    expect(g[0].models[0].label).toBe("Fast");
    expect(g[0].models[0].target).toBe("Fast");
  });

  test("no usable model gives no group, not an empty one", () => {
    expect(groupChoices([opt({ provider: "openai", model: "gpt-4o", available: false })], "", {})).toEqual([]);
  });

  test("embedding models and runner internals are never switchable", () => {
    const opts = [
      opt({ provider: "ollama", model: "qwen3:0.6b" }),
      opt({ provider: "ollama", model: "embeddinggemma" }),
      opt({ provider: "ollama", model: "llamacpp:82f094" }),
    ];
    const g = groupChoices(opts, "", {});
    expect(g).toHaveLength(1);
    expect(g[0].models.map((m) => m.model)).toEqual(["qwen3:0.6b"]);
  });
});

describe("the picker for one provider", () => {
  const live = ["gpt-4o", "gpt-4o-mini", "o3", "gpt-4o"];
  test("lists every live model once, the active first, with a way to switch to each", () => {
    const list = pickerChoices("openai", live, "openai:o3", [opt({ provider: "openai", model: "o3" })]);
    expect(list.map((c) => c.model)).toEqual(["o3", "gpt-4o", "gpt-4o-mini"]);
    expect(list[0].active).toBe(true);
    expect(list[1].target).toBe("openai:gpt-4o");
  });

  test("searching narrows by any part of the name", () => {
    const list = pickerChoices("openai", live, "", []);
    expect(filterChoices(list, "MINI").map((c) => c.model)).toEqual(["gpt-4o-mini"]);
    expect(filterChoices(list, "  ")).toHaveLength(3);
    expect(filterChoices(list, "zzz")).toEqual([]);
  });

  test("embedding models never reach the picker", () => {
    const list = pickerChoices("ollama", ["qwen3:0.6b", "embeddinggemma", "qwen3:0.6b"], "", []);
    expect(list.map((c) => c.model)).toEqual(["qwen3:0.6b"]);
  });
});

describe("saying where a list came from", () => {
  test("live, built-in with a reason, built-in without, and local", () => {
    expect(sourceNote("openai", "live", undefined)).toBe("Live from OpenAI.");
    expect(sourceNote("anthropic", "catalog", "401 from the provider")).toContain("Couldn't reach Claude: 401");
    expect(sourceNote("groq", "catalog", undefined)).toBe("Ghost's built-in list.");
    expect(sourceNote("ollama", "live", undefined)).toBe("Installed on your Pod.");
    expect(sourceNote("x", undefined, undefined)).toBe("");
  });
});

describe("names", () => {
  test("friendly kinds match the console", () => {
    expect(friendlyModel("deepseek-flash", "deepseek")).toBe("Fast");
    expect(friendlyModel("claude-opus-4", "anthropic")).toBe("Thinking");
    expect(friendlyModel("gpt-4o", "openai")).toBe("Standard");
    expect(friendlyModel("qwen3:4b", "ollama")).toBe("Local — medium");
    expect(friendlyModel("llama-vision", "groq")).toBe("Vision");
  });
  test("provider names and refs", () => {
    expect(providerName("anthropic")).toBe("Claude");
    expect(providerName("unknownco")).toBe("Unknownco");
    expect(splitModelRef("deepseek:deepseek-flash")).toEqual({ provider: "deepseek", model: "deepseek-flash" });
    // An Ollama tag has a colon too, and is not a provider.
    expect(splitModelRef("qwen3:4b")).toEqual({ provider: "", model: "qwen3:4b" });
  });
});

describe("internal models and check names", () => {
  test("an embedding model is not a chat model", () => {
    expect(isChatModel("nomic-embed-text:latest")).toBe(false);
    expect(isChatModel("qwen3:8b")).toBe(true);
  });
  test("an ollama internal layer tag is not a chat model", () => {
    expect(isChatModel("llamacpp:82f094e4c0e19bc4208c692996d4f1ecf14e82a8dee579ee1d2ca1175260058e")).toBe(false);
    expect(isChatModel("qwen3:0.6b")).toBe(true);
  });
  test("a check is titled in words, preferring the Pod's own label", () => {
    expect(checkTitle({ name: "disk_pressure" })).toBe("Disk pressure");
    expect(checkTitle({ name: "skill_dependencies", label: "Skills" })).toBe("Skills");
  });
});
