/**
 * Which models Ghost can use, and which one it is using, read from what the
 * Pod reports. Pure (no React Native), so it is testable.
 *
 * The Intelligence screen used to read only the Pod's named presets, so a Pod
 * with none showed a bare model id as "active" next to "no models configured".
 * The Pod also reports every model each connected provider actually serves
 * ("options"), which is what an owner chooses from; presets are just names.
 */
export interface ModelOption {
  name: string;
  provider: string;
  model: string;
  /** What to send to switch to it. */
  target: string;
  kind: string;
  available: boolean;
  unavailable_reason?: string;
  source?: string;
}

export const PROVIDER_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Claude",
  moonshot: "Kimi",
  groq: "Groq",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  gemini: "Gemini",
  zhipu: "Zhipu",
  openrouter: "OpenRouter",
  nvidia: "Nvidia",
  shengsuanyun: "ShengSuanYun",
  ollama: "Local",
  vllm: "Local",
};

export function providerName(key: string): string {
  const k = (key || "").toLowerCase();
  if (PROVIDER_NAMES[k]) return PROVIDER_NAMES[k];
  return k ? k.charAt(0).toUpperCase() + k.slice(1) : "";
}

/** What kind of model it is in an owner's words, as the web console names it. */
export function friendlyModel(model: string, provider = ""): string {
  const m = (model || "").toLowerCase();
  if (provider === "ollama" || provider === "vllm") {
    const size = m.match(/(\d+(?:\.\d+)?)b/);
    if (!size) return "Local";
    const n = parseFloat(size[1]);
    return n <= 1 ? "Local — small" : n <= 8 ? "Local — medium" : "Local — large";
  }
  if (/(vision|multimodal)/.test(m)) return "Vision";
  if (/(flash|mini|haiku|nano|fast|lite|quick|small)/.test(m)) return "Fast";
  if (/(pro|opus|sonnet|reason|thinking|o3|o4|large|max|ultra|extended)/.test(m)) return "Thinking";
  return "Standard";
}

/** The option the Pod's "active" string names, however it names it. */
export function resolveActive(active: string, options: ModelOption[]): ModelOption | null {
  const a = (active || "").trim();
  if (!a) return null;
  return (
    options.find((o) => o.target === a) ??
    options.find((o) => o.name === a) ??
    options.find((o) => `${o.provider}:${o.model}` === a) ??
    options.find((o) => o.model === a) ??
    null
  );
}

/** Split "provider:model" or a bare model id. */
export function splitModelRef(ref: string): { provider: string; model: string } {
  const r = (ref || "").trim();
  const i = r.indexOf(":");
  // An Ollama tag ("qwen3:4b") also has a colon, so only a known provider counts as one.
  if (i > 0 && PROVIDER_NAMES[r.slice(0, i).toLowerCase()]) return { provider: r.slice(0, i).toLowerCase(), model: r.slice(i + 1) };
  return { provider: "", model: r };
}

export interface ModelChoice {
  provider: string;
  model: string;
  /** What to send to switch to it. */
  target: string;
  /** A preset's own name when it has one; otherwise the model id. */
  label: string;
  active: boolean;
}

export interface ModelGroup {
  provider: string;
  providerName: string;
  source?: string;
  error?: string;
  models: ModelChoice[];
}

export interface ProviderMeta {
  configured: boolean;
  source?: string;
  error?: string;
}

const same = (a: ModelOption | null, o: ModelOption) => !!a && a.provider === o.provider && a.model === o.model;

/**
 * What the owner can switch to right now, grouped by provider: usable models of
 * connected providers only, one row per provider and model (a preset's name
 * wins over the bare id), the active one first.
 */
export function groupChoices(options: ModelOption[], active: string, providers: Record<string, ProviderMeta>): ModelGroup[] {
  const current = resolveActive(active, options);
  const groups = new Map<string, ModelGroup>();
  const seen = new Set<string>();
  // Presets first so their names win over the provider's raw ids.
  const ordered = [...options].sort((a, b) => Number(b.kind === "preset") - Number(a.kind === "preset"));
  for (const o of ordered) {
    if (!o.available || !o.provider || !o.model) continue;
    const key = `${o.provider}\u0000${o.model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let g = groups.get(o.provider);
    if (!g) {
      const meta = providers[o.provider];
      g = { provider: o.provider, providerName: providerName(o.provider), source: meta?.source, error: meta?.error, models: [] };
      groups.set(o.provider, g);
    }
    g.models.push({
      provider: o.provider,
      model: o.model,
      target: o.target || `${o.provider}:${o.model}`,
      label: o.kind === "preset" && o.name ? o.name : o.model,
      active: same(current, o),
    });
  }
  const out = [...groups.values()];
  for (const g of out) g.models.sort((a, b) => Number(b.active) - Number(a.active) || a.label.localeCompare(b.label));
  out.sort((a, b) => Number(b.models.some((m) => m.active)) - Number(a.models.some((m) => m.active)) || a.providerName.localeCompare(b.providerName));
  return out;
}

/** The picker for one provider: every model it serves (live when it could be reached), the active one marked. */
export function pickerChoices(provider: string, models: string[], active: string, options: ModelOption[]): ModelChoice[] {
  const current = resolveActive(active, options);
  const byModel = new Map(options.filter((o) => o.provider === provider).map((o) => [o.model, o]));
  const seen = new Set<string>();
  const out: ModelChoice[] = [];
  for (const m of models) {
    if (!m || seen.has(m)) continue;
    seen.add(m);
    const o = byModel.get(m);
    out.push({
      provider,
      model: m,
      target: o?.target || `${provider}:${m}`,
      label: o?.kind === "preset" && o.name ? o.name : m,
      active: !!current && current.provider === provider && current.model === m,
    });
  }
  return out.sort((a, b) => Number(b.active) - Number(a.active) || a.label.localeCompare(b.label));
}

/** Narrow a long list as the owner types. Matches any part of the id or label, ignoring case. */
export function filterChoices(list: ModelChoice[], query: string): ModelChoice[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((c) => c.model.toLowerCase().includes(q) || c.label.toLowerCase().includes(q));
}

/** How the provider's list was obtained, in a sentence an owner can use. */
export function sourceNote(provider: string, source: string | undefined, error: string | undefined): string {
  const name = providerName(provider) || "the provider";
  if (provider === "ollama" || provider === "vllm") return "Installed on your Pod.";
  if (source === "live") return `Live from ${name}.`;
  if (source === "catalog") {
    return error ? `Ghost's built-in list. Couldn't reach ${name}: ${error}` : `Ghost's built-in list.`;
  }
  return "";
}

/**
 * Embedding models (nomic-embed-text and the like) are Ghost's own internal
 * tools for memory search. They cannot chat, so they are never offered as
 * something to use.
 */
export function isChatModel(name: string): boolean {
  return !/embed/i.test(name);
}

/** A health check's name, the way a person would say it ("disk_pressure" -> "Disk pressure"). */
export function checkTitle(check: { name: string; label?: string }): string {
  if (check.label && check.label.trim()) return check.label.trim();
  const words = (check.name || "").replace(/[_-]+/g, " ").trim();
  if (!words) return "Issue";
  return words.charAt(0).toUpperCase() + words.slice(1);
}
