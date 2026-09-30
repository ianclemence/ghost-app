# Pod acceptance guide

Test the app against a real Ghost Pod, from a blank SD card to a working
conversation. Each step says what you should see, and what to do if you do not.

## You need

- A Raspberry Pi 5 (8 GB or more) on your network
- A phone with the Ghost app (development build or Expo Go)
- An API key for the AI you want Ghost to think with, or plan to choose "On this Pod"
- The Pod's IP address (`hostname -I` on the Pi)

## 1. Install Ghost on the Pod

On the Pi:

```bash
sudo apt install -y git make golang-go ffmpeg
git clone https://github.com/ianclemence/ghost.git
cd ghost
sudo make install-ghost
sudo reboot
```

Expect the install to finish with "Ghost installed". If a step fails the
install stops and says so; it does not report success.

## 2. Set up from the console

1. On the Pi, read the setup code: `journalctl -u ghost-web | grep 'Setup code'`
2. Open `http://<pod-ip>` in a browser and enter the code
3. Name yourself and Ghost, and choose an owner password
4. Choose what Ghost thinks with and paste the key (or choose On this Pod)

Expect: a wrong code is refused with a clear message on the first screen, and a
wrong API key is refused on the AI screen. Nothing is left half-configured, so
you can correct it and continue. Setup finishes on "You're connected."

You can do the same from the phone: **Connect a Ghost Pod > Set up a new Ghost
Pod** asks for the address, the setup code, your names, the AI and the password.

## 3. Pair the phone

On the Pi run `ghost pair` and scan the QR in the app (**Pair your Ghost > Scan
your Ghost**). The code works once and expires in five minutes. If the camera
cannot scan it, choose "Enter manually" and type the address and code shown
under the QR.

Expect: the app lands on the conversation, with Ghost's name and a status light
at the top.

## 4. Check the conversation

| Try | Expect |
|---|---|
| Send "hello" | A streamed reply, with a quiet line under it saying where it ran |
| Send a message, then switch the phone to airplane mode and send another | The second waits in the outbox and goes out, in order, when the network returns |
| Ask "what can you do?" | A plain answer; no installation steps |
| Tap Ghost in the header | The panel: what needs you, what is coming up, what it did, memory, settings |

## 5. Photos, files and voice

| Try | Expect |
|---|---|
| Attach a photo and ask what is in it | The photo shows in your message; Ghost describes it |
| Attach a PDF and ask for a summary | A file chip with name and size; Ghost reads the PDF and summarizes it |
| Attach a spreadsheet or CSV and ask for the total of a column | Ghost reads it with its document tool and answers |
| Attach an audio file | Ghost says plainly that it cannot listen to audio files yet |
| Try a file over 25 MB | Refused at the picker, with the limit stated |
| Open **Ghost > Files** | Everything you sent, with size and date; Delete removes it from the Pod |
| Hold the mic, speak, stop | The words appear in the composer; your audio is not kept |
| Open live voice from the header | A spoken back-and-forth |

In the terminal (`ghost`), `/attach ~/lease.pdf` stages a file for your next
message and `/files` lists and deletes what you have sent.

## 6. Approvals

Ask Ghost to do something that changes the world, for example "email me a
test message". Expect an approval card with four answers:

| Answer | Meaning |
|---|---|
| Allow once | This one time |
| Allow for this task | Ghost may repeat it while it keeps working on this; ends after ten quiet minutes, or one hour at most |
| Always allow | A standing permission you can revoke in the console under Approvals |
| Deny | Not now, and Ghost remembers |

## 7. Browser

Ask Ghost to open a page and read it. Expect a live browser card in the thread:
Watch shows what Ghost sees, Take over pauses Ghost while you hold the
browser, and Resume hands it back. Anything hard to undo stops for your approval.

## 8. Updates and health

```bash
ghost update --check     # installed, available, what is actually running
ghost update             # deploy the release
```

Expect `Running:` to match the installed version after an update. The console
(**System > Updates**) does the same thing in its own background job, and the
log stays readable after the console restarts.

## If something fails

| Symptom | First thing to try |
|---|---|
| The app cannot reach the Pod | Same Wi-Fi? `curl http://<pod-ip>:8766/v1/health` |
| The console shows the wizard again | `ls /var/ghost/.setup-complete`; if missing, setup did not finish |
| Ghost is silent | `sudo journalctl -u ghost -n 50` |
| Two Ghost daemons | `ghost update --check` warns; keep the system one: `systemctl --user disable --now ghost` |
