const TARGET_RMS = 0.11;
const MAX_GAIN = 32;
const MIN_GAIN = 0.4;
const SILENCE_RMS = 0.0018;

class SekaiSpeechLeveler extends AudioWorkletProcessor {
  constructor() {
    super();
    this.envelope = 0.02;
    this.gain = 1;
  }

  static get parameterDescriptors() {
    return [{ name: "preference", defaultValue: 1, minValue: 0, maxValue: 2, automationRate: "k-rate" }];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0] || !output || !output[0]) return true;
    const preference = parameters.preference && parameters.preference.length ? parameters.preference[0] : 1;
    const pref = Math.max(0, Math.min(2, preference));
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
    if (pref <= 0) {
      this.gain = 0;
    } else {
      const target = TARGET_RMS * pref;
      const maxGain = MAX_GAIN * (0.5 + pref * 0.5);
      if (rms >= SILENCE_RMS) {
        const follow = rms > this.envelope ? 0.42 : 0.035;
        this.envelope += (rms - this.envelope) * follow;
      } else {
        this.envelope = this.envelope * 0.99 + SILENCE_RMS * 0.01;
      }
      let desired = this.gain;
      if (rms >= SILENCE_RMS && this.envelope > SILENCE_RMS) desired = target / this.envelope;
      if (desired > maxGain) desired = maxGain;
      if (desired < MIN_GAIN) desired = MIN_GAIN;
      const gainFollow = desired < this.gain ? 0.45 : 0.12;
      this.gain += (desired - this.gain) * gainFollow;
      if (this.gain > maxGain) this.gain = maxGain;
      if (this.gain < 0) this.gain = 0;
    }
    for (let i = 0; i < frames; i++) {
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

registerProcessor("sekai-speech-leveler", SekaiSpeechLeveler);
