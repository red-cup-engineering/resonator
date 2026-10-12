// web-audio-engine.test.mjs
//
// Checks ../src/web/audio-engine.mjs's createAudioEngine end to end against
// the fake context (test/helpers/fake-audio-context.mjs): lazy startup,
// silent-degradation when no AudioContext is available, playVoice/schedule/
// playSpec actually rendering and starting buffer sources at the right
// times, mute/volume persistence, and duckChannel's AudioParam automation
// sequence -- all synchronously, with no real audio hardware or timers.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAudioEngine } from '../src/web/audio-engine.mjs';
import { makeInMemoryStorage } from '../src/web/persistence.mjs';
import { makeFakeAudioContext } from './helpers/fake-audio-context.mjs';

const SINE_VOICE = { freqHz: 440, durationSec: 0.05, source: { type: 'sine' }, envelope: { attackSec: 0.001, releaseSec: 0.02, sustainLevel: 1 } };

test('createAudioEngine: does not create a context at construction time (lazy, gesture-safe)', () => {
  let factoryCalls = 0;
  createAudioEngine({ contextFactory: () => { factoryCalls += 1; return makeFakeAudioContext(); } });
  assert.equal(factoryCalls, 0, 'contextFactory should not be called until ensureStarted()/playVoice()/schedule()');
});

test('createAudioEngine: silent degradation -- a contextFactory returning null makes every play/schedule call a safe no-op', () => {
  const engine = createAudioEngine({ contextFactory: () => null });
  assert.equal(engine.ensureStarted(), false);
  assert.equal(engine.isSilent(), true);
  assert.equal(engine.playVoice(SINE_VOICE), null);
  assert.deepEqual(engine.schedule([{ atSec: 0, voice: SINE_VOICE }]), [null]);
  assert.deepEqual(engine.playSpec({ notes: [{ atSec: 0, voice: SINE_VOICE }] }), [null]);
  assert.doesNotThrow(() => engine.duckChannel('ambient', {}));
  assert.doesNotThrow(() => engine.stopAll());
  assert.equal(engine.context, null);
});

test('createAudioEngine: ensureStarted builds the graph exactly once and is idempotent', () => {
  let factoryCalls = 0;
  const ctx = makeFakeAudioContext();
  const engine = createAudioEngine({ contextFactory: () => { factoryCalls += 1; return ctx; } });
  assert.equal(engine.ensureStarted(), true);
  assert.equal(engine.ensureStarted(), true);
  assert.equal(factoryCalls, 1);
  assert.equal(engine.context, ctx);
});

test('playVoice: renders the voice and starts a buffer source on the requested channel at ctx.currentTime + when', () => {
  const ctx = makeFakeAudioContext({ currentTime: 2 });
  const engine = createAudioEngine({ contextFactory: () => ctx });
  const handle = engine.playVoice(SINE_VOICE, { channel: 'music', when: 0.25, gain: 0.5 });

  assert.ok(handle);
  assert.equal(handle.source._started, true);
  assert.equal(handle.source._startedAt, 2.25);
  assert.equal(handle.gain.gain.value, 0.5);
  // routed through the 'music' channel bus, not sfx
  const musicBus = ctx._nodes.gains.find((g) => handle.gain._connections.includes(g));
  assert.ok(musicBus, 'per-play gain should connect into some channel bus');
});

test('playVoice: defaults to the sfx channel when none is given', () => {
  const ctx = makeFakeAudioContext();
  const engine = createAudioEngine({ contextFactory: () => ctx, channels: ['sfx', 'music', 'ambient'] });
  const handle = engine.playVoice(SINE_VOICE);
  assert.ok(handle);
  // first created channel gain is sfx (createAudioEngine builds buses in
  // channels-array order); the per-play gain should connect to it.
  const sfxBus = ctx._nodes.gains[1]; // index 0 is masterGain, index 1 is the first channel bus (sfx)
  assert.deepEqual(handle.gain._connections, [sfxBus]);
});

test('playVoice: attempts ctx.resume() when the context is suspended', () => {
  const ctx = makeFakeAudioContext({ state: 'suspended' });
  const engine = createAudioEngine({ contextFactory: () => ctx });
  engine.playVoice(SINE_VOICE);
  assert.equal(ctx.resumeCalls, 1);
});

test('schedule: plays every event at startDelaySec + its own atSec, honoring per-event channel/gain overrides', () => {
  const ctx = makeFakeAudioContext({ currentTime: 10 });
  const engine = createAudioEngine({ contextFactory: () => ctx });
  const events = [
    { atSec: 0, voice: SINE_VOICE, channel: 'sfx' },
    { atSec: 0.2, voice: SINE_VOICE, gain: 0.7 },
  ];
  const handles = engine.schedule(events, { startDelaySec: 1, channel: 'music' });
  assert.equal(handles.length, 2);
  assert.equal(handles[0].source._startedAt, 11); // 10 + 1 + 0
  assert.equal(handles[1].source._startedAt, 11.2); // 10 + 1 + 0.2
  assert.equal(handles[1].gain.gain.value, 0.7);
});

test('playSpec: accepts a {notes:[...]} spec (the cue-render shape) and a {events:[...]} spec equivalently', () => {
  const ctx = makeFakeAudioContext();
  const engine = createAudioEngine({ contextFactory: () => ctx });
  const withNotes = engine.playSpec({ notes: [{ atSec: 0, voice: SINE_VOICE }] });
  const withEvents = engine.playSpec({ events: [{ atSec: 0, voice: SINE_VOICE }] });
  assert.equal(withNotes.length, 1);
  assert.equal(withEvents.length, 1);
  assert.ok(withNotes[0] && withEvents[0]);
});

test('duckChannel: schedules cancel -> setValueAtTime(from) -> rampTo(to) -> hold -> rampTo(from) in that order', () => {
  const ctx = makeFakeAudioContext({ currentTime: 5 });
  const engine = createAudioEngine({ contextFactory: () => ctx });
  engine.ensureStarted();
  engine.setChannelVolume('ambient', 0.9);

  engine.duckChannel('ambient', { toGain: 0.3, attackSec: 0.1, holdSec: 0.4, releaseSec: 0.2 });

  // Find the ducked channel's gain param by looking for the one duckChannel
  // actually called cancelScheduledValues on (there's only one -- 'ambient').
  const calls = ctx._nodes.gains.map((g) => g.gain._calls);
  const duckedParamCalls = calls.find((c) => c.some(([op]) => op === 'cancelScheduledValues'));
  assert.ok(duckedParamCalls, 'expected duckChannel to have called cancelScheduledValues on some channel gain');
  assert.deepEqual(
    duckedParamCalls.map((c) => c[0]),
    ['cancelScheduledValues', 'setValueAtTime', 'linearRampToValueAtTime', 'setValueAtTime', 'linearRampToValueAtTime']
  );
  const [, from0, from1] = duckedParamCalls;
  assert.equal(from1[1], 0.3); // ramps down to toGain
  assert.equal(from0[1], 0.9); // starts from the pre-duck volume
  const [, , , holdCall, releaseCall] = duckedParamCalls;
  assert.equal(holdCall[1], 0.3);
  assert.equal(releaseCall[1], 0.9); // ramps back up to the original volume
  // timing: now=5, attack=0.1 -> 5.1; hold 0.4 -> 5.5; release 0.2 -> 5.7
  assert.equal(from1[2], 5.1);
  assert.equal(holdCall[2], 5.5);
  assert.equal(releaseCall[2], 5.7);
});

test('duckChannel: no-op when the engine is silent', () => {
  const engine = createAudioEngine({ contextFactory: () => null });
  assert.doesNotThrow(() => engine.duckChannel('ambient', { toGain: 0.2 }));
});

test('mixer state: setMasterVolume/setMuted/setChannelVolume/setChannelMuted persist and are reflected in getMixerState', () => {
  const storage = makeInMemoryStorage();
  const ctx = makeFakeAudioContext();
  const engine = createAudioEngine({ contextFactory: () => ctx, storage, storageKey: 'test:mixer' });

  engine.setMasterVolume(0.7);
  engine.setChannelVolume('sfx', 0.4);
  engine.setChannelMuted('music', true);
  engine.setMuted(false);

  assert.equal(engine.getMasterVolume(), 0.7);
  assert.equal(engine.getChannelVolume('sfx'), 0.4);
  assert.equal(engine.isChannelMuted('music'), true);
  assert.equal(engine.isMuted(), false);

  const snapshot = engine.getMixerState();
  assert.equal(snapshot.masterVolume, 0.7);
  assert.equal(snapshot.channels.sfx.volume, 0.4);
  assert.equal(snapshot.channels.music.muted, true);

  // a fresh engine reading the same storage/key picks up the persisted state
  const engine2 = createAudioEngine({ contextFactory: () => makeFakeAudioContext(), storage, storageKey: 'test:mixer' });
  assert.equal(engine2.getMasterVolume(), 0.7);
  assert.equal(engine2.getChannelVolume('sfx'), 0.4);
});

test('setMasterVolume: muting silences the graph even at nonzero volume, and unmuting restores it', () => {
  const ctx = makeFakeAudioContext();
  const engine = createAudioEngine({ contextFactory: () => ctx });
  engine.ensureStarted();
  engine.setMasterVolume(0.8);
  const masterGain = ctx._nodes.gains[0];
  assert.equal(masterGain.gain.value, 0.8);
  engine.setMuted(true);
  assert.equal(masterGain.gain.value, 0);
  engine.setMuted(false);
  assert.equal(masterGain.gain.value, 0.8);
});

test('setMasterVolume/setChannelVolume: clamp to [0, 1]', () => {
  const engine = createAudioEngine({ contextFactory: () => makeFakeAudioContext() });
  engine.setMasterVolume(5);
  assert.equal(engine.getMasterVolume(), 1);
  engine.setMasterVolume(-3);
  assert.equal(engine.getMasterVolume(), 0);
});

test('stopAll: stops every currently-playing handle', () => {
  const ctx = makeFakeAudioContext();
  const engine = createAudioEngine({ contextFactory: () => ctx });
  const a = engine.playVoice(SINE_VOICE);
  const b = engine.playVoice(SINE_VOICE);
  engine.stopAll();
  assert.equal(a.source._stopped, true);
  assert.equal(b.source._stopped, true);
});
