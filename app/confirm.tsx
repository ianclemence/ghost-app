import { useLocalSearchParams, useRouter } from "expo-router";
import { GhostButton } from "@/components/ghost";
import { StatusScreen } from "@/components/status-screen";
import { completePairing } from "@/lib/connection";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Pairing progress screen.
 * Shows after QR scan, while pairing is in progress.
 * Calm, minimal — "Connecting…"
 */
export default function PairingProgressScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    token: string;
    host: string;
    port: string;
    transport: string;
    relayServer?: string;
    ghostId?: string;
    name?: string;
  }>();
  const [status, setStatus] = useState<"connecting" | "success" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);
  const hasStarted = useRef(false);

  const startPairing = useCallback(async () => {
    if (!params.token || (!params.host && params.transport !== "relay")) {
      setError("Missing pairing information.");
      setStatus("error");
      return;
    }

    const result = await completePairing({
      token: params.token,
      host: params.host || "",
      port: params.port || "8766",
      transport: params.transport === "relay" ? "relay" : "lan",
      relayServer: params.relayServer || undefined,
      ghostId: params.ghostId || undefined,
    });

    if (result.ok) {
      setStatus("success");
      // Brief pause to show success, then navigate
      setTimeout(() => {
        router.replace("/pairing-success");
      }, 1500);
    } else {
      setError(result.error || "Ghost couldn't connect.");
      setStatus("error");
    }
  }, [params.token, params.host, params.port, params.transport, params.relayServer, params.ghostId, router]);

  // Pairing must run once per visit. The guard makes that explicit while the
  // dependency list stays honest about what the function reads.
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    void startPairing();
  }, [startPairing]);

  if (status === "success") {
    return <StatusScreen title="Ghost connected." />;
  }

  if (status === "error") {
    return (
      <StatusScreen
        tone="bad"
        hero={false}
        title="Couldn't connect"
        body={error}
        actions={
          <>
            <GhostButton
              title="Try again"
              onPress={() => {
                setStatus("connecting");
                setError(null);
                hasStarted.current = false;
                startPairing();
              }}
              fullWidth
            />
            <GhostButton title="Cancel" variant="secondary" onPress={() => router.replace("/onboarding")} fullWidth />
          </>
        }
      />
    );
  }

  // Connecting state
  return <StatusScreen title="Connecting" busy hint="Finding your Ghost Pod" />;
}
