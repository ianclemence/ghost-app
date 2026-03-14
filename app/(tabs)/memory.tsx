import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchMemoryFile, fetchMemoryFiles } from "../../lib/ghostApi";
import { useGhostStore } from "../../lib/store";

const C = {
  bg: "#080C0F",
  surface: "#0D1117",
  surface2: "#111920",
  border: "#1A2332",
  accent: "#00FF88",
  accentDim: "#00FF8822",
  text: "#C8D8E8",
  textDim: "#4A6080",
  textMuted: "#2A3A4A",
};

interface MemFile {
  name: string;
  modified: number;
  size: number;
}

function formatRelativeTime(unixMs: number): string {
  const now = Date.now();
  const diffMs = now - unixMs;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(unixMs).toLocaleDateString();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function MemoryScreen() {
  const insets = useSafeAreaInsets();
  const { config } = useGhostStore();
  const [files, setFiles] = useState<MemFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);

  const loadFiles = useCallback(async () => {
    if (!config) return;
    setLoading(true);
    try {
      const data = await fetchMemoryFiles(config);
      setFiles(data.sort((a, b) => b.modified - a.modified));
    } catch {}
    setLoading(false);
  }, [config]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const openFile = async (name: string) => {
    if (!config) return;
    setSelectedFile(name);
    setLoadingFile(true);
    try {
      const content = await fetchMemoryFile(config, name);
      setFileContent(content);
    } catch {
      setFileContent("_Error loading file._");
    }
    setLoadingFile(false);
  };

  const totalSize = files.reduce((a, f) => a + f.size, 0);

  if (!config) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={{ color: C.textDim, fontSize: 14 }}>
          Configure connection in Settings
        </Text>
      </View>
    );
  }

  if (selectedFile && fileContent !== null) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              setSelectedFile(null);
              setFileContent(null);
            }}
          >
            <Text style={styles.backBtn}>← BACK</Text>
          </TouchableOpacity>
          <Text style={styles.headerFile} numberOfLines={1}>
            {selectedFile}
          </Text>
        </View>
        {loadingFile ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView
            style={styles.fileScroll}
            contentContainerStyle={styles.fileContent}
          >
            <Markdown style={mdStyles}>{fileContent}</Markdown>
          </ScrollView>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>MEMORY</Text>
          <Text style={styles.headerSub}>
            Ghost's long-term memory files — written during conversations
          </Text>
        </View>
        <TouchableOpacity onPress={loadFiles} disabled={loading}>
          <Text style={styles.refreshBtn}>↻</Text>
        </TouchableOpacity>
      </View>

      {/* Summary stats */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{files.length}</Text>
          <Text style={styles.statLabel}>FILES</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{formatSize(totalSize)}</Text>
          <Text style={styles.statLabel}>TOTAL</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      ) : files.length === 0 ? (
        <View style={styles.centered}>
          <Text style={{ color: C.textDim, fontSize: 14 }}>
            No memory files found
          </Text>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={(f) => f.name}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.fileRow}
              onPress={() => openFile(item.name)}
              activeOpacity={0.6}
            >
              <View style={styles.fileIcon}>
                <Text style={{ fontSize: 14 }}>📝</Text>
              </View>
              <View style={styles.fileInfo}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {item.name}
                </Text>
                <View style={styles.fileMeta}>
                  <Text style={styles.fileMetaText}>
                    {formatRelativeTime(item.modified * 1000)}
                  </Text>
                  <Text style={styles.fileMetaDot}>·</Text>
                  <Text style={styles.fileMetaText}>
                    {formatSize(item.size)}
                  </Text>
                </View>
              </View>
              <Text style={styles.fileChevron}>›</Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingVertical: 8 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 16,
    fontWeight: "700",
    color: C.accent,
    letterSpacing: 4,
  },
  headerSub: {
    color: C.textDim,
    fontSize: 11,
    marginTop: 4,
    maxWidth: '80%',
  },
  headerFile: {
    color: C.text,
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    flex: 1,
    marginLeft: 12,
  },
  backBtn: {
    color: C.accent,
    fontSize: 13,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },
  refreshBtn: {
    color: C.accent,
    fontSize: 22,
    fontWeight: "700",
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 10,
    paddingVertical: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  statNum: {
    color: C.accent,
    fontSize: 20,
    fontWeight: "800",
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },
  statLabel: {
    color: C.textDim,
    fontSize: 9,
    letterSpacing: 1.5,
    fontWeight: "600",
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#ffffff06",
  },
  fileIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  fileInfo: { flex: 1, gap: 3 },
  fileName: {
    color: C.text,
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  fileMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  fileMetaText: { color: C.textMuted, fontSize: 11 },
  fileMetaDot: { color: C.textMuted, fontSize: 11 },
  fileChevron: { color: C.textDim, fontSize: 18 },
  fileScroll: { flex: 1 },
  fileContent: { padding: 18 },
});

const mdStyles = {
  body: {
    color: C.text,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  } as any,
  heading1: { color: "#FFF", fontWeight: "800" as const, fontSize: 18, marginBottom: 8 },
  heading2: { color: "#FFF", fontWeight: "700" as const, fontSize: 16, marginBottom: 6 },
  heading3: { color: "#FFF", fontWeight: "600" as const, fontSize: 14, marginBottom: 4 },
  code_inline: {
    backgroundColor: "#00FF8814",
    color: C.accent,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    borderRadius: 4,
    paddingHorizontal: 4,
    fontSize: 13,
  } as any,
  fence: {
    backgroundColor: "#080F18",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  } as any,
  code_block: {
    color: C.accent,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 13,
  } as any,
  link: { color: C.accent } as any,
  strong: { color: "#FFFFFF", fontWeight: "700" as const },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
    paddingLeft: 10,
    opacity: 0.8,
  } as any,
  hr: { backgroundColor: C.border, height: 1 } as any,
  list_item: { color: C.text, fontSize: 14 } as any,
};
