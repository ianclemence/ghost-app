# Pi Test Guide — Mobile App + Ghost Pod

Step-by-step procedure for testing the mobile app against a real Ghost Pod on a Raspberry Pi.

## Prerequisites

- Raspberry Pi 5 (8 GB+) with Ghost installed and running
- Mobile phone with Expo Go (or dev build) installed
- Both devices on the same Wi-Fi network
- Ghost Pod IP address (run `hostname -I` on the Pi)

## 1. Verify Ghost Pod is running

```bash
# On the Pi
sudo systemctl status ghost
ghost agent -m "ping"
```

Expected: service is active, agent responds.

## 2. Start the mobile app

```bash
# On your development machine
cd ghost-app
npx expo start
```

Scan the QR with Expo Go (Android) or Camera (iOS).

## 3. Pairing flow (secure token)

### 3a. Generate pairing token on the Pi

```bash
# On the Pi — start the API if not already running
ghost gateway

# In another terminal — generate a pairing token
curl -s -X POST http://localhost:8766/v1/pairing/start \
  -H "X-Ghost-Secret: $BRIDGE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"display_name": "Test Phone"}' | jq .
```

Expected response:
```json
{
  "pairing_id": "a1b2c3d4e5f6",
  "token": "hex_token_string",
  "expires_in": 300
}
```

### 3b. Redeem token from mobile app

Open the app → More → Connection → or use the onboarding screen.

Enter:
- Host: `<Pi IP address>` (e.g., `192.168.1.42`)
- Port: `8766`
- Token: `<token from step 3a>`

Tap "Pair".

### 3c. Verify connection

The app should show "Connected" status. Check the Pi logs:

```bash
sudo journalctl -u ghost -f
```

You should see WebSocket connection established.

## 4. Manual API testing

### Health check (with device credentials)

```bash
# After pairing, get device ID from the app (More → Advanced)
curl -s http://<Pi IP>:8766/v1/health \
  -H "X-Ghost-Device-ID: <device_id>" \
  -H "X-Ghost-Credential: <credential>" | jq .
```

### Health check (with bridge secret)

```bash
curl -s http://<Pi IP>:8766/v1/health \
  -H "X-Ghost-Secret: $BRIDGE_SECRET" | jq .
```

### List paired devices

```bash
curl -s http://<Pi IP>:8766/v1/pairing/devices \
  -H "X-Ghost-Secret: $BRIDGE_SECRET" | jq .
```

### Revoke a device

```bash
curl -s -X POST http://<Pi IP>:8766/v1/pairing/revoke \
  -H "X-Ghost-Secret: $BRIDGE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"device_id": "<device_id>"}' | jq .
```

After revocation, the mobile app should lose connection.

## 5. Test scenarios

### Basic connection
- [ ] App pairs successfully with token
- [ ] Health check returns `{"status":"ok"}`
- [ ] WebSocket connects and receives messages
- [ ] Send a message → get a response

### Reconnection
- [ ] Kill the Ghost service → app shows disconnected
- [ ] Restart the service → app reconnects automatically
- [ ] Toggle Wi-Fi on phone → app reconnects

### Revocation
- [ ] Revoke device via API → app loses access
- [ ] App shows "Disconnected" status
- [ ] Cannot send messages

### Multiple devices
- [ ] Pair two phones → both appear in device list
- [ ] Revoke one → other still works

### Token expiry
- [ ] Generate token, wait 5 minutes
- [ ] Try to redeem → should fail with "invalid or expired token"

### Edge cases
- [ ] Redeem same token twice → second attempt fails
- [ ] Invalid token → proper error message
- [ ] Wrong credentials → 401 unauthorized

## 6. Troubleshooting

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

## 7. Cleanup

To remove all paired devices and start fresh:

```bash
# On the Pi
sqlite3 ~/ghost/workspace/ghost.db "DELETE FROM paired_devices; DELETE FROM pending_pairings;"
```

Or on the mobile app: More → Advanced → Clear all data.
