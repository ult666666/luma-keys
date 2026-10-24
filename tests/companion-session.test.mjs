import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import {createCompanionSession} from '../src/companion-session.mjs';
import {registerCompanionModelRoutes} from '../src/companion-model.mjs';
import {readCompanionStream} from '../src/companion-stream.mjs';
const workerCode=`
let active;
process.on('message', p=> {
 if(p.type==='shutdown') {process.disconnect();return;}
 if(p.type==='cancel') {if(active?.id===p.id && active.value.prompt!=='hang'){process.send({id:p.id,event:{type:'error',code:'cancelled'}});process.send({id:p.id,closed:true});active=null;}return;}
 if(p.type!=='generate')return;
 active=p;
 if(p.value.prompt==='crash'){process.exit(3);return;}
 process.send({id:p.id,event:{type:'text',text:p.value.prompt}});
 if(['hold','hang'].includes(p.value.prompt))return;
 process.send({id:p.id,event:{type:'done'}});
 process.send({id:p.id,closed:true});active=null;
});
`;
async function fixture(t) {
 const root=await fs.mkdtemp('/tmp/luma-session-test-'),file=path.join(root,'worker.mjs');
 await fs.writeFile(file,workerCode);
 const session=createCompanionSession({runtimePath:file,engineDir:root,killGraceMs:80});
 t.after(async()=>{await session.shutdown();await fs.rm(root,{recursive:true,force:true});});
 return session;
}
async function ask(session,prompt) {
 const task=session.launch();let output='';task.child.stdout.on('data',b=>output+=b);
 task.child.stdin.end(JSON.stringify({instructions:'Be helpful',prompt,history:[]}));
 const exit=await task.closed;
 return {exit,events:output.trim().split('\n').map(JSON.parse)};
}
test('IPC session streams Unicode across multiple replies and releases each turn separately',async t=>{
 const session=await fixture(t);session.warm();
 for(const text of ['你好 😊','A second answer']){
  const result=await ask(session,text);assert.equal(result.exit.code,0);
  assert.deepEqual(result.events,[{type:'text',text},{type:'done'}]);
 }
});
test('cancelled turn resolves before retry; stopping before input does not launch a request',async t=>{
 const session=await fixture(t),first=session.launch();first.stop();first.child.stdin.end('{}');await first.closed;
 const task=session.launch();let appeared;const shown=new Promise(r=>appeared=r);
 task.child.stdout.on('data',appeared);task.child.stdin.end(JSON.stringify({prompt:'hold'}));await shown;task.stop();await task.closed;
 assert.equal((await ask(session,'Retry succeeds')).events.at(-1).type,'done');
});
test('worker crash and unacknowledged Stop are reaped and the next turn recovers',async t=>{
 const session=await fixture(t);
 assert.equal((await ask(session,'crash')).exit.code,1);
 const task=session.launch();let appeared;const shown=new Promise(r=>appeared=r);
 task.child.stdout.on('data',appeared);task.child.stdin.end(JSON.stringify({prompt:'hang'}));await shown;task.stop();await task.closed;
 assert.equal((await ask(session,'Recovered')).exit.code,0);
});
test('shutdown closes the owned worker and rejects subsequent launches',async t=>{
 const session=await fixture(t);session.warm();await session.shutdown();
 assert.throws(()=>session.launch());
});
test('HTTP route preserves busy lock, safe output, cancellation and shutdown with reusable worker',async t=>{
 const session=await fixture(t),app=express();
 const backend=registerCompanionModelRoutes(app,{helperPath:process.execPath,session,buildPrompt:body=>({instructions:'Be helpful',prompt:body.message,history:[]})});
 const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
 const base=`http://127.0.0.1:${server.address().port}/api/companion`;
 t.after(async()=>{await backend.shutdown();server.closeAllConnections();await new Promise(r=>server.close(r));});
 const send=(message,signal)=>fetch(base+'/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message}),signal});
 assert.equal((await fetch(base+'/warm',{method:'POST'})).status,202);
 const controller=new AbortController();const first=await send('hold',controller.signal);const reader=first.body.getReader();await reader.read();
 assert.equal((await send('other')).status,409);controller.abort();await reader.cancel().catch(()=>{});
 let res;for(let i=0;i<30;i++){res=await send('你好');if(res.status!==409)break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(await readCompanionStream(res,()=>{}),'你好');
 assert.equal(await readCompanionStream(await send('Again'),()=>{}),'Again');
 await backend.shutdown();assert.equal((await send('After closing')).status,503);
});
