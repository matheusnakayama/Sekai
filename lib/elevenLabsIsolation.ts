import { createClient } from "@/lib/supabase/client";
import { downsampleMono, takePcmFrames } from "@/lib/pcmFrames";

export async function startElevenLabsIsolation(
  context: AudioContext,
  source: AudioNode,
  output: AudioNode,
  onFallback: () => void,
): Promise<{ stop: () => void } | null> {
  try {
    await context.audioWorklet.addModule("/audio-worklets/pcmCaptureWorklet.js");
  } catch {
    return null;
  }

  const capture = new AudioWorkletNode(context, "sekai-pcm-capture", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
  const keepAlive = context.createGain();
  keepAlive.gain.value = 0;
  const dry = context.createGain();
  source.connect(capture);
  capture.connect(keepAlive);
  keepAlive.connect(context.destination);
  source.connect(dry);
  dry.connect(output);

  let pending: Float32Array<ArrayBufferLike> = new Float32Array(0);
  let stopped = false;
  let failed = false;
  let pumping = false;
  let wet = false;
  let nextTime = 0;
  let currentAbort: AbortController | null = null;
  const queue: Uint8Array[] = [];
  const playing: AudioBufferSourceNode[] = [];

  const disconnectFrom = (node: AudioNode) => {
    try { source.disconnect(node); } catch { /* A ligação já foi desfeita. */ }
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    currentAbort?.abort();
    capture.port.onmessage = null;
    capture.disconnect();
    keepAlive.disconnect();
    dry.disconnect();
    disconnectFrom(capture);
    disconnectFrom(dry);
    for (const node of playing) {
      try { node.stop(); } catch { /* A reprodução já terminou. */ }
      node.disconnect();
    }
    playing.length = 0;
  };

  const fail = () => {
    if (failed || stopped) return;
    failed = true;
    stop();
    onFallback();
  };

  const schedule = (buffer: AudioBuffer) => {
    if (stopped) return;
    const start = Math.max(context.currentTime + 0.03, nextTime || context.currentTime + 0.05);
    if (nextTime && start - context.currentTime > 1.2) {
      fail();
      return;
    }
    if (!wet) {
      wet = true;
      dry.gain.setValueAtTime(0, start);
    }
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.connect(output);
    node.start(start);
    nextTime = start + buffer.duration;
    playing.push(node);
    node.onended = () => {
      const index = playing.indexOf(node);
      if (index >= 0) playing.splice(index, 1);
      node.disconnect();
    };
  };

  const pump = async () => {
    if (pumping || stopped || failed) return;
    pumping = true;
    try {
      while (queue.length && !stopped && !failed) {
        if (queue.length > 4) {
          fail();
          return;
        }
        const pcm = queue.shift();
        if (!pcm) break;
        const abort = new AbortController();
        currentAbort = abort;
        const timer = window.setTimeout(() => abort.abort(), 2_500);
        try {
          const encoded = await requestIsolation(pcm, abort.signal);
          if (stopped || failed) return;
          const audio = await context.decodeAudioData(encoded.slice(0));
          schedule(audio);
        } catch {
          fail();
          return;
        } finally {
          window.clearTimeout(timer);
          if (currentAbort === abort) currentAbort = null;
        }
      }
    } finally {
      pumping = false;
      if (!stopped && !failed && queue.length) void pump();
    }
  };

  capture.port.onmessage = (event: MessageEvent<Float32Array>) => {
    if (stopped || failed || !(event.data instanceof Float32Array) || !event.data.length) return;
    const next = takePcmFrames(pending, downsampleMono(event.data, context.sampleRate, 16_000));
    pending = next.pending;
    if (!next.frames.length) return;
    queue.push(...next.frames);
    void pump();
  };

  return { stop };
}

async function requestIsolation(pcm: Uint8Array, signal: AbortSignal): Promise<ArrayBuffer> {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("no-session");
  const response = await fetch("/api/elevenlabs/isolate", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
    body: pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer,
    signal,
  });
  if (!response.ok) throw new Error(`isolate_${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength < 16) throw new Error("isolate_empty");
  return bytes;
}
