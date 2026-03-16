
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
import { FileText, RefreshCw, ArrowLeft, ChevronRight, HardDrive, Database } from "lucide-react-native";

import { fetchMemoryFile, fetchMemoryFiles } from "../../lib/ghostApi";
import { useGhostStore } from "../../lib/store";
import { Colors, Fonts } from "@/constants/theme";

const C = Colors.dark;
const FONT_MONO = Fonts.mono;

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
  const { config, connectionState } = useGhostStore();
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
      <View
        style={[styles.container, styles.centered, { paddingTop: insets.top }]}
      >
        <Database size={48} color={C.terminalGreen} style={{ marginBottom: 14 }} />
        <Text style={styles.noConfigTitle}>MEMORY OFFLINE</Text>
        <Text style={styles.noConfigSub}>Configure connection in Settings</Text>
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
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <ArrowLeft size={16} color={C.terminalGreen} />
            <Text style={styles.backBtn}>BACK</Text>
          </TouchableOpacity>
          <Text style={styles.headerFile} numberOfLines={1}>
            {selectedFile}
          </Text>
        </View>
        {loadingFile ? (
          <ActivityIndicator color={C.terminalGreen} style={{ marginTop: 40 }} />
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
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Database size={20} color={C.terminalGreen} />
            <Text style={styles.headerTitle}>CORE_MEMORY</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor:
                  connectionState === "online"
                    ? C.terminalGreen
                    : connectionState === "syncing"
                      ? C.terminalAmber
                      : C.error,
              }}
            />
            <Text
              style={{
                color:
                  connectionState === "online"
                    ? C.terminalGreen
                    : connectionState === "syncing"
                      ? C.terminalAmber
                      : C.error,
                fontSize: 9,
                fontWeight: "700",
                letterSpacing: 1.5,
                fontFamily: FONT_MONO,
              }}
            >
              {connectionState.toUpperCase()}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={loadFiles} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={C.terminalGreen} size="small" />
          ) : (
            <RefreshCw size={18} color={C.terminalGreen} />
          )}
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
          <Text style={styles.statLabel}>TOTAL_SIZE</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={C.terminalGreen} style={{ marginTop: 40 }} />
      ) : files.length === 0 ? (
        <View style={styles.centered}>
          <Text style={{ color: C.icon, fontSize: 14, fontFamily: FONT_MONO }}>
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
                <FileText size={16} color={C.terminalGreen} />
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
              <ChevronRight size={16} color={C.icon} />
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingVertical: 8 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
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
    fontFamily: FONT_MONO,
    fontSize: 16,
    fontWeight: "700",
    color: C.terminalGreen,
    letterSpacing: 1,
  },
  headerSub: {
    color: C.icon,
    fontSize: 11,
    marginTop: 4,
    maxWidth: "80%",
    fontFamily: FONT_MONO,
  },
  headerFile: {
    color: C.text,
    fontSize: 14,
    fontFamily: FONT_MONO,
    flex: 1,
    marginLeft: 12,
  },
  backBtn: {
    color: C.terminalGreen,
    fontSize: 13,
    fontWeight: "700",
    fontFamily: FONT_MONO,
  },
  refreshBtn: {
    color: C.terminalGreen,
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
    backgroundColor: C.card,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  statNum: {
    color: C.terminalGreen,
    fontSize: 20,
    fontWeight: "800",
    fontFamily: FONT_MONO,
  },
  statLabel: {
    color: C.icon,
    fontSize: 9,
    letterSpacing: 1.5,
    fontWeight: "600",
    fontFamily: FONT_MONO,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  fileIcon: {
    width: 34,
    height: 34,
    borderRadius: 0,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  fileInfo: { flex: 1, gap: 3 },
  fileName: {
    color: C.text,
    fontSize: 14,
    fontFamily: FONT_MONO,
  },
  fileMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  fileMetaText: { color: C.icon, fontSize: 11, fontFamily: FONT_MONO },
  fileMetaDot: { color: C.icon, fontSize: 11 },
  fileScroll: { flex: 1 },
  fileContent: { padding: 18 },
  noConfigTitle: { color: C.terminalGreen, fontSize: 18, fontWeight: "700", fontFamily: FONT_MONO },
  noConfigSub: { color: C.icon, fontSize: 13, marginTop: 8, fontFamily: FONT_MONO },
});

const mdStyles = {
  body: {
    color: C.text,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: FONT_MONO,
  } as any,
  heading1: {
    color: C.terminalGreen,
    fontWeight: "800" as const,
    fontSize: 18,
    marginBottom: 8,
  },
  heading2: {
    color: C.terminalGreen,
    fontWeight: "700" as const,
    fontSize: 16,
    marginBottom: 6,
  },
  heading3: {
    color: C.text,
    fontWeight: "600" as const,
    fontSize: 14,
    marginBottom: 4,
  },
  code_inline: {
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    color: C.terminalGreen,
    fontFamily: FONT_MONO,
    borderRadius: 0,
    paddingHorizontal: 4,
    fontSize: 13,
  } as any,
  fence: {
    backgroundColor: C.card,
    borderRadius: 0,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  } as any,
  code_block: {
    color: C.terminalGreen,
    fontFamily: FONT_MONO,
    fontSize: 13,
  } as any,
  link: { color: C.terminalGreen, textDecorationLine: "underline" } as any,
  strong: { color: C.text, fontWeight: "700" as const },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: C.terminalGreen,
    paddingLeft: 10,
    opacity: 0.8,
  } as any,
  hr: { backgroundColor: C.border, height: 1 } as any,
  list_item: { color: C.text, fontSize: 14, fontFamily: FONT_MONO } as any,
};
