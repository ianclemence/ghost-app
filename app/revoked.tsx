import { useRouter } from "expo-router";
import { GhostButton } from "@/components/ghost";
import { StatusScreen } from "@/components/status-screen";
import { disconnectAndClear } from "@/lib/connection";

/**
 * Revoked device screen.
 * Shown when Ghost explicitly reports this device has been disconnected.
 * The credential should be removed from secure storage.
 */
export default function RevokedScreen() {
  const router = useRouter();

  const handleConnectAgain = async () => {
    await disconnectAndClear();
    router.replace("/onboarding");
  };

  return (
    <StatusScreen
      tone="off"
      hero={false}
      title="Disconnected"
      body="This device has been disconnected from your Ghost. You'll need to pair again with your Ghost Pod."
      actions={<GhostButton title="Connect again" onPress={handleConnectAgain} fullWidth />}
    />
  );
}
