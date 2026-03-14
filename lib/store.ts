import { create } from 'zustand';
import { Message, GhostConfig } from './ghostApi';

interface GhostStore {
  // Config
  config: GhostConfig | null;
  setConfig: (cfg: GhostConfig) => void;

  // Connection
  isConnected: boolean;
  setConnected: (v: boolean) => void;

  // Messages
  messages: Message[];
  setMessages: (msgs: Message[]) => void;
  appendMessage: (msg: Message) => void;
  updateLastAssistant: (text: string) => void;

  // Streaming state
  isStreaming: boolean;
  streamBuffer: string;
  setStreaming: (v: boolean) => void;
  appendStream: (chunk: string) => void;
  commitStream: () => void;

  // UI state
  activeTab: 'chat' | 'remote' | 'history' | 'memory' | 'settings';
  setActiveTab: (tab: GhostStore['activeTab']) => void;
}

let nextTempId = -1;
let nextMessageId = 1;

const isTempId = (id: string) => id.startsWith("temp-");
const makeMessageId = () => `msg-${Date.now()}-${nextMessageId++}`;

export const useGhostStore = create<GhostStore>((set) => ({
  config: null,
  setConfig: (cfg) => set({ config: cfg }),

  isConnected: false,
  setConnected: (v) => set({ isConnected: v }),

  messages: [],
  setMessages: (msgs) => set({ messages: msgs }),
  appendMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, msg] })),

  updateLastAssistant: (text) =>
    set((s) => {
      const msgs = [...s.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = { ...msgs[i], content: text };
          break;
        }
      }
      return { messages: msgs };
    }),

  isStreaming: false,
  streamBuffer: '',
  setStreaming: (v) => set({ isStreaming: v }),
  appendStream: (chunk) =>
    set((s) => {
      const newBuffer = s.streamBuffer + chunk;
      // Update the placeholder assistant message in real-time
      const msgs = [...s.messages];
      const lastIdx = msgs.length - 1;
      if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant' && isTempId(msgs[lastIdx].id)) {
        msgs[lastIdx] = { ...msgs[lastIdx], content: newBuffer };
      }
      return { streamBuffer: newBuffer, messages: msgs };
    }),
  commitStream: () =>
    set((s) => {
      const msgs = s.messages
        .map((m) => (isTempId(m.id) ? { ...m, id: makeMessageId() } : m))
        .filter((m) => !(m.role === "assistant" && m.content.trim() === ""));
      return { streamBuffer: '', isStreaming: false, messages: msgs };
    }),

  activeTab: 'chat',
  setActiveTab: (tab) => set({ activeTab: tab }),
}));

export function createStreamingPlaceholder(): Message {
  return {
    id: `temp-${nextTempId--}`,
    role: 'assistant',
    content: '',
    timestamp: Date.now() / 1000,
  };
}
