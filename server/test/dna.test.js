import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DNA_FIELDS,validateDna,dnaRequestSchema,analysisReference} from '../src/dna/schema.js';
import {dnaPatterns} from '../src/dna/patterns.js';
import {validateBlueprint} from '../src/dna/blueprint.js';
import {createDnaService} from '../src/dna/service.js';
import {createStore} from '../src/store.js';
import {createApp} from '../src/app.js';
import {createProvider} from '../src/provider.js';
import {AnalysisError} from '../src/media.js';
import {nicheStatistics} from '../src/niche/statistics.js';

// Test-only analyses/classifications. Never inserted into real application data.
function analysis(){const categories=['opening_hook','visual_content','narration','pacing','product','call_to_action'];return {version:1,models:{vision:'test-only'},completedAt:'2025-01-01T00:00:00Z',metadata:{duration:30,width:160,height:120},frames:[{index:0,timestamp:.5},{index:1,timestamp:2},{index:2,timestamp:8},{index:3,timestamp:20}],sceneChanges:[2,8],transcript:{windows:[{index:0,start:0,end:3,text:'Test-only narration'},{index:1,start:3,end:30,text:'Test-only CTA'}]},report:{summary:'Test-only summary',limitations:['Test only'],findings:categories.map((category,index)=>({category,certainty:'observed',title:`Test finding ${index}`,assessment:'Test observation',suggestion:'Test edit',evidence:(index===4?[2]:index===5?[3]:[0,2,3]).map(index=>({source:'frame',index,observation:'Test-only evidence'}))}))}};}
function rawDna(){const values={hookType:'question',hookStartSeconds:.5,hookClarity:'clear',editingPace:'fast',productRevealSeconds:8,firstSubjectAppearanceSeconds:.5,visualStyle:'demonstration',storyStructure:'tutorial',ctaPresent:true,ctaType:'follow',ctaTimestampSeconds:20};const indexes={hookType:0,hookStartSeconds:0,hookClarity:0,editingPace:3,productRevealSeconds:4,firstSubjectAppearanceSeconds:1,visualStyle:1,storyStructure:1,ctaPresent:5,ctaType:5,ctaTimestampSeconds:5};return {attributes:Object.fromEntries(Object.keys(DNA_FIELDS).map(key=>[key,{value:values[key],findingIndexes:[indexes[key]],uncertainty:'supported_inference',explanation:'Test-only classification.'}]))};}
function unknownDna(){return {attributes:Object.fromEntries(Object.entries(DNA_FIELDS).map(([key,field])=>[key,{value:field.values?'unknown':null,findingIndexes:[],uncertainty:'unknown',explanation:'Insufficient test evidence.'}]))};}
function rawBlueprint(){const fields={openingHook:0,editingSequence:1,pacing:3,revealTiming:4,cta:5};const item=index=>({proposal:'Test proposal',basis:'individual_guidance',patternIds:[],findingIndexes:[index],uncertainty:'Test guidance, not a historical effect.'});return {...Object.fromEntries(Object.entries(fields).map(([key,index])=>[key,item(index)])),experiment:{proposal:item(0),metric:'views',measurementAgeHours:72},limitations:['Test-only limitations']};}
const video=(id,source=analysis())=>({id,originalName:'test-only.mp4',uploadedAt:'2025-01-01',analysisStatus:'completed',analysis:source});

test('DNA extracts supported values with source references and keeps measurements separate',()=>{
  const source=analysis();const before=JSON.stringify(source);const attrs=validateDna(rawDna(),source);
  assert.equal(attrs.hookType.value,'question');assert.equal(attrs.hookStartSeconds.value,.5);assert.equal(attrs.hookStartSeconds.evidence[0].start,.5);assert.equal(attrs.editingPace.method,'ai_classification_of_saved_analysis');
  assert.equal(attrs.sceneChanges.value,2);assert.equal(attrs.sceneChanges.method,'ffmpeg_scene_candidates');assert.equal(attrs.openingSilenceSeconds.value,null);assert.equal(attrs.openingSilenceSeconds.method,'not_measured');assert.equal(JSON.stringify(source),before);
  const unknown=validateDna(unknownDna(),source);assert.ok(Object.keys(DNA_FIELDS).every(key=>unknown[key].uncertainty==='unknown'));
  const schema=dnaRequestSchema(source);assert.ok(schema.properties.attributes.properties.hookStartSeconds.properties.value.enum.includes(.5));
  source.report.findings[0].certainty='uncertain';const sparse=dnaRequestSchema(source);assert.deepEqual(sparse.properties.attributes.properties.hookType.properties.value.enum,['unknown']);
});

test('DNA rejects absent, incorrect or conflicting evidence, unsupported labels and invented times',()=>{
  for(const mutate of [
    raw=>{raw.attributes.hookType.findingIndexes=[];},raw=>{raw.attributes.hookType.findingIndexes=[3];},raw=>{raw.attributes.hookType.findingIndexes=[999];},
    raw=>{raw.attributes.hookType.value='viral';},raw=>{raw.attributes.hookType.uncertainty='conflicting';},raw=>{raw.attributes.productRevealSeconds.value=7;},raw=>{raw.attributes.productRevealSeconds.value=31;},
    raw=>{raw.attributes.ctaPresent.value=false;},raw=>{raw.attributes.ctaPresent.value=null;raw.attributes.ctaPresent.uncertainty='unknown';raw.attributes.ctaPresent.findingIndexes=[];},
  ]){const raw=rawDna();mutate(raw);assert.throws(()=>validateDna(raw,analysis()),error=>error.code==='INVALID_DNA');}
  const broken=analysis();broken.report.findings[0].evidence[0].index=999;assert.throws(()=>validateDna(rawDna(),broken),error=>error.diagnostic.reason==='missing_source');
  const single=analysis();single.report.findings[3].evidence=single.report.findings[3].evidence.slice(0,1);assert.throws(()=>validateDna(rawDna(),single),error=>error.diagnostic.reason==='insufficient_temporal_evidence');
  const ambiguous=unknownDna();ambiguous.attributes.hookType.uncertainty='conflicting';assert.equal(validateDna(ambiguous,analysis()).hookType.value,'unknown');
});

test('DNA generation deduplicates, persists, detects stale sources and leaves analyses/reviews intact',async()=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'pulse-dna-'));let calls=0;let failNext=false;
  const provider={models:{vision:'test-only'},async dna(){calls++;if(failNext){failNext=false;throw new AnalysisError('PROVIDER_429','Test provider limit');}return {data:rawDna(),usage:null};}};
  try{
    const videos=await createStore(dataDir);await mkdir(path.join(dataDir,'uploads'));await writeFile(path.join(dataDir,'uploads','test.webm'),await readFile(new URL('./fixtures/tiny.webm',import.meta.url)));await videos.add({...video('a'),storageName:'test.webm',creative:{overall:75}});const before=JSON.stringify(videos.list());
    let service=await createDnaService({dataDir,videos,provider,getNiche:()=>null});
    await Promise.all([service.generate('a'),service.generate('a')]);await service.idle();assert.equal(calls,1);assert.equal(service.get('a').status,'completed');assert.equal(service.get('a').videoId,'a');assert.match(service.get('a').assetHash,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(videos.list()),before);
    await service.generate('a');assert.equal(calls,1);service=await createDnaService({dataDir,videos,provider,getNiche:()=>null});assert.equal(service.get('a').attributes.hookType.value,'question');
    const next=analysis();next.version=2;await videos.update('a',{analysis:next});assert.equal(service.get('a').stale,true);failNext=true;await service.generate('a');await service.idle();assert.equal(service.get('a').status,'failed');assert.equal(service.get('a').error.code,'PROVIDER_429');
    await service.generate('a');await service.idle();assert.equal(service.get('a').status,'completed');assert.equal(service.get('a').analysisReference.version,2);
    await videos.add({...video('unfinished'),analysisStatus:'processing'});await assert.rejects(service.generate('unfinished'),error=>error.status===409);
  }finally{await rm(dataDir,{recursive:true,force:true});}
});

test('DNA patterns use distinct assets, equal windows, known groups and separate metric medians',()=>{
  const source=analysis();const attributes=validateDna(rawDna(),source);const posts=[1,2,3,4].map(id=>({postId:String(id),matchedVideoId:String(id),publishedAt:'2025-01-01T00:00:00Z',collectedAt:'2025-01-02T00:00:00Z',metrics:{views:id*100,likes:id*10,comments:0,shares:0}}));
  const videos={get:id=>video(id)};const dna={get:id=>({status:'completed',stale:false,assetHash:id.repeat(64),analysisReference:analysisReference(source),attributes:{...attributes,hookType:{...attributes.hookType,value:Number(id)<3?'question':'problem'}}})};
  let report=dnaPatterns(posts,nicheStatistics(posts),videos,dna);const hook=report.patterns.find(pattern=>pattern.id==='hookType:views');assert.deepEqual(hook.groups.map(group=>group.median),[150,350]);assert.deepEqual(hook.groups.map(group=>group.count),[2,2]);assert.equal(report.completedDna,4);
  const incomplete=structuredClone(posts);incomplete[0].collectedAt=null;assert.equal(dnaPatterns(incomplete,nicheStatistics(incomplete),videos,dna).patterns.length,0);
  assert.equal(dnaPatterns(posts.slice(0,3),nicheStatistics(posts.slice(0,3)),videos,dna).patterns.length,0);
  const duplicate=structuredClone(posts);duplicate[1].matchedVideoId='1';assert.match(dnaPatterns(duplicate,nicheStatistics(duplicate),videos,dna).reason,/same video/);
  const sameFile={get:id=>({...dna.get(id),assetHash:'1'.repeat(64)})};assert.match(dnaPatterns(posts,nicheStatistics(posts),videos,sameFile).reason,/Duplicate underlying/);
  const noFile={get:id=>({...dna.get(id),assetHash:null})};assert.equal(dnaPatterns(posts,nicheStatistics(posts),videos,noFile).patterns.length,0);
  const missing=structuredClone(posts);missing[0].metrics.likes=null;assert.ok(!dnaPatterns(missing,nicheStatistics(missing),videos,dna).patterns.some(pattern=>pattern.id==='hookType:interactionsPerView'));
  const unknown={get:id=>({...dna.get(id),attributes:{...attributes,hookType:{...attributes.hookType,value:'unknown',uncertainty:'unknown'}}})};assert.ok(!dnaPatterns(posts,nicheStatistics(posts),videos,unknown).patterns.some(pattern=>pattern.attribute==='hookType'));
});

test('blueprints require relevant evidence and label individual guidance without historical claims',()=>{
  const context={patterns:[],targetAnalysis:analysis()};const valid=validateBlueprint(rawBlueprint(),context);assert.match(valid.experiment.successCriterion,/72-hour/);assert.equal(valid.openingHook.basis,'individual_guidance');
  for(const mutate of [raw=>{raw.openingHook.findingIndexes=[999];},raw=>{raw.cta.findingIndexes=[0];},raw=>{raw.openingHook.basis='historical_observation';},raw=>{raw.pacing.patternIds=['fake'];},raw=>{raw.revealTiming.basis='unsupported';}]){const raw=rawBlueprint();mutate(raw);assert.throws(()=>validateBlueprint(raw,context),error=>error.code==='INVALID_BLUEPRINT_EVIDENCE');}
});

test('DNA and blueprint adapter methods use strict structured requests with local stubs only',async()=>{
  const names=[];const provider=createProvider({apiKey:'test-only',request:async(_url,options)=>{const body=JSON.parse(options.body);names.push(body.text.format.name);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(body.text.format.name==='creative_dna'?rawDna():rawBlueprint())}]}]});}});
  assert.ok((await provider.dna(analysis())).data.attributes);assert.ok((await provider.blueprint({niche:'Test',patterns:[],targetAnalysis:analysis()})).data.openingHook);assert.deepEqual(names,['creative_dna','editing_blueprint']);
});

test('HTTP DNA/blueprint flow: imports trigger no generation; jobs and guidance persist and are reused',async()=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'pulse-dna-api-'));let server;let dnaCalls=0,blueprintCalls=0;
  const provider={models:{vision:'test-only'},async dna(){dnaCalls++;return {data:unknownDna()};},async blueprint(){blueprintCalls++;return {data:rawBlueprint()};}};
  async function start(){const app=await createApp({dataDir,analysisConfig:{apiKey:''},dnaProvider:provider});server=await new Promise((resolve,reject)=>{const instance=app.listen(0,'127.0.0.1',error=>error?reject(error):resolve(instance));instance.on('error',reject);});return {app,base:`http://127.0.0.1:${server.address().port}`};}
  async function stop(){await new Promise(resolve=>server.close(resolve));}
  try{
    const videos=await createStore(dataDir);await videos.add(video('a'));const before=JSON.stringify(videos.list());let {app,base}=await start();
    const profile='https://www.tiktok.com/@test_dna';const dump={app:'socialmonitor',version:1,tables:{profiles:[{id:1,network:'tiktok',url:profile,handle:'test_dna'}],posts:[{profile_id:1,network:'tiktok',ext_id:'123',url:`${profile}/video/123`,kind:'video',caption:'Test',views:10,posted_at:null,fetched_at:null}]}};
    const form=new FormData();form.append('profileUrl',profile);form.append('export',new Blob([JSON.stringify(dump)],{type:'application/json'}),'test.json');let response=await fetch(`${base}/api/niche/import`,{method:'POST',body:form});const report=(await response.json()).report;assert.equal(dnaCalls,0);assert.equal(blueprintCalls,0);
    await fetch(`${base}/api/niche/${report.id}/posts/123/match`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({videoId:'a'})});
    response=await fetch(`${base}/api/intelligence/videos/a`,{method:'POST'});assert.equal(response.status,202);await app.locals.dnaService.idle();
    response=await fetch(`${base}/api/intelligence/videos/a`);assert.equal((await response.json()).record.status,'insufficient_evidence');
    await fetch(`${base}/api/intelligence/videos/a`,{method:'POST'});assert.equal(dnaCalls,1);
    const request={reportId:report.id,niche:'Test niche',targetVideoId:'a'};
    response=await fetch(`${base}/api/intelligence/blueprints`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});assert.equal(response.status,202);await app.locals.dnaService.idle();
    response=await fetch(`${base}/api/intelligence/blueprints?reportId=${report.id}`);let records=(await response.json()).records;assert.equal(records[0].status,'completed');assert.equal(records[0].blueprint.openingHook.basis,'individual_guidance');
    await fetch(`${base}/api/intelligence/blueprints`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});assert.equal(blueprintCalls,1);
    const persisted=await createStore(dataDir);assert.equal(JSON.stringify(persisted.list()),before);
    await stop();({app,base}=await start());response=await fetch(`${base}/api/intelligence/blueprints?reportId=${report.id}`);records=(await response.json()).records;assert.equal(records[0].status,'completed');assert.equal(records[0].stale,false);
    response=await fetch(`${base}/api/niche`);assert.equal((await response.json()).reports[0].posts[0].creativeDna.status,'insufficient_evidence');
    assert.equal(dnaCalls,1);assert.equal(blueprintCalls,1);
  }finally{if(server?.listening)await stop();await rm(dataDir,{recursive:true,force:true});}
});

test('historical blueprint citations must exist and match the recommended attribute',()=>{
  const raw=rawBlueprint();const unsupported={proposal:'Insufficient evidence.',basis:'unsupported',patternIds:[],findingIndexes:[],uncertainty:'Unknown'};
  for(const key of ['openingHook','editingSequence','pacing','revealTiming','cta'])raw[key]=structuredClone(unsupported);
  raw.openingHook={proposal:'Test a question opening.',basis:'historical_observation',patternIds:['hookType:views'],findingIndexes:[],uncertainty:'Exploratory association only.'};raw.experiment.proposal=structuredClone(raw.openingHook);
  const context={patterns:[{id:'hookType:views',attribute:'hookType',groups:[]}],targetAnalysis:null};
  assert.ok(validateBlueprint(raw,context));raw.pacing=structuredClone(raw.openingHook);assert.throws(()=>validateBlueprint(raw,context),error=>error.code==='INVALID_BLUEPRINT_EVIDENCE');
  const individual=rawBlueprint();const broken=analysis();broken.report.findings[0].evidence[0].index=999;assert.throws(()=>validateBlueprint(individual,{patterns:[],targetAnalysis:broken}),error=>error.code==='INVALID_BLUEPRINT_EVIDENCE');
});

test('blueprint queue deduplicates, records provider failures, and withholds unsupported contexts before a call',async()=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'pulse-blueprint-'));let calls=0;let failing=true;
  try{
    const videos=await createStore(dataDir);await videos.add(video('a'));const report={id:'report',posts:[],dnaPatterns:{patterns:[]}};
    const service=await createDnaService({dataDir,videos,getNiche:id=>id==='report'?report:null,provider:{models:{vision:'test-only'},async blueprint(){calls++;if(failing)throw new AnalysisError('PROVIDER_429','Test provider error');return {data:rawBlueprint()};}}});
    await assert.rejects(service.generateBlueprint({reportId:'report',niche:'test'}),error=>error.status===409);assert.equal(calls,0);
    const input={reportId:'report',niche:'test',targetVideoId:'a'};await Promise.all([service.generateBlueprint(input),service.generateBlueprint(input)]);await service.idle();assert.equal(calls,1);assert.equal(service.listBlueprints('report')[0].status,'failed');
    failing=false;await service.generateBlueprint(input);await service.idle();assert.equal(service.listBlueprints('report')[0].status,'completed');assert.equal(calls,2);
    await service.generateBlueprint(input);assert.equal(calls,2);
    report.posts.push({postId:'new',metrics:{views:10},publishedAt:null,collectedAt:null,matchedVideoId:null});assert.equal(service.listBlueprints('report')[0].stale,true);
  }finally{await rm(dataDir,{recursive:true,force:true});}
});

test('standalone DNA needs only completed analysis; reads stay free and blueprint still requires a report',async()=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'pulse-standalone-dna-'));let server;let calls=0;
  const provider={models:{vision:'local-stub'},async dna(){calls++;return {data:rawDna()};},async blueprint(){throw Error('Must not call provider without a report');}};
  try {
    const videos=await createStore(dataDir);await videos.add(video('standalone'));const before=JSON.stringify(videos.list());
    const app=await createApp({dataDir,analysisConfig:{apiKey:''},dnaProvider:provider});
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    const base=`http://127.0.0.1:${server.address().port}`;
    let response=await fetch(`${base}/api/intelligence/videos/standalone`);let body=await response.json();
    assert.equal(body.ready,true);assert.equal(body.record,null);assert.equal(calls,0);
    assert.deepEqual((await (await fetch(`${base}/api/niche`)).json()).reports,[]);
    response=await fetch(`${base}/api/intelligence/videos/standalone`,{method:'POST'});assert.equal(response.status,202);await app.locals.dnaService.idle();
    body=await (await fetch(`${base}/api/intelligence/videos/standalone`)).json();assert.equal(body.record.status,'completed');assert.equal(body.record.videoId,'standalone');assert.equal(calls,1);
    await fetch(`${base}/api/intelligence/videos/standalone`,{method:'POST'});assert.equal(calls,1);
    const reopened=await createDnaService({dataDir,videos,getNiche:()=>null,provider});assert.equal(reopened.get('standalone').status,'completed');
    response=await fetch(`${base}/api/intelligence/blueprints`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({niche:'Local test',targetVideoId:'standalone'})});assert.equal(response.status,404);assert.match((await response.json()).error.message,/niche report/i);
    assert.equal(JSON.stringify((await createStore(dataDir)).list()),before);
  } finally {if(server)await new Promise(resolve=>server.close(resolve));await rm(dataDir,{recursive:true,force:true});}
});
