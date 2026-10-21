/**
 * Score source-qualified events without running audio, changing Work or judging authority.
 * The caller must supply only admitted observations authorized for the consumer.
 * A score is data for Resonator's existing cue registry and VoiceParams scheduler.
 * Missing/partial witness coverage is NOT evidence of an idle or quiet world.
 */
export const OBSERVED_SCORE_VERSION = 1;
export const MAX_SCORE_WINDOW_SEC = 300;
export const MAX_OBSERVATIONS = 4096;
export const MAX_SCORE_CUES = 32;
export const MAX_SCHEDULE_NOTES = 512;

const DOMAINS = new Set(['work','communication','movement','resource','knowledge','settlement','system']);
const PHASES = new Set(['attempt','outcome','observation']);
const STATUSES = new Set(['ok','failed','unknown']);
const COVERAGE = new Set(['complete','partial','unknown']);
const point = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && ['x','y','z'].every(k => typeof value[k] === 'number' && Number.isFinite(value[k]));
const nonblank = value => typeof value === 'string' && value.length > 0 && value.length <= 512;

function receiveObservation(raw,index) {
  const where = 'observations[' + index + ']';
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      !nonblank(raw.sourceRef) || !Number.isFinite(raw.atMs) ||
      !DOMAINS.has(raw.domain) || !PHASES.has(raw.phase))
    throw new TypeError(where + ': sourceRef, finite atMs, admitted domain and phase are required');
  if (raw.phase === 'outcome' ? !STATUSES.has(raw.status) : raw.status !== undefined)
    throw new TypeError(where + ': only an observed outcome may carry ok/failed/unknown status');
  if (raw.intensity !== undefined && (!Number.isFinite(raw.intensity) || raw.intensity < 0 || raw.intensity > 1))
    throw new RangeError(where + ': intensity must be within 0..1');
  if (raw.position !== undefined && !point(raw.position))
    throw new TypeError(where + ': position must contain finite x/y/z coordinates');
  return {
    sourceRef:raw.sourceRef, atMs:raw.atMs, domain:raw.domain, phase:raw.phase,
    ...(raw.status === undefined ? {} : {status:raw.status}),
    intensity:raw.intensity ?? 0.5,
    ...(raw.position === undefined ? {} : {position:{
      x:raw.position.x,y:raw.position.y,z:raw.position.z,
    }}),
  };
}
function selectCue(event) {
  // This cue describes an observed RPC outcome, NOT institutional Work acceptance.
  if (event.phase === 'outcome') {
    if (event.status === 'failed') return 'failure';
    if (event.status === 'ok') return event.domain === 'settlement' ? 'coin' : 'chime';
    return 'tick';
  }
  if (event.phase === 'attempt') return 'tick';
  switch (event.domain) {
    case 'movement': return 'whoosh';
    case 'communication': return 'chime';
    case 'resource': return 'impact';
    case 'knowledge': return 'ui-tap';
    case 'settlement': return 'tick'; // coin implies source-confirmed settlement
    default: return 'tick';
  }
}
/**
 * Produce deterministic finite Foley cues and witnessed activity breakpoints.
 * Inputs are independently authorized by the consumer, not by this package.
 * Coverage 'complete' must only be used when the source asserts completeness.
 * Coverage unknown/partial never yields a misleading zero-intensity soundtrack.
 */
export function scoreObservations(observations,window) {
  if (!Array.isArray(observations) || observations.length > MAX_OBSERVATIONS)
    throw new RangeError('observations must be a bounded array');
  if (!window || !Number.isFinite(window.startMs) || !Number.isFinite(window.endMs) ||
      window.endMs <= window.startMs || (window.endMs-window.startMs)>MAX_SCORE_WINDOW_SEC*1000 ||
      !COVERAGE.has(window.coverage))
    throw new TypeError('bounded startMs/endMs and explicit complete/partial/unknown coverage required');
  const maxCues=window.maxCues ?? MAX_SCORE_CUES;
  const bucketSec=window.bucketSec ?? 10;
  if (!Number.isSafeInteger(maxCues) || maxCues<1 || maxCues>MAX_SCORE_CUES)
    throw new RangeError('maxCues must be 1..'+MAX_SCORE_CUES);
  if (!Number.isSafeInteger(bucketSec) || bucketSec<1 || bucketSec>60)
    throw new RangeError('bucketSec must be 1..60');
  const all=observations.map(receiveObservation)
    .filter(x=>x.atMs>=window.startMs && x.atMs<window.endMs)
    .sort((a,b)=>a.atMs-b.atMs || a.sourceRef.localeCompare(b.sourceRef) || a.phase.localeCompare(b.phase));
  // Replays are fine; conflicting testimony for the same phase is not silently picked.
  const unique=new Map();
  for(const event of all) {
    const key=event.sourceRef+'\u0000'+event.phase;
    const prior=unique.get(key);
    if(prior && JSON.stringify(prior)!==JSON.stringify(event))
      throw new TypeError('contradictory source observation for '+event.sourceRef+'/'+event.phase);
    unique.set(key,event);
  }
  const witnessed=[...unique.values()].sort((a,b)=>a.atMs-b.atMs || a.sourceRef.localeCompare(b.sourceRef));
  const picked=witnessed.slice(-maxCues);
  const cues=picked.map(event=>Object.freeze({
    sourceRef:event.sourceRef,sourceAtMs:event.atMs,phase:event.phase,domain:event.domain,
    ...(event.status===undefined?{}:{status:event.status}),
    cueId:selectCue(event),
    seed:event.sourceRef+':'+event.phase+':'+(event.status??'unresolved'),
    atSec:(event.atMs-window.startMs)/1000,intensity:event.intensity,channel:'sfx',
    ...(event.position===undefined?{}:{position:Object.freeze(event.position)}),
  }));
  const durationSec=(window.endMs-window.startMs)/1000;
  let activityBreakpoints=null;
  if(window.coverage==='complete') {
    const count=Math.ceil(durationSec/bucketSec),buckets=Array(count).fill(0);
    for(const event of witnessed)
      buckets[Math.min(count-1,Math.floor((event.atMs-window.startMs)/(bucketSec*1000)))]++;
    activityBreakpoints=buckets.map((n,i)=>Object.freeze({
      tSec:i*bucketSec,intensity:Math.round((1-Math.exp(-n/3))*1000)/1000,witnessed:n,
    }));
  }
  return Object.freeze({
    kind:'resonator.observed-score',version:OBSERVED_SCORE_VERSION,
    window:Object.freeze({startMs:window.startMs,endMs:window.endMs,durationSec,coverage:window.coverage}),
    cues:Object.freeze(cues),activityBreakpoints:activityBreakpoints===null?null:Object.freeze(activityBreakpoints),
    metering:Object.freeze({observationsReceived:observations.length,observationsInWindow:all.length,
      distinctWitnessed:witnessed.length,cuesEmitted:cues.length,cuesOmitted:witnessed.length-cues.length,
      durationSec,renderedAudioBytes:0}),
  });
}
/**
 * Resolve a score using createGameAudio({}).resolve, obtaining an original
 * Resonator {durationSec,notes:[{atSec,voice}]} schedule. Never plays sound.
 */
export function scoreToResonatorSpec(score,resolveCue) {
  if(!score || score.kind!=='resonator.observed-score' || score.version!==OBSERVED_SCORE_VERSION ||
     !Array.isArray(score.cues) || score.cues.length>MAX_SCORE_CUES ||
     !Number.isFinite(score.window?.durationSec) || typeof resolveCue!=='function')
    throw new TypeError('valid observed score and native cue resolver required');
  const notes=[];
  for(const cue of score.cues) {
    if(!nonblank(cue.sourceRef)||!Number.isFinite(cue.atSec)||cue.atSec<0||
       cue.atSec>=score.window.durationSec||!nonblank(cue.cueId))
      throw new TypeError('score has invalid source cue');
    const rendered=resolveCue(cue.cueId,{seed:cue.seed,intensity:cue.intensity,position:cue.position});
    if(!rendered||!Array.isArray(rendered.notes)||!Number.isFinite(rendered.durationSec))
      throw new TypeError('original Resonator cue resolver returned no valid CueRender');
    if(notes.length+rendered.notes.length>MAX_SCHEDULE_NOTES)
      throw new RangeError('score exceeds bounded audio note budget');
    for(const note of rendered.notes) {
      if(!Number.isFinite(note.atSec)||note.atSec<0||!note.voice)
        throw new TypeError('invalid native cue note');
      notes.push({...note,atSec:cue.atSec+note.atSec,channel:cue.channel,
        ...(note.position!==undefined?{}:cue.position===undefined?{}:{position:cue.position}),
        sourceRef:cue.sourceRef});
    }
  }
  notes.sort((a,b)=>a.atSec-b.atSec);
  return Object.freeze({durationSec:Math.max(score.window.durationSec,...notes.map(x=>x.atSec+(x.voice.durationSec??0))),
    notes:Object.freeze(notes)});
}
