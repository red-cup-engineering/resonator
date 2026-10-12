// web-persistence.test.mjs
//
// Checks ../src/web/persistence.mjs's mixer-state persistence: a round trip
// through makeInMemoryStorage, and the "never throw, always fall back"
// contract loadMixerState/saveMixerState both promise -- malformed JSON, a
// missing key, and a storage that itself throws all degrade to the supplied
// fallback rather than propagating.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeInMemoryStorage, makeDefaultMixerState, loadMixerState, saveMixerState } from '../src/web/persistence.mjs';

const KEY = 'resonator:mixer:test';

test('makeDefaultMixerState: one entry per channel name, all at volume 1 / unmuted', () => {
  const state = makeDefaultMixerState(['sfx', 'music'], 0.8);
  assert.equal(state.masterVolume, 0.8);
  assert.equal(state.masterMuted, false);
  assert.deepEqual(state.channels, { sfx: { volume: 1, muted: false }, music: { volume: 1, muted: false } });
});

test('save/loadMixerState: round-trips exactly through an in-memory storage', () => {
  const storage = makeInMemoryStorage();
  const state = { masterVolume: 0.6, masterMuted: true, channels: { sfx: { volume: 0.3, muted: false } } };
  saveMixerState(storage, KEY, state);
  const loaded = loadMixerState(storage, KEY, makeDefaultMixerState(['sfx']));
  assert.deepEqual(loaded, state);
});

test('loadMixerState: falls back when the key has never been set', () => {
  const storage = makeInMemoryStorage();
  const fallback = makeDefaultMixerState(['sfx']);
  assert.deepEqual(loadMixerState(storage, KEY, fallback), fallback);
});

test('loadMixerState: falls back on malformed JSON rather than throwing', () => {
  const storage = makeInMemoryStorage();
  storage.setItem(KEY, '{not valid json');
  const fallback = makeDefaultMixerState(['sfx']);
  assert.deepEqual(loadMixerState(storage, KEY, fallback), fallback);
});

test('loadMixerState: falls back when storage.getItem throws', () => {
  const storage = {
    getItem() {
      throw new Error('storage unavailable');
    },
  };
  const fallback = makeDefaultMixerState(['sfx']);
  assert.deepEqual(loadMixerState(storage, KEY, fallback), fallback);
});

test('saveMixerState: swallows a throwing storage.setItem rather than propagating', () => {
  const storage = {
    setItem() {
      throw new Error('quota exceeded');
    },
  };
  assert.doesNotThrow(() => saveMixerState(storage, KEY, { masterVolume: 1 }));
});

test('loadMixerState: merges a fallback\'s channel defaults under an older/narrower persisted blob', () => {
  const storage = makeInMemoryStorage();
  storage.setItem(KEY, JSON.stringify({ masterVolume: 0.5, masterMuted: false, channels: { sfx: { volume: 0.2, muted: false } } }));
  const fallback = makeDefaultMixerState(['sfx', 'music', 'ambient']);
  const loaded = loadMixerState(storage, KEY, fallback);
  assert.equal(loaded.channels.sfx.volume, 0.2);
  assert.deepEqual(loaded.channels.music, { volume: 1, muted: false });
  assert.deepEqual(loaded.channels.ambient, { volume: 1, muted: false });
});
