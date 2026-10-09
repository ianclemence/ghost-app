import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Text } from "@/components/text";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { EdgeScrollView } from "@/components/scroll-edge";
import { CardBlock } from "@/components/card-blocks";
import { Empty, lifeStyles, Pill, SourceLine } from "@/components/life-ui";
import { Fonts, Ghost, Space } from "@/constants/theme";
import { fetchTrips, removeTrip, type Trip } from "@/lib/ghostApi";
import { tripRange, tripSteps } from "@/lib/trips";
import { showDialog } from "@/lib/dialog";
import { useGhostStore } from "@/lib/store";

/**
 * The owner's trips, as Ghost put them together from what they said and their
 * bookings: where and when, and each leg as a step in time (with its
 * reference, and when to leave for it). What is happening now is lit; past
 * trips sit underneath.
 */
export default function TripsScreen() {
  const config = useGhostStore((s) => s.config);
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!config) return;
    const r = await fetchTrips(config);
    if (r.ok) {
      setTrips(r.data.trips);
      setError(null);
    } else setError(r.error);
  }, [config]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const remove = (t: Trip) => {
    if (!config) return;
    showDialog(`Remove ${t.title}?`, "Ghost forgets this trip and won't remind you about it.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        const r = await removeTrip(config, t.id);
        if (!r.ok) return setError(r.error);
        await load();
      } },
    ]);
  };

  const ahead = (trips ?? []).filter((t) => t.state !== "past");
  const past = (trips ?? []).filter((t) => t.state === "past");

  return (
    <View style={styles.container}>
      <ScreenBackground variant="calm" />
      <ScreenHeader title="Trips" subtitle="Where you're going" />
      {!config ? (
        <Empty title="Not connected." text="Your trips live on your Pod. Connect one to see them." />
      ) : (
        <EdgeScrollView contentContainerStyle={styles.content}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {trips === null && !error ? <ActivityIndicator style={{ marginTop: Space.xxxl }} color={Ghost.text.tertiary} /> : null}
          {trips && trips.length === 0 ? (
            <Empty title="No trips yet." text="Tell Ghost where you're going, or forward it your flight and hotel bookings. It puts the trip together and tells you what you need, when you need it." />
          ) : null}
          {ahead.map((t) => <TripCard key={t.id} trip={t} onRemove={() => remove(t)} />)}
          {past.length > 0 ? (
            <>
              <Text style={lifeStyles.eyebrow}>Been</Text>
              <View style={lifeStyles.group}>
                {past.map((t, i) => (
                  <Pressable key={t.id} onLongPress={() => remove(t)} delayLongPress={400} style={[styles.pastRow, i > 0 && styles.rowLine]} accessibilityLabel={`${t.title}, ${tripRange(t)}`} accessibilityHint="Long press to remove">
                    <Text style={styles.pastTitle} numberOfLines={1}>{t.destination || t.title}</Text>
                    <Text style={styles.pastDate}>{tripRange(t)}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </EdgeScrollView>
      )}
    </View>
  );
}

function TripCard({ trip, onRemove }: { trip: Trip; onRemove: () => void }) {
  const steps = tripSteps(trip, new Date());
  return (
    <Pressable onLongPress={onRemove} delayLongPress={500} style={[lifeStyles.group, styles.card]} accessibilityHint="Long press to remove">
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title}>{trip.destination || trip.title}</Text>
          <Text style={styles.dates}>{tripRange(trip)}</Text>
        </View>
        <Pill text={trip.state === "now" ? "Now" : "Coming up"} tone={trip.state === "now" ? "good" : "neutral"} centered />
      </View>
      {steps.length > 0 ? (
        <View style={{ marginTop: Space.md }}>
          <CardBlock block={{ type: "timeline", steps }} index={0} />
        </View>
      ) : (
        <Text style={styles.empty}>No bookings yet. Forward Ghost your tickets and they appear here.</Text>
      )}
      {trip.notes ? <Text style={styles.notes}>{trip.notes}</Text> : null}
      <SourceLine source={trip.source} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  content: { paddingBottom: 96, paddingHorizontal: Space.lg, gap: Space.md },
  card: { padding: Space.lg },
  head: { flexDirection: "row", alignItems: "center", gap: Space.md },
  title: { fontFamily: Fonts.voice, fontSize: 34, lineHeight: 40, letterSpacing: -0.6, color: Ghost.text.primary },
  dates: { fontSize: 14, color: Ghost.text.secondary },
  empty: { fontSize: 14, lineHeight: 20, color: Ghost.text.tertiary, marginTop: Space.md },
  notes: { fontSize: 14.5, lineHeight: 21, fontWeight: "300", color: Ghost.text.secondary, marginBottom: Space.sm },
  pastRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 16 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Ghost.border.subtle },
  pastTitle: { flex: 1, fontSize: 15, color: Ghost.text.primary },
  pastDate: { fontSize: 13, color: Ghost.text.tertiary },
  error: { fontSize: 13.5, color: Ghost.status.error, textAlign: "center" },
});
