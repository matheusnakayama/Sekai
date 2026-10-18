import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CLEAN_MAKEUP_GAIN,
  RAW_MAKEUP_GAIN,
  SPEECH_EXPANDER_FLOOR,
  SPEECH_EXPANDER_THRESHOLD,
  SPEECH_HIGHPASS_HZ,
  SPEECH_SAMPLE_RATE,
  estimateDelaySamples,
  measureVoiceCleanup,
  microphoneMakeup,
  regionRms,
  renderNoisySpeech,
  speechExpanderGain,
} from "../lib/speechCleanup.ts";

test("the expander keeps speech and ducks only the quiet residue", () => {
  assert.equal(speechExpanderGain(0), SPEECH_EXPANDER_FLOOR);
  assert.equal(speechExpanderGain(Number.NaN), SPEECH_EXPANDER_FLOOR);
  assert.equal(speechExpanderGain(-0.2), SPEECH_EXPANDER_FLOOR);
  assert.equal(speechExpanderGain(SPEECH_EXPANDER_THRESHOLD), 1);
  assert.equal(speechExpanderGain(SPEECH_EXPANDER_THRESHOLD * 3), 1);
  const mid = speechExpanderGain(SPEECH_EXPANDER_THRESHOLD / 2);
  const quieter = speechExpanderGain(SPEECH_EXPANDER_THRESHOLD / 8);
  assert.ok(mid < 1);
  assert.ok(mid >= SPEECH_EXPANDER_FLOOR);
  assert.ok(quieter >= SPEECH_EXPANDER_FLOOR);
  assert.ok(quieter < mid);
});

test("neural cleanup keeps the makeup that lifts a distant voice", () => {
  assert.equal(microphoneMakeup("gtcrn"), CLEAN_MAKEUP_GAIN);
  assert.equal(microphoneMakeup("rnnoise"), CLEAN_MAKEUP_GAIN);
  assert.equal(microphoneMakeup("highpass"), RAW_MAKEUP_GAIN);
  assert.ok(RAW_MAKEUP_GAIN < CLEAN_MAKEUP_GAIN);
  assert.ok(SPEECH_HIGHPASS_HZ >= 70 && SPEECH_HIGHPASS_HZ <= 120);
});

test("the expander worklet uses the same gain curve", () => {
  const worklet = readFileSync(new URL("../audio-worklets/speechExpanderWorklet.js", import.meta.url), "utf8");
  assert.match(worklet, /registerProcessor\("sekai-speech-expander"/);
  assert.match(worklet, /Math\.pow\(rms \/ threshold, Math\.max\(0, ratio - 1\)\)/);
});

test("the probe vowel is louder than the constant hiss", () => {
  const signal = renderNoisySpeech();
  const noise = regionRms(signal, SPEECH_SAMPLE_RATE, 0.9, 1.5);
  const speech = regionRms(signal, SPEECH_SAMPLE_RATE, 1.75, 2.65);
  assert.ok(noise && speech);
  assert.ok(speech > noise * 2);
});

test("cleanup measurement lines up a delayed copy and reports the noise drop", () => {
  const input = renderNoisySpeech();
  const delay = 960;
  const output = new Float32Array(input.length + delay);
  for (let i = 0; i < input.length; i++) output[i + delay] = i < input.length ? input[i] * (i / input.length > 0.45 && i / input.length < 0.75 ? 1 : 0.25) : 0;
  assert.ok(Math.abs(estimateDelaySamples(input, output, SPEECH_SAMPLE_RATE) - delay) <= SPEECH_SAMPLE_RATE / 200);
  const report = measureVoiceCleanup(input, output, SPEECH_SAMPLE_RATE);
  assert.ok(report);
  assert.ok(report.noiseReductionDb > 8);
  assert.ok(report.speechRetention > 0.7);
});
