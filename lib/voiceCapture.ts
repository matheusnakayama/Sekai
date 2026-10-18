import { connectSpeechCleaner } from "@/lib/speechCleaner";
import { CLEAN_MAKEUP_GAIN, SPEECH_SAMPLE_RATE, microphoneMakeup } from "@/lib/speechCleanup";

export type VoiceGate = {
  speaking: boolean;
  aboveSince: number | null;
  belowSince: number | null;
  noiseFloor: number;
};

type VoiceConstraints = MediaTrackConstraints & { voiceIsolation?: boolean };

const sourceDeviceIds = new WeakMap<MediaStreamTrack, string>();
const voiceInputGains = new WeakMap<MediaStreamTrack, GainNode>();
const voiceMakeupBases = new WeakMap<MediaStreamTrack, number>();
const voiceInputReleases = new WeakMap<MediaStreamTrack, () => void>();

export function releaseCallInputTrack(track: MediaStreamTrack): void {
  const release = voiceInputReleases.get(track);
  voiceInputReleases.delete(track);
  if (release) release();
  else if (track.readyState === "live") track.stop();
}

/** Encerra as faixas e libera o processamento de áudio associado à captura. */
export function releaseCallInput(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  stream.getAudioTracks().forEach(releaseCallInputTrack);
  stream.getVideoTracks().forEach((track) => {
    if (track.readyState === "live") track.stop();
  });
}

export function voiceDeviceId(track: MediaStreamTrack | undefined): string | undefined {
  if (!track) return undefined;
  return sourceDeviceIds.get(track) || track.getSettings().deviceId || undefined;
}

/** Ajusta o volume enviado pelo microfone sem interromper a chamada. */
export function setVoiceInputVolume(track: MediaStreamTrack | undefined, volume: number): boolean {
  if (!track) return false;
  const gain = voiceInputGains.get(track);
  if (!gain) return false;
  const normalized = Math.max(0, Math.min(2, volume));
  const base = voiceMakeupBases.get(track) ?? CLEAN_MAKEUP_GAIN;
  gain.gain.setTargetAtTime(base * normalized, gain.context.currentTime, 0.025);
  return true;
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

export function voiceInputConstraints(deviceId?: string, noiseSuppression = false): VoiceConstraints {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    echoCancellation: true,
    // A limpeza roda depois da captura. O supressor do navegador cortava fala distante e não entra junto com a rede neural.
    noiseSuppression,
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

async function applyNativeNoiseSuppression(track: MediaStreamTrack) {
  try {
    await track.applyConstraints({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
  } catch {
    // Usa o filtro de captura nativo quando o navegador aceitar; mantém o áudio mesmo sem ele.
  }
}

export type VoiceProcessing = "standard" | "noise-suppression" | "elevenlabs";

export async function amplifyMicrophone(track: MediaStreamTrack, processing: VoiceProcessing = "standard"): Promise<{ track: MediaStreamTrack; stop: () => void; amplified: boolean }> {
  const AudioContextCtor = window.AudioContext;
  if (!AudioContextCtor) {
    await applyNativeNoiseSuppression(track);
    return { track, stop() {}, amplified: false };
  }
  let context: AudioContext;
  try {
    context = new AudioContextCtor({ latencyHint: "interactive", sampleRate: SPEECH_SAMPLE_RATE });
  } catch {
    try {
      context = new AudioContextCtor({ latencyHint: "interactive" });
    } catch {
      await applyNativeNoiseSuppression(track);
      return { track, stop() {}, amplified: false };
    }
  }
  try {
    if (context.state === "suspended") await context.resume();
  } catch {
    // Segue para o teste de estado abaixo.
  }
  if (context.state !== "running") {
    await context.close().catch(() => undefined);
    await applyNativeNoiseSuppression(track);
    return { track, stop() {}, amplified: false };
  }

  let source: MediaStreamAudioSourceNode | null = null;
  let isolation: { stop: () => void } | null = null;
  let cleanStop: (() => void) | null = null;
  let gain: GainNode | null = null;
  let amplified: MediaStreamTrack | null = null;
  try {
    source = context.createMediaStreamSource(new MediaStream([track]));
    gain = context.createGain();
    gain.gain.value = CLEAN_MAKEUP_GAIN;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 20;
    compressor.ratio.value = 2.4;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.25;
    const destination = context.createMediaStreamDestination();
    gain.connect(compressor);
    compressor.connect(destination);
    const input = source;
    const output = gain;
    let makeup = CLEAN_MAKEUP_GAIN;
    if (processing === "elevenlabs") {
      const { startElevenLabsIsolation } = await import("@/lib/elevenLabsIsolation");
      isolation = await startElevenLabsIsolation(context, input, output, () => {
        isolation = null;
        void connectSpeechCleaner(context, input, output, "full").then((cleaner) => {
          cleanStop = cleaner.stop;
          const base = microphoneMakeup(cleaner.engine);
          makeup = base;
          if (gain) gain.gain.value = base;
          if (amplified) voiceMakeupBases.set(amplified, base);
        }).catch(() => {
          try { input.connect(output); } catch { /* O microfone segue pelo caminho que ainda estiver ligado. */ }
        });
      });
    }
    if (!isolation) {
      const cleaner = await connectSpeechCleaner(context, input, output, processing === "noise-suppression" ? "rnnoise" : "full");
      cleanStop = cleaner.stop;
      makeup = microphoneMakeup(cleaner.engine);
    }
    gain.gain.value = makeup;
    amplified = destination.stream.getAudioTracks()[0] ?? null;
    if (!amplified) throw new Error("O processamento de áudio não criou uma faixa de microfone.");
    voiceInputGains.set(amplified, gain);
    voiceMakeupBases.set(amplified, makeup);
    amplified.contentHint = "speech";

    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      window.removeEventListener("pointerdown", resume);
      cleanStop?.();
      isolation?.stop();
      source?.disconnect();
      if (amplified?.readyState === "live") amplified.stop();
      void context.close().catch(() => undefined);
    };
    const resume = () => {
      if (context.state === "suspended") void context.resume().catch(() => undefined);
    };
    window.addEventListener("pointerdown", resume);
    amplified.addEventListener("ended", stop);
    return { track: amplified, stop, amplified: true };
  } catch (error) {
    console.warn("Não foi possível iniciar o filtro de ruído avançado:", error);
    cleanStop?.();
    isolation?.stop();
    source?.disconnect();
    if (amplified?.readyState === "live") amplified.stop();
    await context.close().catch(() => undefined);
    await applyNativeNoiseSuppression(track);
    return { track, stop() {}, amplified: false };
  }
}

/** Abre câmera e microfone. Se a câmera falhar, devolve só o microfone. */
export async function openCallInput(options: { video: boolean; audioDeviceId?: string; processing?: VoiceProcessing } = { video: false }): Promise<MediaStream> {
  // A supressão acontece depois da captura, para não empilhar o filtro do navegador com o filtro escolhido.
  const audio = voiceInputConstraints(options.audioDeviceId, false);
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
    await microphone.applyConstraints(voiceInputConstraints(options.audioDeviceId, false));
  } catch {
    // O navegador ficou com o melhor ajuste que aceitou na abertura.
  }
  const boosted = await amplifyMicrophone(microphone, options.processing ?? "standard");
  if (!boosted.amplified) return raw;
  const deviceId = microphone.getSettings().deviceId;
  if (deviceId) sourceDeviceIds.set(boosted.track, deviceId);

  const stream = new MediaStream([...raw.getVideoTracks(), boosted.track]);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    voiceInputReleases.delete(boosted.track);
    boosted.stop();
    raw.getAudioTracks().forEach((track) => {
      if (track.readyState === "live") track.stop();
    });
  };
  voiceInputReleases.set(boosted.track, release);
  boosted.track.addEventListener("ended", release);
  return stream;
}
