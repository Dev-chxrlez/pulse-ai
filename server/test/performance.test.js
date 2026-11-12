import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {CSV_LIMIT,validateCsv,createPerformanceService,summarizePerformance} from '../src/performance.js';
import {createStore} from '../src/store.js';
import {createApp} from '../src/app.js';

// Synthetic values exclusively for isolated tests; never seeded into user data.
const buffer = text=>Buffer.from(text);
const headers='video_id,platform,published_at,views,likes,comments,shares,saves,observed_at,account,pulse_video_id,filename';
const csv=`${headers}\npost-1,Instagram,2025-01-01,100,10,2,3,,2025-01-08,studio,local-1,clip.mp4\npost-2,Instagram,2025-01-02,0,0,0,0,,,,,clip.mp4\n`;
const localVideo={id:'local-1',originalName:'clip.mp4',uploadedAt:'2025-01-01T00:00:00Z',analysisStatus:'completed',metadata:{duration:10}};

test('CSV validation preserves zero, unknowns, IDs and quoted fields; flags invalid and duplicate rows',()=>{
  const result=validateCsv(buffer(csv),[],[localVideo]);
  assert.equal(result.valid,2);assert.equal(result.rows[0].record.platform,'instagram');
  assert.equal(result.rows[0].record.saves,null);assert.equal(result.rows[1].record.likes,0);assert.equal(result.rows[1].record.views,0);
  assert.equal(result.rows[0].record.matchedVideoId,'local-1');assert.equal(result.rows[1].record.matchedVideoId,null);assert.equal(result.rows[1].suggestions.length,1);
  const aliases=validateCsv(buffer('\uFEFFVideo ID,Platform,Publication Date,Views,filename,ignored\r\n000123,YouTube,2025-02-28,20,"a,b.mp4",unused\r\n'));
  assert.equal(aliases.rows[0].record.videoId,'000123');assert.equal(aliases.rows[0].record.filename,'a,b.mp4');assert.deepEqual(aliases.ignoredColumns,['ignored']);
  const invalid=validateCsv(buffer('video_id,platform,published_at,views\na,ig,2025-02-30,1\nb,ig,2025-02-01,-1\nc,ig,2025-02-01,=SUM(1)\nd,ig,2025-02-01,1.2\ne,ig,2025-02-01,9007199254740992\nf,ig,2025-02-01,\ng,ig,2025-02-01,10,extra\n'));
  assert.equal(invalid.invalid,7);
  const duplicates=validateCsv(buffer('video_id,platform,published_at,views\na,ig,2025-01-01,1\na,ig,2025-01-01,2\nb,ig,2025-01-01,3\n'),[{platform:'ig',account:'',videoId:'b'}]);
  assert.equal(duplicates.valid,1);assert.equal(duplicates.duplicates,2);
  assert.throws(()=>validateCsv(buffer('video_id,platform,published_at,views\n"unterminated')),/Could not parse/);
  assert.throws(()=>validateCsv(buffer('video_id,platform,date,published_at,views\na,ig,2025-01-01,2025-01-01,1')),/unique/);
  assert.throws(()=>validateCsv(buffer('video_id,views\na,1')),/Missing required/);
  assert.throws(()=>validateCsv(Buffer.alloc(CSV_LIMIT+1)),error=>error.status===413);
  assert.throws(()=>validateCsv(Buffer.from([255,254,0,0])),/UTF-8/);
  const badDate=validateCsv(buffer('video_id,platform,published_at,views,observed_at\na,ig,2025-01-03,1,2025-01-02'));
  assert.equal(badDate.invalid,1);
  const missingUpload=validateCsv(buffer('video_id,platform,published_at,views,pulse_video_id\na,ig,2025-01-01,1,missing'));
  assert.equal(missingUpload.invalid,1);
  const accounts=validateCsv(buffer('video_id,platform,published_at,views,account\na,ig,2025-01-01,1,first\na,ig,2025-01-01,1,second'));
  assert.equal(accounts.valid,2);
});

test('preview/commit persists provenance, handles concurrent duplicate imports, links and unlinks without model calls',async()=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'pulse-performance-'));
  try{
    const videos=await createStore(dataDir);await videos.add(localVideo);
    let now=new Date('2026-01-01T00:00:00Z');
    let service=await createPerformanceService({dataDir,videos,clock:()=>now});
    const first=service.preview(buffer(csv),'real-export.csv');
    const second=service.preview(buffer(csv),'same-export.csv');
    assert.equal(service.list().records.length,0);
    const results=await Promise.all([service.commit(first.id),service.commit(second.id)]);
    assert.equal(results[0].imported,2);assert.equal(results[1].imported,0);assert.equal(results[1].skippedDuplicates,2);
    let data=service.list();assert.equal(data.summary.records,2);assert.equal(data.summary.matched,1);
    const record=data.records.find(row=>row.videoId==='post-1');assert.equal(record.sourceFilename,'real-export.csv');assert.equal(record.sourceLine,2);assert.equal(record.interactionsPerView,15);
    const unmatched=data.records.find(row=>row.videoId==='post-2');assert.equal(unmatched.interactionsPerView,null);
    await service.match(unmatched.id,'local-1');assert.equal(service.list().summary.matched,2);
    await service.match(unmatched.id,null);assert.equal(service.list().summary.matched,1);
    await assert.rejects(service.match(unmatched.id,'missing'),error=>error.status===400);
    await assert.rejects(service.match('missing',null),error=>error.status===404);
    service=await createPerformanceService({dataDir,videos,clock:()=>now});assert.equal(service.list().records.length,2);assert.equal(service.list().records.find(row=>row.id===record.id).matchedVideoId,'local-1');
    const expiring=service.preview(buffer(csv),'export.csv');now=new Date(now.getTime()+16*60*1000);await assert.rejects(service.commit(expiring.id),error=>error.status===410);
  }finally{await rm(dataDir,{recursive:true,force:true});}
});

test('descriptive summaries separate platforms and accounts, require distinct videos, and never claim a trained model',()=>{
  const videos=[localVideo,{...localVideo,id:'local-2'},{...localVideo,id:'local-3'}];
  const records=[100,200,300].map((views,index)=>({platform:'ig',account:'a',videoId:String(index),views,matchedVideoId:`local-${index+1}`,observedAt:null}));
  records.push({...records[0],platform:'youtube',views:900});records.push({...records[0],account:'b',views:500});
  const summary=summarizePerformance(records,videos);
  assert.equal(summary.prediction.status,'not_trained');assert.equal(summary.missingMeasurementDates,5);
  assert.equal(summary.durationGroups.find(group=>group.platform==='ig'&&group.account==='a').medianViews,200);
  assert.equal(summary.durationGroups.find(group=>group.account==='b').medianViews,null);
  const repeated=summarizePerformance([records[0],{...records[0],videoId:'repeat'},{...records[0],videoId:'repeat2'}],videos);
  assert.equal(repeated.durationGroups[0].uniqueVideos,1);assert.equal(repeated.durationGroups[0].medianViews,null);
});

test('historical HTTP workflow validates multipart input and JSON matching, persists after restart',async()=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'pulse-performance-api-'));let server;
  async function start(){const app=await createApp({dataDir,analysisConfig:{apiKey:''}});server=await new Promise((resolve,reject)=>{const instance=app.listen(0,'127.0.0.1',error=>error?reject(error):resolve(instance));instance.on('error',reject);});return `http://127.0.0.1:${server.address().port}`;}
  async function stop(){await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  function form(contents,name='metrics.csv',field='csv'){const data=new FormData();data.append(field,new Blob([contents],{type:'text/csv'}),name);return data;}
  try{
    const videos=await createStore(dataDir);await videos.add(localVideo);let base=await start();
    let response=await fetch(`${base}/api/performance/template`);assert.equal(response.status,200);assert.ok((await response.text()).startsWith('video_id,platform,published_at,views'));
    response=await fetch(`${base}/api/performance/preview`,{method:'POST',body:form(csv)});assert.equal(response.status,200);const preview=await response.json();
    response=await fetch(`${base}/api/performance`);assert.equal((await response.json()).records.length,0);
    response=await fetch(`${base}/api/performance/imports/${preview.id}`,{method:'POST'});assert.equal(response.status,201);assert.equal((await response.json()).imported,2);
    response=await fetch(`${base}/api/performance`);let data=await response.json();const id=data.records.find(record=>!record.matchedVideoId).id;
    response=await fetch(`${base}/api/performance/${id}/match`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({videoId:'local-1'})});assert.equal(response.status,200);assert.equal((await response.json()).summary.matched,2);
    response=await fetch(`${base}/api/performance/${id}/match`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,400);
    response=await fetch(`${base}/api/performance/preview`,{method:'POST',body:form(Buffer.alloc(CSV_LIMIT+1))});assert.equal(response.status,413);
    response=await fetch(`${base}/api/performance/preview`,{method:'POST',body:form(csv,'metrics.exe')});assert.equal(response.status,400);
    response=await fetch(`${base}/api/performance/preview`,{method:'POST',body:form(csv,'metrics.csv','video')});assert.equal(response.status,400);
    await stop();base=await start();response=await fetch(`${base}/api/performance`);data=await response.json();assert.equal(data.summary.matched,2);assert.equal(data.records.length,2);assert.equal(data.summary.prediction.status,'not_trained');
  }finally{if(server?.listening)await stop();await rm(dataDir,{recursive:true,force:true});}
});
