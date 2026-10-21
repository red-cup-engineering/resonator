import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreObservations, scoreToResonatorSpec, MAX_SCORE_CUES } from '../src/game/observed-score.mjs';

const startMs = 1_798_000_000_000;
const event = (sourceRef, atOffsetMs, domain = 'work', phase = 'attempt', extra = {}) =>
  ({ sourceRef, atMs: startMs + atOffsetMs, domain, phase, ...extra });
const window = (extra = {}) => ({ startMs, endMs: startMs + 30_000, coverage: 'complete', ...extra });

test('source attempts are not scored as settled work or money', () => {
  const score = scoreObservations([
    event('invocation:a', 1000, 'work', 'attempt'),
    event('transaction:b', 2000, 'settlement', 'observation'),
    event('invocation:a', 3000, 'work', 'outcome', {status:'ok'}),
    event('transaction:b', 4000, 'settlement', 'outcome', {status:'ok'}),
    event('invocation:c', 5000, 'work', 'outcome', {status:'failed'}),
  ], window());
  assert.deepEqual(score.cues.map(x => x.cueId), ['tick','tick','chime','coin','failure']);
  assert.equal(score.cues[0].status,undefined);
  assert.equal(score.cues[3].status,'ok');
  assert.equal(score.cues[0].seed,'invocation:a:attempt:unresolved');
  assert.deepEqual(score.metering,{observationsReceived:5,observationsInWindow:5,
    distinctWitnessed:5,cuesEmitted:5,cuesOmitted:0,durationSec:30,renderedAudioBytes:0});
});

test('deterministic ordering, replay de-duplication and complete-window activity', () => {
  const events=[event('b',10000),event('a',1000),event('a',1000)];
  const one=scoreObservations(events,window());
  const two=scoreObservations(events.slice().reverse(),window());
  assert.deepEqual(one,two);
  assert.equal(one.cues.length,2);
  assert.deepEqual(one.activityBreakpoints.map(x=>x.witnessed),[1,1,0]);
  assert.equal(one.activityBreakpoints[2].intensity,0);
});

test('unknown and partial sources cannot become false evidence of an idle world', () => {
  assert.equal(scoreObservations([],window({coverage:'unknown'})).activityBreakpoints,null);
  assert.equal(scoreObservations([],window({coverage:'partial'})).activityBreakpoints,null);
  const complete=scoreObservations([],window());
  assert.deepEqual(complete.activityBreakpoints.map(x=>x.intensity),[0,0,0]);
  assert.deepEqual(complete.cues,[]);
});

test('malformed, invented or contradictory statuses and coordinates refuse', () => {
  assert.throws(()=>scoreObservations([event('x',0,'work','attempt',{status:'ok'})],window()),/only an observed outcome/);
  assert.throws(()=>scoreObservations([event('x',0,'weather','observation')],window()),/admitted domain/);
  assert.throws(()=>scoreObservations([event('x',0,'work','observation',{position:{x:1,y:'z',z:3}})],window()),/finite x\/y\/z/);
  assert.throws(()=>scoreObservations([
    event('x',0,'work','outcome',{status:'ok'}),event('x',0,'work','outcome',{status:'failed'}),
  ],window()),/contradictory/);
  assert.throws(()=>scoreObservations([],window({endMs:startMs+301_000})),/bounded/);
  assert.throws(()=>scoreObservations([],window({coverage:null})),/bounded/);
});

test('bounded score accounts for omitted old cues; intensity sees the full evidence', () => {
  const events=Array.from({length:36},(_,i)=>event('evt:'+i,i*100,'movement','observation'));
  const score=scoreObservations(events,window());
  assert.equal(score.cues.length,MAX_SCORE_CUES);
  assert.equal(score.cues[0].sourceRef,'evt:4');
  assert.equal(score.metering.cuesOmitted,4);
  assert.equal(score.activityBreakpoints[0].witnessed,36);
});

test('native resolver yields finite source-bearing VoiceParams schedule', () => {
  const score=scoreObservations([event('move:1',2000,'movement','observation',{position:{x:2,y:3,z:4}})],window());
  const calls=[];
  const spec=scoreToResonatorSpec(score,(id,opts)=>{
    calls.push({id,opts});
    return {durationSec:0.5,notes:[{atSec:0,voice:{durationSec:0.5,source:{type:'sine'},freqHz:400}}]};
  });
  assert.equal(calls[0].id,'whoosh');
  assert.deepEqual(spec.notes[0].position,{x:2,y:3,z:4});
  assert.equal(spec.notes[0].sourceRef,'move:1');
  assert.equal(spec.notes[0].atSec,2);
  assert.equal(spec.durationSec,30);
});

test('cue budget and bad native playback spec refuse before sound',()=>{
  const score=scoreObservations([event('evt',0)],window());
  assert.throws(()=>scoreToResonatorSpec(score,()=>({durationSec:1,notes:Array(513).fill({atSec:0,voice:{durationSec:1}})})),/budget/);
  assert.throws(()=>scoreToResonatorSpec(score,()=>({durationSec:1,notes:[{atSec:-1,voice:{}}]})),/invalid native/);
});
