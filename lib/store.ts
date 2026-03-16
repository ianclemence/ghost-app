import { create } from "zustand";
import { GhostConfig, Message, ProfileInfo } from "./ghostApi";

export type ConnectionState = "online" | "syncing" | "offline";
export type MessageStatus =
  | "sending"
  | "streaming"
  | "completed"
  | "failed"
  | "retrying";

export interface ExtendedMessage extends Message {
  status?: MessageStatus;
  errorKind?: string;
}

interface GhostStore {
  // Config
  config: GhostConfig | null;
  setConfig: (cfg: GhostConfig) => void;

  // Connection (3-state)
  connectionState: ConnectionState;
  setConnectionState: (v: ConnectionState) => void;
  // Legacy compat
  isConnected: boolean;
  setConnected: (v: boolean) => void;
  profile: ProfileInfo | null;
  setProfile: (p: ProfileInfo | null) => void;
  availableTools: string[];
  setAvailableTools: (tools: string[]) => void;
  currentSession: string;
  setCurrentSession: (session: string) => void;
  seenMessageIds: Set<string>;
  addSeenMessageId: (id: string) => void;
  clearSeenMessageIds: () => void;

  // Messages
  messages: ExtendedMessage[];
  setMessages: (msgs: ExtendedMessage[]) => void;
  appendMessage: (msg: ExtendedMessage) => void;
  updateLastAssistant: (text: string) => void;
  updateMessageStatus: (id: string, status: MessageStatus) => void;
  removeMessage: (id: string) => void;

  // Streaming state
  isStreaming: boolean;
  streamBuffer: string;
  setStreaming: (v: boolean) => void;
  clearStreamBuffer: () => void;
  appendStream: (chunk: string) => void;
  commitStream: () => void;

  // Dedup
  _lastCommitTime: number;
  _lastCommitContent: string;

  // Retry
  lastSentMessage: {
    content: string;
    mediaB64?: string;
    mediaType?: string;
  } | null;
  setLastSentMessage: (msg: GhostStore["lastSentMessage"]) => void;

  // Health
  lastHealthCheck: number;
  setLastHealthCheck: (t: number) => void;

  // Offline queue
  messageQueue: { content: string; mediaB64?: string; mediaType?: string }[];
  enqueueMessage: (msg: {
    content: string;
    mediaB64?: string;
    mediaType?: string;
  }) => void;
  dequeueMessages: () => {
    content: string;
    mediaB64?: string;
    mediaType?: string;
  }[];

  // UI state
  activeTab: "chat" | "remote" | "memory" | "settings";
  setActiveTab: (tab: GhostStore["activeTab"]) => void;

  // Canvas state
  canvasHtml: string | null;
  setCanvasHtml: (html: string | null) => void;
}

let nextTempId = -1;
let nextMessageId = 1;

const isTempId = (id: string) => id.startsWith("temp-");
const makeMessageId = () => `msg-${Date.now()}-${nextMessageId++}`;

export const useGhostStore = create<GhostStore>((set, get) => ({
  config: null,
  setConfig: (cfg) =>
    set({
      config: cfg,
      currentSession: cfg?.session ?? "mobile:default",
    }),

  connectionState: "offline",
  setConnectionState: (v) =>
    set({ connectionState: v, isConnected: v === "online" }),

  isConnected: false,
  setConnected: (v) =>
    set({
      isConnected: v,
      connectionState: v ? "online" : "offline",
    }),

  profile: null,
  setProfile: (p: ProfileInfo | null) => set({ profile: p }),
  availableTools: [],
  setAvailableTools: (tools: string[]) => set({ availableTools: tools }),
  currentSession: "mobile:default",
  setCurrentSession: (session: string) => set({ currentSession: session }),
  seenMessageIds: new Set<string>(),
  addSeenMessageId: (id: string) =>
    set((s) => {
      const next = new Set(s.seenMessageIds);
      next.add(id);
      return { seenMessageIds: next };
    }),
  clearSeenMessageIds: () => set({ seenMessageIds: new Set<string>() }),

  messages: [],
  setMessages: (msgs) =>
    set(() => {
      const deduped = msgs.filter(
        (m, i, arr) => arr.findIndex((x) => x.id === m.id) === i,
      );
      const seen = new Set<string>();
      deduped.forEach((m) => {
        if (m.id) seen.add(m.id);
      });
      return { messages: deduped, seenMessageIds: seen };
    }),
  appendMessage: (msg) =>
    set((s) => {
      if (msg.id && s.seenMessageIds.has(msg.id)) {
        return { messages: s.messages };
      }
      const exists = s.messages.some(
        (m) =>
          m.id === msg.id ||
          (m.content === msg.content &&
            m.role === msg.role &&
            Math.abs(m.timestamp - msg.timestamp) < 2.0), // Allow 2s drift
      );
      if (exists) {
        // If content matches but ID is different (e.g. temp ID vs server ID),
        // we should ideally update the ID to the server one.
        // For now, we just return to avoid duplication.
        return { messages: s.messages };
      }
      const next = new Set(s.seenMessageIds);
      if (msg.id) next.add(msg.id);
      return {
        messages: [...s.messages, msg],
        seenMessageIds: next,
      };
    }),
  updateLastAssistant: (text) =>
    set((s) => {
      const msgs = [...s.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant") {
          msgs[i] = { ...msgs[i], content: text };
          break;
        }
      }
      return { messages: msgs };
    }),
  updateMessageStatus: (id, status) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, status } : m)),
    })),
  removeMessage: (id) =>
    set((s) => ({
      messages: s.messages.filter((m) => m.id !== id),
    })),

  isStreaming: false,
  streamBuffer: "",
  setStreaming: (v) => set({ isStreaming: v }),
  clearStreamBuffer: () => set({ streamBuffer: "", isStreaming: false }),
  appendStream: (chunk) =>
    set((s) => {
      const newBuffer = s.streamBuffer + chunk;
      const msgs = [...s.messages];
      const lastIdx = msgs.length - 1;
      if (
        lastIdx >= 0 &&
        msgs[lastIdx].role === "assistant" &&
        isTempId(msgs[lastIdx].id)
      ) {
        msgs[lastIdx] = {
          ...msgs[lastIdx],
          content: newBuffer,
          status: "streaming",
        };
      }
      return { streamBuffer: newBuffer, messages: msgs };
    }),
  commitStream: () =>
    set((s) => {
      const content = s.streamBuffer;
      const msgs = s.messages
        .map((m) =>
          isTempId(m.id)
            ? {
                ...m,
                id: makeMessageId(),
                status: "completed" as MessageStatus,
              }
            : m,
        )
        .filter((m) => !(m.role === "assistant" && m.content.trim() === ""));
      return {
        streamBuffer: "",
        isStreaming: false,
        messages: msgs,
        seenMessageIds: new Set(msgs.map((m) => m.id)),
        _lastCommitTime: Date.now(),
        _lastCommitContent: content,
      };
    }),

  // Dedup fields
  _lastCommitTime: 0,
  _lastCommitContent: "",

  // Retry
  lastSentMessage: null,
  setLastSentMessage: (msg) => set({ lastSentMessage: msg }),

  // Health
  lastHealthCheck: 0,
  setLastHealthCheck: (t) => set({ lastHealthCheck: t }),

  // Offline queue
  messageQueue: [],
  enqueueMessage: (msg) =>
    set((s) => ({ messageQueue: [...s.messageQueue, msg] })),
  dequeueMessages: () => {
    const msgs = get().messageQueue;
    set({ messageQueue: [] });
    return msgs;
  },

  activeTab: "chat",
  setActiveTab: (tab) => set({ activeTab: tab }),

  canvasHtml: null,
  setCanvasHtml: (html) => set({ canvasHtml: html }),
}));

export function createStreamingPlaceholder(): ExtendedMessage {
  return {
    id: `temp-${nextTempId--}`,
    role: "assistant",
    content: "",
    timestamp: Date.now() / 1000,
    status: "streaming",
  };
}
