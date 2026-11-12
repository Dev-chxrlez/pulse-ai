import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RUBRIC, validateCreative, scoreCreative, compareCreative, formatCriterion } from '../src/creative.js';
import { createProvider } from '../src/provider.js';
import { createStore } from '../src/store.js';
import { createApp } from '../src/app.js';
import { createCreativeService } from '../src/creative-service.js';

// Explicit test-only creative ratings; never inserted into the application library.
const analysis = { metadata: { duration: 10 }, transcript: { windows: [] }, report: {
  summary: 'Test-only analysis', limitations: ['Test fixture'],
  findings: RUBRIC.map(dimension=>({ category: dimension.categories[0], title: `Test ${dimension.id}`, assessment: 'Test observation', suggestion: 'Test suggestion', certainty: 'observed', evidence: [{ source: 'frame', index: 0, observation: 'Test evidence' }] })),
} };
function review(ratings = [4,3,2,null,1]) {
  // Criteria beyond the given ratings are unknown (null).
  return { criteria: RUBRIC.map((dimension,index)=>({ id: dimension.id, rating: ratings[index] ?? null, rationale: 'Test-only rubric rationale.', findingIndexes: (ratings[index] ?? null)===null ? [] : [index] })), hooks: [{ text: 'Test proposed opening.', execution: 'Show the subject immediately.', rationale: 'Test-only explanation.', findingIndexes: [0] }], priorities: [{ title: 'Test edit', action: 'Test action.', findingIndexes: [0] }] };
}

test('scores renormalize assessed weights; unknown evidence never becomes a zero',()=>{
  const raw = validateCreative(review(),analysis);
  const creative = scoreCreative(raw);
  // Weights: hook 22, clarity 16, pacing 12, text 8, cta 12, brand 10, silent 8, connect 7, format 5 (measured).
  assert.equal(creative.coverage,62); assert.equal(creative.overall,69);
  assert.deepEqual(creative.strengths,['hook','clarity']); assert.deepEqual(creative.weaknesses,['cta']);
  assert.equal(scoreCreative(review([4,4,null,null,null])).overall,null);
  assert.equal(scoreCreative(review([null,null,null,null,null])).coverage,0);
  assert.equal(scoreCreative(review([0,0,0,0,0])).overall,0);
  assert.equal(scoreCreative(review([4,4,4,4,4,4,4,4])).overall,100);
  // Format is measured from the file, never from the AI review.
  const vertical={metadata:{width:1080,height:1920}},horizontal={metadata:{width:1920,height:1080}};
  assert.equal(scoreCreative(review(),vertical.metadata).coverage,67);assert.equal(scoreCreative(review(),vertical.metadata).overall,72);
  assert.equal(formatCriterion(horizontal.metadata).rating,1);assert.equal(formatCriterion({width:1080,height:1350}).rating,3);assert.equal(formatCriterion({width:1080,height:1080}).rating,2);assert.equal(formatCriterion({}).rating,null);
  const first={id:'first',creative,analysis:vertical};
  const second={id:'second',creative:scoreCreative(review([2,2,2,4,3])),analysis:vertical};
  const comparison=compareCreative([first,second]);
  assert.deepEqual(comparison.commonCriteria,['hook','clarity','pacing','cta','format']);assert.equal(comparison.coverage,67);
  assert.deepEqual(comparison.scores,[{id:'first',score:72},{id:'second',score:58}]);
  assert.equal(comparison.rows.length,9);assert.deepEqual(comparison.rows.find(row=>row.id==='format').items.map(item=>item.rating),[4,4]);
  // Reviews saved before the new criteria existed still compare; their new criteria are unknown.
  const legacy={id:'legacy',analysis:vertical,creative:{criteria:creative.criteria.filter(item=>['hook','clarity','pacing','text','cta'].includes(item.id))}};
  const mixed=compareCreative([legacy,second]);assert.equal(mixed.rows.find(row=>row.id==='brand').items[0].rating,null);assert.deepEqual(mixed.scores.map(item=>item.score),[72,58]);
  const sparse={id:'sparse',creative:scoreCreative(review([4,4,null,null,null]))};
  assert.ok(compareCreative([first,sparse]).scores.every(item=>item.score===null));
});

test('creative validation rejects duplicated criteria, unknown and uncertain sources, and unrelated evidence',()=>{
  const duplicate=review();duplicate.criteria[1].id='hook';
  assert.throws(()=>validateCreative(duplicate,analysis),error=>error.code==='INVALID_CREATIVE');
  const invalid=review();invalid.hooks[0].findingIndexes=[1000];
  assert.throws(()=>validateCreative(invalid,analysis),error=>error.code==='INVALID_CREATIVE_EVIDENCE');
  const unsupported=review();unsupported.criteria[0].findingIndexes=[];
  assert.throws(()=>validateCreative(unsupported,analysis),error=>error.code==='INVALID_CREATIVE_EVIDENCE');
  const unrelated=review();unrelated.criteria[0].findingIndexes=[1];
  assert.throws(()=>validateCreative(unrelated,analysis),error=>error.code==='INVALID_CREATIVE_EVIDENCE');
  const uncertain=structuredClone(analysis);uncertain.report.findings[0].certainty='uncertain';
  assert.throws(()=>validateCreative(review(),uncertain),error=>error.code==='INVALID_CREATIVE_EVIDENCE');
});

test('creative API persists reviews, deduplicates paid work and compares only completed distinct videos',async()=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'pulse-creative-'));let server;
  let calls=0;
  const provider={models:{vision:'test-only'},async creative(){calls++;return {review:review(),usage:null};}};
  async function start(){const app=await createApp({dataDir,analysisConfig:{apiKey:''},creativeProvider:provider});server=await new Promise((resolve,reject)=>{const instance=app.listen(0,'127.0.0.1',error=>error?reject(error):resolve(instance));instance.on('error',reject);});return {app,base:`http://127.0.0.1:${server.address().port}`};}
  async function stop(){await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  try{
    const store=await createStore(dataDir);
    for(const id of ['a','b','c'])await store.add({id,originalName:`test-${id}.mp4`,uploadedAt:new Date().toISOString(),status:'uploaded',analysisStatus:id==='c'?'uploaded':'completed',analysis:id==='c'?null:analysis});
    const uncertain = structuredClone(analysis);
    uncertain.report.findings.forEach(finding=>{finding.certainty='uncertain';});
    await store.add({id:'uncertain',originalName:'test-uncertain.mp4',uploadedAt:new Date().toISOString(),analysisStatus:'completed',analysis:uncertain});
    let {app,base}=await start();
    let response=await fetch(`${base}/api/videos/c/creative`,{method:'POST'});assert.equal(response.status,409);
    response=await fetch(`${base}/api/videos/uncertain/creative`,{method:'POST'});assert.equal(response.status,409);assert.equal(calls,0);
    response=await fetch(`${base}/api/videos/missing/creative`,{method:'POST'});assert.equal(response.status,404);
    response=await fetch(`${base}/api/compare?ids=a,b`);assert.equal(response.status,409);
    await Promise.all([fetch(`${base}/api/videos/a/creative`,{method:'POST'}),fetch(`${base}/api/videos/a/creative`,{method:'POST'})]);
    await app.locals.creativeService.idle();assert.equal(calls,1);
    response=await fetch(`${base}/api/videos/a/creative`,{method:'POST'});assert.equal(response.status,200);assert.equal(calls,1);
    await fetch(`${base}/api/videos/b/creative`,{method:'POST'});await app.locals.creativeService.idle();
    response=await fetch(`${base}/api/compare?ids=a,b`);assert.equal(response.status,200);
    const comparison=await response.json();assert.equal(comparison.scores[0].score,69);assert.equal(comparison.coverage,62);assert.ok(!('winner' in comparison));
    response=await fetch(`${base}/api/compare?ids=a,a`);assert.equal(response.status,400);
    response=await fetch(`${base}/api/compare?ids=a,missing`);assert.equal(response.status,404);
    response=await fetch(`${base}/api/compare?ids=a`);assert.equal(response.status,400);
    await stop();({app,base}=await start());
    response=await fetch(`${base}/api/videos/a`);assert.equal((await response.json()).video.creative.overall,69);assert.equal(calls,2);
  }finally{if(server?.listening)await stop();await rm(dataDir,{recursive:true,force:true});}
});

test('OpenAI creative request uses saved evidence and validates structured output',async()=>{
  const provider=createProvider({apiKey:'test-only',request:async(_url,options)=>{
    const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.text.format.name,'creative_review');
    assert.equal(JSON.parse(body.input[0].content).findings.length,RUBRIC.length);
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(review())}]}]});
  }});
  assert.equal((await provider.creative(analysis,RUBRIC)).review.criteria.length,RUBRIC.length);
});

test('outdated reviews can be refreshed once; current reviews are never re-run',async()=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'pulse-refresh-'));
  try{
    const store=await createStore(dataDir);let calls=0;
    const provider={models:{vision:'test-only'},async creative(){calls++;return {review:review([3,3,3,3,3,3,3,3]),usage:null};}};
    const legacy={criteria:[{id:'hook',rating:3,rationale:'Old review.',findingIndexes:[0]}],hooks:[],priorities:[]};
    await store.add({id:'old',uploadedAt:new Date().toISOString(),analysisStatus:'completed',analysis,creativeStatus:'completed',creative:legacy});
    const service=await createCreativeService({store,provider});
    await service.enqueue('old');await service.idle();assert.equal(calls,0);
    await service.enqueue('old',{refresh:true});await service.idle();assert.equal(calls,1);
    assert.equal(store.get('old').creative.criteria.filter(item=>item.rating!==null).length,8);assert.equal(service.outdated(store.get('old')),false);
    await service.enqueue('old',{refresh:true});await service.idle();assert.equal(calls,1);
  }finally{await rm(dataDir,{recursive:true,force:true});}
});
