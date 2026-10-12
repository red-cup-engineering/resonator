import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderVoice } from './voice.mjs';
import { VOICE_PRESETS } from './presets.mjs';
import { estimatePitchHz, zeroCrossingRate, windowedRms, isUnimodal, peakWindowIndex } from '@red-cup-engineering/computer-audio-engineering-services-section/analysis';

const SR = 44100;

test('renderVoice: renders a buffer of the requested duration at the requested sample rate', () => {
  const out = renderVoice({ freqHz: 440, durationSec: 0.5, source: { type: 'sine' }, envelope: { attackSec: 0.01, releaseSec: 0.1, sustainLevel: 0.8 } }, { sampleRate: SR });
  assert.equal(out.sampleRate, SR);
  assert.equal(out.numSamples, Math.round(0.5 * SR));
  assert.equal(out.left.length, out.numSamples);
  assert.equal(out.right.length, out.numSamples);
});

test('renderVoice: determinism -- identical params render byte-identical buffers', () => {
  const params = { freqHz: 330, durationSec: 0.3, seed: 'abc-123', source: { type: 'karplus-strong' }, envelope: { attackSec: 0.002, releaseSec: 0.25, sustainLevel: 1 } };
  const a = renderVoice(params, { sampleRate: SR });
  const b = renderVoice(params, { sampleRate: SR });
  assert.equal(a.left.length, b.left.length);
  for (let i = 0; i < a.left.length; i++) {
    assert.equal(a.left[i], b.left[i], `left sample ${i} differs`);
    assert.equal(a.right[i], b.right[i], `right sample ${i} differs`);
  }
});

test('renderVoice: a noise-sourced voice is NOT deterministic-by-accident -- different seeds actually change the render (guards against a no-op RNG wiring bug)', () => {
  const base = { freqHz: 0, durationSec: 0.2, source: { type: 'noise' }, envelope: { attackSec: 0.001, releaseSec: 0.15, sustainLevel: 1 } };
  const a = renderVoice({ ...base, seed: 1 }, { sampleRate: SR });
  const b = renderVoice({ ...base, seed: 2 }, { sampleRate: SR });
  let differs = false;
  for (let i = 0; i < a.left.length; i++) {
    if (a.left[i] !== b.left[i]) { differs = true; break; }
  }
  assert.ok(differs, 'two different seeds produced byte-identical noise renders');
});

test('renderVoice: default seed (omitted) is reproducible across calls (no ambient Math.random leakage)', () => {
  const params = { freqHz: 200, durationSec: 0.2, source: { type: 'noise' }, envelope: { attackSec: 0.001, releaseSec: 0.15, sustainLevel: 1 } };
  const a = renderVoice(params, { sampleRate: SR });
  const b = renderVoice(params, { sampleRate: SR });
  assert.deepEqual(Array.from(a.left), Array.from(b.left));
});

test('renderVoice: pitch -- a sine voice at 440Hz measures back to ~440Hz via autocorrelation', () => {
  const out = renderVoice({ freqHz: 440, durationSec: 0.5, source: { type: 'sine' }, envelope: { attackSec: 0.001, releaseSec: 0.05, sustainLevel: 1 } }, { sampleRate: SR });
  // measure over the steady sustain region, away from attack/release edges
  const mid = out.left.subarray(Math.floor(0.1 * SR), Math.floor(0.35 * SR));
  const measured = estimatePitchHz(mid, SR);
  assert.ok(Math.abs(measured - 440) < 5, `expected ~440Hz, got ${measured}Hz`);
});

test('renderVoice: pitch -- an additive voice at 220Hz measures back to ~220Hz, and zero-crossing rate roughly agrees', () => {
  const out = renderVoice({ freqHz: 220, durationSec: 0.5, source: { type: 'additive', partials: 'warmPad' }, envelope: { attackSec: 0.001, releaseSec: 0.05, sustainLevel: 1 } }, { sampleRate: SR });
  const mid = out.left.subarray(Math.floor(0.1 * SR), Math.floor(0.35 * SR));
  const measured = estimatePitchHz(mid, SR);
  assert.ok(Math.abs(measured - 220) < 5, `expected ~220Hz, got ${measured}Hz`);
  const zcr = zeroCrossingRate(mid, SR) / 2;
  assert.ok(Math.abs(zcr - 220) < 40, `zero-crossing cross-check too far off: ${zcr}Hz`);
});

test('renderVoice: pitch tracks freqHz across several frequencies (a generalization check, not one magic number)', () => {
  for (const freqHz of [110, 261.63, 523.25, 880]) {
    const out = renderVoice({ freqHz, durationSec: 0.3, source: { type: 'sine' }, envelope: { attackSec: 0.001, releaseSec: 0.02, sustainLevel: 1 } }, { sampleRate: SR });
    const mid = out.left.subarray(Math.floor(0.05 * SR), Math.floor(0.2 * SR));
    const measured = estimatePitchHz(mid, SR, { minHz: 40, maxHz: 2000 });
    const errFrac = Math.abs(measured - freqHz) / freqHz;
    assert.ok(errFrac < 0.02, `freqHz=${freqHz}: measured ${measured}, error fraction ${errFrac}`);
  }
});

test('renderVoice: envelope shape -- a fast-attack/release preset (uiClick) rises then falls (unimodal amplitude trace)', () => {
  const out = renderVoice(VOICE_PRESETS.uiClick, { sampleRate: SR });
  const mono = out.left; // pan is 0, so left carries the full signal at equal-power center gain
  const trace = windowedRms(mono, SR, 0.003);
  assert.ok(isUnimodal(trace, 0.08), 'uiClick envelope trace is not unimodal (rise then fall)');
  // peak should land near the start, not the end, for a fast-attack/fast-release click
  const peakIdx = peakWindowIndex(trace);
  assert.ok(peakIdx < trace.length * 0.5, `uiClick peak at window ${peakIdx}/${trace.length}, expected early`);
});

test('renderVoice: envelope shape -- a slow pad (ambientPad) has silence at the very start and rises smoothly', () => {
  const out = renderVoice(VOICE_PRESETS.ambientPad, { sampleRate: SR });
  const trace = windowedRms(out.left, SR, 0.25);
  assert.ok(trace[0] < trace[trace.length > 4 ? 4 : trace.length - 1], 'ambientPad does not rise from near-silence at onset');
  assert.ok(isUnimodal(trace, 0.1), 'ambientPad envelope trace is not unimodal (rise then fall)');
});

test('renderVoice: envelope shape -- releaseAtSec truncates sustain and forces release earlier than the default', () => {
  const base = { freqHz: 440, durationSec: 1, source: { type: 'sine' }, envelope: { attackSec: 0.01, releaseSec: 0.3, sustainLevel: 1 } };
  const early = renderVoice({ ...base, envelope: { ...base.envelope, releaseAtSec: 0.1 } }, { sampleRate: SR });
  const late = renderVoice(base, { sampleRate: SR }); // default releaseAtSec = durationSec - releaseSec = 0.7
  const earlyTrace = windowedRms(early.left, SR, 0.05);
  const lateTrace = windowedRms(late.left, SR, 0.05);
  // at t=0.5s (window index 10 @ 0.05s windows), the early-release voice should already be much quieter
  assert.ok(earlyTrace[10] < lateTrace[10] * 0.5, `expected early release to be quieter by t=0.5s: early=${earlyTrace[10]}, late=${lateTrace[10]}`);
});

test('renderVoice: gain scales output linearly', () => {
  const params = { freqHz: 440, durationSec: 0.2, source: { type: 'sine' }, envelope: { attackSec: 0.001, releaseSec: 0.15, sustainLevel: 1 } };
  const quiet = renderVoice({ ...params, gain: 0.1 }, { sampleRate: SR });
  const loud = renderVoice({ ...params, gain: 0.4 }, { sampleRate: SR });
  const quietPeak = Math.max(...quiet.left.map(Math.abs));
  const loudPeak = Math.max(...loud.left.map(Math.abs));
  assert.ok(Math.abs(loudPeak / quietPeak - 4) < 0.05, `expected ~4x peak ratio, got ${loudPeak / quietPeak}`);
});

test('renderVoice: pan -- hard left/right produce silence in the opposite channel', () => {
  const params = { freqHz: 440, durationSec: 0.1, source: { type: 'sine' }, envelope: { attackSec: 0.001, releaseSec: 0.08, sustainLevel: 1 } };
  const left = renderVoice({ ...params, pan: -1 }, { sampleRate: SR });
  const right = renderVoice({ ...params, pan: 1 }, { sampleRate: SR });
  const rightChannelOfLeftPan = Math.max(...left.right.map(Math.abs));
  const leftChannelOfRightPan = Math.max(...right.left.map(Math.abs));
  assert.ok(rightChannelOfLeftPan < 1e-9, `hard-left pan leaked into right channel: ${rightChannelOfLeftPan}`);
  assert.ok(leftChannelOfRightPan < 1e-9, `hard-right pan leaked into left channel: ${leftChannelOfRightPan}`);
});

test('renderVoice: every preset in VOICE_PRESETS renders without throwing, non-silent, and finite', () => {
  for (const [name, preset] of Object.entries(VOICE_PRESETS)) {
    const out = renderVoice(preset, { sampleRate: SR });
    let peak = 0;
    let allFinite = true;
    for (let i = 0; i < out.left.length; i++) {
      if (!Number.isFinite(out.left[i]) || !Number.isFinite(out.right[i])) allFinite = false;
      peak = Math.max(peak, Math.abs(out.left[i]), Math.abs(out.right[i]));
    }
    assert.ok(allFinite, `${name}: produced non-finite samples`);
    assert.ok(peak > 0, `${name}: rendered silence`);
    assert.ok(peak < 1.5, `${name}: peak ${peak} looks unbounded/blown up`);
  }
});

test('renderVoice: rejects a missing/invalid durationSec', () => {
  assert.throws(() => renderVoice({ freqHz: 440, source: { type: 'sine' }, envelope: {} }), TypeError);
  assert.throws(() => renderVoice({ freqHz: 440, durationSec: -1, source: { type: 'sine' }, envelope: {} }), TypeError);
});

test('renderVoice: rejects an unknown source.type', () => {
  assert.throws(() => renderVoice({ freqHz: 440, durationSec: 0.1, source: { type: 'kazoo' }, envelope: {} }), TypeError);
});
