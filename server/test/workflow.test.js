import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../src/app.js';
import {findMediaTools,runMedia} from '../src/media.js';
import {RUBRIC} from '../src/creative.js';

test('complete demo workflow: upload → real extraction → saved review → compare → CSV → match → restart',async context=>{
  const tools=await findMediaTools();
  if(!tools.ffmpeg||!tools.ffprobe)return context.skip('Install FFmpeg/ffprobe for workflow test.');
  const directory=await mkdtemp(path.join(tmpdir(),'pulse-workflow-'));
  let server;
  let analyses=0,reviews=0;
  // These test doubles are isolated. They never enter the user's local library or make paid calls.
  const analysisProvider={models:{vision:'test-only',transcription:'test-only'},async review(metadata,frames){analyses++;assert.ok(metadata.duration>0);assert.ok(frames.length>0);return {report:{summary:'Generated test footage.',findings:RUBRIC.map(dimension=>({category:dimension.categories[0],title:`Test ${dimension.id}`,assessment:'Test-only observation.',suggestion:'Test-only edit.',certainty:'inferred',evidence:[{source:'frame',index:0,observation:'Generated test frame.'}]})),limitations:['Test doubles, not real AI findings.']},usage:null};}};
  const creativeProvider={models:{vision:'test-only'},async creative(){reviews++;return {review:{criteria:RUBRIC.map((dimension,index)=>({id:dimension.id,rating:3,rationale:'Test-only rating.',findingIndexes:[index]})),hooks:[{text:'Test proposal.',execution:'Test execution.',rationale:'Test rationale.',findingIndexes:[0]}],priorities:[{title:'Test edit.',action:'Test action.',findingIndexes:[0]}]},usage:null};}};
  async function start(){const app=await createApp({dataDir:path.join(directory,'data'),clientDir:path.join(directory,'client'),analysisConfig:{apiKey:''},analysisProvider,creativeProvider});server=await new Promise((resolve,reject)=>{const instance=app.listen(0,'127.0.0.1',error=>error?reject(error):resolve(instance));instance.on('error',reject);});return {app,base:`http://127.0.0.1:${server.address().port}`};}
  async function stop(){await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  try{
    await mkdir(path.join(directory,'client'));await writeFile(path.join(directory,'client','index.html'),'<!doctype html><title>Test-only demo UI</title>');
    const fixture=path.join(directory,'fixture.mp4');
    await runMedia(tools.ffmpeg,['-nostdin','-v','error','-f','lavfi','-i','testsrc2=size=160x120:rate=12:duration=4','-c:v','libx264','-pix_fmt','yuv420p','-y',fixture]);
    let {app,base}=await start();
    let response=await fetch(base);assert.equal(response.status,200);assert.match(await response.text(),/Test-only demo UI/);
    response=await fetch(`${base}/api/missing`);assert.equal(response.status,404);assert.match(response.headers.get('content-type'),/application\/json/);
    response=await fetch(`${base}/videos.json`);assert.equal(response.status,404);
    const bytes=await readFile(fixture);const ids=[];
    for(let index=0;index<2;index++){const form=new FormData();form.append('video',new Blob([bytes],{type:'video/mp4'}),`test-cut-${index}.mp4`);response=await fetch(`${base}/api/videos`,{method:'POST',body:form});assert.equal(response.status,201);ids.push((await response.json()).video.id);}
    await app.locals.analysisService.idle();
    for(const id of ids){response=await fetch(`${base}/api/videos/${id}`);assert.equal((await response.json()).video.analysisStatus,'completed');response=await fetch(`${base}/api/videos/${id}/creative`,{method:'POST'});assert.equal(response.status,202);}
    await app.locals.creativeService.idle();
    response=await fetch(`${base}/api/compare?ids=${ids.join(',')}`);assert.equal(response.status,200);const compared=await response.json();assert.deepEqual(compared.scores.map(item=>item.score),[73,73]);assert.ok(compared.rows.find(row=>row.id==='format').items.every(item=>item.rating!==null&&item.rating<4)); // generated test video is not 9:16
    // Link a social identity to already-paid-for results; do not re-run either model.
    const socialProfile='https://www.tiktok.com/@test_workflow';
    const socialDump={app:'socialmonitor',version:1,tables:{profiles:[{id:1,network:'tiktok',url:socialProfile,handle:'test_workflow'}],posts:[{profile_id:1,network:'tiktok',ext_id:'123',url:`${socialProfile}/video/123`,kind:'video',caption:'Test-only caption',posted_at:'2025-01-01T00:00:00Z',fetched_at:'2025-01-02T00:00:00Z',views:100,likes:10,comments_count:2,shares:3}]}};
    const socialForm=new FormData();socialForm.append('profileUrl',socialProfile);socialForm.append('export',new Blob([JSON.stringify(socialDump)],{type:'application/json'}),'test-only-social.json');
    response=await fetch(`${base}/api/niche/import`,{method:'POST',body:socialForm});const socialReport=(await response.json()).report;
    response=await fetch(`${base}/api/niche/${socialReport.id}/posts/123/match`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({videoId:ids[0]})});
    const social=(await response.json()).report.posts[0];assert.equal(social.metrics.views,100);assert.equal(social.insights.creative.overall,73);assert.ok(social.insights.observations[0].evidence.length>0);assert.equal(analyses,2);assert.equal(reviews,2);
    const csv=`video_id,platform,published_at,views,likes,comments,shares,pulse_video_id\npost-a,test-platform,2025-01-01,100,10,2,3,${ids[0]}\npost-b,test-platform,2025-01-01,200,0,0,0,\n`;
    const form=new FormData();form.append('csv',new Blob([csv],{type:'text/csv'}),'test-only.csv');
    response=await fetch(`${base}/api/performance/preview`,{method:'POST',body:form});assert.equal(response.status,200);const preview=await response.json();assert.equal(preview.valid,2);
    response=await fetch(`${base}/api/performance/imports/${preview.id}`,{method:'POST'});assert.equal((await response.json()).imported,2);
    response=await fetch(`${base}/api/performance`);const history=await response.json();const unmatched=history.records.find(record=>!record.matchedVideoId);
    response=await fetch(`${base}/api/performance/${unmatched.id}/match`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({videoId:ids[1]})});const matched=await response.json();assert.equal(matched.summary.analyzed,2);assert.equal(matched.summary.prediction.status,'not_trained');
    await stop();({app,base}=await start());
    response=await fetch(`${base}/api/compare?ids=${ids.join(',')}`);assert.equal(response.status,200);
    response=await fetch(`${base}/api/performance`);assert.equal((await response.json()).summary.matched,2);
    response=await fetch(`${base}/api/videos/${ids[0]}/file`,{headers:{Range:'bytes=0-19'}});assert.equal(response.status,206);
    response=await fetch(`${base}/api/videos/${ids[0]}/frames/0`);assert.equal(response.status,200);
    assert.equal(analyses,2);assert.equal(reviews,2);
  }finally{if(server?.listening)await stop();await rm(directory,{recursive:true,force:true});}
});
