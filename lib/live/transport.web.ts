import type { AudioStats, LiveEvent, TransportFactory } from "./types";

export const createTransport: TransportFactory = async ({ onEvent, onFailure }) => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  });
  const pc = new RTCPeerConnection({});
  let closed = false;
  for (const track of stream.getAudioTracks()) pc.addTrack(track, stream);
  const channel = pc.createDataChannel("oai-events", { ordered: true });
  const audio = new Audio();
  audio.autoplay = true;
  pc.ontrack = (e) => {
    audio.srcObject = e.streams[0] ?? null;
  };
  channel.onmessage = (event) => {
    if (closed || typeof event.data !== "string") return;
    try {
      onEvent(JSON.parse(event.data) as LiveEvent);
    } catch {}
  };
  channel.onclose = () => {
    if (!closed) onFailure("The live connection closed. Start again to reconnect.");
  };
  pc.onconnectionstatechange = () => {
    if (closed) return;
    if (pc.connectionState === "failed")
      onFailure("The audio connection failed. Check your connection and try again.");
  };
  return {
    async offer() {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
      await pc.setLocalDescription(offer);
      if (pc.iceGatheringState !== "complete") {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Could not establish an audio route.")),
            10000,
          );
          pc.onicegatheringstatechange = () => {
            if (pc.iceGatheringState === "complete") {
              clearTimeout(timeout);
              resolve();
            }
          };
        });
      }
      if (!pc.localDescription?.sdp) throw new Error("Could not prepare the audio connection.");
      return pc.localDescription.sdp;
    },
    answer: (sdp) => pc.setRemoteDescription({ type: "answer", sdp }),
    send(event) {
      if (closed || channel.readyState !== "open") return false;
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
      const result: AudioStats = { inputLevel: 0, outputLevel: 0, sentPackets: 0, receivedPackets: 0 };
      if (closed) return result;
      const reports = await pc.getStats();
      reports.forEach((report) => {
        const r = report as unknown as Record<string, unknown>;
        if (r.kind !== "audio" && r.mediaType !== "audio") return;
        const level = typeof r.audioLevel === "number" ? (r.audioLevel as number) : 0;
        if (r.type === "media-source") result.inputLevel = Math.max(result.inputLevel, level);
        if (r.type === "inbound-rtp") {
          result.outputLevel = Math.max(result.outputLevel, level);
          result.receivedPackets += Number(r.packetsReceived || 0);
        }
        if (r.type === "outbound-rtp") result.sentPackets += Number(r.packetsSent || 0);
      });
      return result;
    },
    close() {
      if (closed) return;
      closed = true;
      stream.getTracks().forEach((track) => track.stop());
      try {
        channel.close();
      } catch {}
      try {
        pc.close();
      } catch {}
      audio.srcObject = null;
    },
  };
};
