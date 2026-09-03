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
  // Identity of the paired Ghost (from the pairing response)
  ghostName: string | null;
  setGhostName: (name: string | null) => void;
  // Gateway uptime in seconds (from /v1/health), null when unknown
  uptimeSeconds: number | null;
  setUptimeSeconds: (s: number | null) => void;
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
  adoptServerId: (index: number, serverId: string) => void;

  // Streaming state
  isStreaming: boolean;
  streamBuffer: string;
  setStreaming: (v: boolean) => void;
  clearStreamBuffer: () => void;
  appendStream: (chunk: string) => void;
  commitStream: () => void;

  // Live tool activity ("Searching: …", "Running: …" from tool_status events)
  toolActivity: string | null;
  setToolActivity: (label: string | null) => void;

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
  activeTab: "chat" | "remote" | "cron" | "memory" | "settings";
  setActiveTab: (tab: GhostStore["activeTab"]) => void;
  accentColor: "green" | "amber" | "cyan";
  setAccentColor: (color: GhostStore["accentColor"]) => void;

  // Canvas state
  canvasHtml: string | null;
  setCanvasHtml: (html: string | null) => void;

  // Inbox — proactive pushes (heartbeat briefings, cron deliveries, device
  // events) that belong to other sessions, surfaced behind a bell icon.
  inbox: InboxItem[];
  addInboxItem: (item: InboxItem) => void;
  removeInboxItem: (id: string) => void;
  clearInbox: () => void;

  // Pending interactive tool requests rendered as cards in the chat.
  clarifyRequest: ClarifyRequest | null;
  setClarifyRequest: (req: ClarifyRequest | null) => void;
  approvalRequest: ApprovalRequest | null;
  setApprovalRequest: (req: ApprovalRequest | null) => void;
}

export interface InboxItem {
  id: string;
  kind: "message";
  content: string;
  timestamp: number;
  session_id?: string;
}

export interface ClarifyRequest {
  questionId: string;
  question: string;
  choices: string[];
}

export interface ApprovalRequest {
  id: string;
  description: string;
}

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

  ghostName: null,
  setGhostName: (name) => set({ ghostName: name }),
  uptimeSeconds: null,
  setUptimeSeconds: (s) => set({ uptimeSeconds: s }),

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
            Math.abs(m.timestamp - msg.timestamp) < 2000), // ms + s tolerant
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
  adoptServerId: (index, serverId) =>
    set((s) => {
      if (index < 0 || index >= s.messages.length) return s;
      const existing = s.messages[index];
      if (!existing || existing.id === serverId) {
        return { messages: s.messages };
      }
      const msgs = [...s.messages];
      msgs[index] = { ...existing, id: serverId };
      const seen = new Set(s.seenMessageIds);
      seen.delete(existing.id);
      seen.add(serverId);
      return { messages: msgs, seenMessageIds: seen };
    }),

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
  toolActivity: null,
  setToolActivity: (label) => set({ toolActivity: label }),
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
  accentColor: "green",
  setAccentColor: (color) => set({ accentColor: color }),

  canvasHtml: null,
  setCanvasHtml: (html) => set({ canvasHtml: html }),

  inbox: [],
  addInboxItem: (item) =>
    set((s) => {
      if (item.id && s.inbox.some((x) => x.id === item.id)) {
        return { inbox: s.inbox };
      }
      // Cap the inbox so heartbeat deliveries cannot grow it unbounded.
      const next = [...s.inbox, item];
      return { inbox: next.slice(-100) };
    }),
  removeInboxItem: (id) =>
    set((s) => ({ inbox: s.inbox.filter((x) => x.id !== id) })),
  clearInbox: () => set({ inbox: [] }),

  clarifyRequest: null,
  setClarifyRequest: (req) => set({ clarifyRequest: req }),
  approvalRequest: null,
  setApprovalRequest: (req) => set({ approvalRequest: req }),
}));
