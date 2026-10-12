// ambient.mjs
//
// A loopable seeded ambient/music bed, plus a duck-under-cue helper.
//
// Deliberately modest: buildAmbientBed renders one seeded, slightly-detuned
// pad or drone voice (from ../voice/presets.mjs's ambientPad/droneNoiseBed)
// and marks it as a loop, rather than assembling a generative composition
// out of the drone/flow/regime layers under ../generative/. That is a scope
// choice, tracking the same "keep the ambient/music bed modest" note this
// package's own generative core is being independently developed further
// under (a richer seeded performance-spec/event-stream engine, upstream of
// this fiber) -- and it is exactly why this bed is played through the same
// ../web/audio-engine.mjs schedule()/playSpec() seam every other cue in this
// kit uses: a {durationSec, notes} CueRender is a {durationSec, notes} spec
// either way, so swapping this bed's single-voice builder for a real
// multi-voice performance-spec stream later needs no change on the playback
// side, only here.
//
// Looping caveat, stated plainly rather than glossed over: ../voice/voice.mjs's
// presets already have a slow attack and a slow release (ambientPad: 4s/5s;
// droneNoiseBed: 3s/3s), which keeps both ends of the rendered buffer close
// to silence -- but "close to" is not "exactly," so a native
// AudioBufferSourceNode.loop=true replay of one render is not a
// mathematically seamless loop point. In practice, at these attack/release
// times, the discontinuity is well below what a bed sitting under game
// sound effects reads as audible; a true seamless loop (cross-faded tail
// into head, or a loop rendered as an exact integer number of cycles) is a
// refinement left for whenever this bed's single-voice implementation is
// replaced by the richer engine referenced above.

import { ambientPad, droneNoiseBed } from '../voice/presets.mjs';
import { nextRange, nextInt } from '@red-cup-engineering/music-engineering-services-section/src/generative/random.mjs';
import { resolveIntensity } from './primitives.mjs';

/**
 * @param {{state:number}} rng
 * @param {object} [opts]
 * @param {'pad'|'drone'} [opts.mood='pad']
 * @param {number|'minor'|'major'|'epic'|'default'} [opts.intensity]
 * @returns {{durationSec:number, notes:Array<{atSec:number, voice:object, loop:boolean}>}}
 */
export function buildAmbientBed(rng, opts = {}) {
  const level = resolveIntensity(opts.intensity);
  const base = opts.mood === 'drone' ? droneNoiseBed : ambientPad;
  const detune = 1 + nextRange(rng, -0.012, 0.012);
  const voice = {
    ...base,
    freqHz: base.freqHz * detune,
    gain: base.gain * (0.6 + 0.5 * level),
    seed: nextInt(rng, 0, 1e9),
  };
  return { durationSec: voice.durationSec, notes: [{ atSec: 0, voice, loop: true }] };
}

/**
 * Ducks the 'ambient' channel under a big cue and schedules its own
 * recovery, sized to the cue's own rendered duration -- callers don't need
 * to know or guess how long a cue lasts to duck sensibly under it. This
 * calls straight through to ../web/audio-engine.mjs's duckChannel (AudioParam
 * automation scheduled at call time, no JS timer); it is a no-op if the
 * engine is silent, exactly as duckChannel itself already is.
 * @param {object} engine - an engine from ../web/audio-engine.mjs's createAudioEngine
 * @param {{durationSec:number}} cueRender - typically the result of resolving the cue that's about to play
 * @param {object} [duckOpts]
 * @param {number} [duckOpts.toGain=0.35]
 * @param {number} [duckOpts.attackSec=0.08]
 * @param {number} [duckOpts.releaseSec=0.5]
 */
export function duckAmbientForCue(engine, cueRender, duckOpts = {}) {
  const attackSec = duckOpts.attackSec ?? 0.08;
  const releaseSec = duckOpts.releaseSec ?? 0.5;
  const holdSec = Math.max(0, (cueRender.durationSec ?? 0) - attackSec - releaseSec);
  engine.duckChannel('ambient', {
    toGain: duckOpts.toGain ?? 0.35,
    attackSec,
    holdSec,
    releaseSec,
  });
}
