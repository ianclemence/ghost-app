// Runtime-independent inference contract for the phone.
// Mirrors pkg/infer: Ghost asks for capabilities, never "is Ollama running?".
export type Capability =
  | "chat" | "tool_calling" | "structured_output"
  | "embeddings" | "vision" | "speech";

export type Locality = "phone" | "pod" | "cloud";

export interface ModelRef {
  id: string;
  version?: string;
  runtime: string;
  locality: Locality;
  contextMax?: number;
}

export interface Requirements {
  capabilities: Capability[];
  minContext?: number;
  localOnly?: boolean;
  allowPod?: boolean;
}

export interface ChatMessage {
  role: string;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  rawArgs?: string;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface GenerateRequest {
  model: ModelRef;
  messages: ChatMessage[];
  tools?: ToolSchema[];
  jsonMode?: boolean;
  options?: Record<string, unknown>;
}

export interface GenerateResult {
  content: string;
  toolCalls?: ToolCall[];
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
}

export interface RuntimeHealth {
  available: boolean;
  reason?: string;
  loadedModel?: string;
  latencyMs?: number;
}

export interface InferenceRuntime {
  readonly name: string;
  readonly locality: Locality;
  models(): Promise<ModelRef[]>;
  capabilities(modelId: string): Promise<Capability[]>;
  satisfies(modelId: string, req: Requirements): Promise<{ ok: boolean; reason?: string }>;
  generate(req: GenerateRequest, signal?: AbortSignal): Promise<GenerateResult>;
  stream(req: GenerateRequest, onToken: (t: string) => void, signal?: AbortSignal): Promise<GenerateResult>;
  embed(modelId: string, text: string): Promise<number[]>;
  health(): Promise<RuntimeHealth>;
}

export function hasCapability(have: Capability[], want: Capability): boolean {
  return have.includes(want);
}
