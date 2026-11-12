import { z } from 'zod';
import { AnalysisError } from '../media.js';
const section=z.object({proposal:z.string().min(1).max(1800),basis:z.enum(['historical_observation','individual_guidance','unsupported']),patternIds:z.array(z.string()).max(12),findingIndexes:z.array(z.number().int().nonnegative()).max(8),uncertainty:z.string().min(1).max(900)}).strict();
export const blueprintSchema=z.object({openingHook:section,editingSequence:section,pacing:section,revealTiming:section,cta:section,experiment:z.object({proposal:section,metric:z.enum(['views','interactionsPerView']),measurementAgeHours:z.number().int().min(1).max(720)}).strict(),limitations:z.array(z.string().min(1).max(1000)).min(1).max(12)}).strict();
export const blueprintJsonSchema=z.toJSONSchema(blueprintSchema,{target:'draft-7'});delete blueprintJsonSchema.$schema;
const allowed={openingHook:{attributes:['hookType'],categories:['opening_hook']},editingSequence:{attributes:['visualStyle','storyStructure'],categories:['visual_content','narration','product']},pacing:{attributes:['editingPace'],categories:['pacing']},revealTiming:{attributes:['productRevealSeconds'],categories:['product','visual_content']},cta:{attributes:['ctaPresent'],categories:['call_to_action']}};
export function blueprintRequestSchema(context){
  const schema=structuredClone(blueprintJsonSchema);
  function constrain(template,scope){
    const patterns=context.patterns.filter(pattern=>!scope||scope.attributes.includes(pattern.attribute)).map(pattern=>pattern.id);
    const findings=(context.targetAnalysis?.report.findings||[]).flatMap((finding,index)=>finding.certainty!=='uncertain'&&finding.evidence.length&&(!scope||scope.categories.includes(finding.category))?[index]:[]);
    const empty=structuredClone(template);empty.properties.basis={type:'string',enum:['unsupported']};
    for(const key of ['patternIds','findingIndexes'])empty.properties[key]={...empty.properties[key],maxItems:0};
    const choices=[empty];
    function branch(basis){const item=structuredClone(template);item.properties.basis={type:'string',enum:[basis]};
      item.properties.patternIds=patterns.length?{type:'array',items:{type:'string',enum:patterns},maxItems:12}:{type:'array',items:{type:'string'},maxItems:0};
      item.properties.findingIndexes=findings.length?{type:'array',items:{type:'integer',enum:findings},maxItems:8}:{type:'array',items:{type:'integer'},maxItems:0};
      item.properties[basis==='historical_observation'?'patternIds':'findingIndexes'].minItems=1;return item;
    }
    if(patterns.length)choices.push(branch('historical_observation'));if(findings.length)choices.push(branch('individual_guidance'));
    return {anyOf:choices};
  }
  for(const [key,scope] of Object.entries(allowed))schema.properties[key]=constrain(schema.properties[key],scope);
  schema.properties.experiment.properties.proposal=constrain(schema.properties.experiment.properties.proposal,null);
  return schema;
}
export function validateBlueprint(raw,context){
  const parsed=blueprintSchema.safeParse(raw);if(!parsed.success)throw new AnalysisError('INVALID_BLUEPRINT','The editing blueprint was structurally invalid. Please retry.');
  const entries={...Object.fromEntries(Object.keys(allowed).map(key=>[key,parsed.data[key]])),experiment:parsed.data.experiment.proposal};
  for(const [key,item] of Object.entries(entries)){
    const scope=allowed[key];
    const patterns=item.patternIds.map(id=>context.patterns.find(pattern=>pattern.id===id));
    const findings=item.findingIndexes.map(index=>context.targetAnalysis?.report.findings[index]);
    if(findings.some(finding=>finding?.evidence.some(ref=>ref.source==='frame'?!context.targetAnalysis.frames?.some(frame=>frame.index===ref.index):ref.source==='transcript'?!context.targetAnalysis.transcript?.windows.some(window=>window.index===ref.index):true)))throw new AnalysisError('INVALID_BLUEPRINT_EVIDENCE','The target analysis references missing evidence. No blueprint was saved.');
    const invalid=patterns.some(pattern=>!pattern)||(scope&&patterns.some(pattern=>!scope.attributes.includes(pattern.attribute)))||findings.some(finding=>!finding||finding.certainty==='uncertain'||!finding.evidence.length)||(scope&&findings.some(finding=>!scope.categories.includes(finding.category)))||(item.basis==='historical_observation'&&!patterns.length)||(item.basis==='individual_guidance'&&!findings.length)||(item.basis==='unsupported'&&(patterns.length||findings.length));
    if(invalid){const error=new AnalysisError('INVALID_BLUEPRINT_EVIDENCE','The blueprint cited unsupported evidence. No blueprint was saved.');error.diagnostic={field:key};throw error;}
  }
  if(Object.values(entries).every(item=>item.basis==='unsupported'))throw new AnalysisError('INSUFFICIENT_EVIDENCE','There is insufficient evidence for an editing blueprint.');
  if(parsed.data.experiment.proposal.basis==='unsupported')throw new AnalysisError('INSUFFICIENT_EVIDENCE','An evidence-backed A/B experiment could not be proposed.');
  return {...parsed.data,experiment:{...parsed.data.experiment,successCriterion:`At the proposed ${parsed.data.experiment.measurementAgeHours}-hour publication age, compare ${parsed.data.experiment.metric==='views'?'views':'(likes + comments + shares) / views × 100 with all counts known and views > 0'}. A higher value for variant B is an exploratory test result, not causal proof or validated uplift.`}};
}
