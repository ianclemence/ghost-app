import React from "react";
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import {
  Lock,
  Clock,
  AlertTriangle,
  WifiOff,
  MessageCircleOff,
  ZapOff,
  TimerOff,
} from "lucide-react-native";
import type { GhostError } from "../lib/ghostApi";
import { Ghost, Radius, Space } from "../constants/theme";
import { GhostText } from "./themed-text";

const ICONS: Record<string, React.ElementType> = {
  auth: Lock,
  rate_limit: Clock,
  provider: AlertTriangle,
  network: WifiOff,
  empty_stream: MessageCircleOff,
  interrupted: ZapOff,
  timeout: TimerOff,
};

const TITLES: Record<string, string> = {
  auth: "Connection rejected",
  rate_limit: "Ghost is busy",
  provider: "Something went wrong",
  network: "Can't reach your Ghost Pod",
  empty_stream: "No response",
  interrupted: "Interrupted",
  timeout: "Took too long",
};

const TONE: Record<string, { fg: string; bg: string; border: string }> = {
  auth: { fg: Ghost.status.error, bg: "rgba(194,75,60,0.10)", border: "rgba(194,75,60,0.30)" },
  provider: { fg: Ghost.status.error, bg: "rgba(194,75,60,0.10)", border: "rgba(194,75,60,0.30)" },
  network: { fg: Ghost.status.error, bg: "rgba(194,75,60,0.10)", border: "rgba(194,75,60,0.30)" },
  rate_limit: { fg: Ghost.status.warning, bg: "rgba(176,124,46,0.10)", border: "rgba(176,124,46,0.30)" },
  empty_stream: { fg: Ghost.status.warning, bg: "rgba(176,124,46,0.10)", border: "rgba(176,124,46,0.30)" },
  interrupted: { fg: Ghost.status.warning, bg: "rgba(176,124,46,0.10)", border: "rgba(176,124,46,0.30)" },
  timeout: { fg: Ghost.status.warning, bg: "rgba(176,124,46,0.10)", border: "rgba(176,124,46,0.30)" },
};

interface ErrorCardProps {
  error: GhostError;
  onRetry?: () => void;
  onDismiss?: () => void;
  partialContent?: string;
}

export default function ErrorCard({ error, onRetry, onDismiss, partialContent }: ErrorCardProps) {
  const tone = TONE[error.kind] ?? TONE.provider;
  const Icon = ICONS[error.kind] ?? AlertTriangle;
  const title = TITLES[error.kind] ?? "Something went wrong";

  return (
    <View style={styles.row}>
      <View style={styles.iconWrap}>
        <Icon size={16} color={Ghost.text.secondary} />
      </View>
      <View style={[styles.card, { backgroundColor: tone.bg, borderColor: tone.border }]}>
        {partialContent ? (
          <GhostText type="body" style={styles.partial}>
            {partialContent}
          </GhostText>
        ) : null}

        <View style={styles.header}>
          <View style={[styles.dot, { backgroundColor: tone.fg }]} />
          <View style={styles.headerText}>
            <GhostText type="headline">{title}</GhostText>
            <GhostText type="callout" style={styles.subtitle} numberOfLines={3}>
              {error.message}
            </GhostText>
          </View>
        </View>

        <View style={styles.actions}>
          {error.retryable && onRetry && (
            <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.7}>
              <GhostText type="headline" style={{ color: tone.fg }}>
                Try again
              </GhostText>
            </TouchableOpacity>
          )}
          {onDismiss && (
            <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss} activeOpacity={0.7}>
              <GhostText type="callout" style={{ color: Ghost.text.secondary }}>
                Dismiss
              </GhostText>
            </TouchableOpacity>
          )}
          {error.kind === "auth" && (
            <GhostText type="caption" style={styles.hint}>
              Check Settings → Shared Secret
            </GhostText>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: Space.sm,
    justifyContent: "flex-start",
    alignItems: "flex-start",
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Ghost.bg.sunken,
    borderWidth: 1,
    borderColor: Ghost.border.subtle,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  card: {
    flex: 1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Space.md,
    gap: Space.sm,
  },
  partial: {
    color: Ghost.text.primary,
    paddingBottom: Space.sm,
    borderBottomWidth: 1,
    borderBottomColor: Ghost.border.subtle,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Space.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  headerText: {
    flex: 1,
    gap: Space.xs,
  },
  subtitle: {
    color: Ghost.text.secondary,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    flexWrap: "wrap",
    paddingTop: Space.xs,
  },
  retryBtn: {
    borderWidth: 1,
    borderColor: Ghost.border.default,
    borderRadius: Radius.full,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
  },
  dismissBtn: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
  },
  hint: {
    color: Ghost.text.tertiary,
    marginLeft: "auto",
  },
});
