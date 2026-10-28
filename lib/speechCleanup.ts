export const SPEECH_SAMPLE_RATE = 48000;
export const SPEECH_HIGHPASS_HZ = 85;
export const SPEECH_EXPANDER_THRESHOLD = 0.007;
export const SPEECH_EXPANDER_RATIO = 2.2;
export const SPEECH_EXPANDER_FLOOR = 0.4;
export const SPEECH_EXPANDER_ATTACK_S = 0.004;
export const SPEECH_EXPANDER_RELEASE_S = 0.35;
export const CLEAN_MAKEUP_GAIN = 2.6;
export const RAW_MAKEUP_GAIN = 1.45;
export const SPEECH_PROBE_SECONDS = 3.6;

export type SpeechEngine = "gtcrn" | "rnnoise" | "expander" | "highpass";

/** O ganho alto fica para a voz já limpa. Sem a rede neural, um ganho menor não estoura o chiado. */
export function microphoneMakeup(engine: SpeechEngine): number {
  return engine === "gtcrn" || engine === "rnnoise" ? CLEAN_MAKEUP_GAIN : RAW_MAKEUP_GAIN;
}

/**
 * Expansor descendente. No limiar e acima, a fala passa inteira.
 * Abaixo, o resíduo cai, e o piso impede um corte seco no meio da palavra.
 */
export function speechExpanderGain(
  rms: number,
  threshold = SPEECH_EXPANDER_THRESHOLD,
  ratio = SPEECH_EXPANDER_RATIO,
  floor = SPEECH_EXPANDER_FLOOR,
): number {
  if (!Number.isFinite(rms) || rms <= 0) return floor;
  if (rms >= threshold) return 1;
  const reduced = Math.pow(rms / threshold, Math.max(0, ratio - 1));
  if (reduced < floor) return floor;
  if (reduced > 1) return 1;
  return reduced;
}

function createNoise(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Voz sintética com chiado constante, para medir se o filtro tira o ruído e deixa a fala. */
export function renderNoisySpeech(sampleRate = SPEECH_SAMPLE_RATE, seconds = SPEECH_PROBE_SECONDS, seed = 7): Float32Array {
  const length = Math.floor(sampleRate * seconds);
  const data = new Float32Array(length);
  const random = createNoise(seed);
  const frequencies = [730, 1090, 2440];
  const bandwidths = [90, 110, 170];
  const mixes = [1, 0.55, 0.28];
  const formants = frequencies.map((frequency, index) => {
    const radius = Math.exp((-Math.PI * bandwidths[index]) / sampleRate);
    return { a1: 2 * radius * Math.cos((2 * Math.PI * frequency) / sampleRate), a2: -radius * radius, gain: 1 - radius, mix: mixes[index], y1: 0, y2: 0 };
  });
  let phase = 0;
  const fundamental = 128;
  const voice = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const time = i / sampleRate;
    if (time >= 1.6 && time < 2.8) {
      phase += fundamental / sampleRate;
      if (phase >= 1) phase -= 1;
      const pulse = phase < 0.42 ? Math.sin((Math.PI * phase) / 0.42) : 0;
      for (const formant of formants) {
        const next = pulse * formant.gain + formant.a1 * formant.y1 + formant.a2 * formant.y2;
        formant.y2 = formant.y1;
        formant.y1 = next;
        voice[i] += next * formant.mix;
      }
    }
    data[i] = (random() * 2 - 1) * 0.045;
  }
  let peak = 0;
  for (let i = 0; i < voice.length; i++) peak = Math.max(peak, Math.abs(voice[i]));
  const scale = peak > 0 ? 0.42 / peak : 0;
  for (let i = 0; i < data.length; i++) data[i] += voice[i] * scale;
  return data;
}

export function regionRms(samples: ArrayLike<number>, sampleRate: number, startSeconds: number, endSeconds: number): number | null {
  const start = Math.max(0, Math.floor(startSeconds * sampleRate));
  const end = Math.min(samples.length, Math.floor(endSeconds * sampleRate));
  if (end - start < Math.floor(0.05 * sampleRate)) return null;
  let sum = 0;
  for (let i = start; i < end; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (end - start));
}

function envelope(samples: ArrayLike<number>, hop: number): Float32Array {
  const frames = Math.ceil(samples.length / hop);
  const values = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame++) {
    const start = frame * hop;
    const end = Math.min(samples.length, start + hop);
    let sum = 0;
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    values[frame] = Math.sqrt(sum / (end - start));
  }
  return values;
}

/** Atraso da limpeza, em amostras. A voz de saída chega alguns milissegundos depois da entrada. */
export function estimateDelaySamples(input: ArrayLike<number>, output: ArrayLike<number>, sampleRate: number): number {
  const hop = Math.max(1, Math.round(sampleRate / 200));
  const inputEnv = envelope(input, hop);
  const outputEnv = envelope(output, hop);
  const maxLag = Math.round((0.12 * sampleRate) / hop);
  let bestLag = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let lag = 0; lag <= maxLag; lag++) {
    const count = Math.min(inputEnv.length, outputEnv.length - lag);
    if (count <= 0) break;
    let score = 0;
    for (let i = 0; i < count; i++) score += inputEnv[i] * outputEnv[i + lag];
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  return bestLag * hop;
}

export type VoiceCleanupMeasurement = {
  lagSamples: number;
  noiseReductionDb: number;
  speechToNoise: number;
  speechRetention: number;
};

/** Compara o chiado fora da fala e o nível da vogal, já compensando o atraso do filtro. */
export function measureVoiceCleanup(input: ArrayLike<number>, output: ArrayLike<number>, sampleRate = SPEECH_SAMPLE_RATE): VoiceCleanupMeasurement | null {
  const lag = estimateDelaySamples(input, output, sampleRate);
  const lagSeconds = lag / sampleRate;
  const noiseInA = regionRms(input, sampleRate, 0.9, 1.5);
  const noiseInB = regionRms(input, sampleRate, 3.05, 3.45);
  const noiseOutA = regionRms(output, sampleRate, 0.9 + lagSeconds, 1.5 + lagSeconds);
  const noiseOutB = regionRms(output, sampleRate, 3.05 + lagSeconds, 3.45 + lagSeconds);
  const speechIn = regionRms(input, sampleRate, 1.75, 2.65);
  const speechOut = regionRms(output, sampleRate, 1.75 + lagSeconds, 2.65 + lagSeconds);
  if (noiseInA === null || noiseInB === null || noiseOutA === null || noiseOutB === null || speechIn === null || speechOut === null) return null;
  const noiseIn = (noiseInA + noiseInB) / 2;
  const noiseOut = (noiseOutA + noiseOutB) / 2;
  if (noiseIn <= 0 || speechIn <= 0) return null;
  return {
    lagSamples: lag,
    noiseReductionDb: 20 * Math.log10(noiseIn / Math.max(noiseOut, 1e-8)),
    speechToNoise: speechOut / Math.max(noiseOut, 1e-8),
    speechRetention: speechOut / speechIn,
  };
}
