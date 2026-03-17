import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  Folder,
  FolderOpen,
  RefreshCw,
} from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors, Fonts, UI } from "@/constants/theme";
import {
  fetchWorkspaceFilePreview,
  fetchWorkspaceFiles,
  WorkspaceFilePreview,
} from "../../lib/ghostApi";
import { useGhostStore } from "../../lib/store";

const C = Colors.dark;
const FONT_MONO = Fonts.mono;

interface MemFile {
  name: string;
  modified: number;
  size: number;
}

interface TreeFileNode {
  type: "file";
  name: string;
  path: string;
  file: MemFile;
}

interface TreeFolderNode {
  type: "folder";
  name: string;
  path: string;
  children: TreeNode[];
}

type TreeNode = TreeFileNode | TreeFolderNode;

interface VisibleNode {
  key: string;
  level: number;
  node: TreeNode;
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

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  const folders: TreeFolderNode[] = [];
  const files: TreeFileNode[] = [];
  nodes.forEach((node) => {
    if (node.type === "folder") {
      node.children = sortTree(node.children);
      folders.push(node);
    } else {
      files.push(node);
    }
  });
  folders.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return [...folders, ...files];
}

function buildTree(files: MemFile[]): TreeNode[] {
  const root: TreeFolderNode = {
    type: "folder",
    name: "/",
    path: "",
    children: [],
  };

  files.forEach((file) => {
    const normalized = normalizePath(file.name);
    const parts = normalized.split("/").filter(Boolean);
    if (parts.length === 0) return;

    let current = root;
    let currentPath = "";

    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (isLast) {
        current.children.push({
          type: "file",
          name: part,
          path: normalized,
          file: { ...file, name: normalized },
        });
        return;
      }

      let existing = current.children.find(
        (child): child is TreeFolderNode =>
          child.type === "folder" && child.name === part,
      );

      if (!existing) {
        existing = {
          type: "folder",
          name: part,
          path: currentPath,
          children: [],
        };
        current.children.push(existing);
      }

      current = existing;
    });
  });

  return sortTree(root.children);
}

function flattenVisibleNodes(
  nodes: TreeNode[],
  expandedFolders: Record<string, boolean>,
  level = 0,
): VisibleNode[] {
  const result: VisibleNode[] = [];

  nodes.forEach((node) => {
    result.push({
      key: `${node.type}:${node.path}`,
      level,
      node,
    });

    if (node.type === "folder" && expandedFolders[node.path]) {
      result.push(
        ...flattenVisibleNodes(node.children, expandedFolders, level + 1),
      );
    }
  });

  return result;
}

function countFolderNodes(nodes: TreeNode[]): number {
  let total = 0;
  nodes.forEach((node) => {
    if (node.type === "folder") {
      total += 1 + countFolderNodes(node.children);
    }
  });
  return total;
}

export default function MemoryScreen() {
  const insets = useSafeAreaInsets();
  const { config, connectionState } = useGhostStore();
  const [files, setFiles] = useState<MemFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<
    Record<string, boolean>
  >({});
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [lastOpenedFile, setLastOpenedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [filePreviewMeta, setFilePreviewMeta] =
    useState<WorkspaceFilePreview | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);

  const loadFiles = useCallback(async () => {
    if (!config) return;
    setLoading(true);
    try {
      const data = await fetchWorkspaceFiles(config);
      const sorted = data.sort((a, b) =>
        normalizePath(a.name).localeCompare(normalizePath(b.name)),
      );
      setFiles(sorted);
      setExpandedFolders((prev) => {
        if (Object.keys(prev).length > 0) return prev;
        const initial: Record<string, boolean> = {};
        sorted.forEach((f) => {
          const parts = normalizePath(f.name).split("/").filter(Boolean);
          if (parts.length > 1) initial[parts[0]] = true;
        });
        return initial;
      });
    } catch {}
    setLoading(false);
  }, [config]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const openFile = async (name: string) => {
    if (!config) return;
    setLastOpenedFile(name);
    setSelectedFile(name);
    setLoadingFile(true);
    setFilePreviewMeta(null);
    try {
      const preview = await fetchWorkspaceFilePreview(config, name);
      setFilePreviewMeta(preview);
      if (!preview.previewable) {
        setFileContent(
          [
            `Preview unavailable for this file.`,
            ``,
            `Reason: ${preview.reason || "unsupported"}`,
            `Size: ${formatSize(preview.size)}`,
          ].join("\n"),
        );
      } else if (preview.content.trim() === "") {
        setFileContent("_File is empty._");
      } else {
        setFileContent(preview.content);
      }
    } catch {
      setFileContent("_Error loading file._");
    }
    setLoadingFile(false);
  };

  const totalSize = files.reduce((a, f) => a + f.size, 0);
  const tree = buildTree(files);
  const visibleNodes = flattenVisibleNodes(tree, expandedFolders);
  const folderCount = countFolderNodes(tree);

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const breadcrumbParts = lastOpenedFile
    ? normalizePath(lastOpenedFile).split("/").filter(Boolean)
    : [];
  const statusColor =
    connectionState === "online"
      ? C.terminalGreen
      : connectionState === "syncing"
        ? C.terminalAmber
        : C.error;
  const statusLabel =
    connectionState === "online"
      ? "ONLINE"
      : connectionState === "syncing"
        ? "SYNCING"
        : "OFFLINE";

  if (!config) {
    return (
      <View
        style={[styles.container, styles.centered, { paddingTop: insets.top }]}
      >
        <Database
          size={48}
          color={C.terminalGreen}
          style={{ marginBottom: 14 }}
        />
        <Text style={styles.noConfigTitle}>Offline</Text>
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
              setFilePreviewMeta(null);
            }}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <ArrowLeft size={16} color={C.terminalGreen} />
            <Text style={styles.backBtn}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerFile} numberOfLines={1}>
            {selectedFile}
          </Text>
        </View>
        {filePreviewMeta && (
          <View style={styles.previewMetaRow}>
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>
                {filePreviewMeta.previewable ? "previewable" : "blocked"}
              </Text>
            </View>
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>
                {formatSize(filePreviewMeta.size)}
              </Text>
            </View>
            {filePreviewMeta.truncated && (
              <View style={styles.metaPill}>
                <Text style={styles.metaPillText}>truncated</Text>
              </View>
            )}
          </View>
        )}
        {loadingFile ? (
          <ActivityIndicator
            color={C.terminalGreen}
            style={{ marginTop: 40 }}
          />
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
      <View style={styles.explorerShell}>
        <View style={styles.panelHead}>
          <View style={styles.panelHeadLeft}>
            <Database size={16} color={C.terminalGreen} />
            <Text style={styles.panelHeadTitle}>workspace</Text>
          </View>
          <TouchableOpacity
            onPress={loadFiles}
            disabled={loading}
            style={styles.iconBtn}
          >
            {loading ? (
              <ActivityIndicator color={C.terminalGreen} size="small" />
            ) : (
              <RefreshCw size={16} color={C.terminalGreen} />
            )}
          </TouchableOpacity>
        </View>
        <View style={styles.panelMeta}>
          <View style={styles.statusPill}>
            <View
              style={[styles.statusDot, { backgroundColor: statusColor }]}
            />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {statusLabel}
            </Text>
          </View>
          <View style={styles.metaPill}>
            <Text style={styles.metaPillText}>{files.length} files</Text>
          </View>
          <View style={styles.metaPill}>
            <Text style={styles.metaPillText}>{folderCount} folders</Text>
          </View>
          <View style={styles.metaPill}>
            <Text style={styles.metaPillText}>{formatSize(totalSize)}</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={C.terminalGreen} style={{ marginTop: 40 }} />
      ) : files.length === 0 ? (
        <View style={styles.centered}>
          <Text style={{ color: C.icon, fontSize: 14, fontFamily: FONT_MONO }}>
            No workspace files found
          </Text>
        </View>
      ) : (
        <>
          {breadcrumbParts.length > 0 && (
            <View style={styles.breadcrumbWrap}>
              <ScrollView
                horizontal
                style={styles.breadcrumbScroll}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.breadcrumbRow}
              >
                {breadcrumbParts.map((part, idx) => (
                  <View key={`${part}-${idx}`} style={styles.breadcrumbChip}>
                    <Text style={styles.breadcrumbText}>{part}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
          <FlatList
            data={visibleNodes}
            keyExtractor={(item) => item.key}
            style={styles.treeList}
            renderItem={({ item }) =>
              item.node.type === "folder" ? (
                <TouchableOpacity
                  style={[
                    styles.treeRow,
                    { paddingLeft: 12 + item.level * 16 },
                  ]}
                  onPress={() => toggleFolder(item.node.path)}
                  activeOpacity={0.7}
                >
                  {expandedFolders[item.node.path] ? (
                    <ChevronDown size={14} color={C.icon} />
                  ) : (
                    <ChevronRight size={14} color={C.icon} />
                  )}
                  {expandedFolders[item.node.path] ? (
                    <FolderOpen size={16} color={C.terminalGreen} />
                  ) : (
                    <Folder size={16} color={C.terminalGreen} />
                  )}
                  <Text style={styles.treeFolderName} numberOfLines={1}>
                    {item.node.name}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.treeRow,
                    { paddingLeft: 12 + item.level * 16 },
                    item.node.path === lastOpenedFile && styles.treeRowActive,
                  ]}
                  onPress={() => openFile(item.node.path)}
                  activeOpacity={0.7}
                >
                  <View style={styles.treeSpacer} />
                  <FileText
                    size={14}
                    color={
                      item.node.path === lastOpenedFile
                        ? C.terminalGreen
                        : C.icon
                    }
                  />
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {item.node.name}
                    </Text>
                    <View style={styles.fileMeta}>
                      <Text style={styles.fileMetaText}>
                        {formatRelativeTime(item.node.file.modified * 1000)}
                      </Text>
                      <Text style={styles.fileMetaDot}>·</Text>
                      <Text style={styles.fileMetaText}>
                        {formatSize(item.node.file.size)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )
            }
            contentContainerStyle={styles.treeContent}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  explorerShell: {
    marginHorizontal: UI.spacing.screenX,
    marginTop: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  panelHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 36,
  },
  panelHeadLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  panelHeadTitle: {
    color: C.text,
    fontFamily: FONT_MONO,
    textTransform: "lowercase",
    fontSize: 13,
    letterSpacing: 0.8,
    fontWeight: "700",
  },
  iconBtn: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.background,
  },
  panelMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6,
    backgroundColor: C.background,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontFamily: FONT_MONO,
    fontSize: UI.typography.status,
    fontWeight: "700",
    letterSpacing: 1,
  },
  metaPill: {
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: C.background,
  },
  metaPillText: {
    color: C.icon,
    fontFamily: FONT_MONO,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: UI.spacing.screenX,
    paddingVertical: UI.spacing.headerY,
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
  breadcrumbWrap: {
    marginHorizontal: UI.spacing.screenX,
    marginTop: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    minHeight: 36,
    justifyContent: "center",
  },
  breadcrumbScroll: {
    maxHeight: 40,
  },
  breadcrumbRow: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    alignItems: "center",
  },
  breadcrumbChip: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  breadcrumbText: {
    color: C.icon,
    fontFamily: FONT_MONO,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  treeList: {
    marginHorizontal: UI.spacing.screenX,
    marginTop: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  treeContent: { paddingVertical: 4 },
  treeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    minHeight: 34,
  },
  treeRowActive: {
    backgroundColor: "rgba(74, 222, 128, 0.14)",
    borderLeftWidth: 2,
    borderLeftColor: C.terminalGreen,
  },
  treeSpacer: {
    width: 12,
  },
  treeFolderName: {
    color: C.text,
    fontSize: 13,
    fontFamily: FONT_MONO,
    flex: 1,
  },
  fileInfo: { flex: 1, gap: 3 },
  fileName: {
    color: C.text,
    fontSize: 13,
    fontFamily: FONT_MONO,
  },
  fileMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  fileMetaText: { color: C.icon, fontSize: 11, fontFamily: FONT_MONO },
  fileMetaDot: { color: C.icon, fontSize: 11 },
  previewMetaRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: UI.spacing.screenX,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  fileScroll: { flex: 1 },
  fileContent: { padding: 18 },
  noConfigTitle: {
    color: C.terminalGreen,
    fontSize: 18,
    fontWeight: "700",
    fontFamily: FONT_MONO,
  },
  noConfigSub: {
    color: C.icon,
    fontSize: 13,
    marginTop: 8,
    fontFamily: FONT_MONO,
  },
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
    backgroundColor: "rgba(74, 222, 128, 0.1)",
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
