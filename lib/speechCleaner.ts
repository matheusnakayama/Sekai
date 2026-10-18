import {
  SPEECH_EXPANDER_ATTACK_S,
  SPEECH_EXPANDER_FLOOR,
  SPEECH_EXPANDER_RATIO,
  SPEECH_EXPANDER_RELEASE_S,
  SPEECH_EXPANDER_THRESHOLD,
  SPEECH_HIGHPASS_HZ,
  SPEECH_SAMPLE_RATE,
  type SpeechEngine,
} from "@/lib/speechCleanup";

export type SpeechCleanerMode = "full" | "rnnoise";

export type SpeechCleanerHandle = {
  engine: SpeechEngine;
  stop: () => void;
};

const moduleJobs = new WeakMap<BaseAudioContext, Map<string, Promise<void>>>();
let gtcrnBinary: Promise<ArrayBuffer> | null = null;
let rnnoiseBinary: Promise<ArrayBuffer> | null = null;
let warned = false;

function warnOnce(message: string) {
  if (warned) return;
  warned = true;
  console.warn(message);
}

function addModule(context: BaseAudioContext, url: string) {
  let jobs = moduleJobs.get(context);
  if (!jobs) {
    jobs = new Map();
    moduleJobs.set(context, jobs);
  }
  const existing = jobs.get(url);
  if (existing) return existing;
  const job = context.audioWorklet.addModule(url).catch((error: unknown) => {
    jobs?.delete(url);
    throw error;
  });
  jobs.set(url, job);
  return job;
}

async function loadGtcrnBinary() {
  if (!gtcrnBinary) {
    gtcrnBinary = import("@sapphi-red/web-noise-suppressor")
      .then(({ loadGtcrn }) => loadGtcrn({ url: "/audio-worklets/gtcrn.wasm" }))
      .catch((error: unknown) => {
        gtcrnBinary = null;
        throw error;
      });
  }
  return gtcrnBinary;
}

async function loadRnnoiseBinary() {
  if (!rnnoiseBinary) {
    rnnoiseBinary = import("@sapphi-red/web-noise-suppressor")
      .then(({ loadRnnoise }) => loadRnnoise({ url: "/audio-worklets/rnnoise.wasm", simdUrl: "/audio-worklets/rnnoise_simd.wasm" }))
      .catch((error: unknown) => {
        rnnoiseBinary = null;
        throw error;
      });
  }
  return rnnoiseBinary;
}

async function createNeural(context: AudioContext, input: AudioNode, kind: "gtcrn" | "rnnoise") {
  let node: (AudioWorkletNode & { destroy?: () => void }) | null = null;
  try {
    if (kind === "gtcrn") {
      await addModule(context, "/audio-worklets/gtcrnWorklet.js");
      const { GtcrnWorkletNode } = await import("@sapphi-red/web-noise-suppressor");
      node = new GtcrnWorkletNode(context, { maxChannels: 2, wasmBinary: (await loadGtcrnBinary()).slice(0) });
    } else {
      await addModule(context, "/audio-worklets/rnnoiseWorklet.js");
      const { RnnoiseWorkletNode } = await import("@sapphi-red/web-noise-suppressor");
      node = new RnnoiseWorkletNode(context, { maxChannels: 2, wasmBinary: (await loadRnnoiseBinary()).slice(0) });
    }
    input.connect(node);
    return node;
  } catch {
    try { node?.disconnect(); } catch { /* O nó pode ter sido criado sem ligação. */ }
    node?.destroy?.();
    warnOnce(kind === "gtcrn" ? "A limpeza neural da voz não iniciou; o Sekai tenta o filtro seguinte." : "O RNNoise não iniciou; a voz segue com o corte de graves.");
    return null;
  }
}

async function createExpander(context: AudioContext, input: AudioNode) {
  let node: AudioWorkletNode | null = null;
  try {
    await addModule(context, "/audio-worklets/speechExpanderWorklet.js");
    node = new AudioWorkletNode(context, "sekai-speech-expander", {
      processorOptions: {
        threshold: SPEECH_EXPANDER_THRESHOLD,
        ratio: SPEECH_EXPANDER_RATIO,
        floor: SPEECH_EXPANDER_FLOOR,
        attack: SPEECH_EXPANDER_ATTACK_S,
        release: SPEECH_EXPANDER_RELEASE_S,
      },
    });
    input.connect(node);
    return node;
  } catch {
    try { node?.disconnect(); } catch { /* O expansor não chegou a entrar na cadeia. */ }
    return null;
  }
}

/**
 * Corta o ronco, passa a voz por uma rede neural e abaixa o chiado que sobra
 * nos intervalos. O supressor do navegador fica de fora para não empilhar filtros
 * nem engolir fala distante.
 */
export async function connectSpeechCleaner(
  context: AudioContext,
  source: AudioNode,
  destination: AudioNode,
  mode: SpeechCleanerMode = "full",
): Promise<SpeechCleanerHandle> {
  const highpass = context.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = SPEECH_HIGHPASS_HZ;
  highpass.Q.value = 0.707;
  const highpassTight = context.createBiquadFilter();
  highpassTight.type = "highpass";
  highpassTight.frequency.value = SPEECH_HIGHPASS_HZ;
  highpassTight.Q.value = 0.707;
  source.connect(highpass);
  highpass.connect(highpassTight);

  const nodes: AudioNode[] = [highpass, highpassTight];
  let engine: SpeechEngine = "highpass";
  let tail: AudioNode = highpassTight;
  let neural: (AudioWorkletNode & { destroy?: () => void }) | null = null;

  if (context.sampleRate === SPEECH_SAMPLE_RATE && context.audioWorklet) {
    if (mode === "full") {
      neural = await createNeural(context, tail, "gtcrn");
      if (neural) engine = "gtcrn";
    }
    if (!neural) {
      neural = await createNeural(context, tail, "rnnoise");
      if (neural) engine = "rnnoise";
    }
    if (neural) {
      nodes.push(neural);
      tail = neural;
    }
    const expander = await createExpander(context, tail);
    if (expander) {
      nodes.push(expander);
      tail = expander;
      if (engine === "highpass") engine = "expander";
    }
  }

  tail.connect(destination);
  let stopped = false;
  return {
    engine,
    stop() {
      if (stopped) return;
      stopped = true;
      try { source.disconnect(highpass); } catch { /* A entrada já foi solta. */ }
      for (const node of nodes) {
        try { node.disconnect(); } catch { /* O nó já saiu da cadeia. */ }
      }
      neural?.destroy?.();
    },
  };
}
