/**
 * The task Android runs when the phone crosses a place the owner asked to be
 * reminded at, even with Ghost closed. It shows the reminder at once (no
 * network needed) and then tells the Pod, which keeps it in the conversation.
 * Defined at start-up, as background tasks must be.
 */
import { Platform } from "react-native";
import { GEOFENCE_TASK, placeMessage } from "./phone";
import { placeCrossed } from "./ghostApi";
import { restoreConfig } from "./connection";
import { useGhostStore } from "./store";

if (Platform.OS === "android") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TaskManager = require("expo-task-manager") as typeof import("expo-task-manager");
    TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
      if (error || !data) return;
      const Location = await import("expo-location");
      const { eventType, region } = data as { eventType: number; region: { identifier?: string } };
      const id = region?.identifier;
      if (!id) return;
      const event = eventType === Location.GeofencingEventType.Enter ? "enter" : "exit";
      const place = await placeMessage(id);
      if (place) {
        try {
          const Notifications = await import("expo-notifications");
          await Notifications.scheduleNotificationAsync({ content: { title: place.name, body: place.message, data: { place: id } }, trigger: null });
        } catch {
          // The Pod still says it in the conversation.
        }
      }
      try {
        let cfg = useGhostStore.getState().config;
        if (!cfg && (await restoreConfig())) cfg = useGhostStore.getState().config;
        if (cfg) await placeCrossed(cfg, id, event);
      } catch {
        // Offline: the reminder was shown on the phone; the Pod hears of it next time.
      }
    });
  } catch {
    // A build without background tasks: places are not watched.
  }
}
