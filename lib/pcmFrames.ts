export const ISOLATION_RATE = 16_000;
export const ISOLATION_FRAME_SAMPLES = 3_200;

export function downsampleMono(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (input.length === 0 || inputRate <= 0 || outputRate <= 0) return new Float32Array(0);
  if (inputRate === outputRate) return input.slice();
  const ratio = inputRate / outputRate;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const fraction = position - left;
    const start = input[left] ?? 0;
    const end = input[Math.min(left + 1, input.length - 1)] ?? start;
    output[index] = start + (end - start) * fraction;
  }
  return output;
}

export function floatToPcm16(samples: Float32Array): Uint8Array {
  const pcm = new Uint8Array(samples.length * 2);
  const view = new DataView(pcm.buffer);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] || 0));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return pcm;
}

export function takePcmFrames(pending: Float32Array, incoming: Float32Array, frameSamples = ISOLATION_FRAME_SAMPLES): { pending: Float32Array; frames: Uint8Array[] } {
  const merged = new Float32Array(pending.length + incoming.length);
  merged.set(pending, 0);
  merged.set(incoming, pending.length);
  const frames: Uint8Array[] = [];
  let offset = 0;
  while (merged.length - offset >= frameSamples) {
    frames.push(floatToPcm16(merged.subarray(offset, offset + frameSamples)));
    offset += frameSamples;
  }
  return { pending: new Float32Array(merged.subarray(offset)), frames };
}
