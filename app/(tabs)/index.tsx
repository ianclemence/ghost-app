import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { Easing, FadeInUp, useReducedMotion } from "react-native-reanimated";
import { Ghost, Space } from "@/constants/theme";
import { GhostButton } from "@/components/ghost";
import { PlusMenu } from "@/components/plus-menu";
import { fetchGoals, fetchIdentity, fetchPendingApprovals, fetchProactiveStatus, fetchRoutines, type GoalItem, type ProactiveStatus, type RoutineItem } from "@/lib/ghostApi";
import { deriveHomeSummary } from "@/lib/home";
import { proactiveLine } from "@/lib/proactive";
import { useGhostStore } from "@/lib/store";

const EASE = Easing.bezier(0.32, 0.72, 0, 1);

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function dateHeader(d = new Date()): { top: string; sub: string } {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return { top: `${months[d.getMonth()]} ${d.getDate()}`, sub: d.toLocaleDateString([], { weekday: "long" }) };
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { config, setGhostName, connectionState, localReady } = useGhostStore();
  const [userName, setUserName] = useState("");
  const [approvalCount, setApprovalCount] = useState(0);
  const [routines, setRoutines] = useState<RoutineItem[]>([]);
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [proactive, setProactive] = useState<ProactiveStatus | null>(null);
  const { top, sub } = dateHeader();
  const greet = greeting();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    fetchIdentity(config).then((id) => {
      if (cancelled || !id) return;
      if (id.name) setGhostName(id.name);
      if (id.owner.trim()) setUserName(id.owner.trim());
    }).catch(() => {});
    fetchPendingApprovals(config).then((r) => {
      if (!cancelled) setApprovalCount(r.length);
    }).catch(() => {});
    // Home states one fact about what Ghost is doing, so the owner's first
    // screen answers "what do you do for me?" without becoming a dashboard.
    fetchRoutines(config).then((r) => {
      if (!cancelled) setRoutines(r);
    }).catch(() => {});
    fetchGoals(config).then((g) => {
      if (!cancelled) setGoals(g);
    }).catch(() => {});
    // When Ghost is quietly watching or holding something for later, the
    // owner should know — without a dashboard. One calm line at most.
    fetchProactiveStatus(config).then((p) => {
      if (!cancelled) setProactive(p);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [config, setGhostName]);

  const summary = deriveHomeSummary(routines, goals);
  const proactiveText = proactiveLine(proactive).text;
  // "Ready" is earned, not default: without a Pod or a phone model there is
  // nothing to talk to yet, so Home offers setup instead of conversation.
  const ready = !!config || localReady;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Animated.View
        entering={reduceMotion ? undefined : FadeInUp.duration(300).easing(EASE)}
        style={styles.dateWrap}
        accessible
        accessibilityLabel={`Today is ${sub}, ${top}`}
        accessibilityRole="header"
      >
        <Text style={styles.dateTop}>{top}</Text>
        <Text style={styles.dateSub}>{sub}</Text>
      </Animated.View>
      {config && connectionState !== "online" ? (
        <Text style={styles.offline} accessibilityLiveRegion="polite">{connectionState === "syncing" ? "Ghost is reconnecting" : "Your Ghost is offline"}</Text>
      ) : null}
      {!config && localReady ? (
        <Text style={styles.offline} accessibilityLiveRegion="polite">Ghost is on this phone</Text>
      ) : null}
      <Animated.View
        entering={reduceMotion ? undefined : FadeInUp.duration(320).delay(80).easing(EASE)}
        style={styles.center}
      >
        <Text style={styles.hello}>
          {userName ? (
            <>
              <Text style={styles.muted}>{greet},{`\n`}</Text>
              <Text style={styles.ink}>{userName}. </Text>
              {ready ? (
                <Text style={styles.muted}>I am ready.{`\n`}What should we do first?</Text>
              ) : (
                <Text style={styles.muted}>Let&apos;s get set up first.</Text>
              )}
            </>
          ) : ready ? (
            <>
              <Text style={styles.muted}>{greet}. {`\n`}I am ready.{`\n`}What should we do first?</Text>
            </>
          ) : (
            <>
              <Text style={styles.muted}>Welcome to Ghost.{`\n`}Let&apos;s get set up first.</Text>
            </>
          )}
        </Text>
        {approvalCount > 0 ? (
          <Pressable
            onPress={() => router.push({ pathname: "/conversation", params: { anchor: "approvals" } } as never)}
            accessibilityRole="button"
            accessibilityLabel={`${approvalCount} approval${approvalCount === 1 ? "" : "s"} waiting. Open conversation to review.`}
            style={styles.routinesLine}
          >
            <Text style={styles.nudge}>
              {approvalCount === 1
                ? "Ghost is waiting for your approval."
                : `Ghost is waiting for ${approvalCount} approvals.`}
            </Text>
          </Pressable>
        ) : null}
        {summary.headline ? (
          <Pressable
            onPress={() => router.push("/routines" as never)}
            accessibilityRole="button"
            accessibilityLabel={`${summary.headline} Open routines.`}
            style={styles.routinesLine}
          >
            <Text style={styles.routinesText}>{summary.headline}</Text>
          </Pressable>
        ) : null}
        {proactiveText ? (
          <Text style={styles.proactiveText} accessibilityLiveRegion="polite">
            {proactiveText}
          </Text>
        ) : null}
        <View style={styles.talkRow}>
          {ready ? (
            <>
              <GhostButton title="Start a conversation" onPress={() => router.push("/conversation" as never)} />
              <GhostButton title="Live voice" variant="secondary" onPress={() => router.push("/live" as never)} />
            </>
          ) : (
            <>
              <GhostButton title="Set up on this phone" onPress={() => router.push("/ghost?firstRun=1" as never)} />
              <GhostButton title="Connect a Pod" variant="secondary" onPress={() => router.push("/connect")} />
            </>
          )}
        </View>
      </Animated.View>
      <PlusMenu />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAFAF7",
  },
  dateWrap: {
    alignItems: "center",
    marginTop: Space.xl,
  },
  dateTop: {
    fontSize: 19,
    fontWeight: "700",
    color: "#1A1611",
  },
  dateSub: {
    fontSize: 17,
    color: Ghost.text.tertiary,
  },
  offline: {
    textAlign: "center",
    fontSize: 12,
    color: Ghost.text.tertiary,
    marginTop: 4,
  },
  center: {
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
    paddingHorizontal: 44,
  },
  hello: {
    fontSize: 21,
    lineHeight: 30,
    textAlign: "center",
    letterSpacing: -0.2,
  },
  muted: {
    color: "#7A746C",
  },
  ink: {
    color: "#1A1611",
    fontWeight: "700",
  },
  nudge: {
    marginTop: Space.lg,
    fontSize: 14,
    textAlign: "center",
    color: "#1A1611",
    fontWeight: "600",
  },
  routinesLine: {
    marginTop: Space.lg,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Space.md,
  },
  routinesText: {
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
    color: "#6B6560",
  },
  proactiveText: {
    marginTop: Space.sm,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    color: "#8A857E",
    paddingHorizontal: Space.md,
  },
  talkRow: {
    marginTop: Space.lg,
    flexDirection: "row",
    gap: Space.sm,
    justifyContent: "center",
  },
});
