import { mediaDevices, RTCPeerConnection, RTCSessionDescription } from "react-native-webrtc";
import InCallManager from "react-native-incall-manager";
import type { AudioStats, LiveEvent, TransportFactory } from "./types";

export const createTransport: TransportFactory = async ({ onEvent, onFailure }) => {
  const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
  let peer: RTCPeerConnection | undefined;
  let channel: ReturnType<RTCPeerConnection["createDataChannel"]>;
  try {
    peer = new RTCPeerConnection({ iceServers: [] });
    InCallManager.start({ media: "audio", auto: true });
    for (const track of stream.getAudioTracks()) (peer as RTCPeerConnection).addTrack(track, stream);
    channel = (peer as RTCPeerConnection).createDataChannel("oai-events", { ordered: true });
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    try {
      peer?.close();
    } catch {}
    try {
      (stream as unknown as { release?: () => void }).release?.();
    } catch {}
    try {
      InCallManager.stop();
    } catch {}
    throw error;
  }
  const pc = peer as RTCPeerConnection;
  let closed = false;
  let disconnectTimer: ReturnType<typeof setTimeout> | undefined;
  const energies = new Map<string, { energy: number; duration: number }>();
  channel.onmessage = (event: unknown) => {
    const { data } = event as unknown as { data: unknown };
    if (closed || typeof data !== "string") return;
    try {
      onEvent(JSON.parse(data) as LiveEvent);
    } catch {}
  };
  channel.onclose = () => {
    if (!closed) onFailure("The live connection closed. Start again to reconnect.");
  };
  (pc as unknown as { onconnectionstatechange: (() => void) | null }).onconnectionstatechange = () => {
    clearTimeout(disconnectTimer);
    if (closed) return;
    const state = (pc as unknown as { connectionState?: string }).connectionState;
    if (state === "failed")
      onFailure("The audio connection failed. Check your connection and try again.");
    if (state === "disconnected") {
      disconnectTimer = setTimeout(
        () => onFailure("The audio connection was lost. Try starting again."),
        7000,
      );
    }
  };
  return {
    async offer() {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false } as never);
      await pc.setLocalDescription(offer);
      if ((pc as unknown as { iceGatheringState?: string }).iceGatheringState !== "complete") {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            cleanup();
            reject(
              new Error("Could not establish an audio route. Check your network and try again."),
            );
          }, 10000);
          const check = () => {
            if ((pc as unknown as { iceGatheringState?: string }).iceGatheringState === "complete") {
              cleanup();
              resolve();
            }
          };
          const cleanup = () => {
            clearTimeout(timeout);
            (pc as unknown as { onicegatheringstatechange: unknown }).onicegatheringstatechange = null;
          };
          (pc as unknown as { onicegatheringstatechange: unknown }).onicegatheringstatechange = check;
          check();
        });
      }
      const sdp = (pc as unknown as { localDescription?: { sdp?: string } }).localDescription?.sdp;
      if (!sdp) throw new Error("Could not prepare the audio connection.");
      return sdp;
    },
    answer: (sdp) => pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp })),
    send(event) {
      if (closed || (channel as unknown as { readyState?: string }).readyState !== "open") return false;
      try {
        channel.send(JSON.stringify(event));
        return true;
      } catch {
        return false;
      }
    },
    setMuted(muted) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    },
    async stats() {
      const result: AudioStats = {
        inputLevel: 0,
        outputLevel: 0,
        sentPackets: 0,
        receivedPackets: 0,
      };
      if (closed) return result;
      const reports = await pc.getStats();
      (reports as unknown as { forEach: (cb: (r: Record<string, unknown>) => void) => void }).forEach((report: Record<string, unknown>) => {
        if (report.kind !== "audio" && report.mediaType !== "audio") return;
        let level = typeof report.audioLevel === "number" ? report.audioLevel : 0;
        if (
          typeof report.totalAudioEnergy === "number" &&
          typeof report.totalSamplesDuration === "number"
        ) {
          const previous = energies.get(String(report.id));
          if (
            previous &&
            (report.totalSamplesDuration as number) > previous.duration &&
            typeof report.audioLevel !== "number"
          ) {
            level = Math.sqrt(
              Math.max(
                0,
                ((report.totalAudioEnergy as number) - previous.energy) /
                  ((report.totalSamplesDuration as number) - previous.duration),
              ),
            );
          }
          energies.set(String(report.id), {
            energy: report.totalAudioEnergy as number,
            duration: report.totalSamplesDuration as number,
          });
        }
        if (report.type === "media-source") result.inputLevel = Math.max(result.inputLevel, level);
        if (report.type === "inbound-rtp") {
          result.outputLevel = Math.max(result.outputLevel, level);
          result.receivedPackets += Number(report.packetsReceived || 0);
        }
        if (report.type === "outbound-rtp") result.sentPackets += Number(report.packetsSent || 0);
      });
      return result;
    },
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(disconnectTimer);
      stream.getTracks().forEach((track) => track.stop());
      try {
        channel.close();
      } catch {}
      try {
        pc.close();
      } catch {}
      try {
        (stream as unknown as { release?: () => void }).release?.();
      } catch {}
      try {
        InCallManager.stop();
      } catch {}
    },
  };
};
