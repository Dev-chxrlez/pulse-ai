import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {request as httpRequest} from 'node:http';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {approvedExport} from '../src/niche/sync-export.js';
import {createLocalSync,readLocalExport} from '../src/niche/local-sync.js';
import {localSyncRoutes} from '../src/niche/sync-routes.js';
import {createNicheService} from '../src/niche/service.js';
import {createStore} from '../src/store.js';
const profileUrl='https://www.tiktok.com/@local_fixture';
const fixture=()=>({app:'socialmonitor',version:1,exported_at:'2025-02-01T00:00:00Z',tables:{profiles:[{id:1,brand_id:2,network:'tiktok',handle:'local_fixture',url:profileUrl,last_error:'PRIVATE_ERROR',password:'PRIVATE_PASSWORD'}],posts:[{profile_id:1,network:'tiktok',ext_id:'123',url:`${profileUrl}/video/123`,kind:'video',posted_at:'2025-01-01T00:00:00Z',fetched_at:'2025-01-02T00:00:00Z',views:20,likes:null,comments_count:0,shares:0,caption:'Isolated test record',secret:'PRIVATE_POST'}],comments:[{text:'PRIVATE_COMMENT'}],brands:[{alert_emails:'PRIVATE_EMAIL'}],network_tokens:[{token:'PRIVATE_TOKEN'}],schedules:[],runs:[]}});
function sourceDb({profiles=fixture().tables.profiles,count=1}={}){return {prepare(sql){assert.match(sql,/^SELECT/);return {all:()=>profiles,get:()=>({count})};}};}

test('approved transfer scopes profile/brand and drops comments, credentials and unrelated fields',()=>{
  let calls=0;const raw=fixture();raw.tables.posts.push({...raw.tables.posts[0],profile_id:999});raw.tables.profiles.push({...raw.tables.profiles[0],id:999,network:'instagram'});
  const dump=approvedExport(sourceDb(),(_db,brand)=>{calls++;assert.equal(brand,2);return raw;},profileUrl);
  assert.equal(calls,1);assert.equal(dump.tables.posts.length,1);assert.equal(dump.tables.profiles.length,1);
  assert.deepEqual(Object.keys(dump.tables),['profiles','posts']);assert.ok(!JSON.stringify(dump).includes('PRIVATE_'));
  assert.equal(dump.tables.posts[0].likes,null);assert.equal(dump.tables.posts[0].comments_count,0);
  assert.throws(()=>approvedExport(sourceDb({profiles:[]}),()=>{throw Error('must not export');},profileUrl),e=>e.code==='PROFILE_NOT_FOUND');
  assert.throws(()=>approvedExport(sourceDb({count:0}),()=>{throw Error('must not export');},profileUrl),e=>e.code==='SYNC_EMPTY');
  const empty=fixture();empty.tables.posts=[];assert.throws(()=>approvedExport(sourceDb(),()=>empty,profileUrl),e=>e.code==='NO_VIDEO_POSTS');
  assert.throws(()=>approvedExport(sourceDb(),()=>({version:2}),profileUrl),e=>e.code==='INVALID_EXPORT');
  assert.throws(()=>approvedExport(sourceDb({profiles:[...raw.tables.profiles.slice(0,1),...raw.tables.profiles.slice(0,1)]}),()=>raw,profileUrl),e=>e.code==='AMBIGUOUS_PROFILE');
});

test('local sync reuses normalizer, preserves links/stores, warns on invalid metrics and survives failed/repeated imports',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'pulse-local-sync-'));const originalFetch=globalThis.fetch;
  try{
    globalThis.fetch=async()=>{throw Error('No network, paid API or collector allowed');};
    const videos=await createStore(dir);await videos.add({id:'saved',uploadedAt:'2025-01-01',analysisStatus:'completed',analysis:{report:{findings:[]},unchanged:true},creative:{unchanged:true}});
    await writeFile(path.join(dir,'creative-dna.json'),'[]');await writeFile(path.join(dir,'performance.json'),'[]');
    const before=await readFile(path.join(dir,'videos.json'),'utf8');const niche=await createNicheService({dataDir:dir,videos});let raw=fixture();
    const sync=createLocalSync({niche,root:'/test-only',health:async()=>true,readExport:async()=>raw});
    let out=await sync.sync(profileUrl);assert.equal(out.report.posts.length,1);assert.equal(out.missingMetrics,1);assert.equal(out.report.provenance.method,'local_readonly_export');
    await niche.match(out.report.id,'123','saved');
    raw=fixture();raw.tables.posts.push({...raw.tables.posts[0],views:30,fetched_at:'2025-01-03T00:00:00Z'});raw.tables.posts.push({...raw.tables.posts[0],ext_id:'456',views:-1,url:`${profileUrl}/video/456`});
    out=await sync.sync(profileUrl);assert.equal(out.report.duplicates,1);assert.equal(out.report.skipped,1);assert.ok(out.report.warnings.length);assert.equal(out.report.posts[0].metrics.views,30);assert.equal(out.report.posts[0].matchedVideoId,'saved');assert.equal(niche.list().length,1);
    const snapshot=JSON.stringify(niche.list());raw.tables.posts.forEach(post=>{post.views='invalid';});await assert.rejects(sync.sync(profileUrl),e=>e.code==='NO_VIDEO_POSTS');assert.equal(JSON.stringify(niche.list()),snapshot);
    raw={version:2};await assert.rejects(sync.sync(profileUrl),e=>e.code==='INVALID_EXPORT');assert.equal(JSON.stringify(niche.list()),snapshot);
    assert.equal(await readFile(path.join(dir,'videos.json'),'utf8'),before);assert.equal(await readFile(path.join(dir,'creative-dna.json'),'utf8'),'[]');assert.equal(await readFile(path.join(dir,'performance.json'),'utf8'),'[]');
    assert.ok(!JSON.stringify(niche.list()).includes('PRIVATE_'));
  }finally{globalThis.fetch=originalFetch;await rm(dir,{recursive:true,force:true});}
});

test('sync blocks unavailable source, unconfigured setup, and concurrent transfers before writes',async()=>{
  let imports=0,reads=0;const niche={import:async()=>{imports++;}};
  await assert.rejects(createLocalSync({niche,root:'',health:async()=>true}).sync(profileUrl),e=>e.code==='SYNC_DISABLED');
  await assert.rejects(createLocalSync({niche,root:'/test',health:async()=>false,readExport:async()=>{reads++;}}).sync(profileUrl),e=>e.code==='SOURCE_UNAVAILABLE');
  let release;const gate=new Promise(resolve=>{release=resolve;});const sync=createLocalSync({niche,root:'/test',health:async()=>{await gate;return false;}});
  const first=sync.sync(profileUrl);await assert.rejects(sync.sync(profileUrl),e=>e.code==='SYNC_BUSY');release();await assert.rejects(first,e=>e.code==='SOURCE_UNAVAILABLE');assert.equal(imports,0);assert.equal(reads,0);
});

test('worker refuses unknown source code without executing it or leaking local paths',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'pulse-sync-source-'));
  try{await mkdir(path.join(dir,'apps/app/src/core'),{recursive:true});await writeFile(path.join(dir,'apps/app/src/core/transfer.ts'),"throw Error('PRIVATE_MUST_NOT_EXECUTE')");
    await assert.rejects(readLocalExport({root:dir,database:path.join(dir,'missing.db'),profileUrl}),e=>e.code==='SOURCE_VERSION'&&!e.message.includes(dir)&&!e.message.includes('PRIVATE_'));
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('local sync HTTP boundary rejects foreign/missing origin, forwarded/public hosts, missing and replayed capabilities',async()=>{
  const app=express();let calls=0;app.use('/sync',localSyncRoutes({enabled:true,sync:async()=>{calls++;return {report:{posts:[]}};}},{origin:'http://localhost:5173'}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const url=`http://127.0.0.1:${server.address().port}/sync`;
  const headers={'Content-Type':'application/json',Origin:'http://localhost:5173','X-Pulse-Local-Sync':'1'};
  try {
    for(const extra of [{Origin:'https://evil.invalid'},{Origin:''},{'X-Forwarded-For':'203.0.113.1'}, {'X-Pulse-Local-Sync':''}])assert.equal((await fetch(url+'/session',{method:'POST',headers:{...headers,...extra}})).status,403,JSON.stringify(extra));
    const deniedHost=await new Promise((resolve,reject)=>{const req=httpRequest(url+'/session',{method:'POST',headers:{...headers,Host:'public.invalid'}},response=>{response.resume();resolve(response.statusCode);});req.on('error',reject);req.end();});assert.equal(deniedHost,403);
    assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({profileUrl})})).status,401);
    const grant=await (await fetch(url+'/session',{method:'POST',headers})).json();assert.equal(typeof grant.capability,'string');
    const request={method:'POST',headers:{...headers,Authorization:`Bearer ${grant.capability}`},body:JSON.stringify({profileUrl})};
    assert.equal((await fetch(url,request)).status,200);assert.equal((await fetch(url,request)).status,401);assert.equal(calls,1);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
