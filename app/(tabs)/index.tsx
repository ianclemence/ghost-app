import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { Easing, FadeInUp } from "react-native-reanimated";
import { Space } from "@/constants/theme";
import { PlusMenu } from "@/components/plus-menu";
import { fetchIdentity, fetchPendingApprovals } from "@/lib/ghostApi";
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
  const { config, setGhostName, connectionState } = useGhostStore();
  const [userName, setUserName] = useState("");
  const [waitingApproval, setWaitingApproval] = useState(false);
  const { top, sub } = dateHeader();
  const greet = greeting();

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    fetchIdentity(config).then((id) => {
      if (cancelled || !id) return;
      if (id.name) setGhostName(id.name);
      if (id.owner.trim()) setUserName(id.owner.trim());
    }).catch(() => {});
    fetchPendingApprovals(config).then((r) => {
      if (!cancelled) setWaitingApproval(r.length > 0);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [config, setGhostName]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Animated.View entering={FadeInUp.duration(500).easing(EASE)} style={styles.dateWrap}>
        <Text style={styles.dateTop}>{top}</Text>
        <Text style={styles.dateSub}>{sub}</Text>
      </Animated.View>
      {connectionState !== "online" ? (
        <Text style={styles.offline}>{connectionState === "syncing" ? "Ghost is reconnecting" : "Your Ghost is offline"}</Text>
      ) : null}
      <Animated.View
        entering={FadeInUp.duration(560).delay(120).easing(EASE)}
        style={styles.center}
      >
        <Text style={styles.hello}>
          {userName ? (
            <>
              <Text style={styles.muted}>{greet},{`\n`}</Text>
              <Text style={styles.ink}>{userName}. </Text>
              <Text style={styles.muted}>I am ready.{`\n`}What should we do first?</Text>
            </>
          ) : (
            <>
              <Text style={styles.muted}>{greet}. {`\n`}I am ready.{`\n`}What should we do first?</Text>
            </>
          )}
        </Text>
        {waitingApproval ? (
          <Text style={styles.nudge}>Ghost is waiting for your approval.</Text>
        ) : null}
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
    color: "#9C9590",
  },
  offline: {
    textAlign: "center",
    fontSize: 12,
    color: "#9C9590",
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
    color: "#B8B2AA",
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
});
