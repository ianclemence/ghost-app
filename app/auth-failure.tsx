import { useRouter } from "expo-router";
import { GhostButton } from "@/components/ghost";
import { StatusScreen } from "@/components/status-screen";
import { disconnectAndClear, initializeConnection } from "@/lib/connection";

/**
 * Authentication failure screen.
 * Shown when the stored credential is rejected by Ghost.
 * Not a temporary network issue: the credential itself is invalid.
 */
export default function AuthFailureScreen() {
  const router = useRouter();

  const handleConnectAgain = async () => {
    await disconnectAndClear();
    router.replace("/onboarding");
  };

  const handleTryReconnect = async () => {
    await initializeConnection();
    router.replace("/(tabs)");
  };

  return (
    <StatusScreen
      tone="bad"
      hero={false}
      title="Not connected"
      body="This device is no longer connected to your Ghost. The connection may have been removed from your Ghost Pod."
      actions={
        <>
          <GhostButton title="Connect again" onPress={handleConnectAgain} fullWidth />
          <GhostButton title="Try reconnect" variant="secondary" onPress={handleTryReconnect} fullWidth />
        </>
      }
    />
  );
}
