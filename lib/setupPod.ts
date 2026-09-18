/**
 * Phone-driven first-run setup for a fresh Ghost Pod.
 *
 * The Pod's console gates the first configure behind a one-time setup code
 * printed on the device (see the Go side: appliance.SetupCodeFileName). This
 * proves the caller is at the device, so a phone on the LAN can claim and
 * configure a brand-new Pod without a second visit to the browser.
 *
 * With `pair: true`, the console also mints a one-time pairing invitation
 * once the gateway is up, so the phone can pair in the same pass.
 */

export interface SetupPodInput {
  host: string;
  port?: string; // console port, default 80
  setupCode: string;
  adminPassword: string;
  ownerName: string;
  ghostName: string;
  provider?: string;
  model?: string;
}

export interface SetupPairing {
  token: string;
  host?: string;
  port?: string;
  transport?: string;
}

export interface SetupPodResult {
  ok: boolean;
  error?: string;
  pairing?: SetupPairing;
  pairingPending?: boolean;
}

export async function setupPod(
  input: SetupPodInput,
  fetchImpl: typeof fetch = fetch,
): Promise<SetupPodResult> {
  const host = input.host.trim();
  const port = (input.port || "80").trim();
  if (!host) return { ok: false, error: "Enter the Ghost Pod address." };
  if (!input.setupCode.trim()) {
    return { ok: false, error: "Enter the setup code shown on the device." };
  }
  if (input.adminPassword.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  try {
    const res = await fetchImpl(`http://${host}:${port}/api/configure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        admin_password: input.adminPassword,
        setup_code: input.setupCode.trim(),
        owner_name: input.ownerName.trim(),
        ghost_name: input.ghostName.trim(),
        provider: input.provider || "ollama",
        model: input.model || "qwen3:0.6b",
        pair: true,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (json.ok !== true) {
      const err = typeof json.error === "string" ? json.error : "Ghost refused setup.";
      return { ok: false, error: err };
    }
    const raw = json.pairing as Record<string, unknown> | undefined;
    const pairing =
      raw && typeof raw.token === "string"
        ? {
            token: raw.token,
            host: typeof raw.host === "string" ? raw.host : undefined,
            port: typeof raw.port === "string" ? raw.port : undefined,
            transport: typeof raw.transport === "string" ? raw.transport : undefined,
          }
        : undefined;
    return { ok: true, pairing, pairingPending: json.pairing_pending === true };
  } catch {
    return {
      ok: false,
      error: "Couldn't reach the Ghost Pod. Check the address and that you're on the same network.",
    };
  }
}
