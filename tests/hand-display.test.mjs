import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultReading,readPreferences,validatePreferences} from '../src/preferences.mjs';
test('hand display migrates the legacy hidden choice and persists all three modes',()=>{
 assert.equal(defaultReading().handDisplay,'natural');
 assert.equal(readPreferences({reading:{keyHands:false}}).preferences.reading.handDisplay,'off');
 for(const handDisplay of ['natural','focus','off']){
  const {preferences,issues}=readPreferences({reading:{handDisplay,keyHands:false}});
  assert.deepEqual(issues,[]);assert.equal(preferences.reading.handDisplay,handDisplay);
  assert.equal(preferences.reading.keyHands,handDisplay!=='off');
  assert.equal(validatePreferences(preferences).reading.handDisplay,handDisplay);
 }
});
test('invalid hand mode is flagged without changing musical settings',()=>{
 const {preferences,issues}=readPreferences({reading:{handDisplay:'ghost',speed:.5,hand:'left'}});
 assert.deepEqual(issues,['Reading preferences']);assert.equal(preferences.reading.handDisplay,'natural');
 assert.equal(preferences.reading.speed,.5);assert.equal(preferences.reading.hand,'left');
});

test('contact-only guidance keeps held pitches and never invents fingers for infeasible chords', async()=>{
 const {guidePoses,geometryFrames}=await import('../src/hand-display.mjs');
 const left={pose:{marks:[],pedal:[]},motion:{fingers:[{finger:2,midi:52,state:'down'}]}};
 const right={pose:{guidanceOnly:true,marks:[{midi:72,finger:null,strength:1}]},motion:{guidanceOnly:true,fingers:[]}};
 const frames={left,right};
 assert.equal(geometryFrames(frames,'natural').left,left);
 assert.equal(geometryFrames(frames,'natural').right,null);
 assert.deepEqual(geometryFrames(frames,'focus'),{left:null,right:null});
 assert.deepEqual(guidePoses(frames,true).left.marks,[{midi:52,finger:2,kind:'contact',strength:1}]);
 assert.equal(guidePoses(frames,true).right.marks[0].finger,null);
 assert.deepEqual(left.pose.marks,[]);
});
test('studio hand material stays opaque to the viewport boundary',async()=>{
 const {LOOK,screenFadeLength}=await import('../src/hand3d.mjs');
 assert.equal(screenFadeLength({bed:300,h:166,u:40}),0);
 assert.ok(LOOK.wristFade[0]>.2,'the short mesh must not dissolve inside the instrument');
});
