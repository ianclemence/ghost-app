// Execution planner: deterministic phone/pod/cloud selection.
// Local-first; effort never automatically means cloud. Mirrors pkg/execplan.
export type Target = "phone" | "pod" | "cloud";
export type Privacy = "local_only" | "balanced" | "cloud_capable";
export type Effort = "quick" | "normal" | "deep";

export interface Availability {
  phone: boolean;
  pod: boolean;
  cloud: boolean;
  phoneModel: boolean;
  podModel: boolean;
  cloudModel: boolean;
  needsHardware?: boolean;
  needsCloud?: boolean;
}

export interface PlanInput {
  effort: Effort;
  privacy: Privacy;
  avail: Availability;
  podPreferred?: boolean;
}

export interface Decision {
  target: Target;
  reason: string;
}

export function plan(input: PlanInput): Decision {
  const a = input.avail;
  if (a.needsHardware) {
    if (a.pod && a.podModel) return { target: "pod", reason: "task requires pod hardware executor" };
    if (a.phone) return { target: "phone", reason: "hardware unavailable; phone explains and offers retry when pod returns" };
    return { target: "cloud", reason: "no local executor available" };
  }
  if (input.privacy === "local_only") {
    if (input.podPreferred && a.pod && a.podModel) return { target: "pod", reason: "local-only; user-selected pod" };
    if (a.phone && a.phoneModel) return { target: "phone", reason: "local-only; phone-local model" };
    if (a.pod && a.podModel) return { target: "pod", reason: "local-only; pod-local fallback" };
    if (a.phone) return { target: "phone", reason: "local-only; phone best effort (model missing)" };
    return { target: "pod", reason: "local-only; pod best effort" };
  }
  switch (input.effort) {
    case "quick":
      if (a.phone && a.phoneModel) return { target: "phone", reason: "quick effort served by phone-local" };
      if (a.pod && a.podModel) return { target: "pod", reason: "quick; phone model missing, pod-local" };
      break;
    case "normal":
      if (input.podPreferred && a.pod && a.podModel) return { target: "pod", reason: "user prefers home pod" };
      if (a.phone && a.phoneModel) return { target: "phone", reason: "normal effort served by phone-local" };
      if (a.pod && a.podModel) return { target: "pod", reason: "normal; phone model missing, pod-local" };
      break;
    case "deep":
      if (a.pod && a.podModel) return { target: "pod", reason: "deep effort served by stronger pod-local model" };
      if (a.phone && a.phoneModel) return { target: "phone", reason: "deep; pod unavailable, phone-local best effort" };
      break;
  }
  if ((a.needsCloud || (!a.phoneModel && !a.podModel)) && a.cloud && a.cloudModel) {
    if (input.privacy === "cloud_capable" || a.needsCloud) {
      return { target: "cloud", reason: "local models unavailable; policy permits cloud" };
    }
  }
  if (a.pod && a.podModel) return { target: "pod", reason: "fallback to pod-local" };
  if (a.phone) return { target: "phone", reason: "fallback to phone (best effort)" };
  return { target: "cloud", reason: "no local target; cloud last resort" };
}

// classifyEffort mirrors the backend effort signals conservatively so the
// phone can plan without a model round-trip (trivial routing stays local).
export function classifyEffort(msg: string): Effort {
  const m = msg.toLowerCase();
  const multiStep = /\b(then|after that|step by step|first .* then|and also|sequence|workflow)\b/.test(m);
  const code = /```|\b(func|compile|debug|stack trace|refactor|regex|sql|bug|error:|exception)\b/.test(m);
  const research = /\b(latest|breaking|trending|research|look up|find out|dig into|compare|news (on|about)|price of)\b/.test(m);
  let score = 0;
  if (multiStep) score += 2;
  if (code) score += 2;
  if (research) score += 2;
  if (m.length > 1200) score += 1;
  if (/\b(remember|recall|previously|last time|i told you|my (preference|schedule|routine))\b/.test(m)) score += 1;
  if (score === 0 && m.length > 0 && m.length <= 160) return "quick";
  if (score >= 4) return "deep";
  return "normal";
}
