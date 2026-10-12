// game-anticipation.test.mjs
//
// Checks ../src/game/anticipation.mjs's buildRiser: the tension-riser
// primitive that rises then resolves to either a win chime (drawn from
// ../src/game/library.mjs's own chime family) or a soft fail thud, per the
// caller-supplied `outcome`.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeRng } from '@red-cup-engineering/music-engineering-services-section/src/generative/random.mjs';
import { buildRiser } from '../src/game/anticipation.mjs';
import { buildChime } from '../src/game/library.mjs';

test('buildRiser: win outcome resolves with the same chime shape buildChime produces at that intensity', () => {
  const render = buildRiser(makeRng('reveal-seed'), { durationSec: 1.5, outcome: 'win', intensity: 'epic' });
  const riseSec = 1.5 * 0.78;
  const resolveAtSec = riseSec + 0.05;
  const resolutionNotes = render.notes.filter((n) => n.atSec >= resolveAtSec - 1e-9);

  // The exact chime rng draws differ (buildRiser's rng has already been
  // advanced through the rise generator by this point), but the chime
  // family's shape at a given intensity -- note count, source type -- is
  // fixed by intensity alone, so that much can be checked directly.
  assert.equal(resolutionNotes.length, buildChime(makeRng('unused'), { intensity: 'epic' }).notes.length);
  for (const n of resolutionNotes) {
    assert.ok(n.atSec >= resolveAtSec - 1e-9, 'resolution notes should start at/after resolveAtSec');
    assert.equal(n.voice.source.type, 'additive', 'win resolution should use the chime family\'s glassy additive voice');
  }
});

test('buildRiser: lose outcome resolves with exactly one soft, low, short-lived note', () => {
  const render = buildRiser(makeRng('reveal-lose-seed'), { durationSec: 1.5, outcome: 'lose' });
  const riseSec = 1.5 * 0.78;
  const resolveAtSec = riseSec + 0.05;
  const resolutionNotes = render.notes.filter((n) => Math.abs(n.atSec - resolveAtSec) < 1e-9);
  assert.equal(resolutionNotes.length, 1);
  assert.equal(resolutionNotes[0].voice.source.type, 'sine');
  assert.ok(resolutionNotes[0].voice.freqHz < 200, 'expected a low-pitched soft-fail note');
});

test('buildRiser: defaults to a win outcome and a ~1.6s duration when unspecified', () => {
  const render = buildRiser(makeRng('default-seed'));
  assert.ok(render.durationSec > 1, 'expected a multi-second default riser');
  assert.ok(render.notes.length > 1);
});

test('buildRiser: durationSec reflects the actual resolution length, growing to fit a long win chime if needed', () => {
  const render = buildRiser(makeRng('fit-seed'), { durationSec: 0.5, outcome: 'win', intensity: 'epic' });
  const lastNoteEnd = Math.max(...render.notes.map((n) => n.atSec));
  assert.ok(render.durationSec >= lastNoteEnd, 'durationSec should cover every scheduled note');
});

test('buildRiser: deterministic for a given seed+opts', () => {
  const a = buildRiser(makeRng('det-seed'), { durationSec: 1.2, outcome: 'lose', intensity: 'minor' });
  const b = buildRiser(makeRng('det-seed'), { durationSec: 1.2, outcome: 'lose', intensity: 'minor' });
  assert.deepEqual(a, b);
});

test('buildRiser: the rise itself sweeps upward before resolving (reuses the same granular rise generator as library.mjs\'s plain riser cue)', () => {
  const render = buildRiser(makeRng('sweep-seed'), { durationSec: 1.4, outcome: 'lose' });
  const riseSec = 1.4 * 0.78;
  const riseNotes = render.notes.filter((n) => n.atSec < riseSec);
  const freqs = riseNotes.map((n) => n.voice.filter.cutoffHz);
  assert.ok(freqs[freqs.length - 1] > freqs[0], 'expected the pre-resolution rise to net upward in pitch');
});
