import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import type { GhostError } from '../lib/ghostApi';

const C = {
  bg: '#080C0F',
  surface: '#0D1117',
  border: '#1A2332',
  accent: '#00FF88',
  text: '#C8D8E8',
  textDim: '#4A6080',
  danger: '#FF4455',
  dangerDim: '#FF445520',
  dangerBorder: '#FF445530',
  warn: '#FFAA00',
  warnDim: '#FFAA0020',
  warnBorder: '#FFAA0030',
};

const ERROR_CONFIG: Record<string, { icon: string; title: string; bg: string; border: string }> = {
  auth: {
    icon: '🔒',
    title: 'Connection Rejected',
    bg: C.dangerDim,
    border: C.dangerBorder,
  },
  rate_limit: {
    icon: '⏳',
    title: 'Ghost is Busy',
    bg: C.warnDim,
    border: C.warnBorder,
  },
  provider: {
    icon: '⚠️',
    title: 'Response Failed',
    bg: C.dangerDim,
    border: C.dangerBorder,
  },
  network: {
    icon: '📡',
    title: "Can't Reach Ghost",
    bg: C.dangerDim,
    border: C.dangerBorder,
  },
  empty_stream: {
    icon: '💭',
    title: 'No Response',
    bg: C.warnDim,
    border: C.warnBorder,
  },
  interrupted: {
    icon: '⚡',
    title: 'Response Interrupted',
    bg: C.warnDim,
    border: C.warnBorder,
  },
  timeout: {
    icon: '⏱',
    title: 'Request Timed Out',
    bg: C.warnDim,
    border: C.warnBorder,
  },
};

interface ErrorCardProps {
  error: GhostError;
  onRetry?: () => void;
  onDismiss?: () => void;
  partialContent?: string;
}

export default function ErrorCard({ error, onRetry, onDismiss, partialContent }: ErrorCardProps) {
  const config = ERROR_CONFIG[error.kind] ?? ERROR_CONFIG.provider;

  return (
    <View style={styles.outerRow}>
      <View style={styles.avatar}>
        <Text style={{ fontSize: 14 }}>👻</Text>
      </View>
      <View style={[styles.card, { backgroundColor: config.bg, borderColor: config.border }]}>
        {/* Partial content (if stream was interrupted) */}
        {partialContent ? (
          <Text style={styles.partialText}>{partialContent}</Text>
        ) : null}

        {/* Error header */}
        <View style={styles.header}>
          <Text style={styles.icon}>{config.icon}</Text>
          <View style={styles.headerText}>
            <Text style={styles.title}>{config.title}</Text>
            <Text style={styles.subtitle} numberOfLines={2}>{error.message}</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {error.retryable && onRetry && (
            <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.7}>
              <Text style={styles.retryText}>↻ RETRY</Text>
            </TouchableOpacity>
          )}
          {onDismiss && (
            <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss} activeOpacity={0.7}>
              <Text style={styles.dismissText}>DISMISS</Text>
            </TouchableOpacity>
          )}
          {error.kind === 'auth' && (
            <Text style={styles.hintText}>Check Settings → Shared Secret</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    maxWidth: '85%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  partialText: {
    color: C.text,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ffffff10',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  icon: {
    fontSize: 18,
    marginTop: 1,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  subtitle: {
    color: C.textDim,
    fontSize: 12,
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  retryBtn: {
    borderWidth: 1,
    borderColor: C.accent,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#00FF8810',
  },
  retryText: {
    color: C.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  dismissBtn: {
    borderWidth: 1,
    borderColor: '#ffffff20',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  dismissText: {
    color: C.textDim,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  hintText: {
    color: C.textDim,
    fontSize: 11,
    fontStyle: 'italic',
    marginLeft: 4,
  },
});
