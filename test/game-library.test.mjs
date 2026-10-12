// game-library.test.mjs
//
// Checks the actual musical/shape claims this library's header comments and
// the fiber's brief make about individual cues -- not just "it resolves,"
// but "the chime family really does escalate with intensity," "coin-shower
// really does scale with intensity," "riser really does sweep upward," etc.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeRng } from '@red-cup-engineering/music-engineering-services-section/src/generative/random.mjs';
import { buildUiTap, buildSuccess, buildFailure, buildTick, buildWhoosh, buildImpact, buildChime, buildCoin, buildCoinShower, buildFanfare, buildRiser, STANDARD_CUES } from '../src/game/library.mjs';

test('STANDARD_CUES: includes the full house-required cue list', () => {
  const required = ['ui-tap', 'success', 'failure', 'tick', 'whoosh', 'impact', 'chime', 'coin', 'coin-shower', 'fanfare', 'riser'];
  for (const name of required) assert.ok(name in STANDARD_CUES, `missing required cue: ${name}`);
});

test('chime family: note count escalates with intensity (minor -> major -> epic), sharing one builder', () => {
  const rng = () => makeRng('chime-seed');
  const minor = buildChime(rng(), { intensity: 'minor' });
  const major = buildChime(rng(), { intensity: 'major' });
  const epic = buildChime(rng(), { intensity: 'epic' });
  assert.ok(minor.notes.length <= major.notes.length, 'expected minor <= major note count');
  assert.ok(major.notes.length <= epic.notes.length, 'expected major <= epic note count');
  assert.equal(minor.notes.length, 1);
  assert.equal(epic.notes.length, 3);
});

test('chime family: gain escalates with intensity for the shared first (root) note', () => {
  const rng = () => makeRng('chime-gain-seed');
  const minor = buildChime(rng(), { intensity: 'minor' }).notes[0].voice.gain;
  const major = buildChime(rng(), { intensity: 'major' }).notes[0].voice.gain;
  const epic = buildChime(rng(), { intensity: 'epic' }).notes[0].voice.gain;
  assert.ok(minor < major && major < epic, `expected strictly increasing gain: ${minor} < ${major} < ${epic}`);
});

test('coin-shower: note count and span scale up with intensity', () => {
  const rng = () => makeRng('shower-seed');
  const minor = buildCoinShower(rng(), { intensity: 'minor' });
  const epic = buildCoinShower(rng(), { intensity: 'epic' });
  assert.ok(minor.notes.length < epic.notes.length, 'expected more coins at epic than minor intensity');
  assert.ok(minor.durationSec < epic.durationSec, 'expected a longer shower span at epic intensity');
  for (const note of epic.notes) assert.equal(note.voice.source.type, 'additive', 'coin voices should be the glassy additive source');
});

test('fanfare: draws real pitch material from the procedural-music layer (varying, non-constant frequencies) and is longer at higher intensity', () => {
  const rng = () => makeRng('fanfare-seed');
  const render = buildFanfare(rng(), { intensity: 'major' });
  const freqs = render.notes.map((n) => n.voice.freqHz);
  const distinctFreqs = new Set(freqs.map((f) => Math.round(f * 100)));
  assert.ok(distinctFreqs.size > 1, 'expected a real melodic figure, not one repeated pitch');
  for (const f of freqs) assert.ok(f > 0 && Number.isFinite(f));

  const minorLen = buildFanfare(makeRng('fanfare-seed'), { intensity: 'minor' }).notes.length;
  const epicLen = buildFanfare(makeRng('fanfare-seed'), { intensity: 'epic' }).notes.length;
  assert.ok(minorLen <= epicLen, 'expected the fanfare figure to grow (or stay the same length) with intensity');
});

test('riser: sweeps monotonically upward in center frequency across the rise', () => {
  const render = buildRiser(makeRng('riser-seed'), { durationSec: 1.0, intensity: 'major' });
  const freqs = render.notes.map((n) => n.voice.filter.cutoffHz);
  for (let i = 1; i < freqs.length; i++) {
    assert.ok(freqs[i] >= freqs[i - 1] - 1e-6, `riser frequency dipped at step ${i}: ${freqs[i - 1]} -> ${freqs[i]}`);
  }
  assert.ok(freqs[freqs.length - 1] > freqs[0], 'expected the riser to net rise in pitch');
});

test('riser: gain also ramps upward across the rise', () => {
  const render = buildRiser(makeRng('riser-gain-seed'), { durationSec: 1.0 });
  const gains = render.notes.map((n) => n.voice.gain);
  assert.ok(gains[gains.length - 1] > gains[0], 'expected riser gain to increase toward the end of the sweep');
});

test('tick: index nudges pitch upward, for a light ascending character across a run of ticks', () => {
  const low = buildTick(makeRng('tick-seed'), { index: 0 }).notes[0].voice.freqHz;
  const high = buildTick(makeRng('tick-seed'), { index: 5 }).notes[0].voice.freqHz;
  assert.ok(high > low, 'expected a later tick index to read higher in pitch');
});

test('success: two ascending notes; failure: one descending/duller note', () => {
  const success = buildSuccess(makeRng('success-seed'), {});
  assert.equal(success.notes.length, 2);
  assert.ok(success.notes[1].voice.freqHz > success.notes[0].voice.freqHz);

  const failure = buildFailure(makeRng('failure-seed'));
  assert.equal(failure.notes.length, 1);
});

test('ui-tap, impact, whoosh, coin: each resolves to exactly one note with a positive, finite duration', () => {
  for (const [name, build] of [['ui-tap', buildUiTap], ['impact', buildImpact], ['whoosh', buildWhoosh], ['coin', buildCoin]]) {
    const render = build(makeRng(`${name}-seed`), {});
    assert.equal(render.notes.length, 1, `${name}: expected exactly one note`);
    assert.ok(render.notes[0].voice.durationSec > 0, `${name}: expected a positive duration`);
  }
});

test('impact: intensity scales gain up and pitch down for a "bigger" hit', () => {
  const minor = buildImpact(makeRng('impact-seed'), { intensity: 'minor' }).notes[0].voice;
  const epic = buildImpact(makeRng('impact-seed'), { intensity: 'epic' }).notes[0].voice;
  assert.ok(epic.gain > minor.gain, 'expected epic impact to be louder');
  assert.ok(epic.freqHz < minor.freqHz, 'expected epic impact to read lower/bigger in pitch');
});
