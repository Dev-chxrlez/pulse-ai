import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createStore} from '../src/store.js';
import {createNicheService} from '../src/niche/service.js';
import {creativePatternReport,savedCreativeInsights} from '../src/niche/patterns.js';
import {nicheStatistics} from '../src/niche/statistics.js';
import {createApp} from '../src/app.js';

// Synthetic fixtures only; no external collection or paid model requests.
const profile='https://www.tiktok.com/@test_fixture';
function dump(){return {app:'socialmonitor',version:1,tables:{profiles:[{id:1,network:'tiktok',url:profile,handle:'test_fixture'}],posts:[1,2,3,4].map(id=>({profile_id:1,network:'tiktok',ext_id:String(id),url:`${profile}/video/${id}`,kind:'video',caption:'Test caption',posted_at:'2025-01-01T00:00:00Z',fetched_at:'2025-01-10T00:00:00Z',views:id*10,likes:id,comments_count:0,shares:0}))}};}
function video(id,duration){return {id,originalName:'test-only.mp4',uploadedAt:'2025-01-01',analysisStatus:'completed',metadata:{duration},analysis:{metadata:{duration},frames:[{index:0,timestamp:.75}],transcript:{windows:[{index:0,start:0,end:3,text:'test-only'}]},report:{findings:[{category:'opening_hook',certainty:'observed',title:'Test hook',assessment:'Test-only observation.',suggestion:'Test-only edit.',evidence:[{source:'frame',index:0,observation:'Test frame'}]}]}}};}

test('inline insights reuse exact saved evidence and never invent missing categories or scores',()=>{
  const saved=video('test',10);const before=JSON.stringify(saved);
  let insight=savedCreativeInsights(saved);assert.equal(insight.observations.length,1);assert.equal(insight.observations[0].evidence[0].start,.75);assert.ok(insight.missingCategories.includes('pacing'));assert.equal(insight.creative,null);
  saved.creativeStatus='completed';saved.creative={overall:null,coverage:55,hooks:[],priorities:[]};insight=savedCreativeInsights(saved);assert.equal(insight.creative.overall,null);assert.equal(insight.creative.coverage,55);
  assert.equal(savedCreativeInsights({...saved,analysisStatus:'processing'}),null);
  delete saved.creative;delete saved.creativeStatus;assert.equal(JSON.stringify(saved),before);
});

test('patterns require shared windows and multiple distinct analyzed files per structured duration group',async()=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'pulse-pattern-'));
  try{
    const videos=await createStore(dataDir);for(const [id,duration] of [['a',8],['b',10],['c',22],['d',25]])await videos.add(video(id,duration));
    const service=await createNicheService({dataDir,videos});let report=await service.import(dump(),profile);
    assert.equal(report.patterns.status,'insufficient_data');
    for(const [postId,id] of [['1','a'],['2','b'],['3','c'],['4','d']])report=await service.match(report.id,postId,id);
    assert.equal(report.patterns.status,'available');assert.equal(report.patterns.analyzedPosts,4);assert.equal(report.patterns.comparableMetricPosts,4);assert.equal(report.patterns.patterns.length,1);assert.equal(report.patterns.patterns[0].attribute,'duration');assert.deepEqual(report.patterns.patterns[0].groups.map(group=>group.count),[2,2]);assert.equal(report.patterns.experiment.sourcePostIds.length,4);
    assert.ok(report.patterns.unsupportedAttributes.includes('Hook style'));
    const unsupported={get:id=>{const saved=structuredClone(videos.get(id));delete saved.analysis.metadata.duration;saved.analysis.report.findings[0].assessment='Fast edits, early reveal, strong CTA (unstructured test prose).';return saved;}};
    const unsupportedReport=creativePatternReport(report.posts,report.statistics,unsupported);
    assert.equal(unsupportedReport.status,'insufficient_data');assert.equal(unsupportedReport.patterns.length,0);assert.equal(unsupportedReport.experiment,null);
    const altered=structuredClone(report.posts);altered[0].collectedAt=null;
    assert.equal(creativePatternReport(altered,nicheStatistics(altered),videos).status,'insufficient_data');
    report=await service.match(report.id,'2','a');assert.equal(report.patterns.status,'insufficient_data');assert.match(report.patterns.reason,/same creative asset/);
    const sparse=report.posts.slice(0,1);assert.equal(creativePatternReport(sparse,nicheStatistics(sparse),videos).patterns.length,0);
  }finally{await rm(dataDir,{recursive:true,force:true});}
});

test('upload attachment refuses a changed target without replacing an existing file link',async()=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'pulse-niche-target-'));
  try{
    const videos=await createStore(dataDir);await videos.add(video('existing',10));await videos.add(video('new-upload',20));
    const before=JSON.stringify(videos.list());const service=await createNicheService({dataDir,videos});const report=await service.import(dump(),profile);
    const target=service.uploadTarget(report.id,'1',profile);await service.match(report.id,'1','existing');
    await assert.rejects(service.attachUpload(target,'new-upload'),error=>error.code==='TARGET_CHANGED');
    assert.equal(service.list()[0].posts.find(post=>post.postId==='1').matchedVideo.id,'existing');assert.equal(JSON.stringify(videos.list()),before);
  }finally{await rm(dataDir,{recursive:true,force:true});}
});

test('upload-and-link reuses validation, checks account/post before saving, preserves existing media, and starts no paid job',async()=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'pulse-niche-media-'));let server;
  let providerCalls=0;
  const provider={models:{vision:'test-only'},async review(){providerCalls++;throw new Error('No model request should run during attach.');}};
  try{
    const app=await createApp({dataDir,analysisProvider:provider,analysisConfig:{apiKey:''}});
    server=await new Promise((resolve,reject)=>{const instance=app.listen(0,'127.0.0.1',error=>error?reject(error):resolve(instance));instance.on('error',reject);});const base=`http://127.0.0.1:${server.address().port}`;
    const body=new FormData();body.append('profileUrl',profile);body.append('export',new Blob([JSON.stringify(dump())],{type:'application/json'}),'test.json');
    let response=await fetch(`${base}/api/niche/import`,{method:'POST',body});const report=(await response.json()).report;
    const fixture=await readFile(new URL('./fixtures/tiny.webm',import.meta.url));
    function upload(bytes=fixture,name='test.webm'){const form=new FormData();form.append('video',new Blob([bytes],{type:'video/webm'}),name);return form;}
    const endpoint=`${base}/api/niche/${report.id}/posts/1/video`;
    response=await fetch(endpoint,{method:'POST',headers:{'X-Pulse-Profile':'https://www.tiktok.com/@wrong'},body:upload()});assert.equal(response.status,409);
    response=await fetch(`${base}/api/niche/${report.id}/posts/missing/video`,{method:'POST',headers:{'X-Pulse-Profile':profile},body:upload()});assert.equal(response.status,404);
    response=await fetch(`${base}/api/videos`);assert.equal((await response.json()).videos.length,0);
    response=await fetch(endpoint,{method:'POST',headers:{'X-Pulse-Profile':profile},body:upload(Buffer.from('not a video'))});assert.equal(response.status,415);
    response=await fetch(endpoint,{method:'POST',headers:{'X-Pulse-Profile':profile},body:upload()});assert.equal(response.status,201);const uploaded=(await response.json()).video;
    assert.equal(uploaded.analysisStatus,undefined);await app.locals.analysisService.idle();assert.equal(providerCalls,0);
    response=await fetch(`${base}/api/niche`);const linked=(await response.json()).reports[0].posts.find(post=>post.postId==='1');assert.equal(linked.matchedVideo.id,uploaded.id);assert.equal(linked.mediaStatus,'user_upload_linked');assert.equal(linked.insights,null);assert.equal(linked.metrics.views,10);
    response=await fetch(endpoint,{method:'POST',headers:{'X-Pulse-Profile':profile},body:upload()});assert.equal(response.status,409);
    response=await fetch(`${base}/api/videos`);assert.equal((await response.json()).videos.length,1);
    response=await fetch(`${base}/api/videos/${uploaded.id}/file`);assert.deepEqual(Buffer.from(await response.arrayBuffer()),fixture);
    assert.equal(providerCalls,0);
  }finally{if(server?.listening)await new Promise(resolve=>server.close(resolve));await rm(dataDir,{recursive:true,force:true});}
});
