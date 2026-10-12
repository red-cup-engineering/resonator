// game-index.test.mjs
//
// Checks ../src/game/index.mjs's createGameAudio: pure preview mode with no
// engine, real scheduling through an injected engine, defineCue overrides,
// the 'ambient-bed'/'reveal' cues the default registry layers on top of
// STANDARD_CUES, and -- the two integration seams this fiber's brief and
// its coordination note both call out -- that createGameAudio()'s own
// return value already satisfies the {play(cueId, opts)} shape a consumer's
// injected-player interface expects, and that toPlayerInterface() narrows
// to exactly that shape with no translation logic.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createGameAudio, toPlayerInterface } from '../src/game/index.mjs';

test('createGameAudio: with no engine, play() is pure preview -- returns the bare CueRender, plays nothing', () => {
  const gameAudio = createGameAudio();
  const result = gameAudio.play('ui-tap', { seed: 'preview-seed' });
  assert.ok(Array.isArray(result.notes));
  assert.ok(result.durationSec > 0);
});

test('createGameAudio: with an engine, play() schedules through it and returns {cueRender, handles}', () => {
  const scheduled = [];
  const fakeEngine = {
    schedule(events, opts) {
      scheduled.push({ events, opts });
      return events.map(() => ({ fake: 'handle' }));
    },
  };
  const gameAudio = createGameAudio({ engine: fakeEngine });
  const result = gameAudio.play('chime', { seed: 's1', intensity: 'epic', channel: 'music' });

  assert.ok(result.cueRender.notes.length > 0);
  assert.equal(result.handles.length, result.cueRender.notes.length);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].opts.channel, 'music');
  assert.deepEqual(scheduled[0].events, result.cueRender.notes);
});

test('createGameAudio: play() defaults to the sfx channel when none is given', () => {
  const scheduled = [];
  const fakeEngine = { schedule: (events, opts) => { scheduled.push(opts); return []; } };
  const gameAudio = createGameAudio({ engine: fakeEngine });
  gameAudio.play('ui-tap');
  assert.equal(scheduled[0].channel, 'sfx');
});

test('createGameAudio: listCues() includes the standard library plus \'ambient-bed\' and \'reveal\'', () => {
  const gameAudio = createGameAudio();
  const cues = gameAudio.listCues();
  assert.ok(cues.includes('chime'));
  assert.ok(cues.includes('ambient-bed'));
  assert.ok(cues.includes('reveal'));
});

test('createGameAudio: \'reveal\' plays the fuller riser-with-outcome primitive, distinct from the plain \'riser\' cue', () => {
  const gameAudio = createGameAudio();
  const reveal = gameAudio.resolve('reveal', { seed: 'x', outcome: 'win', durationSec: 1.0 });
  const riser = gameAudio.resolve('riser', { seed: 'x', durationSec: 1.0 });
  assert.notEqual(reveal.notes.length, riser.notes.length, 'reveal should have extra resolution notes beyond the plain riser');
});

test('createGameAudio: defineCue registers a custom cue that plays like any other', () => {
  const gameAudio = createGameAudio();
  gameAudio.defineCue('custom', () => ({ durationSec: 0.5, notes: [{ atSec: 0, voice: { freqHz: 500, durationSec: 0.5, source: { type: 'sine' }, envelope: {} } }] }));
  const result = gameAudio.play('custom');
  assert.equal(result.notes.length, 1);
  assert.equal(result.notes[0].voice.freqHz, 500);
});

test('createGameAudio: an explicit `cues` option replaces the default set entirely', () => {
  const gameAudio = createGameAudio({ cues: { onlyOne: () => ({ durationSec: 0.1, notes: [] }) } });
  assert.deepEqual(gameAudio.listCues(), ['onlyOne']);
  assert.throws(() => gameAudio.resolve('chime'));
});

test('duckForCue: forwards to the engine when present, no-ops without one', () => {
  const duckCalls = [];
  const fakeEngine = { schedule: () => [], duckChannel: (ch, opts) => duckCalls.push({ ch, opts }) };
  const gameAudio = createGameAudio({ engine: fakeEngine });
  gameAudio.duckForCue({ durationSec: 1 }, { toGain: 0.4 });
  assert.equal(duckCalls.length, 1);
  assert.equal(duckCalls[0].ch, 'ambient');

  const noEngineGameAudio = createGameAudio();
  assert.doesNotThrow(() => noEngineGameAudio.duckForCue({ durationSec: 1 }));
});

// -- the {play(cueId, opts)} integration seam --------------------------------

test('integration seam: createGameAudio()\'s own return value already satisfies {play(cueId, opts)} with no adapter', () => {
  const fakeEngine = { schedule: (events) => events.map(() => ({})) };
  const gameAudio = createGameAudio({ engine: fakeEngine });
  /** @type {{play(cueId:string, opts?:object): object}} */
  const player = gameAudio; // no wrapping at all
  const result = player.play('impact', { seed: 'p1' });
  assert.ok(result.cueRender);
});

test('integration seam: toPlayerInterface() narrows to exactly {play}, delegating to the same play()', () => {
  const fakeEngine = { schedule: (events) => events.map(() => ({})) };
  const gameAudio = createGameAudio({ engine: fakeEngine });
  const player = toPlayerInterface(gameAudio);
  assert.deepEqual(Object.keys(player), ['play']);
  const viaPlayer = player.play('coin', { seed: 'p2' });
  const viaGameAudio = gameAudio.play('coin', { seed: 'p2' });
  assert.deepEqual(viaPlayer.cueRender, viaGameAudio.cueRender);
});
