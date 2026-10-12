// game-cue.test.mjs
//
// Checks ../src/game/cue.mjs's registry mechanics, and property-tests
// determinism across the whole standard library (../src/game/library.mjs):
// resolving the same cue name with the same seed+intensity twice must
// produce a structurally identical CueRender, exactly the guarantee
// ../voice/voice.test.mts already makes for renderVoice itself -- this is
// the same property one level up the stack (cue -> VoiceParams events,
// rather than VoiceParams -> samples).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCueRegistry } from '../src/game/cue.mjs';
import { STANDARD_CUES } from '../src/game/library.mjs';

test('createCueRegistry: define/has/list/resolve basic mechanics', () => {
  const registry = createCueRegistry();
  assert.deepEqual(registry.list(), []);
  assert.equal(registry.has('beep'), false);

  registry.define('beep', (rng, opts) => ({ durationSec: 0.1, notes: [{ atSec: 0, voice: { freqHz: 1000, durationSec: 0.1, source: { type: 'sine' }, envelope: {} } }] }));
  assert.equal(registry.has('beep'), true);
  assert.deepEqual(registry.list(), ['beep']);

  const render = registry.resolve('beep');
  assert.equal(render.durationSec, 0.1);
  assert.equal(render.notes.length, 1);
});

test('createCueRegistry: seeding from initialCues registers every entry up front', () => {
  const registry = createCueRegistry(STANDARD_CUES);
  for (const name of Object.keys(STANDARD_CUES)) assert.ok(registry.has(name), `expected ${name} to be registered`);
});

test('resolveCue: throws a clear error naming the unknown cue and listing known ones', () => {
  const registry = createCueRegistry({ foo: () => ({ durationSec: 0, notes: [] }) });
  assert.throws(() => registry.resolve('bar'), /unknown cue "bar"/);
  assert.throws(() => registry.resolve('bar'), /foo/);
});

test('resolveCue: defaults opts.intensity to \'default\' and passes it through to the builder', () => {
  const registry = createCueRegistry();
  let seenIntensity;
  registry.define('probe', (rng, opts) => {
    seenIntensity = opts.intensity;
    return { durationSec: 0, notes: [] };
  });
  registry.resolve('probe');
  assert.equal(seenIntensity, 'default');
  registry.resolve('probe', { intensity: 'epic' });
  assert.equal(seenIntensity, 'epic');
});

test('resolveCue: an unseeded call is still fully reproducible (seeds from the cue name itself, never ambient randomness)', () => {
  const registry = createCueRegistry(STANDARD_CUES);
  const a = registry.resolve('chime');
  const b = registry.resolve('chime');
  assert.deepEqual(a, b);
});

test('resolveCue: different seeds produce different renders for a cue that reads randomness (guards against a no-op seed wiring bug)', () => {
  const registry = createCueRegistry(STANDARD_CUES);
  const a = registry.resolve('fanfare', { seed: 'seed-a' });
  const b = registry.resolve('fanfare', { seed: 'seed-b' });
  assert.notDeepEqual(a, b);
});

test('every STANDARD_CUES entry: resolving twice with the same seed+intensity is byte-for-byte deterministic', () => {
  const registry = createCueRegistry(STANDARD_CUES);
  const seeds = ['alpha', 'spin-42', 12345, 'reel-2-tick'];
  const intensities = ['minor', 'major', 'epic', 'default', 0.15, 0.9];
  for (const name of Object.keys(STANDARD_CUES)) {
    for (const seed of seeds) {
      for (const intensity of intensities) {
        const opts = { seed, intensity, index: 2, durationSec: 1.1, outcome: 'win' };
        const a = registry.resolve(name, opts);
        const b = registry.resolve(name, opts);
        assert.deepEqual(a, b, `${name} with seed=${seed} intensity=${intensity} was not deterministic`);
      }
    }
  }
});

test('every STANDARD_CUES entry: produces a well-formed CueRender (positive durationSec, at least one note, valid VoiceParams, non-negative/sorted-enough atSec)', () => {
  const registry = createCueRegistry(STANDARD_CUES);
  for (const name of Object.keys(STANDARD_CUES)) {
    const render = registry.resolve(name, { seed: `wellformed-${name}`, intensity: 'major', durationSec: 1.2, outcome: 'win', index: 1 });
    assert.ok(render.durationSec > 0, `${name}: durationSec should be positive`);
    assert.ok(Array.isArray(render.notes) && render.notes.length > 0, `${name}: expected at least one note`);
    for (const note of render.notes) {
      assert.ok(note.atSec >= 0, `${name}: note.atSec should be >= 0`);
      assert.ok(typeof note.voice === 'object' && note.voice !== null, `${name}: note.voice should be a VoiceParams object`);
      assert.ok(Number.isFinite(note.voice.freqHz) || note.voice.source?.type === 'noise', `${name}: note.voice.freqHz should be finite (or the source is pure noise)`);
      assert.ok(note.voice.durationSec > 0, `${name}: note.voice.durationSec should be positive`);
    }
  }
});
