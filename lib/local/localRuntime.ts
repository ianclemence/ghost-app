// MobileLocalRuntime: the phone as a first-class Ghost runtime.
// Native code owns model loading, token generation, streaming and
// cancellation; this adapter translates to the InferenceRuntime contract.
// Requires a dev build (custom native module); Expo Go reports unavailable
// with an actionable reason instead of failing obscurely.
import Constants from "expo-constants";
import { ReasoningStreamFilter, stripReasoningTags } from "./reasoning";
import type {
  Capability, ChatMessage, GenerateRequest, GenerateResult,
  InferenceRuntime, Locality, ModelRef, Requirements, RuntimeHealth,
} from "./runtime";

interface NativeInference {
  isAvailable(): Promise<boolean>;
  loadModel(uri: string): Promise<void>;
  unloadModel(): Promise<void>;
  loadedModelUri(): Promise<string | null>;
  generate(prompt: string, options?: Record<string, unknown>): Promise<string>;
  streamGenerate(prompt: string, options?: Record<string, unknown>): Promise<string>;
  addListener(event: string, cb: (e: { token?: string }) => void): { remove(): void };
  cancel(): Promise<void>;
  hashFile(uri: string): Promise<string>;
  deviceInfo(): Promise<Record<string, unknown>>;
}

function loadNative(): NativeInference | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@/modules/ghost-local-inference");
    return (mod.GhostLocalInference ?? mod.default ?? null) as NativeInference | null;
  } catch {
    return null;
  }
}

function buildPrompt(messages: ChatMessage[], tools?: GenerateRequest["tools"], jsonMode?: boolean): string {
  // ChatML-style framing understood by the Qwen GGUF artifacts.
  const lines: string[] = [];
  for (const m of messages) {
    lines.push(`<|im_start|>${m.role}\n${m.content}<|im_end|>`);
  }
  if (tools && tools.length > 0) {
    lines.push(`<|im_start|>system\nAvailable tools: ${tools.map((t) => t.name).join(", ")}. Reply with a tool call as JSON {"tool": name, "args": {}} when needed.${jsonMode ? " Reply with JSON only." : ""}<|im_end|>`);
  }
  lines.push("<|im_start|>assistant\n");
  return lines.join("\n");
}

export class MobileLocalRuntime implements InferenceRuntime {
  readonly name = "mobile-local";
  readonly locality: Locality = "phone";
  private native = loadNative();
  private loadedUri: string | null = null;

  async models(): Promise<ModelRef[]> {
    return [];
  }

  // Travel-cache contract: chat only. The phone collects via the deterministic
  // remember path (not model tool calls), so tool_calling/structured_output
  // are deliberately NOT advertised — any planner trusting those would route
  // tool work to a phone that refuses it. Wire-compatible narrowing: peers
  // negotiate via ghostproto Version/MinSupportedVersion (=1); fewer caps is
  // a valid older-peer view, so old Pods simply route tool work to the Pod.
  async capabilities(): Promise<Capability[]> {
    return ["chat"];
  }

  async satisfies(_modelId: string, req: Requirements): Promise<{ ok: boolean; reason?: string }> {
    if (req.localOnly === false) { /* local runtime always satisfies locality */ }
    for (const c of req.capabilities) {
      if (c !== "chat") {
        return { ok: false, reason: `capability ${c} not in the phone travel cache (chat only)` };
      }
    }
    const health = await this.health();
    if (!health.available) return { ok: false, reason: health.reason };
    return { ok: true };
  }

  async ensureLoaded(artifactUri: string): Promise<void> {
    if (!this.native) throw new Error("local inference unavailable: dev build with ghost-local-inference required");
    if (this.loadedUri !== artifactUri) {
      await this.native.loadModel(artifactUri);
      this.loadedUri = artifactUri;
    }
  }

  async generate(req: GenerateRequest, signal?: AbortSignal): Promise<GenerateResult> {
    if (!this.native) throw new Error("local inference unavailable");
    signal?.throwIfAborted();
    const prompt = buildPrompt(req.messages, req.tools, req.jsonMode);
    const text = await this.native.generate(prompt, req.options);
    signal?.throwIfAborted();
    // Never surface inline chain-of-thought from the local model.
    return { content: stripReasoningTags(text), finishReason: "stop" };
  }

  async stream(req: GenerateRequest, onToken: (t: string) => void, signal?: AbortSignal): Promise<GenerateResult> {
    if (!this.native) throw new Error("local inference unavailable");
    return new Promise<GenerateResult>((resolve, reject) => {
      // Strip inline reasoning before any token reaches the caller; the
      // filter persists across tokens so split tags never leak.
      const filter = new ReasoningStreamFilter();
      const sub = this.native!.addListener("token", (e) => {
        if (!e.token) return;
        const visible = filter.write(e.token);
        if (visible) onToken(visible);
      });
      const onAbort = () => {
        this.native!.cancel().catch(() => {});
        sub.remove();
        reject(new DOMException("aborted", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      const prompt = buildPrompt(req.messages, req.tools, req.jsonMode);
      this.native!.streamGenerate(prompt, req.options).then(
        (text) => {
          signal?.removeEventListener("abort", onAbort);
          sub.remove();
          const tail = filter.flush();
          if (tail) onToken(tail);
          // Prefer the sanitized result; fall back to the raw text if the
          // native layer returned nothing.
          const content = text ? stripReasoningTags(text) : "";
          resolve({ content, finishReason: signal?.aborted ? "cancelled" : "stop" });
        },
        (err) => {
          signal?.removeEventListener("abort", onAbort);
          sub.remove();
          reject(err instanceof Error ? err : new Error(String(err)));
        },
      );
    });
  }

  async embed(): Promise<number[]> {
    throw new Error("phone text model has no embedding head; retrieval uses Pod embeddings or a future embed artifact");
  }

  async health(): Promise<RuntimeHealth> {
    if (Constants.appOwnership === "expo") {
      return { available: false, reason: "Expo Go cannot load native inference; use a dev build" };
    }
    if (!this.native) return { available: false, reason: "ghost-local-inference module not linked" };
    try {
      const ok = await this.native.isAvailable();
      if (!ok) return { available: false, reason: "native runtime reports unavailable" };
      const uri = await this.native.loadedModelUri().catch(() => this.loadedUri);
      return { available: true, loadedModel: uri ?? this.loadedUri ?? undefined };
    } catch (e) {
      return { available: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }
}

export const mobileLocalRuntime = new MobileLocalRuntime();
