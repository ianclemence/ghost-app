import React, { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Ghost, Space } from "@/constants/theme";
import { ScreenHeader } from "@/components/screen-header";
import {
  fetchActivity,
  fetchMemorySelf,
  fetchPendingApprovals,
  fetchProactiveStatus,
  fetchRoutines,
  type ActivityChip,
  type RoutineItem,
} from "@/lib/ghostApi";
import { proactiveLine } from "@/lib/proactive";
import { useGhostStore } from "@/lib/store";
import { whenAgo, whenAhead } from "@/lib/when";

/**
 * Ghost, opened up. Everything here is runtime state read just now — what
 * needs you, what's coming, what it did and why, what it remembers, and
 * where it runs. Nothing is summarized by a model.
 */
export default function PanelScreen() {
  const router = useRouter();
  const { config, connectionState } = useGhostStore();
  const [approvals, setApprovals] = useState(0);
  const [upcoming, setUpcoming] = useState<RoutineItem[]>([]);
  const [activity, setActivity] = useState<ActivityChip[]>([]);
  const [memoryCount, setMemoryCount] = useState<number | null>(null);
  const [quietLine, setQuietLine] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!config) return;
    await Promise.all([
      fetchPendingApprovals(config).then((r) => setApprovals(r.length)).catch(() => {}),
      fetchRoutines(config).then((r) => {
        const active = r
          .filter((x) => x.state === "active" || x.state === "waiting")
          .sort((a, b) => Date.parse(a.next_run_at ?? "9999") - Date.parse(b.next_run_at ?? "9999"));
        setUpcoming(active.slice(0, 4));
      }).catch(() => {}),
      fetchActivity(config, { limit: 5 }).then(setActivity).catch(() => {}),
      fetchMemorySelf(config).then((m) => setMemoryCount(m.entries.length + m.notes.length)).catch(() => {}),
      fetchProactiveStatus(config).then((p) => setQuietLine(proactiveLine(p).text)).catch(() => {}),
    ]);
  }, [config]);

  useEffect(() => {
    void load();
  }, [load]);

  const where = config
    ? connectionState === "online" ? "On your Pod, online"
      : connectionState === "syncing" ? "On your Pod, reconnecting"
      : "Pod offline · messages will wait"
    : "Not connected to a Pod yet";

  return (
    <View style={styles.container}>
      <ScreenHeader title="Ghost" subtitle={where} variant="close" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          config ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              tintColor={Ghost.text.tertiary}
            />
          ) : undefined
        }
      >
        {config ? (
          <>
            {approvals > 0 || quietLine ? (
              <Section title="Right now">
                {approvals > 0 ? (
                  <Row
                    title={approvals === 1 ? "1 thing needs your OK" : `${approvals} things need your OK`}
                    accent
                    onPress={() => router.back()}
                  />
                ) : null}
                {quietLine ? <Row title={quietLine} /> : null}
              </Section>
            ) : null}

            <Section title="Coming up" action={{ label: "All", onPress: () => router.push("/routines" as never) }}>
              {upcoming.length === 0 ? (
                <Empty text="Nothing scheduled. Say “every Monday at 8, brief me on my week” and it lands here." />
              ) : (
                upcoming.map((r) => (
                  <Row
                    key={r.id}
                    title={r.title}
                    detail={[whenAhead(r.next_run_at), r.schedule].filter(Boolean).join(" · ")}
                    note={r.state === "waiting" ? r.waiting_on || "Waiting on you" : undefined}
                    onPress={() => router.push("/routines" as never)}
                  />
                ))
              )}
            </Section>

            <Section title="What Ghost did" action={{ label: "All", onPress: () => router.push("/activity" as never) }}>
              {activity.length === 0 ? (
                <Empty text="Nothing yet. Every action Ghost takes is recorded here." />
              ) : (
                activity.map((a) => (
                  <Row
                    key={a.id}
                    title={a.title}
                    detail={[a.summary, whenAgo(a.timestamp)].filter(Boolean).join(" · ")}
                    note={a.why}
                  />
                ))
              )}
            </Section>

            <Section title="Memory">
              <Row
                title="What Ghost remembers"
                detail={memoryCount === null ? undefined : memoryCount === 1 ? "1 thing" : `${memoryCount} things`}
                onPress={() => router.push("/memory" as never)}
              />
            </Section>
          </>
        ) : (
          <Section title="Right now">
            <Empty text="Ghost lives on your Pod. Connect it to see what Ghost is doing for you." />
          </Section>
        )}

        <Section title="Settings">
          {config ? <Row title="Intelligence" detail="Which AI Ghost thinks with" onPress={() => router.push("/intelligence" as never)} /> : null}
          {config ? <Row title="Connected apps" detail="Email, calendar, and logins" onPress={() => router.push("/connections" as never)} /> : null}
          {config ? <Row title="Files" detail="What you have sent Ghost, and delete it" onPress={() => router.push("/files" as never)} /> : null}
          <Row title="Your Pod" detail="Health and the models on it" onPress={() => router.push("/ghost" as never)} />
          {!config ? <Row title="Connect your Pod" onPress={() => router.push("/connect" as never)} /> : null}
          <Row title="About" onPress={() => router.push("/about" as never)} />
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${action.label} ${title.toLowerCase()}`}>
            <Text style={styles.sectionAction}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

function Row({
  title,
  detail,
  note,
  accent,
  onPress,
}: {
  title: string;
  detail?: string;
  note?: string;
  accent?: boolean;
  onPress?: () => void;
}) {
  const body = (
    <View style={styles.row}>
      {accent ? <View style={styles.accentDot} /> : null}
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, accent && styles.rowTitleAccent]}>{title}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
        {note ? <Text style={styles.rowNote}>{note}</Text> : null}
      </View>
      {onPress ? <ChevronRight size={18} color={Ghost.text.tertiary} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => pressed && { backgroundColor: Ghost.bg.sunken }}
      accessibilityRole="button"
      accessibilityLabel={[title, detail].filter(Boolean).join(", ")}
    >
      {body}
    </Pressable>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.empty}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Ghost.bg.base,
  },
  content: {
    paddingBottom: Space.huge,
  },
  section: {
    marginTop: Space.xl,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: Space.xl,
    marginBottom: Space.xs,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
    color: Ghost.text.tertiary,
  },
  sectionAction: {
    fontSize: 14,
    fontWeight: "600",
    color: Ghost.accent.primary,
  },
  group: {
    marginHorizontal: Space.lg,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: Ghost.bg.raised,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingVertical: 13,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Ghost.border.subtle,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 16,
    lineHeight: 21,
    color: Ghost.text.primary,
  },
  rowTitleAccent: {
    fontWeight: "600",
  },
  rowDetail: {
    fontSize: 13,
    lineHeight: 18,
    color: Ghost.text.secondary,
  },
  rowNote: {
    fontSize: 13,
    lineHeight: 18,
    color: Ghost.text.tertiary,
  },
  accentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Ghost.emberDeep,
  },
  empty: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: Ghost.text.tertiary,
  },
});
