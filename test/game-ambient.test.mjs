// game-ambient.test.mjs
//
// Checks ../src/game/ambient.mjs: buildAmbientBed's single-loop-voice shape
// (and its honest, documented looping caveat -- see that module's header),
// and duckAmbientForCue's hold-time sizing against a fake engine that just
// records its duckChannel call.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeRng } from '@red-cup-engineering/music-engineering-services-section/src/generative/random.mjs';
import { buildAmbientBed, duckAmbientForCue } from '../src/game/ambient.mjs';
import { ambientPad, droneNoiseBed } from '../src/voice/presets.mjs';

test('buildAmbientBed: exactly one note, marked loop:true', () => {
  const render = buildAmbientBed(makeRng('bed-seed'));
  assert.equal(render.notes.length, 1);
  assert.equal(render.notes[0].loop, true);
  assert.equal(render.notes[0].atSec, 0);
});

test('buildAmbientBed: defaults to the pad mood, and "drone" selects the noise-bed preset', () => {
  const pad = buildAmbientBed(makeRng('bed-seed'));
  const drone = buildAmbientBed(makeRng('bed-seed'), { mood: 'drone' });
  // freqHz is jittered but stays close to the chosen preset's own freqHz
  assert.ok(Math.abs(pad.notes[0].voice.freqHz - ambientPad.freqHz) < ambientPad.freqHz * 0.02);
  assert.ok(Math.abs(drone.notes[0].voice.freqHz - droneNoiseBed.freqHz) < 1e-6 || droneNoiseBed.freqHz === 0);
  assert.equal(drone.notes[0].voice.source.type, droneNoiseBed.source.type);
});

test('buildAmbientBed: intensity scales gain up', () => {
  const quiet = buildAmbientBed(makeRng('bed-seed'), { intensity: 'minor' }).notes[0].voice.gain;
  const loud = buildAmbientBed(makeRng('bed-seed'), { intensity: 'epic' }).notes[0].voice.gain;
  assert.ok(loud > quiet);
});

test('buildAmbientBed: deterministic for a given seed', () => {
  const a = buildAmbientBed(makeRng('same-seed'), { mood: 'drone', intensity: 'major' });
  const b = buildAmbientBed(makeRng('same-seed'), { mood: 'drone', intensity: 'major' });
  assert.deepEqual(a, b);
});

test('duckAmbientForCue: sizes holdSec to the cue duration minus attack/release, and targets the ambient channel', () => {
  const calls = [];
  const fakeEngine = { duckChannel: (channel, opts) => calls.push({ channel, opts }) };
  duckAmbientForCue(fakeEngine, { durationSec: 2 }, { attackSec: 0.1, releaseSec: 0.4, toGain: 0.25 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].channel, 'ambient');
  assert.equal(calls[0].opts.toGain, 0.25);
  assert.equal(calls[0].opts.attackSec, 0.1);
  assert.equal(calls[0].opts.releaseSec, 0.4);
  assert.ok(Math.abs(calls[0].opts.holdSec - (2 - 0.1 - 0.4)) < 1e-9);
});

test('duckAmbientForCue: never produces a negative holdSec for a very short cue', () => {
  const calls = [];
  const fakeEngine = { duckChannel: (channel, opts) => calls.push(opts) };
  duckAmbientForCue(fakeEngine, { durationSec: 0.05 });
  assert.ok(calls[0].holdSec >= 0);
});
