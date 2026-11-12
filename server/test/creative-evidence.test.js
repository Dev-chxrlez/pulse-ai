import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RUBRIC, creativeEvidenceMap, creativeRequestSchema, validateCreative, scoreCreative } from '../src/creative.js';
import { createProvider } from '../src/provider.js';
import { createStore } from '../src/store.js';
import { createCreativeService } from '../src/creative-service.js';

const fixture = JSON.parse(await readFile(new URL('./fixtures/creative-evidence.json',import.meta.url),'utf8'));
function analysisFor(layout) {
  return { metadata: {}, transcript: { windows: [] }, report: { summary: 'SANITIZED PRIVATE CONTENT PLACEHOLDER', limitations: [], findings: layout.map(category => ({ category, certainty: category === 'engagement' ? 'inferred' : 'observed', title: 'SANITIZED PRIVATE CONTENT PLACEHOLDER', assessment: 'SANITIZED PRIVATE CONTENT PLACEHOLDER', suggestion: '', evidence: [{ source: 'frame', index: 16, observation: 'SANITIZED PRIVATE CONTENT PLACEHOLDER' }] })) } };
}
function reviewFor(analysis) {
  const eligible = creativeEvidenceMap(analysis);
  return { criteria: RUBRIC.map(dimension => ({ id: dimension.id, rating: eligible[dimension.id].length ? 3 : null, rationale: 'SANITIZED PRIVATE CONTENT PLACEHOLDER', findingIndexes: eligible[dimension.id].slice(0,1) })), hooks: [{ text: 'Test proposal', execution: 'Test execution', rationale: 'Test rationale', findingIndexes: [0] }], priorities: [{ title: 'Test edit', action: 'Test action', findingIndexes: [0] }] };
}

test('sanitized layouts reproduce the reported error, and unsupported criteria remain unknown',()=>{
  for (const layout of fixture.layouts) {
    const analysis = analysisFor(layout);
    const valid = reviewFor(analysis);
    assert.ok(validateCreative(valid,analysis));
    const invalid = structuredClone(valid);
    Object.assign(invalid.criteria.find(item=>item.id===fixture.reconstructedFailure.criterion),fixture.reconstructedFailure);
    // Only the response-schema fields belong in the reconstructed criterion.
    delete invalid.criteria[2].criterion; delete invalid.criteria[2].expectedField;
    assert.throws(()=>validateCreative(invalid,analysis),error=>{
      assert.equal(error.message,'A creative rating lacked evidence for its criterion. Please retry.');
      assert.equal(error.diagnostic.field,fixture.reconstructedFailure.expectedField);
      assert.equal(error.diagnostic.criterionId,'pacing');
      assert.deepEqual(error.diagnostic.referencedCategories,['visual_content']);
      assert.ok(!JSON.stringify(error.diagnostic).includes('PRIVATE'));
      return true;
    });
  }
  const sparse=analysisFor(fixture.layouts[0]);
  const accepted=validateCreative(reviewFor(sparse),sparse);
  assert.deepEqual(accepted.criteria.filter(item=>item.rating===null).map(item=>item.id),['pacing','text','cta']);
  // Visual findings also support early branding, sound-off clarity and connection; criteria without evidence stay unknown.
  assert.equal(scoreCreative(accepted).coverage,63);assert.equal(scoreCreative(accepted).overall,75);
  assert.equal(scoreCreative({...accepted,criteria:accepted.criteria.filter(item=>['hook','clarity'].includes(item.id))}).overall,null);
});

test('missing, wrong-category, out-of-range and uncertain evidence stay rejected',()=>{
  const analysis=analysisFor(fixture.layouts[1]);
  for(const indexes of [[],[1],[999],[16]]) {
    const raw=reviewFor(analysis);raw.criteria[2].findingIndexes=indexes;
    assert.throws(()=>validateCreative(raw,analysis),error=>error.code==='INVALID_CREATIVE_EVIDENCE'&&error.diagnostic.field==='criteria[2].findingIndexes'&&error.diagnostic.criterionId==='pacing');
  }
  const uncertain=structuredClone(analysis);uncertain.report.findings[4].certainty='uncertain';
  const raw=reviewFor(analysis);
  assert.throws(()=>validateCreative(raw,uncertain),error=>error.diagnostic.reason==='unsupported_reference');
  raw.criteria[2].rating=null;raw.criteria[2].findingIndexes=[];
  assert.ok(validateCreative(raw,uncertain));
  const missing=reviewFor(analysis);delete missing.criteria[2].findingIndexes;
  assert.throws(()=>validateCreative(missing,analysis),error=>error.code==='INVALID_CREATIVE');
});

test('request schema constrains each scored criterion to eligible finding indexes',()=>{
  for(const layout of fixture.layouts){
    const analysis=analysisFor(layout);const eligible=creativeEvidenceMap(analysis);
    const schema=creativeRequestSchema(analysis);
    assert.equal(schema.type,'object');assert.equal(schema.additionalProperties,false);
    for(const dimension of RUBRIC){
      const branches=schema.properties.criteria.items.anyOf.filter(branch=>branch.properties.id.enum[0]===dimension.id);
      const scored=branches.find(branch=>branch.properties.rating.type==='integer');
      const unknown=branches.find(branch=>branch.properties.rating.type==='null');
      assert.ok(unknown);
      assert.equal(Boolean(scored),eligible[dimension.id].length>0);
      if(scored){assert.deepEqual(scored.properties.findingIndexes.items.enum,eligible[dimension.id]);assert.equal(scored.properties.findingIndexes.minItems,1);assert.equal(scored.additionalProperties,false);assert.ok(scored.required.includes('findingIndexes'));}
      else assert.equal(unknown.properties.findingIndexes.maxItems,0);
    }
  }
});

test('adapter sends explicit finding IDs and allowed indexes; invalid fixture still fails locally',async()=>{
  const analysis=analysisFor(fixture.layouts[0]);let requests=0;
  const raw=reviewFor(analysis);
  const provider=createProvider({apiKey:'test-only',request:async(_url,options)=>{
    requests++;const body=JSON.parse(options.body);const input=JSON.parse(body.input[0].content);
    assert.deepEqual(input.findings.map(finding=>finding.findingIndex),[0,1]);
    assert.deepEqual(input.rubric.find(item=>item.id==='clarity').eligibleFindingIndexes,[1]);
    assert.deepEqual(input.rubric.find(item=>item.id==='pacing').eligibleFindingIndexes,[]);
    assert.match(input.evidenceRules,/NOT frame or transcript indexes/);
    assert.equal(body.text.format.strict,true);
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(raw)}]}]});
  }});
  assert.ok((await provider.creative(analysis,RUBRIC)).review);
  raw.criteria[2].rating=2;raw.criteria[2].findingIndexes=[1];
  await assert.rejects(provider.creative(analysis,RUBRIC),error=>error.diagnostic.criterionId==='pacing');
  assert.equal(requests,2); // Local request stub only; no network/API charges.
});

test('rejected reviews persist safe exact-field diagnostics without changing saved analysis',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'pulse-evidence-diagnostic-'));
  const originalWarn=console.warn;const logs=[];
  try{
    const store=await createStore(directory);const analysis=analysisFor(fixture.layouts[0]);const before=JSON.stringify(analysis);
    await store.add({id:'test-only',uploadedAt:'2025-01-01',analysisStatus:'completed',analysis});
    const invalid=reviewFor(analysis);invalid.criteria[2].rating=2;invalid.criteria[2].findingIndexes=[1];
    console.warn=(...values)=>logs.push(values.join(' '));
    const service=await createCreativeService({store,provider:{models:{vision:'test-only'},async creative(){return {review:invalid};}}});
    await service.enqueue('test-only');await service.idle();
    const record=store.get('test-only');assert.equal(record.creativeStatus,'failed');assert.equal(record.creative,undefined);
    assert.equal(record.creativeDiagnostic.criterionId,'pacing');assert.equal(record.creativeDiagnostic.field,'criteria[2].findingIndexes');
    assert.equal(JSON.stringify(record.analysis),before);assert.ok(!logs.join('').includes('PRIVATE'));assert.equal(logs.length,1);
    const persisted=await createStore(directory);assert.deepEqual(persisted.get('test-only').creativeDiagnostic,record.creativeDiagnostic);
  }finally{console.warn=originalWarn;await rm(directory,{recursive:true,force:true});}
});
