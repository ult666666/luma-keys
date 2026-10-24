// Actual Practice-screen evidence. No lab clock, pose injection, personal-data
// cleanup, or production-profile writes. Run against an isolated dev server:
// node scripts/hand-practice-evidence.mjs --phase before [--only stills|motion]
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { secondsAt, audibleTransportBeat } from '../src/tempo.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, xs) => x.startsWith('--') ? [...a, [x.slice(2), xs[i + 1]]] : a, []));
const phase = args.phase || 'before';
const base = args.base || (phase === 'before' ? 'http://127.0.0.1:5178' : 'http://127.0.0.1:5188');
const out = path.resolve(args.out || `.qa-runs/hands-corrective-2026-10-15/${phase}`);
const viewport = { width: 1440, height: 900 };
if(args.only==='summarize') {
  const prior=JSON.parse(await fs.readFile(path.join(out,'report.json'),'utf8'));
  const stored=JSON.parse(await fs.readFile(path.join(out,'fixtures.json'),'utf8'));
  for(const [i,m]of prior.motion.entries()){
    const frames=JSON.parse(await fs.readFile(path.join(out,`${m.label}-frames.json`),'utf8'));
    const summary={...summarize(frames,stored[m.fixture],m.speed),runtime:m.runtime};
    prior.motion[i]={label:m.label,speed:m.speed,fixture:m.fixture,video:m.video,...summary};
    await fs.writeFile(path.join(out,`${m.label}-summary.json`),JSON.stringify(summary,null,2));
  }
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(prior,null,2));
  console.log(`Recomputed ${prior.motion.length} summaries from existing raw frames; no UI launched.`);
  process.exit(0);
}
const health = await fetch(`${base}/api/health`).then(r => r.json());
assert.ok(health.dataDir?.includes('/.qa-runs/'), 'Evidence requires an isolated .qa-runs Library');
await fs.mkdir(out, { recursive: true });
const json = (name, data) => fs.writeFile(path.join(out, name), JSON.stringify(data, null, 2));
const preferences = await fetch(`${base}/api/preferences`).then(r => r.json());
await json('preferences-at-start.json', preferences);
// Preserve the isolated profile's other fields while choosing reproducible UI
// settings. As written makes the saved score's tempo map the transport map.
await fetch(`${base}/api/preferences`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...preferences, volume: 0, reading: { ...preferences.reading, countIn: false, metronome: false, keyboardCollapsed: false, keyLane: true, keyHands: true, handDisplay: 'natural', readingView: 'falling', mode: 'listen', hand: 'both', speed: 1, interpretation: 'written', buddy: false, welcomeSeen: true, last: { scoreId: '35f5190a-a277-41a2-960f-635902383597', exercise: null } } }) });

const note = (id, midi, beat, duration, hand, finger) => ({ id, midi, beat, duration, hand, fingerOverride: finger, velocity: 0.7 });
const piece = (id, label, notes, duration = 8, bpm = 100) => ({ id: `practice-evidence-${id}`, title: `Hand evidence · ${label}`, composer: 'Deterministic Practice fixture', bpm, tonic: 0, meter: 4, notes, duration, measures: Math.ceil(duration / 4), measureStarts: Array.from({ length: Math.ceil(duration / 4) }, (_, i) => i * 4), measureLengths: Array(Math.ceil(duration / 4)).fill(4), reviewed: true, warnings: [] });
const seq = (id, pitches, hand, fingers, step = 0.5) => pitches.map((midi, i) => note(`${id}-${hand}-${i}`, midi, i * step, step * 0.9, hand, fingers?.[i]));
const fixtures = {
  'relaxed-five': piece('relaxed-five', 'relaxed five-finger position', [...seq('five', [60,62,64,65,67,65,64,62,60], 'right', [1,2,3,4,5,4,3,2,1]), ...seq('five', [48,50,52,53,55,53,52,50,48], 'left', [5,4,3,2,1,2,3,4,5])]),
  'mixed-chord': piece('mixed-chord', 'mixed white and black chord', [['right',[60,63,67],[1,3,5]],['left',[48,51,55],[5,3,1]]].flatMap(([h, ns, fingers]) => ns.map((m,i) => note(`${h}-${m}`,m,0,3,h,fingers[i])))),
  'held-moving': piece('held-moving', 'held white key with moving black-key neighbours', [note('held',60,0,5,'right',1),note('first',64,0,1,'right',2),note('black',66,2,1,'right',3),note('last',68,3,1,'right',4),note('bass',48,0,5,'left',5),note('bass-first',52,0,1,'left',3),note('bass-second',55,2,1,'left',1)]),
  'position-transition': piece('position-transition', 'release and octave position transition', [[0,[60,64,67],[48,52,55],1.5],[2,[72,76,79],[36,40,43],1.5],[4,[60,64,67],[48,52,55],2]].flatMap(([b,r,l,d]) => [['right',r,[1,3,5]],['left',l,[5,3,1]]].flatMap(([h,ns,f]) => ns.map((m,i) => note(`${h}-${b}-${m}`,m,b,d,h,f[i]))))),
  'arpeggio': piece('arpeggio', 'arpeggio', [...seq('arp',[60,64,67,72,67,64,60], 'right',[1,2,3,5,3,2,1]), ...seq('arp',[48,52,55,60,55,52,48],'left',[5,3,2,1,2,3,5])]),
  'mixed-arpeggio': piece('mixed-arpeggio', 'mixed black and white key arpeggio', [...seq('mixarp',[61,65,68,73,68,65,61], 'right',[1,2,3,5,3,2,1]), ...seq('mixarp',[49,53,56,61,56,53,49],'left',[5,3,2,1,2,3,5])]),
  'repeated': piece('repeated', 'repeated notes', [...seq('repeat',[60,60,60,60,64,64,64,64],'right',[1,1,1,1,3,3,3,3]),...seq('repeat',[48,48,48,48,52,52,52,52],'left',[5,5,5,5,3,3,3,3])]),
  'wide-intervals': piece('wide-intervals', 'wide intervals and release', [[0,[60,72],[36,48]],[2,[62,74],[38,50]],[4,[60,72],[36,48]]].flatMap(([b,r,l]) => [['right',r,[1,5]],['left',l,[5,1]]].flatMap(([h,ns,f]) => ns.map((m,i) => note(`${h}-${b}-${m}`,m,b,1.5,h,f[i]))))),
};
fixtures.scale = { ...piece('scale', 'two-hand scale and crossover', [], 16), ...JSON.parse(await fs.readFile('tests/fixtures/hand-motion/scale.json', 'utf8')), id: 'practice-evidence-scale', title: 'Hand evidence · two-hand scale and crossover', reviewed: true, measures: 4, duration: 16, meter: 4, measureStarts: [0,4,8,12], measureLengths: [4,4,4,4] };
const scores = await fetch(`${base}/api/scores`).then(r => r.json());
const appassionata = scores.find(s => s.id === '35f5190a-a277-41a2-960f-635902383597') || scores.find(s => s.title.includes('Appassionata'));
assert.ok(appassionata, 'The isolated Library must contain Appassionata');
assert.deepEqual(appassionata.notes.filter(n => n.beat === 0).map(n => n.midi).sort((a,b)=>a-b), [46,55,64,73]);
await json('fixtures.json', { appassionata, ...fixtures });
// The frozen baseline uses port 5178, outside the browser-origin write list.
// Seed through the normal JSON-import API before loading the page. The server
// still validates/normalizes every note and generates each score identity.
for (const [name, fixture] of Object.entries(fixtures)) {
  const data = new FormData();
  data.append('score', new Blob([JSON.stringify(fixture)], { type: 'application/json' }), `${fixture.id}.json`);
  const response = await fetch(`${base}/api/import`, { method: 'POST', body: data });
  const result = await response.json();
  assert.ok(response.ok && result.score, `${name}: ${JSON.stringify(result)}`);
  fixtures[name] = result.score;
}
await json('imported-fixtures.json', fixtures);
const sourceFiles = ['src/hand3d.mjs','src/hand3d-rig.mjs','src/hand3d-data.mjs','src/hand-pose.mjs','src/hands3d-layer.mjs','src/KeyboardGuide.jsx','src/App.jsx'];
const sourceRoot = args['source-root'] || (phase === 'before' && base.endsWith(':5178') ? '.qa-runs/hands-corrective-2026-10-15/baseline-source' : '.');
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async p => [p, createHash('sha256').update(await fs.readFile(path.join(sourceRoot,p))).digest('hex')])));
const build = await fetch(`${base}/__luma_build.json`).then(r=>r.json()).catch(()=>null);
const report = { phase, base, out, capturedAt: new Date().toISOString(), health, viewport, dpr: 1, build, sourceRoot, sourceHashes, stills: [], motion: [], errors: [], notes: ['All normal frames use the real Practice screen and audible transport clock.', 'Neutral and silhouette are temporary diagnostic mesh-material swaps at the same paused camera/pose; original materials are restored.', 'Video contains visual output only. Volume is muted; audible synchronization is not claimed.'] };
if (args.only === 'motion' || args.only === 'stills') {
  const previous = await fs.readFile(path.join(out,'report.json'),'utf8').then(JSON.parse).catch(()=>null);
  if(previous?.phase===phase) {
    if(args.only==='motion') report.stills = previous.stills || [];
    if(args.only==='stills') report.motion = previous.motion || [];
  }
}
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio','--enable-gpu','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding'] });
report.browserVersion = browser.version();
async function profileWrites(context) {
  if(!base.endsWith(':5178'))return;
  // Baseline-only test adapter: preserve real API writes/responses while the
  // frozen dev page uses a second local port. No application security changes.
  await context.route('**/api/**',async route=>{
    const req=route.request();if(['GET','HEAD'].includes(req.method()))return route.continue();
    const headers={};if(req.headers()['content-type'])headers['content-type']=req.headers()['content-type'];
    const result=await fetch(req.url(),{method:req.method(),headers,body:req.postDataBuffer()});
    await route.fulfill({status:result.status,contentType:result.headers.get('content-type')||'application/json',body:Buffer.from(await result.arrayBuffer())});
  });
}
const button = (p, name) => p.getByRole('button', { name, exact: true });
const networkResources = new WeakMap();
const monitor = p => { networkResources.set(p,[]);p.setDefaultTimeout(30000); p.setDefaultNavigationTimeout(60000); p.on('pageerror', e => report.errors.push(e.message));p.on('response',r=>{if(/hand|models\/hands/.test(r.url()))networkResources.get(p).push({url:r.url(),status:r.status()});}); };
async function ready(p) {
  await expect(button(p,'Play')).toBeEnabled({ timeout: 60000 });
  await p.getByRole('tab',{name:'Falling notes',exact:true}).click();
  await p.getByRole('combobox',{name:'Hands display',exact:true}).selectOption('natural');
  await button(p,'Listen & follow').click();
  await p.getByRole('combobox',{name:'Practice speed',exact:true}).selectOption('1');
  await p.waitForFunction(() => window.lumaHandPlan?.()?.ready && window.lumaHands3d?.()?.state === 'ready', null, { timeout: 90000 });
  await p.mouse.move(0,0);
}
async function open(p, score) {
  await button(p,'Library').click();
  await p.getByRole('button',{name:new RegExp(`^Open ${score.title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`)}).first().click();
  await ready(p);
}
async function imported(p, fixture) {
  console.log(`Opening ${fixture.title}`);
  await open(p,fixture);
}
async function seek(p, beat) {
  if (await button(p,'Pause').count()) await button(p,'Pause').click();
  await p.getByRole('slider',{name:'Song position',exact:true}).fill(String(beat));
  await p.waitForTimeout(650); // Production paused settling is bounded to 300 ms.
  await p.mouse.move(0,0);
}
const sample = () => {
  const clock = window.lumaClock?.(), hands = window.lumaHands?.();
  const renderer = window.__lumaHands3d?.renderer;
  const stage = document.querySelector('.keyboard-stage');
  const shown = (stage?.dataset.geometryHands || '').split(' ');
  const raw = Object.fromEntries(['left','right'].map(h => [h, shown.includes(h) ? renderer?.fingers(h) : null]));
  const rect = e => { const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
  return { t: performance.now(), buildId:window.lumaBuild?.id??null, clock, hands, raw, plan: window.lumaHandPlan?.(), renderer: window.lumaHands3d?.(), stage: {...stage?.dataset}, keys: [...document.querySelectorAll('.piano-key')].map(e=>({midi:+e.dataset.midi,on:e.dataset.on||'',land:e.dataset.land||'',finger:e.dataset.landFinger||'',...rect(e)})), bed:document.querySelector('.key-bed')?rect(document.querySelector('.key-bed')):null };
};
const runtimeIdentity = async () => {
  const r=window.__lumaHands3d?.renderer;
  const digest=async typed=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typed.buffer.slice(typed.byteOffset,typed.byteOffset+typed.byteLength)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const meshes={};
  for(const [hand,h] of Object.entries(r?.hands||{})) {
    const g=h.mesh.geometry;
    meshes[hand]={positionSha256:await digest(g.attributes.position.array),normalSha256:await digest(g.attributes.normal.array),skinWeightSha256:await digest(g.attributes.skinWeight.array),vertices:g.attributes.position.count,triangles:g.index.count/3,material:h.mesh.material.type,visible:h.group.visible};
  }
  const geometry=(await import('/src/hand3d-data.mjs')).HAND_RENDER_GEOMETRY;
  return {url:location.href,buildId:window.lumaBuild?.id??null,browser:{userAgent:navigator.userAgent,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,viewportScale:visualViewport?.scale??1},geometry,meshes,camera:{projection:r.camera.projectionMatrix.elements,world:r.camera.matrixWorld.elements,position:r.camera.position.toArray()},view:{u:r.view.u,h:r.view.h,bed:r.view.bed,left:r.view.left,width:r.view.width,height:r.view.height,dpr:r.view.dpr},stage:{...document.querySelector('.keyboard-stage')?.dataset},resources:performance.getEntriesByType('resource').filter(e=>/hand|models\/hands/.test(e.name)).map(e=>({url:e.name,type:e.initiatorType,duration:e.duration,bytes:e.transferSize}))};
};
async function capture(p, name, beat) {
  await seek(p,beat);
  const data = await p.evaluate(sample);
  data.runtime = await p.evaluate(runtimeIdentity);
  data.runtime.networkResources=networkResources.get(p);
  assert.equal(data.buildId,report.build.id,'Screenshot build must match the requested build');
  assert.equal((await fetch(`${base}/__luma_build.json`).then(r=>r.json())).id,report.build.id,'Source must remain frozen during still capture');
  assert.equal(data.clock.playing,false);
  assert.equal(data.clock.beat,beat);
  const full = `${name}.png`, crop = `${name}-keyboard.png`;
  await p.screenshot({ path:path.join(out,full), animations:'disabled' });
  const bed = await p.locator('.key-bed').boundingBox();
  const clip = {x:Math.max(0,Math.floor(bed.x)),y:Math.max(0,Math.floor(bed.y-12)),width:Math.min(viewport.width-Math.max(0,Math.floor(bed.x)),Math.ceil(bed.width)),height:Math.min(viewport.height-Math.max(0,Math.floor(bed.y-12)),Math.ceil(bed.height+12))};
  await p.screenshot({path:path.join(out,crop),clip,animations:'disabled'});
  await json(`${name}.json`,data);
  report.stills.push({name,beat,full,crop,clip,clock:data.clock,geometryHands:data.stage.geometryHands});
  console.log(`Captured ${name} at beat ${beat}`);
}
async function diagnostic(p, mode) {
  await p.evaluate(async mode => {
    const r=window.__lumaHands3d.renderer;
    const THREE=await import('/node_modules/.vite/deps/three.js');
    window.__practiceEvidenceMaterials=[];
    for(const h of Object.values(r.hands)) {
      for(const mesh of [h.mesh,...(h.nails||[])]) {
        if(!mesh?.material)continue;
        const original=mesh.material;
        const material=mode==='silhouette'?new THREE.MeshBasicMaterial({color:0x111111,side:original.side}):new THREE.MeshStandardMaterial({color:0xb8b8b8,roughness:1,metalness:0,side:original.side});
        window.__practiceEvidenceMaterials.push({mesh,original,material});mesh.material=material;
      }
    }
    r.render();
  },mode);
  try { await capture(p,`appassionata-${mode}`,0); }
  finally { await p.evaluate(()=>{for(const {mesh,original,material} of window.__practiceEvidenceMaterials){mesh.material=original;material.dispose();}delete window.__practiceEvidenceMaterials;window.__lumaHands3d.renderer.render();}); }
}
function quantile(xs,q) { const a=xs.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?a[Math.floor((a.length-1)*q)]:null; }
function summarize(frames, score, speed) {
  const gaps=frames.slice(1).map((f,i)=>f.t-frames[i].t),notes=new Map(),contacts=[],missing=[],unexpected=[];
  const allDownErrors=frames.flatMap(f=>Object.values(f.raw).flatMap(ds=>(ds||[]).filter(d=>d.state==='down').map(d=>d.error*1000)));
  const delta=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  let expectedSamples=0,coveredSamples=0,missingSamples=0,stableMissingSamples=0,markerCoveredSamples=0,syntheticLegatoSamples=0,unexpectedSamples=0,clockMs=0,targetStep=0,padStep=0,targetExcursion=0,padExcursion=0;
  const boundarySeconds=0.03,legatoAllowanceSeconds=0.04;
  for(const [frameIndex,f] of frames.entries()) {
    const beat=f.hands.left?.beat??f.hands.right?.beat??f.clock.beat;
    const active=new Map();
    // A same-pitch reattack owns one physical contact. Keep the latest onset
    // identity, so consecutive repeated notes never share a drift anchor.
    for(const n of score.notes)if(n.beat<=beat+1e-8&&n.beat+n.duration>beat+1e-8){const k=`${n.hand}:${n.midi}`,old=active.get(k);if(!old||old.beat<n.beat)active.set(k,n);}
    for(const [key,n]of active) {
      expectedSamples++;
      let entry=notes.get(n.id);
      if(!entry){entry={id:n.id,hand:n.hand,midi:n.midi,onset:n.beat,end:n.beat+n.duration,expectedSamples:0,matchedSamples:0,missingSamples:0,firstMatchedBeat:null,lastMatchedBeat:null,maxErrorMm:null,maxTargetExcursionPx:0,maxPadExcursionPx:0};notes.set(n.id,entry);}
      entry.expectedSamples++;
      const d=(f.raw[n.hand]||[]).find(d=>d.state==='down'&&d.midi===n.midi);
      if(!d){missingSamples++;entry.missingSamples++;const since=(secondsAt(score,beat)-secondsAt(score,n.beat))/speed,until=(secondsAt(score,n.beat+n.duration)-secondsAt(score,beat))/speed;if(since>boundarySeconds&&until>boundarySeconds)stableMissingSamples++;if(f.keys.some(k=>k.midi===n.midi&&k.land))markerCoveredSamples++;if(missing.length<24)missing.push({frame:frameIndex,beat,id:n.id,hand:n.hand,midi:n.midi,sinceOnsetSeconds:since,untilReleaseSeconds:until,geometryHands:f.stage.geometryHands});continue;}
      coveredSamples++;entry.matchedSamples++;contacts.push(d.error*1000);
      if(entry.firstMatchedBeat==null){entry.firstMatchedBeat=beat;entry.anchorContact=d.contact;entry.anchorBottom=d.bottom;}
      entry.lastMatchedBeat=beat;entry.maxErrorMm=Math.max(entry.maxErrorMm??0,d.error*1000);
      if(d.contact&&entry.anchorContact){entry.maxTargetExcursionPx=Math.max(entry.maxTargetExcursionPx,delta(d.contact,entry.anchorContact));targetExcursion=Math.max(targetExcursion,entry.maxTargetExcursionPx);}
      if(d.bottom&&entry.anchorBottom){entry.maxPadExcursionPx=Math.max(entry.maxPadExcursionPx,delta(d.bottom,entry.anchorBottom));padExcursion=Math.max(padExcursion,entry.maxPadExcursionPx);}
      if(entry.previousFrame===frameIndex-1){if(d.contact&&entry.previousContact)targetStep=Math.max(targetStep,delta(d.contact,entry.previousContact));if(d.bottom&&entry.previousBottom)padStep=Math.max(padStep,delta(d.bottom,entry.previousBottom));}
      entry.previousFrame=frameIndex;entry.previousContact=d.contact;entry.previousBottom=d.bottom;
    }
    for(const[h,ds]of Object.entries(f.raw))for(const d of ds||[])if(d.state==='down'&&!active.has(`${h}:${d.midi}`)) {
      const ended=score.notes.filter(n=>n.hand===h&&n.midi===d.midi&&n.beat+n.duration<=beat+1e-8).sort((a,b)=>(b.beat+b.duration)-(a.beat+a.duration))[0];
      const elapsed=ended?(secondsAt(score,beat)-secondsAt(score,ended.beat+ended.duration))/speed:Infinity;
      if(elapsed>=-1e-8&&elapsed<=legatoAllowanceSeconds+1e-8)syntheticLegatoSamples++;
      else {unexpectedSamples++;if(unexpected.length<24)unexpected.push({frame:frameIndex,beat,hand:h,midi:d.midi,finger:d.finger,secondsAfterWrittenRelease:Number.isFinite(elapsed)?elapsed:null});}
    }
    if(f.clock.playing&&f.clock.now>=f.clock.start){const mapped=audibleTransportBeat(f.clock,score,speed,f.clock.now-f.clock.latency);clockMs=Math.max(clockMs,Math.abs(secondsAt(score,beat)-secondsAt(score,mapped))/speed*1000);}
  }
  const perNote=[...notes.values()].map(({anchorContact,anchorBottom,previousContact,previousBottom,previousFrame,...n})=>({...n,firstContactLagMs:n.firstMatchedBeat==null?null:(secondsAt(score,n.firstMatchedBeat)-secondsAt(score,n.onset))/speed*1000}));
  const uniqueBuildIds=[...new Set(frames.map(f=>f.buildId??null))];
  return {measurementValid:frames.length>0&&expectedSamples>0&&contacts.length>0,frames:frames.length,firstBeat:frames[0]?.hands.left?.beat??frames[0]?.hands.right?.beat,lastBeat:frames.at(-1)?.hands.left?.beat??frames.at(-1)?.hands.right?.beat,buildIds:uniqueBuildIds,rafMs:{p50:quantile(gaps,.5),p95:quantile(gaps,.95),max:gaps.length?Math.max(...gaps):null},contactSamples:allDownErrors.length,expectedContactSamples:contacts.length,maxContactErrorMm:allDownErrors.length?Math.max(...allDownErrors):null,maxExpectedContactErrorMm:contacts.length?Math.max(...contacts):null,maxTargetDriftPx:targetStep,maxHeldPadStepPx:padStep,maxTargetExcursionPx:targetExcursion,maxHeldPadExcursionPx:padExcursion,maxStageClockDifferenceMs:clockMs,coverage:{expectedSamples,coveredSamples,missingSamples,stableMissingSamples,markerCoveredSamples,syntheticLegatoSamples,unexpectedSamples,boundarySeconds,legatoAllowanceSeconds,missingExamples:missing,unexpectedExamples:unexpected,notesSeen:perNote.length,notesWithNoContact:perNote.filter(n=>!n.matchedSamples).map(n=>n.id)},perNote,guidanceFrames:frames.filter(f=>(f.stage.geometryHands||'').trim()!=='left right').length};
}
try {
  const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'no-preference'});await profileWrites(context);const p=await context.newPage();monitor(p);
  await p.goto(base);await ready(p);await open(p,appassionata);
  if(args.only!=='motion') { await capture(p,'appassionata-natural',0);await diagnostic(p,'neutral');await diagnostic(p,'silhouette'); }
  if(args.only!=='motion')for(const [name,fixture]of Object.entries(fixtures)){
    await imported(p,fixture);
    if(args.only!=='motion'&&['relaxed-five','mixed-chord','held-moving','position-transition'].includes(name)){
      const beats=name==='position-transition'?[1.5,1.8,2]:name==='held-moving'?[0,2.35]:name==='relaxed-five'?[0,1.2]:[0,1];
      for(const beat of beats)await capture(p,`${name}-${String(beat).replace('.','_')}`,beat);
    }
  }
  await p.evaluate(()=>window.lumaFlushPreferences?.());await context.close();
  await json('report.json',report);
  console.log(`${phase}: saved ${report.stills.length} still pairs`);
  if(args.only!=='stills')for(const name of ['appassionata','relaxed-five','mixed-chord','held-moving','position-transition','scale','arpeggio','mixed-arpeggio','repeated','wide-intervals'].filter(name=>!args.fixture||args.fixture===name)){
    const fixture=name==='appassionata'?appassionata:fixtures[name];
    for(const speed of (['scale','held-moving','position-transition'].includes(name)?[0.5,1]:[1])){
      const label=`${name}-${speed}x`,videoDir=path.join(out,'video',label);await fs.mkdir(videoDir,{recursive:true});
      const ctx=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'no-preference',recordVideo:{dir:videoDir,size:viewport}});
      await profileWrites(ctx);
      const page=await ctx.newPage();monitor(page);await page.goto(base);await ready(page);await open(page,fixture);
      await page.getByRole('combobox',{name:'Practice speed',exact:true}).selectOption(String(speed));
      await page.waitForFunction(()=>window.lumaHandPlan?.()?.ready);await seek(page,0);
      const runtime=await page.evaluate(runtimeIdentity);
      runtime.networkResources=networkResources.get(page);
      assert.equal(runtime.buildId,report.build.id,'Loaded motion renderer must match the requested build');
      await page.evaluate(()=>window.lumaHands3d?.({reset:true}));
      const to=name==='scale'?8:6;
      await page.evaluate(({source,to})=>{
        window.__practiceEvidence={frames:[],to,done:false};const read=(0,eval)(`(${source})`);
        const tick=()=>{const e=window.__practiceEvidence;const f=read();if(f.clock.playing){e.frames.push(f);const beat=f.hands.left?.beat??f.hands.right?.beat??f.clock.beat;if(beat>=e.to){e.done=true;return;}}e.raf=requestAnimationFrame(tick);};requestAnimationFrame(tick);
      },{source:sample.toString(),to});
      await button(page,'Play').click();await button(page,'Pause').waitFor();
      await page.waitForFunction(()=>window.__practiceEvidence.done,null,{timeout:60000});
      await button(page,'Pause').click();
      const frames=await page.evaluate(()=>{cancelAnimationFrame(window.__practiceEvidence.raf);return window.__practiceEvidence.frames;});
      assert.ok(frames.length&&frames.every(f=>f.buildId===report.build.id),'Every captured motion frame must retain the requested build');
      const summary={...summarize(frames,fixture,speed),runtime};await json(`${label}-frames.json`,frames);await json(`${label}-summary.json`,summary);
      const video=page.video();await ctx.close();await video.saveAs(path.join(out,`${label}.webm`));
      assert.equal((await fetch(`${base}/__luma_build.json`).then(r=>r.json())).id,report.build.id,'Source must remain frozen throughout the motion recording');
      report.motion.push({label,speed,fixture:name,video:`${label}.webm`,...summary});await json('report.json',report);console.log(label,JSON.stringify({frames:summary.frames,maxContactErrorMm:summary.maxContactErrorMm,maxHeldPadExcursionPx:summary.maxHeldPadExcursionPx,clockMs:summary.maxStageClockDifferenceMs,missing:summary.coverage.missingSamples,stableMissing:summary.coverage.stableMissingSamples,unexpected:summary.coverage.unexpectedSamples}));
    }
  }
} catch(error) { report.failure=error.stack;for(const [i,p] of browser.contexts().flatMap(c=>c.pages()).entries()){await p.screenshot({path:path.join(out,`failure-${i}.png`)}).catch(()=>{});await fs.writeFile(path.join(out,`failure-${i}.txt`),await p.locator('body').innerText().catch(()=>''));}await json('report.json',report);throw error; }
finally { await browser.close();await json('report.json',report); }
console.log(`Saved ${report.stills.length} still pairs and ${report.motion.length} Practice recordings to ${out}`);
