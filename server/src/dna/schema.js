import { z } from 'zod';
import { createHash } from 'node:crypto';
import { AnalysisError } from '../media.js';
export const DNA_FIELDS = {
  hookType:{values:['question','problem','curiosity','storytelling','demonstration','direct','other','unknown'],categories:['opening_hook']},
  hookStartSeconds:{timing:true,categories:['opening_hook'],opening:true},
  hookClarity:{values:['clear','partial','unclear','unknown'],categories:['opening_hook']},
  editingPace:{values:['slow','moderate','fast','unknown'],categories:['pacing'],sequence:true},
  productRevealSeconds:{timing:true,categories:['product']},
  firstSubjectAppearanceSeconds:{timing:true,categories:['visual_content']},
  visualStyle:{values:['demonstration','talking_head','pov','montage','cinematic','mixed','other','unknown'],categories:['visual_content']},
  storyStructure:{values:['problem_solution','before_after','tutorial','review','narrative','showcase','other','unknown'],categories:['visual_content','narration','product'],sequence:true},
  ctaPresent:{boolean:true,categories:['call_to_action']},
  ctaType:{values:['follow','comment','share','visit','purchase','other','unknown'],categories:['call_to_action']},
  ctaTimestampSeconds:{timing:true,categories:['call_to_action']},
};
const reference=z.array(z.number().int().nonnegative()).max(8);
export const dnaSchema=z.object({attributes:z.object(Object.fromEntries(Object.entries(DNA_FIELDS).map(([key,field])=>[key,z.object({value:field.values?z.enum(field.values):field.boolean?z.boolean().nullable():z.number().nonnegative().nullable(),findingIndexes:reference,uncertainty:z.enum(['supported_inference','unknown','conflicting']),explanation:z.string().min(1).max(1200)}).strict()]))).strict()}).strict();
export function analysisReference(analysis){return {hash:createHash('sha256').update(JSON.stringify(analysis)).digest('hex'),version:analysis.version??null,models:analysis.models??null,completedAt:analysis.completedAt??null};}
export function eligibleDnaFindings(analysis,key){return analysis.report.findings.flatMap((finding,index)=>finding.certainty!=='uncertain'&&finding.evidence.length&&DNA_FIELDS[key].categories.includes(finding.category)?[index]:[]);}
function refs(analysis,indexes){return indexes.flatMap(findingIndex=>analysis.report.findings[findingIndex].evidence.map(ref=>{
  const item=ref.source==='frame'?analysis.frames?.find(frame=>frame.index===ref.index):ref.source==='transcript'?analysis.transcript?.windows.find(window=>window.index===ref.index):null;
  if(!item)throw invalid('missing_source');
  const start=ref.source==='frame'?item.timestamp:item.start;const end=ref.source==='frame'?null:item.end;
  if(!Number.isFinite(start)||start<0||(end!==null&&(!Number.isFinite(end)||end<start)))throw invalid('invalid_source_time');
  return {findingIndex,source:ref.source,index:ref.index,start,end,approximate:true};
}));}
function invalid(reason,field){const error=new AnalysisError('INVALID_DNA','Creative DNA contained unsupported evidence or values. No attributes were saved.');error.diagnostic={reason,...(field?{field}:{} )};return error;}
export function dnaRequestSchema(analysis){
  const schema=z.toJSONSchema(dnaSchema,{target:'draft-7'});delete schema.$schema;
  for(const [key,field] of Object.entries(DNA_FIELDS)){
    const properties=schema.properties.attributes.properties[key].properties;const eligible=eligibleDnaFindings(analysis,key);
    properties.findingIndexes=eligible.length?{type:'array',items:{type:'integer',enum:eligible},maxItems:8}:{type:'array',items:{type:'integer'},maxItems:0};
    if(!eligible.length){properties.value=field.values?{type:'string',enum:['unknown']}:{type:'null'};properties.uncertainty={type:'string',enum:['unknown','conflicting']};}
    else if(field.boolean)properties.value={type:['boolean','null'],enum:[true,null]}; // Sparse samples cannot prove global absence.
    else if(field.timing){const times=refs(analysis,eligible).filter(ref=>ref.source==='frame'&&(!field.opening||ref.start<=3)).map(ref=>ref.start);properties.value={type:['number','null'],enum:[null,...new Set(times)]};}
  }
  return schema;
}
export function validateDna(raw,analysis){
  const parsed=dnaSchema.safeParse(raw);if(!parsed.success)throw invalid('schema');const attributes={};
  for(const [key,field] of Object.entries(DNA_FIELDS)){
    const item=parsed.data.attributes[key];const unknown=item.value===null||item.value==='unknown';const eligible=eligibleDnaFindings(analysis,key);
    if(!item.findingIndexes.every(index=>eligible.includes(index)))throw invalid('wrong_or_unsupported_finding',key);
    if(unknown&&item.uncertainty==='supported_inference')throw invalid('unknown_marked_supported',key);
    if(!unknown&&(item.uncertainty!=='supported_inference'||!item.findingIndexes.length))throw invalid('missing_or_conflicting_evidence',key);
    const evidence=refs(analysis,item.findingIndexes);
    const duration=analysis.metadata?.duration;
    if(evidence.some(ref=>Number.isFinite(duration)&&ref.start>duration))throw invalid('out_of_bounds_source',key);
    if(!unknown&&item.value===false&&field.boolean)throw invalid('absence_not_proven',key);
    if(!unknown&&field.timing){const earliest=Math.min(...evidence.filter(ref=>ref.source==='frame').map(ref=>ref.start));if(!Number.isFinite(earliest)||item.value!==earliest||(!Number.isFinite(duration)||item.value>duration)||(field.opening&&item.value>3))throw invalid('unsupported_timestamp',key);}
    if(!unknown&&field.sequence&&new Set(evidence.map(ref=>ref.start)).size<2)throw invalid('insufficient_temporal_evidence',key);
    attributes[key]={value:item.value,evidence,method:unknown?'unavailable':'ai_classification_of_saved_analysis',uncertainty:item.uncertainty,explanation:item.explanation,...(field.timing?{approximate:true,timingMeaning:'Earliest cited frame sample; not a verified first appearance or exact event onset.'}:{})};
  }
  if(attributes.ctaPresent.value!==true&&(attributes.ctaType.value!=='unknown'||attributes.ctaTimestampSeconds.value!==null))throw invalid('conflicting_cta_attributes','ctaPresent');
  const changes=analysis.sceneChanges;
  const measured=Array.isArray(changes)&&Number.isFinite(analysis.metadata?.duration)&&changes.every(time=>Number.isFinite(time)&&time>=0&&time<=analysis.metadata.duration);
  attributes.sceneChanges={value:measured?changes.length:null,evidence:measured?[{source:'scene_changes',timestamps:changes}]:[],method:measured?'ffmpeg_scene_candidates':'unavailable',uncertainty:measured?'measured_heuristic':'unknown',explanation:'Count of FFmpeg threshold candidates, not verified scene cuts.'};
  attributes.openingSilenceSeconds={value:null,evidence:[],method:'not_measured',uncertainty:'unknown',explanation:'Opening silence was not measured by the saved analysis; transcript windows cannot establish it.'};
  return attributes;
}
