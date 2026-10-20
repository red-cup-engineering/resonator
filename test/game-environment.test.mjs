import test from 'node:test';
import assert from 'node:assert/strict';

import { makeRng } from '@red-cup-engineering/music-engineering-services-section/src/generative/random.mjs';
import { ENVIRONMENT_KINDS, buildEnvironmentSoundscape, createGameAudio } from '../src/game/index.mjs';

const render = (kind, opts = {}, seed = 'world:place-42:season-3') =>
  buildEnvironmentSoundscape(makeRng(seed), {kind, ...opts});

test('four different original world quality selectors yield distinct, deterministic acoustic structures', () => {
  assert.deepEqual(ENVIRONMENT_KINDS, ['rain', 'wind', 'surf', 'workshop']);
  const seen = new Map();
  for(const kind of ENVIRONMENT_KINDS) {
    const one = render(kind), twice = render(kind);
    assert.deepEqual(one, twice, `${kind} source sound should be reproducible`);
    assert.equal(one.durationSec, 4);
    assert.ok(one.notes.length > 1);
    assert.ok(one.notes.every(({atSec,voice}) =>
      Number.isFinite(atSec) && atSec >= 0 && atSec < one.durationSec &&
      voice.durationSec > 0 && atSec + voice.durationSec <= one.durationSec + 1e-8 &&
      Number.isFinite(voice.gain) && voice.gain >= 0 && voice.gain < 0.2));
    assert.deepEqual(one.notes.map(note => note.atSec).slice().sort((a,b) => a-b),
      one.notes.map(note => note.atSec), 'timed events have stable order');
    seen.set(kind, JSON.stringify(one));
  }
  assert.equal(new Set(seen.values()).size, ENVIRONMENT_KINDS.length,
    'every authored condition must have a distinct acoustic rendering');
});

test('user-selected richness changes number of audio layers, not the source environmental kind', () => {
  for(const kind of ENVIRONMENT_KINDS) {
    const low = render(kind, {detail:0});
    const mid = render(kind, {detail:0.5});
    const high = render(kind, {detail:1});
    assert.equal(low.notes.length,1);
    assert.equal(mid.notes.length,2);
    assert.ok(high.notes.length > mid.notes.length);
    assert.ok(high.notes.length <= 8, 'bounded synthesis workload');
    assert.notEqual(JSON.stringify(low), JSON.stringify(high));
  }
  const quiet = render('rain', {intensity:'minor'}).notes[0].voice.gain;
  const loud = render('rain', {intensity:'epic'}).notes[0].voice.gain;
  assert.ok(quiet < loud && loud < 0.2);
});

test('a new source event or period receives a new deterministic seed without ambient randomness', () => {
  const first = render('surf', {detail:1}, 'observed-period-1');
  const again = render('surf', {detail:1}, 'observed-period-1');
  const next = render('surf', {detail:1}, 'observed-period-2');
  assert.deepEqual(first, again);
  assert.notDeepEqual(first, next);
  assert.ok(first.notes.every(note => note.loop !== true),
    'finite soundscape segments do not invent a seamless ambient loop');
});

test('source conditions and rendering budgets must be explicitly admitted', () => {
  for(const kind of [undefined,'clear','storm','plaza','unknown','']) {
    assert.throws(() => render(kind), /source must select/);
  }
  for(const durationSec of [0,0.1,Infinity,-1,9,NaN]) {
    assert.throws(() => render('rain',{durationSec}), /duration/);
  }
  for(const detail of [-0.5,1.01,NaN,Infinity,null]) {
    assert.throws(() => render('wind',{detail}), /detail/);
  }
  assert.throws(() => buildEnvironmentSoundscape(null,{kind:'rain'}), /RNG/);
});

test('the original game player and scheduler accept authored atmospheric cues unchanged', () => {
  const calls = [];
  const engine = {schedule(events,opts){calls.push({events,opts});return events.map(() => ({stop(){}}));}};
  const game = createGameAudio({engine});
  assert.ok(game.listCues().includes('environment-bed'));
  const sourcePosition = {x:2,y:-5,z:0};
  const played = game.play('environment-bed', {
    kind:'wind',seed:'original-climate-reading-18',detail:.9,durationSec:3,
    position:sourcePosition,channel:'ambient',
  });
  assert.deepEqual(calls[0].events,played.cueRender.notes);
  assert.deepEqual(calls[0].opts,{channel:'ambient',position:sourcePosition});
  assert.equal(played.handles.length,played.cueRender.notes.length);
  assert.deepEqual(game.resolve('environment-bed',{
    kind:'wind',seed:'original-climate-reading-18',detail:.9,durationSec:3,
  }),played.cueRender, 'same world evidence produces same sound independent of coordinates');
});
