import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGhostStore } from '../../lib/store';
import { fetchMemoryFiles, fetchMemoryFile } from '../../lib/ghostApi';

const C = {
  bg: '#080C0F',
  surface: '#0D1117',
  border: '#1A2332',
  accent: '#00FF88',
  accentDim: '#00FF8822',
  text: '#C8D8E8',
  textDim: '#4A6080',
  textMuted: '#2A3A4A',
  purple: '#AA88FF',
};

interface MemoryFile {
  name: string;
  modified: number;
  size: number;
}

export default function MemoryScreen() {
  const insets = useSafeAreaInsets();
  const { config } = useGhostStore();
  const [files, setFiles] = useState<MemoryFile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);

  const loadFiles = useCallback(async () => {
    if (!config) return;
    setLoading(true);
    try {
      const data = await fetchMemoryFiles(config);
      setFiles(data.sort((a, b) => b.modified - a.modified));
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => { loadFiles(); }, [config]);

  const openFile = async (name: string) => {
    if (!config) return;
    setSelected(name);
    setFileLoading(true);
    try {
      const c = await fetchMemoryFile(config, name);
      setContent(c);
    } catch {
      setContent('Error loading file.');
    } finally {
      setFileLoading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    return `${(bytes / 1024).toFixed(1)}KB`;
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  if (selected) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setSelected(null)} style={styles.backBtn}>
            <Text style={{ color: C.accent, fontSize: 20 }}>←</Text>
          </TouchableOpacity>
          <Text style={styles.fileTitle} numberOfLines={1}>{selected}</Text>
        </View>
        {fileLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={C.accent} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.fileContent}>
            <Text style={styles.fileText}>{content}</Text>
          </ScrollView>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>GHOST MEMORY</Text>
        <TouchableOpacity onPress={loadFiles}>
          <Text style={{ color: C.textDim, fontSize: 14 }}>↻</Text>
        </TouchableOpacity>
      </View>

      {/* Summary strip */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{files.length}</Text>
          <Text style={styles.statLabel}>LOG FILES</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {formatSize(files.reduce((acc, f) => acc + f.size, 0))}
          </Text>
          <Text style={styles.statLabel}>TOTAL SIZE</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {files.length > 0 ? formatDate(files[0].modified) : '—'}
          </Text>
          <Text style={styles.statLabel}>LAST ENTRY</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={C.accent} /></View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={(f) => f.name}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.fileRow} onPress={() => openFile(item.name)} activeOpacity={0.7}>
              <View style={styles.fileIcon}>
                <Text style={{ fontSize: 16 }}>📄</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fileName}>{item.name}</Text>
                <Text style={styles.fileMeta}>
                  {new Date(item.modified * 1000).toLocaleString()} · {formatSize(item.size)}
                </Text>
              </View>
              <Text style={{ color: C.textDim }}>›</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={{ fontSize: 36 }}>🧠</Text>
              <Text style={[styles.emptyText, { marginTop: 12 }]}>No memory files found</Text>
              <Text style={{ color: C.textDim, fontSize: 12, marginTop: 6 }}>
                Ghost stores episodic logs in workspace/memory/
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 16, fontWeight: '700', color: C.accent, letterSpacing: 4,
  },
  statsRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    color: C.accent,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  statLabel: {
    color: C.textDim,
    fontSize: 9,
    letterSpacing: 1,
    marginTop: 3,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    gap: 10,
  },
  fileIcon: {
    width: 36, height: 36,
    borderRadius: 8,
    backgroundColor: C.accentDim,
    alignItems: 'center', justifyContent: 'center',
  },
  fileName: {
    color: C.text,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600',
  },
  fileMeta: { color: C.textDim, fontSize: 11, marginTop: 2 },
  emptyText: { color: C.textDim, fontSize: 14 },
  backBtn: { paddingRight: 12 },
  fileTitle: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  fileContent: { padding: 16 },
  fileText: {
    color: C.text,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
