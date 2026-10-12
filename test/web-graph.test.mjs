// web-graph.test.mjs
//
// Checks ../src/web/graph.mjs's pure graph-construction functions against a
// hand-written fake context (test/helpers/fake-audio-context.mjs) --
// no real AudioContext is ever created, matching this whole engine's
// headless-testability requirement: buildMasterBus/buildChannelBuses/
// connectBufferSource are pure functions of an injected context, so their
// connection topology and AudioParam values can be asserted directly.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildMasterBus, buildChannelBuses, connectBufferSource, DEFAULT_CHANNELS } from '../src/web/graph.mjs';
import { makeFakeAudioContext } from './helpers/fake-audio-context.mjs';

test('buildMasterBus: connects masterGain -> compressor -> destination', () => {
  const ctx = makeFakeAudioContext();
  const { masterGain, compressor } = buildMasterBus(ctx);
  assert.deepEqual(masterGain._connections, [compressor]);
  assert.deepEqual(compressor._connections, [ctx.destination]);
});

test('buildMasterBus: applies masterVolume to masterGain.gain.value and configures the limiter compressor', () => {
  const ctx = makeFakeAudioContext();
  const { masterGain, compressor } = buildMasterBus(ctx, { masterVolume: 0.5 });
  assert.equal(masterGain.gain.value, 0.5);
  // limiter-ish defaults: low threshold, high ratio, fast attack
  assert.ok(compressor.threshold.value < 0, 'expected a negative dB threshold');
  assert.ok(compressor.ratio.value > 1, 'expected a compression ratio > 1');
  assert.ok(compressor.attack.value < 0.02, 'expected a fast attack suited to limiting');
});

test('buildMasterBus: masterVolume defaults to 1 when omitted', () => {
  const ctx = makeFakeAudioContext();
  const { masterGain } = buildMasterBus(ctx);
  assert.equal(masterGain.gain.value, 1);
});

test('buildMasterBus: a partial compressor override only touches the given fields', () => {
  const ctx = makeFakeAudioContext();
  const { compressor } = buildMasterBus(ctx, { compressor: { ratio: 20 } });
  assert.equal(compressor.ratio.value, 20);
  assert.ok(compressor.threshold.value < 0, 'other fields should keep their limiter default');
});

test('buildChannelBuses: creates one GainNode per channel name, each connected to masterGain', () => {
  const ctx = makeFakeAudioContext();
  const { masterGain } = buildMasterBus(ctx);
  const buses = buildChannelBuses(ctx, masterGain, ['sfx', 'music', 'ambient']);
  assert.equal(buses.size, 3);
  for (const name of ['sfx', 'music', 'ambient']) {
    assert.ok(buses.has(name));
    assert.deepEqual(buses.get(name)._connections, [masterGain]);
  }
});

test('buildChannelBuses: defaults to DEFAULT_CHANNELS (sfx, music, ambient) when no names are given', () => {
  const ctx = makeFakeAudioContext();
  const { masterGain } = buildMasterBus(ctx);
  const buses = buildChannelBuses(ctx, masterGain);
  assert.deepEqual(Array.from(buses.keys()), DEFAULT_CHANNELS.slice());
});

test('connectBufferSource: wires source -> per-play gain -> destination, sets buffer/loop, and starts at the given time', () => {
  const ctx = makeFakeAudioContext();
  const dest = ctx.createGain();
  const fakeBuffer = { fake: true };
  const { source, gain } = connectBufferSource(ctx, fakeBuffer, dest, { gain: 0.4, when: 1.5, loop: true });

  assert.equal(source.buffer, fakeBuffer);
  assert.equal(source.loop, true);
  assert.deepEqual(source._connections, [gain]);
  assert.deepEqual(gain._connections, [dest]);
  assert.equal(gain.gain.value, 0.4);
  assert.equal(source._started, true);
  assert.equal(source._startedAt, 1.5);
});

test('connectBufferSource: defaults gain to 1, when to 0, loop to false', () => {
  const ctx = makeFakeAudioContext();
  const dest = ctx.createGain();
  const { source, gain } = connectBufferSource(ctx, {}, dest);
  assert.equal(gain.gain.value, 1);
  assert.equal(source.loop, false);
  assert.equal(source._startedAt, 0);
});
