import {
  ArrowLeft,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  Folder,
  FolderOpen,
  RefreshCw,
} from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Image as RNImage,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors, Fonts, Ghost, Radius, UI } from "@/constants/theme";
import {
  fetchWorkspaceFilePreview,
  fetchWorkspaceFiles,
  WorkspaceFilePreview,
} from "../../lib/ghostApi";
import { useGhostStore } from "../../lib/store";
import { ConnectionPill, EmptyState, GhostButton } from "@/components/ghost";

const C = Colors.dark;
const FONT_SANS = Fonts.sans;

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
    const parts = normalized.split("/").reverse().filter(Boolean);
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
  const [fileImageURI, setFileImageURI] = useState<string | null>(null);
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
    setFileContent(null);
    setFileImageURI(null);
    setFilePreviewMeta(null);
    try {
      const preview = await fetchWorkspaceFilePreview(config, name);
      setFilePreviewMeta(preview);
      if (
        preview.kind === "image" &&
        preview.previewable &&
        preview.image_base64
      ) {
        const mimeType = preview.mime_type || "image/*";
        setFileImageURI(`data:${mimeType};base64,${preview.image_base64}`);
        setFileContent("");
      } else if (!preview.previewable) {
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

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  if (!config) {
    return (
      <View
        style={[styles.container, styles.centered, { paddingTop: insets.top }]}
      >
        <EmptyState
          icon={<Bookmark size={34} color={Ghost.accent} />}
          title="You’re not connected"
          subtitle="Connect to your Ghost to see what it remembers."
        />
      </View>
    );
  }

  if (
    selectedFile &&
    (loadingFile || fileContent !== null || fileImageURI !== null)
  ) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              setSelectedFile(null);
              setFileContent(null);
              setFileImageURI(null);
              setFilePreviewMeta(null);
            }}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <ArrowLeft size={18} color={Ghost.text.secondary} />
            <Text style={styles.backBtn}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerFile} numberOfLines={1}>
            {selectedFile.split("/").pop()}
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
            color={Ghost.accent}
            style={{ marginTop: 40 }}
          />
        ) : fileImageURI ? (
          <ScrollView
            style={styles.fileScroll}
            contentContainerStyle={styles.imagePreviewContent}
          >
            <RNImage
              source={{ uri: fileImageURI }}
              style={styles.imagePreview}
              resizeMode="contain"
            />
          </ScrollView>
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

  const tree = buildTree(files);
  const visibleNodes = flattenVisibleNodes(tree, expandedFolders);
  const folderCount = countFolderNodes(tree);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Bookmark size={20} color={Ghost.accent} />
          <Text style={styles.headerTitle}>Memory</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <ConnectionPill
            connected={connectionState === "online"}
            degraded={connectionState === "syncing"}
          />
          <TouchableOpacity
            onPress={loadFiles}
            disabled={loading}
            style={styles.refreshBtnWrap}
          >
            {loading ? (
              <ActivityIndicator color={Ghost.accent} size="small" />
            ) : (
              <RefreshCw size={16} color={Ghost.text.secondary} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>
          {files.length} {files.length === 1 ? "memory" : "memories"}
          {folderCount > 0 ? ` · ${folderCount} folders` : ""}
        </Text>
      </View>

      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={Ghost.accent} style={{ marginTop: 40 }} />
        ) : files.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>Nothing remembered yet.</Text>
          </View>
        ) : (
          <FlatList
            data={visibleNodes}
            keyExtractor={(item) => item.key}
            style={styles.treeList}
            renderItem={({ item }) =>
              item.node.type === "folder" ? (
                <TouchableOpacity
                  style={[
                    styles.treeRow,
                    { paddingLeft: 16 + item.level * 16 },
                  ]}
                  onPress={() => toggleFolder(item.node.path)}
                  activeOpacity={0.7}
                >
                  {expandedFolders[item.node.path] ? (
                    <ChevronDown size={16} color={Ghost.text.secondary} />
                  ) : (
                    <ChevronRight size={16} color={Ghost.text.secondary} />
                  )}
                  {expandedFolders[item.node.path] ? (
                    <FolderOpen size={16} color={Ghost.accent} />
                  ) : (
                    <Folder size={16} color={Ghost.text.secondary} />
                  )}
                  <Text style={styles.treeFolderName} numberOfLines={1}>
                    {item.node.name}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.treeRow,
                    { paddingLeft: 16 + item.level * 16 },
                    item.node.path === lastOpenedFile && styles.treeRowActive,
                  ]}
                  onPress={() => openFile(item.node.path)}
                  activeOpacity={0.7}
                >
                  <View style={styles.treeSpacer} />
                  <FileText
                    size={15}
                    color={
                      item.node.path === lastOpenedFile
                        ? Ghost.accent
                        : Ghost.text.secondary
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
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  content: { flex: 1, paddingHorizontal: UI.spacing.screenX },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: UI.spacing.screenX,
    paddingVertical: UI.spacing.headerY + 4,
    borderBottomWidth: 1,
    borderBottomColor: Ghost.hairline,
  },
  headerTitle: {
    fontFamily: FONT_SANS,
    fontSize: 20,
    fontWeight: "600",
    color: Ghost.text.primary,
  },
  headerFile: {
    color: Ghost.text.primary,
    fontSize: 15,
    fontFamily: FONT_SANS,
    flex: 1,
    marginLeft: 12,
  },
  backBtn: {
    color: Ghost.text.secondary,
    fontSize: 14,
    fontWeight: "600",
    fontFamily: FONT_SANS,
  },
  summaryRow: {
    paddingHorizontal: UI.spacing.screenX,
    paddingVertical: UI.spacing.headerY,
  },
  summaryText: {
    color: Ghost.text.tertiary,
    fontSize: 13,
    fontFamily: FONT_SANS,
  },
  refreshBtnWrap: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: Ghost.bg.surface2,
  },
  previewMetaRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: UI.spacing.screenX,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Ghost.hairline,
  },
  metaPill: {
    borderWidth: 1,
    borderColor: Ghost.hairline,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Ghost.bg.surface2,
  },
  metaPillText: {
    color: Ghost.text.secondary,
    fontFamily: FONT_SANS,
    fontSize: 12,
  },
  emptyText: {
    color: Ghost.text.secondary,
    fontSize: 15,
    fontFamily: FONT_SANS,
  },
  treeList: {
    flex: 1,
    borderRadius: UI.radius.panel,
    borderWidth: 1,
    borderColor: Ghost.hairline,
    backgroundColor: Ghost.bg.surface,
  },
  treeContent: { paddingVertical: 4 },
  treeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Ghost.hairline,
    minHeight: 40,
  },
  treeRowActive: {
    backgroundColor: Ghost.accentSoft,
  },
  treeSpacer: {
    width: 12,
  },
  treeFolderName: {
    color: Ghost.text.primary,
    fontSize: 15,
    fontFamily: FONT_SANS,
    flex: 1,
  },
  fileInfo: { flex: 1, gap: 3 },
  fileName: {
    color: Ghost.text.primary,
    fontSize: 15,
    fontFamily: FONT_SANS,
  },
  fileMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  fileMetaText: {
    color: Ghost.text.tertiary,
    fontSize: 12,
    fontFamily: FONT_SANS,
  },
  fileMetaDot: { color: Ghost.text.tertiary, fontSize: 12 },
  fileScroll: { flex: 1 },
  imagePreviewContent: {
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 320,
  },
  imagePreview: {
    width: "100%",
    height: 420,
    borderWidth: 1,
    borderColor: Ghost.hairline,
    backgroundColor: Ghost.bg.surface,
    borderRadius: UI.radius.panel,
  },
  fileContent: { padding: 18 },
});

const mdStyles = {
  body: {
    color: Ghost.text.primary,
    fontSize: 15,
    lineHeight: 23,
    fontFamily: FONT_SANS,
  } as any,
  heading1: {
    color: Ghost.text.primary,
    fontWeight: "800" as const,
    fontSize: 20,
    marginBottom: 8,
  },
  heading2: {
    color: Ghost.text.primary,
    fontWeight: "700" as const,
    fontSize: 17,
    marginBottom: 6,
  },
  heading3: {
    color: Ghost.text.primary,
    fontWeight: "600" as const,
    fontSize: 15,
    marginBottom: 4,
  },
  code_inline: {
    backgroundColor: Ghost.bg.surface2,
    color: Ghost.text.primary,
    fontFamily: Fonts.mono,
    borderRadius: Radius.sm,
    paddingHorizontal: 5,
    fontSize: 13,
  } as any,
  fence: {
    backgroundColor: Ghost.bg.surface2,
    borderRadius: Radius.sm,
    padding: 12,
    borderWidth: 1,
    borderColor: Ghost.hairline,
  } as any,
  code_block: {
    color: Ghost.text.primary,
    fontFamily: Fonts.mono,
    fontSize: 13,
  } as any,
  link: { color: Ghost.accent, textDecorationLine: "underline" } as any,
  strong: { color: Ghost.text.primary, fontWeight: "700" as const },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: Ghost.accent,
    paddingLeft: 10,
    opacity: 0.85,
  } as any,
  hr: { backgroundColor: Ghost.hairline, height: 1 } as any,
  list_item: { color: Ghost.text.primary, fontSize: 15, fontFamily: FONT_SANS } as any,
};
