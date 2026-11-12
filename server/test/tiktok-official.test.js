import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createTikTokConnector,REQUIRED_SCOPES,VIDEO_ENDPOINT} from '../src/tiktok/connector.js';
import {createOfficialAcquisition} from '../src/tiktok/local.js';
import {createNicheService} from '../src/niche/service.js';
import {createStore} from '../src/store.js';
import {createApp} from '../src/app.js';
const at=Date.parse('2026-01-20T00:00:00Z');
const profile={id:3,brand_id:1,network:'tiktok',handle:'official_fixture',url:'https://www.tiktok.com/@official_fixture'};
const grant=()=>({access_token:'TEST_ACCESS_DO_NOT_LEAK',refresh_token:'TEST_REFRESH_DO_NOT_LEAK',open_id:'fixture-open-id',expires_at:new Date(at+3600000).toISOString(),refresh_expires_at:new Date(at+86400000).toISOString(),scope:REQUIRED_SCOPES.join(',')});
const video=(id='123')=>({id,create_time:1767225600,share_url:`${profile.url}/video/${id}`,video_description:'Sanitized response fixture',view_count:100,like_count:0,comment_count:null});
const envelope=data=>Response.json({data,error:{code:'ok',message:''}});
function provider({user={open_id:'fixture-open-id',username:'official_fixture'},pages=[{videos:[video()],has_more:false}],token,denied}={}) {
  const calls=[];let page=0;
  return {calls,async request(url,options){calls.push({url,options});assert.ok(url.startsWith('https://open.tiktokapis.com/v2/'));assert.equal(options.redirect,'error');
    if(denied)return denied();
    if(url.includes('/oauth/token/'))return Response.json(token);
    if(url.includes('/user/info/'))return envelope({user});
    assert.ok(url.startsWith(VIDEO_ENDPOINT));assert.equal(options.method,'POST');return envelope(pages[page++]);
  }};
}

test('official connector rejects absent grants, scopes and wrong account identities before listing',async()=>{
  const mock=provider();const connector=createTikTokConnector({request:mock.request,now:()=>at});
  await assert.rejects(connector.acquire({profile,grant:null}),e=>e.code==='TIKTOK_AUTH_REQUIRED');
  await assert.rejects(connector.acquire({profile,grant:{...grant(),scope:'video.list'}}),e=>e.code==='TIKTOK_SCOPE_REQUIRED');assert.equal(mock.calls.length,0);
  for(const user of [{open_id:'wrong',username:profile.handle},{open_id:grant().open_id,username:'wrong'},{open_id:grant().open_id}]){
    const other=provider({user});await assert.rejects(createTikTokConnector({request:other.request,now:()=>at}).acquire({profile,grant:grant()}),e=>e.code==='TIKTOK_IDENTITY_MISMATCH');assert.equal(other.calls.length,1);
  }
});

test('official video responses map independently of stored posts, preserve IDs/nulls/times and paginate without media',async()=>{
  const mock=provider({pages:[{videos:[video()],has_more:true,cursor:100},{videos:[video(),video('456')],has_more:false,cursor:50}]});
  const result=await createTikTokConnector({request:mock.request,now:()=>at}).acquire({profile,grant:grant()});
  assert.equal(result.receivedVideos,2);assert.equal(result.duplicateVideos,1);assert.equal(result.pages,2);assert.equal(result.hasMore,false);assert.equal(result.retainedVideos,2);
  assert.equal(result.dump.tables.posts[0].views,100);assert.equal(result.dump.tables.posts[0].likes,0);assert.equal(result.dump.tables.posts[0].comments_count,null);assert.equal(result.dump.tables.posts[0].shares,null);
  assert.equal(result.dump.tables.posts[0].posted_at,'2026-01-01T00:00:00.000Z');assert.equal(result.dump.tables.posts[0].fetched_at,new Date(at).toISOString());assert.equal(result.dump.tables.posts[0].url,video().share_url);
  assert.equal(JSON.parse(mock.calls[2].options.body).cursor,100);assert.ok(!JSON.stringify(result).includes('TEST_ACCESS'));assert.ok(!JSON.stringify(result).includes('TEST_REFRESH'));
  const noTimes=video();delete noTimes.create_time;delete noTimes.video_description;const missing=provider({pages:[{videos:[noTimes],has_more:false}]});const without=await createTikTokConnector({request:missing.request,now:()=>at}).acquire({profile,grant:grant()});assert.equal(without.dump.tables.posts[0].posted_at,null);assert.equal(without.dump.tables.posts[0].caption,null);
});

test('expired access refreshes and persists rotated grant before API calls; expired/rejected refresh fails safely',async()=>{
  const old={...grant(),expires_at:new Date(at-1000).toISOString()};let saved;
  const mock=provider({token:{access_token:'ROTATED_ACCESS',refresh_token:'ROTATED_REFRESH',open_id:old.open_id,scope:old.scope,expires_in:7200,refresh_expires_in:86400}});
  const original=mock.request;const request=async(url,options)=>{if(url.includes('/user/info/'))assert.ok(saved);return original(url,options);};
  const result=await createTikTokConnector({request,now:()=>at,clientKey:'test-key',clientSecret:'test-secret'}).acquire({profile,grant:old,saveGrant:async(value,previous)=>{assert.equal(previous,old.refresh_token);saved=value;}});
  assert.equal(result.status,'acquired');assert.equal(saved.refresh_token,'ROTATED_REFRESH');assert.equal(saved.expires_at,new Date(at+7200000).toISOString());assert.equal(new URLSearchParams(mock.calls[0].options.body).get('grant_type'),'refresh_token');
  const none=provider();await assert.rejects(createTikTokConnector({request:none.request,now:()=>at}).acquire({profile,grant:{...old,refresh_expires_at:new Date(at-1).toISOString()}}),e=>e.code==='TIKTOK_REAUTHORIZE');assert.equal(none.calls.length,0);
  await assert.rejects(createTikTokConnector({request:none.request,now:()=>at}).acquire({profile,grant:old}),e=>e.code==='TIKTOK_APP_REQUIRED');
  const bad=provider({denied:()=>Response.json({error:'invalid_grant',error_description:'PRIVATE_PROVIDER_DATA'},{status:400})});
  await assert.rejects(createTikTokConnector({request:bad.request,now:()=>at,clientKey:'key',clientSecret:'secret'}).acquire({profile,grant:old}),e=>e.code==='TIKTOK_REAUTHORIZE'&&!e.message.includes('PRIVATE'));
});

test('authorized empty is distinct; invalid metrics, URL, pagination, scopes and provider errors do not produce snapshots',async()=>{
  const empty=provider({pages:[{videos:[],has_more:false}]});const result=await createTikTokConnector({request:empty.request,now:()=>at}).acquire({profile,grant:grant()});assert.equal(result.status,'authorized_empty');assert.equal(result.accountVerified,true);assert.equal(result.dump,undefined);
  for(const pages of [[{videos:[{...video(),view_count:-1}],has_more:false}],[{videos:[{...video(),share_url:'https://evil.invalid'}],has_more:false}],[{videos:[],has_more:true}],[{videos:[video()],has_more:true,cursor:100},{videos:[],has_more:true,cursor:100}]]) {
    const mock=provider({pages});await assert.rejects(createTikTokConnector({request:mock.request,now:()=>at}).acquire({profile,grant:grant()}),e=>['TIKTOK_INVALID_RESPONSE','TIKTOK_PAGINATION'].includes(e.code));
  }
  for(const [status,code] of [[401,'TIKTOK_REAUTHORIZE'],[403,'TIKTOK_SCOPE_REQUIRED'],[429,'TIKTOK_RATE_LIMIT'],[500,'TIKTOK_API_ERROR']]){
    const mock=provider({denied:()=>Response.json({error:{code:'provider_failure',message:'PRIVATE_SERVER_ERROR'}},{status})});await assert.rejects(createTikTokConnector({request:mock.request,now:()=>at}).acquire({profile,grant:grant()}),e=>e.code===code&&!e.message.includes('PRIVATE'));
  }
});

test('bounded acquisition reports remaining pages instead of claiming complete history',async()=>{
  const mock=provider({pages:[{videos:[video()],has_more:true,cursor:100}]});const result=await createTikTokConnector({request:mock.request,now:()=>at,maxPages:1}).acquire({profile,grant:grant()});assert.equal(result.hasMore,true);assert.equal(result.receivedVideos,1);
});

test('official acquisitions reuse niche persistence, preserve existing stores and links, and do not erase data on authorized empty/failure',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'pulse-official-'));
  try{
    const videos=await createStore(dir);await videos.add({id:'saved-video',uploadedAt:'2025',analysisStatus:'uploaded',analysis:{preserved:true},creative:{preserved:true}});
    for(const name of ['creative-dna.json','performance.json'])await writeFile(path.join(dir,name),'[]');
    const before=await readFile(path.join(dir,'videos.json'),'utf8');const niche=await createNicheService({dataDir:dir,videos});const mock=provider();let acquired=await createTikTokConnector({request:mock.request,now:()=>at}).acquire({profile,grant:grant()});
    const local=createOfficialAcquisition({niche,root:'/test',worker:async()=>({result:acquired})});let result=await local.acquire();assert.equal(result.persisted,true);assert.equal(result.report.posts[0].postId,'123');assert.deepEqual(result.report.posts[0].metrics,{views:100,likes:0,comments:null,shares:null});assert.equal(result.report.posts[0].mediaUrl,null);assert.equal(result.report.provenance.method,'official_tiktok_api');
    await niche.match(result.report.id,'123','saved-video');result=await local.acquire();assert.equal(result.report.posts[0].matchedVideoId,'saved-video');assert.equal(niche.list().length,1);
    const snapshot=JSON.stringify(niche.list());acquired={status:'authorized_empty',accountVerified:true,receivedVideos:0};result=await local.acquire();assert.equal(result.persisted,false);assert.equal(JSON.stringify(niche.list()),snapshot);
    acquired={status:'acquired',accountVerified:false};await assert.rejects(local.acquire(),e=>e.code==='TIKTOK_IDENTITY_MISMATCH');assert.equal(JSON.stringify(niche.list()),snapshot);
    const app=await createApp({dataDir:dir,analysisConfig:{apiKey:''}});const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
    try{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/niche`);const shown=(await response.json()).reports[0].posts[0];assert.equal(shown.postId,'123');assert.deepEqual(shown.metrics,{views:100,likes:0,comments:null,shares:null});assert.equal(shown.originalPostUrl,video().share_url);}finally{await new Promise(resolve=>server.close(resolve));}
    const reopened=await createNicheService({dataDir:dir,videos});assert.equal(reopened.list()[0].posts[0].postId,'123');assert.equal(await readFile(path.join(dir,'videos.json'),'utf8'),before);for(const name of ['creative-dna.json','performance.json'])assert.equal(await readFile(path.join(dir,name),'utf8'),'[]');
  }finally{await rm(dir,{recursive:true,force:true});}
});


test('refresh cannot broaden account identity or continue with missing grants, and concurrent acquisition is refused',async()=>{
  const old={...grant(),expires_at:new Date(at-1).toISOString()};
  for(const token of [{...grant(),expires_in:100,refresh_expires_in:100,open_id:'different'},{...grant(),expires_in:100,refresh_expires_in:100,scope:'video.list'}]) {
    const mock=provider({token});let writes=0;
    await assert.rejects(createTikTokConnector({request:mock.request,now:()=>at,clientKey:'key',clientSecret:'secret'}).acquire({profile,grant:old,saveGrant:async()=>{writes++;}}),e=>['TIKTOK_INVALID_TOKEN','TIKTOK_SCOPE_REQUIRED'].includes(e.code));assert.equal(writes,0);assert.equal(mock.calls.length,1);
  }
  let release;const gate=new Promise(resolve=>{release=resolve;});let imports=0;
  const local=createOfficialAcquisition({root:'/test',niche:{import:async()=>{imports++;}},worker:async()=>{await gate;return {result:{status:'authorized_empty',accountVerified:true}};}});
  const first=local.acquire();await assert.rejects(local.acquire(),e=>e.code==='TIKTOK_BUSY');release();assert.equal((await first).persisted,false);assert.equal(imports,0);
});
