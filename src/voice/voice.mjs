// voice.mjs -- the synthesis core: a "voice" is DATA (a plain,
// JSON-serializable VoiceParams object), and renderVoice(params) is a pure
// function from that object to a deterministic stereo sample buffer. Games
// ship voice presets (./presets.mjs), never bespoke oscillator-wiring code.
// The browser-side WebAudio adapter (../web/webaudio-adapter.mjs) builds an
// AudioContext graph from the same VoiceParams shape. DSP primitives come
// from @red-cup-engineering/audio-services-section; nothing here
// reimplements DSP, it only sequences it per-sample from params.

import { makeOscillator, advanceOscillator, PARTIAL_PRESETS, generatePartials } from "@red-cup-engineering/computer-audio-engineering-services-section/oscillator";
import { makeEnvelope, triggerAttack, triggerRelease, envelopeValueAt } from "@red-cup-engineering/computer-audio-engineering-services-section/envelope";
import { computeBiquadCoeffs, makeBiquad, processBiquad, makeOnePoleLowpass, processOnePole } from "@red-cup-engineering/computer-audio-engineering-services-section/filter";
import { equalPowerPan } from "@red-cup-engineering/computer-audio-engineering-services-section/mixer";
import { saturate } from "@red-cup-engineering/computer-audio-engineering-services-section/saturation";
import { makeKarplusString, advanceKarplusString } from "@red-cup-engineering/computer-audio-engineering-services-section/karplus-strong";
import { makeBowBreathVoice, triggerBowBreathAttack, triggerBowBreathRelease, advanceBowBreathVoice, BOW_BREATH_SHAPES } from "@red-cup-engineering/computer-audio-engineering-services-section/bow-breath-voice";
import { makeRng, nextRange } from '@red-cup-engineering/music-engineering-services-section/src/generative/random.mjs';

const DEFAULT_SAMPLE_RATE = 44100;

/** Resolves a source.partials field (name | generator opts | explicit array) to a {ratio,amp}[] array. */
function resolvePartials(partialsField) {
  if (Array.isArray(partialsField)) return partialsField;
  if (typeof partialsField === 'string') return PARTIAL_PRESETS[partialsField] || PARTIAL_PRESETS.warmPad;
  if (partialsField && typeof partialsField === 'object') return generatePartials(partialsField);
  return PARTIAL_PRESETS.warmPad;
}

/** Resolves a bow-breath source.shape field (name | explicit shape object). */
function resolveBowBreathShape(shapeField) {
  if (typeof shapeField === 'string') return BOW_BREATH_SHAPES[shapeField] || BOW_BREATH_SHAPES.flute;
  if (shapeField && typeof shapeField === 'object') return shapeField;
  return BOW_BREATH_SHAPES.flute;
}

/** Builds a deterministic seeded white-noise sample generator for exciters/noise-mix. */
function makeSeededNoiseSample(rng) {
  return () => nextRange(rng, -1, 1);
}

/**
 * Renders one voice from a VoiceParams object into a deterministic stereo
 * buffer. Pure function of `params` and the render options: the same
 * inputs always produce byte-identical Float32Arrays -- every source of
 * randomness (noise exciters, noise-mix texture) is drawn from a
 * makeRng(params.seed ?? 0) instance created fresh on every call, never
 * from Math.random or any other ambient state.
 *
 * @typedef {object} VoiceParams
 * @property {number} freqHz - fundamental (ignored by pure-noise sources)
 * @property {number} durationSec - total render length
 * @property {object} source
 * @property {'sine'|'triangle'|'additive'|'noise'|'karplus-strong'|'bow-breath'} source.type
 * @property {string|{count:number,rolloffExponent?:number,oddEvenBias?:number}|Array<{ratio:number,amp:number}>} [source.partials] - additive only; a PARTIAL_PRESETS name, generatePartials() opts, or an explicit array; defaults to 'warmPad'
 * @property {'white'|'filtered'} [source.color] - noise only; defaults to 'white'
 * @property {number} [source.cutoffHz] - noise 'filtered' lowpass cutoff, default 2000
 * @property {number} [source.decay] - karplus-strong only, passed to makeKarplusString
 * @property {number} [source.dampingHz] - karplus-strong only
 * @property {number} [source.exciteGain] - karplus-strong only
 * @property {string|object} [source.shape] - bow-breath only; a BOW_BREATH_SHAPES name or explicit shape
 * @property {object} envelope
 * @property {number} envelope.attackSec
 * @property {number} envelope.releaseSec
 * @property {number} envelope.sustainLevel
 * @property {number} [envelope.curve]
 * @property {number} [envelope.releaseAtSec] - absolute trigger time; default durationSec - releaseSec, clamped >= 0
 * @property {{type:'lowpass'|'highpass'|'bandpass', cutoffHz:number, Q?:number}} [filter]
 * @property {{amount:number, cutoffHz?:number}} [noiseMix] - blends seeded filtered noise under the tonal source; amount in [0,1]
 * @property {{drive?:number, asymmetryBias?:number, mix?:number}} [saturation]
 * @property {number} [gain] - linear, default 0.3
 * @property {number} [pan] - -1..1 static equal-power pan, default 0
 * @property {number} [sampleRate] - default 44100
 * @property {number|string} [seed] - seeds noise/exciter determinism, default 0
 *
 * @param {VoiceParams} params
 * @param {object} [opts]
 * @param {number} [opts.sampleRate] - overrides params.sampleRate
 * @returns {{sampleRate:number, durationSec:number, numSamples:number, left:Float32Array, right:Float32Array}}
 */
export function renderVoice(params, opts = {}) {
  if (!params || typeof params !== 'object') throw new TypeError('renderVoice: params must be an object');
  if (!Number.isFinite(params.durationSec) || params.durationSec <= 0) {
    throw new TypeError('renderVoice: params.durationSec must be a positive number');
  }
  const sampleRate = opts.sampleRate ?? params.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const numSamples = Math.max(1, Math.round(params.durationSec * sampleRate));
  const rng = makeRng(params.seed ?? 0);
  const noiseSample = makeSeededNoiseSample(rng);

  const source = params.source || { type: 'sine' };
  const freqHz = Number.isFinite(params.freqHz) ? params.freqHz : 440;

  // -- source setup --------------------------------------------------
  let osc = null;
  let karplus = null;
  let bowBreath = null;
  let noiseFilter = null;

  switch (source.type) {
    case 'sine':
    case 'triangle':
      osc = makeOscillator({ freqHz, sampleRate, waveform: source.type });
      break;
    case 'additive':
      osc = makeOscillator({ freqHz, sampleRate, waveform: 'additive', partials: resolvePartials(source.partials) });
      break;
    case 'noise':
      if (source.color === 'filtered') {
        noiseFilter = makeOnePoleLowpass(source.cutoffHz ?? 2000, sampleRate);
      }
      break;
    case 'karplus-strong':
      karplus = makeKarplusString({
        freqHz,
        sampleRate,
        decay: source.decay,
        dampingHz: source.dampingHz,
        exciteGain: source.exciteGain,
        exciteSample: noiseSample,
      });
      break;
    case 'bow-breath':
      bowBreath = makeBowBreathVoice({
        freqHz,
        sampleRate,
        partials: resolvePartials(source.partials),
        shape: resolveBowBreathShape(source.shape),
        noiseSample,
      });
      break;
    default:
      throw new TypeError(`renderVoice: unknown source.type "${source.type}"`);
  }

  // -- envelope setup --------------------------------------------------
  const envSpec = params.envelope || {};
  const env = makeEnvelope({
    attackSec: envSpec.attackSec ?? 0.02,
    releaseSec: envSpec.releaseSec ?? 0.3,
    sustainLevel: envSpec.sustainLevel ?? 0.8,
    curve: envSpec.curve,
  });
  const releaseAtSec = Math.max(0, envSpec.releaseAtSec ?? params.durationSec - env.releaseSec);
  triggerAttack(env, 0);
  if (bowBreath) triggerBowBreathAttack(bowBreath, 0);
  let released = false;

  // -- filter setup --------------------------------------------------
  let biquad = null;
  if (params.filter) {
    biquad = makeBiquad(computeBiquadCoeffs({
      type: params.filter.type,
      cutoffHz: params.filter.cutoffHz,
      Q: params.filter.Q ?? 0.707,
      sampleRate,
    }));
  }

  let noiseMixFilter = null;
  if (params.noiseMix && params.noiseMix.amount > 0) {
    noiseMixFilter = makeOnePoleLowpass(params.noiseMix.cutoffHz ?? 3000, sampleRate);
  }

  const gain = params.gain ?? 0.3;
  const { left: panL, right: panR } = equalPowerPan(params.pan ?? 0);
  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const tSec = i / sampleRate;
    if (!released && tSec >= releaseAtSec) {
      triggerRelease(env, tSec);
      if (bowBreath) triggerBowBreathRelease(bowBreath, tSec);
      released = true;
    }

    // raw source sample
    let raw;
    if (osc) {
      raw = advanceOscillator(osc);
    } else if (karplus) {
      raw = advanceKarplusString(karplus);
    } else if (bowBreath) {
      raw = advanceBowBreathVoice(bowBreath, tSec);
    } else {
      // pure noise source
      const n = noiseSample();
      raw = noiseFilter ? processOnePole(noiseFilter, n) : n;
    }

    // optional filter (skipped for the pure-noise source, which already
    // has its own color knob above rather than a second filter stage)
    let shaped = biquad ? processBiquad(biquad, raw) : raw;

    // optional tone+noise blend (attack "chiff"/click texture)
    if (noiseMixFilter) {
      const n = processOnePole(noiseMixFilter, noiseSample());
      const amount = params.noiseMix.amount;
      shaped = shaped * (1 - amount) + n * amount;
    }

    // optional saturation
    if (params.saturation) shaped = saturate(shaped, params.saturation);

    // bow-breath already carries its own internal amplitude envelope
    // (advanceBowBreathVoice multiplies by voice.envelope's level before
    // returning) -- applying the outer params.envelope on top of that
    // would double-envelope the signal, so the outer envelope is a no-op
    // (level 1) for this source type. Every other source type is a raw,
    // un-enveloped signal at this point and gets the outer envelope here.
    let envLevel = 1;
    if (!bowBreath) {
      const elapsed = tSec - env.stageStartTime;
      envLevel = envelopeValueAt(env, elapsed);
    }
    const sample = shaped * envLevel * gain;

    left[i] = sample * panL;
    right[i] = sample * panR;
  }

  return { sampleRate, durationSec: params.durationSec, numSamples, left, right };
}
