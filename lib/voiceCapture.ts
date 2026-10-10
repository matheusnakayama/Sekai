export type VoiceGate = {
  speaking: boolean;
  aboveSince: number | null;
  belowSince: number | null;
  noiseFloor: number;
};

type VoiceConstraints = MediaTrackConstraints & { voiceIsolation?: boolean };

const MAKEUP_GAIN = 2.6;
const sourceDeviceIds = new WeakMap<MediaStreamTrack, string>();

export function voiceDeviceId(track: MediaStreamTrack | undefined): string | undefined {
  if (!track) return undefined;
  return sourceDeviceIds.get(track) || track.getSettings().deviceId || undefined;
}

export function createVoiceGate(): VoiceGate {
  return { speaking: false, aboveSince: null, belowSince: null, noiseFloor: 0.0035 };
}

/**
 * A fala normal fica abaixo do piso antigo (0,014). O piso novo acompanha o
 * ruído de fundo e abre para uma conversa a uma distância normal do microfone.
 */
export function advanceVoiceGate(gate: VoiceGate, rms: number, now: number): VoiceGate {
  const startThreshold = Math.min(0.04, Math.max(0.006, gate.noiseFloor * 1.85));
  const stopThreshold = Math.min(0.026, Math.max(0.0035, gate.noiseFloor * 1.3));
  let { speaking, aboveSince, belowSince } = gate;
  const noiseFloor = speaking ? gate.noiseFloor : gate.noiseFloor * 0.99 + Math.min(rms, 0.03) * 0.01;
  if (!speaking && rms >= startThreshold) {
    aboveSince ??= now;
    belowSince = null;
  } else if (speaking && rms < stopThreshold) {
    belowSince ??= now;
    aboveSince = null;
  } else {
    aboveSince = null;
    belowSince = null;
  }
  const next = speaking
    ? !(belowSince !== null && now - belowSince > 420)
    : aboveSince !== null && now - aboveSince > 90;
  return { speaking: next, aboveSince, belowSince, noiseFloor };
}

export function voiceInputConstraints(deviceId?: string): VoiceConstraints {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    echoCancellation: true,
    // O supressor do navegador descartava a fala que não estivesse colada no microfone.
    noiseSuppression: false,
    autoGainControl: true,
    voiceIsolation: false,
    channelCount: 1,
    sampleRate: 48000,
  };
}

export function tuneVoiceSdp(sdp: string | undefined): string | undefined {
  if (!sdp) return sdp;
  const eol = sdp.includes("\r\n") ? "\r\n" : "\n";
  const lines = sdp.split(/\r\n|\n/);
  const opus = lines.find((line) => /^a=rtpmap:\d+ opus\/48000/i.test(line));
  const payloadType = opus?.match(/^a=rtpmap:(\d+)/i)?.[1];
  if (!payloadType) return sdp;
  const prefix = `a=fmtp:${payloadType} `;
  const fmtpIndex = lines.findIndex((line) => line.startsWith(prefix));
  const params = new Map<string, string>();
  if (fmtpIndex >= 0) {
    for (const part of lines[fmtpIndex].slice(prefix.length).split(";")) {
      const [key, value] = part.split("=");
      if (key?.trim()) params.set(key.trim(), (value ?? "").trim());
    }
  }
  params.set("minptime", "10");
  params.set("useinbandfec", "1");
  params.set("usedtx", "0");
  params.set("stereo", "0");
  params.set("sprop-stereo", "0");
  params.set("maxaveragebitrate", "96000");
  const fmtp = `${prefix}${Array.from(params.entries()).map(([key, value]) => value ? `${key}=${value}` : key).join(";")}`;
  if (fmtpIndex >= 0) lines[fmtpIndex] = fmtp;
  else {
    const rtpIndex = lines.findIndex((line) => line.startsWith(`a=rtpmap:${payloadType} `));
    lines.splice(rtpIndex + 1, 0, fmtp);
  }
  return lines.join(eol);
}

export function voiceDescription(description: RTCSessionDescriptionInit): RTCSessionDescriptionInit {
  return { ...description, sdp: tuneVoiceSdp(description.sdp) };
}

async function requestUserMedia(audio: VoiceConstraints, video: boolean): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio, video });
  } catch (error) {
    const unsupported = error instanceof TypeError || (error instanceof DOMException && error.name === "OverconstrainedError");
    if (!unsupported) throw error;
    const basic = { ...audio };
    delete basic.voiceIsolation;
    return navigator.mediaDevices.getUserMedia({ audio: basic, video });
  }
}

export async function amplifyMicrophone(track: MediaStreamTrack): Promise<{ track: MediaStreamTrack; stop: () => void; amplified: boolean }> {
  const AudioContextCtor = window.AudioContext;
  if (!AudioContextCtor) return { track, stop() {}, amplified: false };
  let context: AudioContext;
  try {
    context = new AudioContextCtor({ latencyHint: "interactive" });
  } catch {
    return { track, stop() {}, amplified: false };
  }
  try {
    if (context.state === "suspended") await context.resume();
  } catch {
    // Segue para o teste de estado abaixo.
  }
  if (context.state !== "running") {
    await context.close().catch(() => undefined);
    return { track, stop() {}, amplified: false };
  }

  const source = context.createMediaStreamSource(new MediaStream([track]));
  const gain = context.createGain();
  gain.gain.value = MAKEUP_GAIN;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 16;
  compressor.ratio.value = 3.5;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.24;
  const destination = context.createMediaStreamDestination();
  source.connect(gain);
  gain.connect(compressor);
  compressor.connect(destination);
  const amplified = destination.stream.getAudioTracks()[0];
  if (!amplified) {
    source.disconnect();
    await context.close().catch(() => undefined);
    return { track, stop() {}, amplified: false };
  }
  amplified.contentHint = "speech";

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.removeEventListener("pointerdown", resume);
    source.disconnect();
    if (amplified.readyState === "live") amplified.stop();
    void context.close().catch(() => undefined);
  };
  const resume = () => {
    if (context.state === "suspended") void context.resume().catch(() => undefined);
  };
  window.addEventListener("pointerdown", resume);
  amplified.addEventListener("ended", stop);
  return { track: amplified, stop, amplified: true };
}

/** Abre câmera e microfone. Se a câmera falhar, devolve só o microfone. */
export async function openCallInput(options: { video: boolean; audioDeviceId?: string } = { video: false }): Promise<MediaStream> {
  const audio = voiceInputConstraints(options.audioDeviceId);
  let raw: MediaStream;
  try {
    raw = await requestUserMedia(audio, options.video);
  } catch (error) {
    if (!options.video) throw error;
    raw = await requestUserMedia(audio, false);
  }
  const microphone = raw.getAudioTracks()[0];
  if (!microphone) return raw;
  microphone.contentHint = "speech";
  try {
    await microphone.applyConstraints(voiceInputConstraints());
  } catch {
    // O navegador ficou com o melhor ajuste que aceitou na abertura.
  }
  const boosted = await amplifyMicrophone(microphone);
  if (!boosted.amplified) return raw;
  const deviceId = microphone.getSettings().deviceId;
  if (deviceId) sourceDeviceIds.set(boosted.track, deviceId);

  const stream = new MediaStream([...raw.getVideoTracks(), boosted.track]);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    boosted.stop();
    raw.getAudioTracks().forEach((track) => {
      if (track.readyState === "live") track.stop();
    });
  };
  boosted.track.addEventListener("ended", release);
  return stream;
}
