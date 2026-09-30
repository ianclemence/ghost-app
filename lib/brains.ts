// What Ghost can think with, as offered when a Pod is set up. The list and the
// wording match the Pod's own first-run screen so the phone and the browser
// ask the same question.

export type Brain = {
  key: string;
  label: string;
  note: string;
  /** Needs an API key. False means it runs on the Pod itself. */
  cloud: boolean;
};

export const BRAINS: Brain[] = [
  { key: "deepseek", label: "DeepSeek", note: "Recommended. Fast and inexpensive.", cloud: true },
  { key: "anthropic", label: "Anthropic", note: "Claude models.", cloud: true },
  { key: "openai", label: "OpenAI", note: "", cloud: true },
  { key: "moonshot", label: "Kimi", note: "", cloud: true },
  { key: "ollama", label: "On this Pod", note: "Private and offline. Slower, and less capable.", cloud: false },
];

export function brainByKey(key: string): Brain {
  return BRAINS.find((b) => b.key === key) ?? BRAINS[0];
}

/** Why setup can't continue with this choice, or null when it can. */
export function brainProblem(key: string, apiKey: string): string | null {
  const b = brainByKey(key);
  if (b.cloud && !apiKey.trim()) {
    return `Paste your ${b.label} API key, or choose On this Pod.`;
  }
  return null;
}
