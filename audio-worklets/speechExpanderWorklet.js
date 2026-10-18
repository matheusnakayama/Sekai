function speechExpanderGain(rms, threshold, ratio, floor) {
  if (!Number.isFinite(rms) || rms <= 0) return floor;
  if (rms >= threshold) return 1;
  const reduced = Math.pow(rms / threshold, Math.max(0, ratio - 1));
  if (reduced < floor) return floor;
  if (reduced > 1) return 1;
  return reduced;
}

class SekaiSpeechExpander extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const settings = options.processorOptions || {};
    this.threshold = Number.isFinite(settings.threshold) ? settings.threshold : 0.007;
    this.ratio = Number.isFinite(settings.ratio) ? settings.ratio : 2.2;
    this.floor = Number.isFinite(settings.floor) ? settings.floor : 0.4;
    this.attack = Number.isFinite(settings.attack) ? settings.attack : 0.004;
    this.release = Number.isFinite(settings.release) ? settings.release : 0.35;
    this.env = 0;
    this.gain = 1;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0] || !output || !output[0]) return true;
    const frames = input[0].length;
    const channels = Math.min(input.length, output.length);
    let sum = 0;
    let count = 0;
    for (let channel = 0; channel < channels; channel++) {
      const samples = input[channel];
      if (!samples) continue;
      for (let i = 0; i < samples.length; i++) {
        sum += samples[i] * samples[i];
        count++;
      }
    }
    const rms = count ? Math.sqrt(sum / count) : 0;
    const follow = rms > this.env ? 0.55 : 0.12;
    this.env += (rms - this.env) * follow;
    const target = speechExpanderGain(this.env, this.threshold, this.ratio, this.floor);
    const seconds = target > this.gain ? this.attack : this.release;
    const coeff = 1 - Math.exp(-1 / (sampleRate * seconds));
    for (let i = 0; i < frames; i++) {
      this.gain += (target - this.gain) * coeff;
      for (let channel = 0; channel < channels; channel++) {
        const samples = input[channel];
        const destination = output[channel];
        if (!samples || !destination) continue;
        destination[i] = samples[i] * this.gain;
      }
    }
    return true;
  }
}

registerProcessor("sekai-speech-expander", SekaiSpeechExpander);
