# Pi Test Guide — Mobile App + Ghost Pod

Step-by-step procedure for testing the mobile app against a real Ghost Pod on a Raspberry Pi.

## Prerequisites

- Raspberry Pi 5 (8 GB+) with Ghost installed and running
- Mobile phone with Expo Go (or dev build) installed
- Both devices on the same Wi-Fi network
- Ghost Pod IP address (run `hostname -I` on the Pi)

## 1. Fresh Install & Setup

```bash
# On the Pi — if Ghost is freshly installed
ghost gateway
# This will fail if setup is not complete
# Run ghost-web to complete setup first
```

Complete the setup wizard:
1. Open Ghost Web UI (http://<Pi IP>:80)
2. Set owner name
3. Set Ghost name
4. Create password
5. Ghost initializes

## 2. Verify Ghost Pod is running

```bash
sudo systemctl status ghost
ghost agent -m "ping"
```

Expected: service is active, agent responds.

## 3. Start the mobile app

```bash
# On your development machine
cd ghost-app
npx expo start
```

Scan the QR with Expo Go (Android) or Camera (iOS).

## 4. Pairing flow (secure token)

### 4a. Generate pairing invitation on the Pi

```bash
# On the Pi — start the API if not already running
ghost gateway

# In another terminal — create a pairing invitation
curl -s -X POST http://localhost:8766/v1/pairing/invitations \
  -H "X-Ghost-Secret: $BRIDGE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"display_name": "Test Phone", "transport": "lan"}'
```

Expected response:
```json
{
  "pairing_id": "a1b2c3d4e5f6",
  "pod_id": "abc12345",
  "transport": "lan",
  "host": "0.0.0.0",
  "port": "8766",
  "token": "hex_token_string",
  "expires_at": "2026-08-24T12:05:00Z",
  "expires_in": 300
}
```

### 4b. Scan QR on mobile app

Open the app → first launch shows onboarding → tap "Connect to Ghost" → tap "Scan QR Code" → point camera at the QR code.

### 4c. Pairing confirmation

The app shows "Connecting…" while redeeming the token.

On success: "Ghost connected. Your Ghost is ready." → tap Continue → Home.

## 5. Returning user (after pairing)

Open the app → Home loads immediately → Ghost reconnects in background.

No QR scan needed.

## 6. Test scenarios

### Basic connection
- [ ] App pairs successfully with token
- [ ] Health check returns `{"status":"ok"}`
- [ ] WebSocket connects and receives messages
- [ ] Send a message → get a response

### Reconnection
- [ ] Kill the Ghost service → app shows offline
- [ ] Restart the service → app reconnects automatically
- [ ] Toggle Wi-Fi on phone → app reconnects

### Revocation
- [ ] Revoke device via API → app shows "disconnected" screen
- [ ] Cannot send messages
- [ ] Re-pairing works

### Multiple devices
- [ ] Pair two phones → both appear in device list
- [ ] Revoke one → other still works

### Token expiry
- [ ] Generate token, wait 5 minutes
- [ ] Try to complete → should fail with "Pairing invitation expired"

### Token replay
- [ ] Generate token, pair phone A
- [ ] Try same token with phone B → must fail

### Edge cases
- [ ] Invalid token → proper error message
- [ ] Wrong credentials → 401 unauthorized
- [ ] Camera denied → settings action available

## 7. Backend API reference

### Pairing endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /v1/pairing/invitations` | Bridge secret | Create pairing invitation |
| `POST /v1/pairing/complete` | PUBLIC | Complete pairing (token is auth) |
| `GET /v1/pairing/devices` | Bridge secret | List paired devices |
| `POST /v1/pairing/revoke` | Bridge secret | Revoke a device |
| `POST /v1/pairing/cancel` | Bridge secret | Cancel pending invitation |

### Legacy endpoints (still work)

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /v1/pairing/start` | Bridge secret | Create invitation (alias) |
| `POST /v1/pairing/redeem` | PUBLIC | Complete pairing (alias) |

### Structured error responses

```json
{
  "error": {
    "code": "pairing_expired",
    "message": "Pairing invitation expired."
  }
}
```

Error codes: `pairing_invalid`, `pairing_expired`, `pairing_consumed`, `pairing_rejected`, `device_revoked`, `device_not_found`

## 8. Troubleshooting

### "Connection refused"
- Check Pi IP address: `hostname -I`
- Check Ghost is running: `sudo systemctl status ghost`
- Check port: `sudo lsof -i :8766`

### "Unauthorized"
- Verify bridge secret: `cat ~/.ghost/.secrets.json`
- Check device credentials in app (More → Advanced)

### WebSocket disconnects immediately
- Check if another process is using the port
- Check Pi logs: `sudo journalctl -u ghost -f`

### App shows "Offline" after pairing
- Verify the Pi is reachable: `curl http://<Pi IP>:8766/v1/health`
- Check if firewall is blocking port 8766

## 9. Cleanup

To remove all paired devices and start fresh:

```bash
sqlite3 ~/ghost/workspace/ghost.db "DELETE FROM paired_devices; DELETE FROM pending_pairings;"
```

Or on the mobile app: More → Connection → Connect another Ghost.
