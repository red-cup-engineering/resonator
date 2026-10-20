import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAudioEngine } from '../src/web/audio-engine.mjs';
import { buildMasterBus, buildChannelBuses, connectBufferSource, setSpatialPosition } from '../src/web/graph.mjs';
import { createGameAudio } from '../src/game/index.mjs';
import { makeFakeAudioContext } from './helpers/fake-audio-context.mjs';

const voice = {
  freqHz: 440, durationSec: 0.04, source: { type: 'sine' },
  envelope: { attackSec: 0.001, releaseSec: 0.015, sustainLevel: 1 },
};

const point = (x, y, z) => ({ x, y, z });

function withSpatialAudio() {
  const context = makeFakeAudioContext();
  const param = (value = 0) => ({ value });
  const panners = [];
  context.listener = {
    positionX: param(), positionY: param(), positionZ: param(),
    forwardX: param(), forwardY: param(), forwardZ: param(-1),
    upX: param(), upY: param(1), upZ: param(),
  };
  context.createPanner = () => {
    const panner = {
      positionX: param(), positionY: param(), positionZ: param(),
      _connections: [],
      connect(destination) { this._connections.push(destination); return destination; },
    };
    panners.push(panner);
    return panner;
  };
  return { context, panners };
}

test('a witnessed source position creates exactly one native spatial path beneath the original bus', () => {
  const { context, panners } = withSpatialAudio();
  const { masterGain } = buildMasterBus(context);
  const bus = buildChannelBuses(context, masterGain).get('sfx');
  const played = connectBufferSource(context, {}, bus, {
    position: point(11, 2, 3), gain: 0.4,
  });
  assert.equal(panners.length, 1);
  assert.equal(played.panner, panners[0]);
  assert.equal(played.gain.gain.value, 0.4);
  assert.deepEqual([played.panner.positionX.value, played.panner.positionY.value, played.panner.positionZ.value], [11, 2, 3]);
  assert.deepEqual(played.source._connections, [played.gain]);
  assert.deepEqual(played.gain._connections, [played.panner]);
  assert.deepEqual(played.panner._connections, [bus]);
  assert.equal(played.panner.panningModel, 'HRTF');
  assert.equal(played.source._started, true);
});

test('ordinary cues are unchanged, and devices without PannerNode keep the existing audible path', () => {
  const context = makeFakeAudioContext();
  const bus = context.createGain();
  const original = connectBufferSource(context, {}, bus);
  const fallback = connectBufferSource(context, {}, bus, { position: point(1, 2, 3) });
  for (const result of [original, fallback]) {
    assert.equal(result.panner, null);
    assert.deepEqual(result.source._connections, [result.gain]);
    assert.deepEqual(result.gain._connections, [bus]);
    assert.equal(result.source._started, true);
  }
  assert.throws(() => connectBufferSource(context, {}, bus, {position: point(NaN, 0, 0)}), /finite/);
  assert.throws(() => setSpatialPosition(null, {x: 0, y: 1}), /finite/);
});

test('legacy setPosition-only WebAudio hosts receive exactly the source-provided coordinates', () => {
  const received = [];
  assert.equal(setSpatialPosition({setPosition: (...args) => received.push(args)}, point(-1, 0.5, 9)), true);
  assert.deepEqual(received, [[-1, 0.5, 9]]);
});

test('listener pose is validated and held without starting playback or guessing axes', () => {
  let starts = 0;
  const {context} = withSpatialAudio();
  const engine = createAudioEngine({contextFactory: () => { starts++; return context; }});
  const pose = {position: point(3, 4, 5), forward: point(0, 1, 0), up: point(0, 0, 1)};
  assert.deepEqual(engine.setListenerPose(pose), pose);
  assert.equal(starts, 0);
  pose.position.x = 1234; // callers cannot alter the held pose
  assert.equal(engine.getListenerPose().position.x, 3);
  engine.ensureStarted();
  assert.equal(starts, 1);
  assert.deepEqual([
    context.listener.positionX.value, context.listener.positionY.value,
    context.listener.positionZ.value, context.listener.forwardY.value,
    context.listener.upZ.value,
  ], [3, 4, 5, 1, 1]);
  assert.throws(() => engine.setListenerPose({position: point(0, 0, 0), forward: point(1, 0, 0)}), /both/);
  assert.throws(() => engine.setListenerPose({
    position: point(0, 0, 0), forward: point(1, 0, 0), up: point(2, 0, 0),
  }), /independent/);
});

test('one original timed note gets its own position; the remaining notes inherit the caller position', () => {
  const {context, panners} = withSpatialAudio();
  const engine = createAudioEngine({contextFactory: () => context});
  const handles = engine.schedule([
    {atSec: 0, voice},
    {atSec: 0.25, voice, position: point(8, 0, 0)},
  ], {position: point(-3, 0, 0)});
  assert.equal(handles.length, 2);
  assert.equal(panners.length, 2);
  assert.equal(handles[0].panner.positionX.value, -3);
  assert.equal(handles[1].panner.positionX.value, 8);
  assert.equal(handles[1].source._startedAt, 0.25);
  engine.setChannelMuted('sfx', true);
  assert.equal(engine.isChannelMuted('sfx'), true);
  assert.ok(handles[0].source._started, 'muting a listener does not rewrite a world event');
});

test('the existing seeded cue player carries position to the existing event scheduler, never inventing a world action', () => {
  const scheduled = [];
  const engine = {schedule(notes, options) { scheduled.push({notes, options}); return []; }};
  const game = createGameAudio({engine});
  const position = point(7, 6, 5);
  const result = game.play('chime', {seed: 'world-event-42', position, channel: 'ambient'});
  assert.deepEqual(scheduled[0].options, {channel: 'ambient', position});
  assert.deepEqual(scheduled[0].notes, result.cueRender.notes);
  const preview = createGameAudio().play('chime', {seed: 'world-event-42', position});
  assert.deepEqual(preview, result.cueRender, 'position changes playback location, not generated sonic identity');
});
