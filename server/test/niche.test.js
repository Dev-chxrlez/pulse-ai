import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parseTikTokProfile,collectProfile,normalizeSocialMonitor} from '../src/niche/socialmonitor.js';
import {nicheStatistics} from '../src/niche/statistics.js';
import {createNicheService} from '../src/niche/service.js';
import {createStore} from '../src/store.js';
import {createApp} from '../src/app.js';

// Hand-authored structural fixtures, NOT real accounts or verified social metrics.
const profileUrl='https://www.tiktok.com/@test_fixture';
function exportFixture(count=3){return {app:'socialmonitor',version:1,exported_at:'2025-01-10T00:00:00Z',tables:{profiles:[{id:10,network:'tiktok',handle:'test_fixture',url:profileUrl,last_status:'ok'}],posts:Array.from({length:count},(_,index)=>({id:index+1,profile_id:10,network:'tiktok',ext_id:String(index+1),url:`${profileUrl}/video/${index+1}`,kind:'video',posted_at:`2025-01-${String(index+1).padStart(2,'0')}T00:00:00Z`,fetched_at:'2025-01-10T00:00:00Z',caption:'Test-only caption',views:(index+1)*10,likes:1,comments_count:1,shares:0,thumb_url:'https://example.invalid/image.jpg'})),comments:[{text:'PRIVATE_COMMENT_DO_NOT_IMPORT'}],network_tokens:[{access_token:'SECRET_DO_NOT_IMPORT'}]}};}

test('TikTok profiles are strictly validated; blocked adapter never makes a social request',async()=>{
  assert.equal(parseTikTokProfile('https://tiktok.com/@Test_Fixture?utm_source=test').profileUrl,profileUrl);
  for(const value of ['not a url','http://www.tiktok.com/@test','https://127.0.0.1/@test','https://www.tiktok.com.evil.invalid/@test','https://www.tiktok.com@127.0.0.1/@test','https://user:password@tiktok.com/@test',`${profileUrl}/video/1`,'https://www.tiktok.com:8443/@test','https://vm.tiktok.com/short'])assert.throws(()=>parseTikTokProfile(value),error=>error.code==='INVALID_PROFILE');
  assert.throws(()=>parseTikTokProfile('https://www.instagram.com/test'),error=>error.code==='SOURCE_UNSUPPORTED');
  const originalFetch=globalThis.fetch;let calls=0;
  try{globalThis.fetch=async()=>{calls++;throw new Error('SocialMonitor unavailable');};await assert.rejects(collectProfile(profileUrl),error=>error.code==='SOURCE_UNSUPPORTED');assert.equal(calls,0);}
  finally{globalThis.fetch=originalFetch;}
});

test('export normalization uses actual fields, preserves null/zero and never promotes thumbnails to media',()=>{
  const fixture=exportFixture(7);fixture.tables.posts[0].views=null;delete fixture.tables.posts[0].likes;fixture.tables.posts[0].reach=999;fixture.tables.posts[0].impressions=999;
  const all=normalizeSocialMonitor(fixture,profileUrl);assert.equal(all.posts.length,5);assert.equal(all.truncated,2);assert.ok(all.posts.every(post=>post.mediaUrl===null));
  const missing=normalizeSocialMonitor({...fixture,tables:{...fixture.tables,posts:[fixture.tables.posts[0]]}},profileUrl).posts[0];assert.equal(missing.metrics.views,null);assert.equal(missing.metrics.likes,null);assert.equal(missing.metrics.shares,0);assert.equal(missing.collectedAt,'2025-01-10T00:00:00.000Z');
  assert.ok(!JSON.stringify(all).includes('SECRET_DO_NOT_IMPORT'));assert.ok(!JSON.stringify(all).includes('PRIVATE_COMMENT_DO_NOT_IMPORT'));assert.ok(!JSON.stringify(all).includes('image.jpg'));
  const unavailable=exportFixture(1);unavailable.tables.posts[0].posted_at=null;unavailable.tables.posts[0].fetched_at=null;delete unavailable.tables.posts[0].caption;
  const post=normalizeSocialMonitor(unavailable,profileUrl).posts[0];assert.equal(post.publishedAt,null);assert.equal(post.collectedAt,null);assert.equal(post.description,'');
  assert.throws(()=>normalizeSocialMonitor({error:'Provider error'},profileUrl),error=>error.code==='INVALID_EXPORT');
  assert.throws(()=>normalizeSocialMonitor(exportFixture(),'https://www.tiktok.com/@other'),error=>error.code==='PROFILE_NOT_FOUND');
});

test('duplicate posts use the newest available reading, bad permalinks/non-video rows are skipped, errors remain explicit',()=>{
  const fixture=exportFixture(2);fixture.tables.posts.push({...fixture.tables.posts[0],fetched_at:'2025-01-11T00:00:00Z',views:90});
  fixture.tables.posts.push({...fixture.tables.posts[0],kind:'photo'});fixture.tables.posts.push({...fixture.tables.posts[1],ext_id:'3',url:'https://127.0.0.1/private'});
  const result=normalizeSocialMonitor(fixture,profileUrl);assert.equal(result.posts.length,2);assert.equal(result.duplicates,1);assert.equal(result.skipped,2);assert.equal(result.posts.find(post=>post.postId==='1').metrics.views,90);
  fixture.tables.profiles[0].last_status='error';fixture.tables.profiles[0].last_error='401 authorization required PRIVATE_SESSION';
  const failed=normalizeSocialMonitor(fixture,profileUrl);assert.equal(failed.collectionStatus,'authorization_required');assert.ok(!JSON.stringify(failed).includes('PRIVATE_SESSION'));
  fixture.tables.profiles[0].last_error='service temporarily unavailable';assert.equal(normalizeSocialMonitor(fixture,profileUrl).collectionStatus,'collection_failed');
});

test('performance ranking withholds unequal or incomplete windows and uses only known counts',()=>{
  const report=normalizeSocialMonitor(exportFixture(),profileUrl);
  // Unequal ages where fewer than two posts are 7+ days old: nothing is ranked.
  const young=report.posts.map((post,index)=>({...post,publishedAt:`2025-01-0${index+5}T00:00:00.000Z`}));
  const youngStats=nicheStatistics(young);assert.equal(youngStats.comparable,false);assert.deepEqual(youngStats.viewsRanking,[]);assert.equal(youngStats.baselineViews,null);assert.equal(youngStats.mode,'mature_lifetime');
  // Unequal ages, two mature posts and one young post: only the mature posts are compared.
  const mixed=[{...report.posts[0],publishedAt:'2025-01-01T00:00:00.000Z'},{...report.posts[1],publishedAt:'2025-01-02T00:00:00.000Z'},{...report.posts[2],publishedAt:'2025-01-08T00:00:00.000Z'}];
  const mixedStats=nicheStatistics(mixed);assert.equal(mixedStats.comparable,true);assert.deepEqual(mixedStats.excludedPostIds,[mixed[2].postId]);assert.ok(!mixedStats.viewsRanking.some(row=>row.postId===mixed[2].postId));assert.equal(mixedStats.viewsRanking.length,2);assert.equal(mixedStats.baselineViews,null);assert.equal(mixedStats.minimumAgeSeconds,7*24*3600);
  const comparable=report.posts.map(post=>({...post,publishedAt:'2025-01-01T00:00:00Z'}));
  const stats=nicheStatistics(comparable);assert.equal(stats.comparable,true);assert.equal(stats.baselineViews,20);assert.equal(stats.viewsRanking[0].postId,'3');assert.deepEqual(stats.belowBaseline,['1']);assert.equal(stats.sampleSize,3);assert.equal(stats.exploratory,true);
  comparable[0].collectedAt=null;const undated=nicheStatistics(comparable);assert.equal(undated.mode,'mature_lifetime');assert.deepEqual(undated.excludedPostIds,[comparable[0].postId]);assert.ok(!undated.viewsRanking.some(row=>row.postId===comparable[0].postId));
  assert.equal(nicheStatistics(comparable.slice(0,2)).comparable,false);
  comparable[0].collectedAt='2025-01-10T00:00:00Z';comparable[0].metrics={views:0,likes:0,comments:0,shares:0};comparable[1].metrics.likes=null;
  assert.equal(nicheStatistics(comparable).rows.find(row=>row.postId===comparable[0].postId).interactionsPerView,null);
  assert.ok(!nicheStatistics(comparable).engagementRanking.some(row=>row.postId===comparable[1].postId));
});

test('isolated persistence links existing uploads and ignores credentials/comments without modifying the video store',async()=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'pulse-niche-'));
  try{
    const videos=await createStore(dataDir);await videos.add({id:'local-test',originalName:'test.mp4',uploadedAt:'2025-01-01',analysisStatus:'completed'});const before=JSON.stringify(videos.list());
    let service=await createNicheService({dataDir,videos});const first=await service.import(exportFixture(),profileUrl);await service.match(first.id,'1','local-test');
    const again=await service.import(exportFixture(),profileUrl);assert.equal(again.id,first.id);assert.equal(service.list().length,1);assert.equal(again.posts.find(post=>post.postId==='1').matchedVideo.id,'local-test');
    await assert.rejects(service.match(first.id,'1','missing'),error=>error.code==='INVALID_VIDEO');assert.equal(JSON.stringify(videos.list()),before);
    service=await createNicheService({dataDir,videos});assert.equal(service.list()[0].posts.find(post=>post.postId==='1').analysisStatus,'completed');
    await service.match(first.id,'1',null);assert.equal(service.list()[0].posts.find(post=>post.postId==='1').matchedVideo,null);
    await assert.rejects(service.import({app:'socialmonitor',version:1,tables:{profiles:[null],posts:[]}},profileUrl),error=>error.code==='INVALID_EXPORT');
  }finally{await rm(dataDir,{recursive:true,force:true});}
});

test('HTTP fallback handles blocked live service, invalid JSON, limits, matching, and restart without provider calls',async()=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'pulse-niche-api-'));let server;
  async function start(){const app=await createApp({dataDir,analysisConfig:{apiKey:''}});server=await new Promise((resolve,reject)=>{const instance=app.listen(0,'127.0.0.1',error=>error?reject(error):resolve(instance));instance.on('error',reject);});return `http://127.0.0.1:${server.address().port}`;}
  async function stop(){await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  function form(body,name='export.json'){const data=new FormData();data.append('profileUrl',profileUrl);data.append('export',new Blob([body],{type:'application/json'}),name);return data;}
  try{
    const videos=await createStore(dataDir);await videos.add({id:'local-test',originalName:'test.mp4',uploadedAt:'2025-01-01',analysisStatus:'completed'});let base=await start();
    let response=await fetch(`${base}/api/niche/collect`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profileUrl})});assert.equal(response.status,409);assert.equal((await response.json()).error.code,'SOURCE_UNSUPPORTED');
    response=await fetch(`${base}/api/niche/import`,{method:'POST',body:form(JSON.stringify(exportFixture()))});assert.equal(response.status,201);const {report}=await response.json();assert.equal(report.posts.length,3);
    response=await fetch(`${base}/api/niche/${report.id}/posts/1/match`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({videoId:'local-test'})});assert.equal(response.status,200);assert.equal((await response.json()).report.posts.find(post=>post.postId==='1').analysisStatus,'completed');
    response=await fetch(`${base}/api/niche/import`,{method:'POST',body:form('{invalid')});assert.equal(response.status,400);
    response=await fetch(`${base}/api/niche/import`,{method:'POST',body:form(JSON.stringify({error:'provider failed'}))});assert.equal(response.status,400);
    response=await fetch(`${base}/api/niche/import`,{method:'POST',body:form(Buffer.alloc(1024*1024+1))});assert.equal(response.status,413);
    response=await fetch(`${base}/api/niche/source`);assert.equal((await response.json()).liveCollection,false);
    await stop();base=await start();response=await fetch(`${base}/api/niche`);assert.equal((await response.json()).reports.length,1);
    response=await fetch(`${base}/api/videos/local-test`);assert.equal((await response.json()).video.analysisStatus,'completed');
  }finally{if(server?.listening)await stop();await rm(dataDir,{recursive:true,force:true});}
});
