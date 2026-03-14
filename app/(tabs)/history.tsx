import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGhostStore } from '../../lib/store';
import { fetchHistory, Message } from '../../lib/ghostApi';

const C = {
  bg: '#080C0F',
  surface: '#0D1117',
  border: '#1A2332',
  accent: '#00FF88',
  text: '#C8D8E8',
  textDim: '#4A6080',
  textMuted: '#2A3A4A',
};

function HistoryRow({ msg, isExpanded, onToggle }: { msg: Message; isExpanded: boolean; onToggle: () => void }) {
  const isUser = msg.role === 'user';
  const preview = msg.content.slice(0, 120) + (msg.content.length > 120 ? '…' : '');
  const date = new Date(msg.timestamp * 1000);

  return (
    <TouchableOpacity style={styles.row} onPress={onToggle} activeOpacity={0.7}>
      <View style={styles.rowMeta}>
        <View style={[styles.roleTag, isUser ? styles.roleTagUser : styles.roleTagAI]}>
          <Text style={[styles.roleText, { color: isUser ? C.accent : '#88AACC' }]}>
            {isUser ? 'YOU' : 'GHOST'}
          </Text>
        </View>
        <Text style={styles.timeText}>
          {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
      <Text style={[styles.previewText, isExpanded && styles.expandedText]} numberOfLines={isExpanded ? 0 : 2}>
        {isExpanded ? msg.content : preview}
      </Text>
      {!isExpanded && msg.content.length > 120 && (
        <Text style={styles.expandHint}>tap to expand</Text>
      )}
    </TouchableOpacity>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { config } = useGhostStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [filtered, setFiltered] = useState<Message[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const PAGE_SIZE = 30;

  const load = useCallback(async (offset: number, replace: boolean) => {
    if (!config) return;
    setLoading(true);
    try {
      const data = await fetchHistory(config, PAGE_SIZE, offset);
      const reversed = [...data.messages].reverse();
      setTotal(data.total);
      setMessages((prev) => replace ? reversed : [...reversed, ...prev]);
    } catch {
      if (replace) {
        setMessages([]);
        setTotal(0);
      }
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => { load(0, true); }, [config]);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(messages);
    } else {
      const q = search.toLowerCase();
      setFiltered(messages.filter((m) => m.content.toLowerCase().includes(q)));
    }
  }, [search, messages]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const loadMore = () => {
    if (messages.length < total) {
      const nextOffset = page + 1;
      setPage(nextOffset);
      load(nextOffset * PAGE_SIZE, false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>MEMORY LOG</Text>
        <Text style={styles.headerSub}>{total} entries</Text>
      </View>

      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search conversations..."
          placeholderTextColor={C.textMuted}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={{ color: C.textDim, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading && messages.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(m) => String(m.id)}
          renderItem={({ item }) => (
            <HistoryRow
              msg={item}
              isExpanded={expanded.has(item.id)}
              onToggle={() => toggleExpand(item.id)}
            />
          )}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loading ? <ActivityIndicator color={C.accent} style={{ marginVertical: 16 }} /> : null}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>
                {search ? 'No matches found' : 'No conversation history yet'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 10,
  },
  headerTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 16,
    fontWeight: '700',
    color: C.accent,
    letterSpacing: 4,
  },
  headerSub: { color: C.textDim, fontSize: 12 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchIcon: { color: C.textDim, fontSize: 18 },
  searchInput: {
    flex: 1,
    color: C.text,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  row: {
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    gap: 6,
  },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  roleTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  roleTagUser: { borderColor: '#00FF8840', backgroundColor: '#00FF8810' },
  roleTagAI: { borderColor: '#88AACC40', backgroundColor: '#88AACC10' },
  roleText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    letterSpacing: 1,
  },
  timeText: { color: C.textDim, fontSize: 11 },
  previewText: {
    color: C.text,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  expandedText: { color: C.text },
  expandHint: { color: C.textMuted, fontSize: 11, fontStyle: 'italic' },
  emptyText: { color: C.textDim, fontSize: 14 },
});
