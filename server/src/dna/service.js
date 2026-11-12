import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createStore} from '../store.js';
import {createProvider} from '../provider.js';
import {AnalysisError} from '../media.js';
import {analysisReference,validateDna,DNA_FIELDS} from './schema.js';
import {validateBlueprint} from './blueprint.js';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
export async function createDnaService({dataDir,videos,getNiche,config={},provider:injected}){
  const store=await createStore(dataDir,'creative-dna.json');const blueprints=await createStore(dataDir,'editing-blueprints.json');
  const provider=injected||createProvider({apiKey:config.apiKey??process.env.OPENAI_API_KEY,visionModel:config.visionModel??process.env.OPENAI_VISION_MODEL});
  const available=Boolean(injected||(config.apiKey??process.env.OPENAI_API_KEY));
  for(const target of [store,blueprints])for(const record of target.list())if(['queued','processing'].includes(record.status))await target.update(record.id,{status:'failed',error:{code:'INTERRUPTED',message:'Generation was interrupted. Retry explicitly.'}});
  let tail=Promise.resolve();const pending=new Set();
  function source(videoId){const video=videos.get(videoId);if(!video)throw fail('Video not found.',404);if(video.analysisStatus!=='completed'||!video.analysis)throw fail('Complete video analysis first.');return video;}
  async function assetHash(video){
    if(typeof video.storageName!=='string'||path.basename(video.storageName)!==video.storageName)return null;
    try{const digest=createHash('sha256');for await(const chunk of createReadStream(path.join(dataDir,'uploads',video.storageName)))digest.update(chunk);return digest.digest('hex');}
    catch{return null;} // Classifications can use saved analysis; pattern independence cannot.
  }
  function get(videoId){const record=store.get(videoId);if(!record)return null;const video=videos.get(videoId);return {...record,stale:!video?.analysis||record.analysisReference.hash!==analysisReference(video.analysis).hash};}
  function contextFor({reportId,niche,targetVideoId=null}){
    if(typeof niche!=='string'||!niche.trim()||niche.length>100)throw fail('Enter a niche label of 1–100 characters.',400);
    const report=getNiche(reportId);if(!report)throw fail('Imported niche report not found.',404);
    const target=targetVideoId?source(targetVideoId):null;
    const patterns=report.dnaPatterns?.patterns||[];const findings=target?.analysis.report.findings.filter(finding=>finding.certainty!=='uncertain'&&finding.evidence.length)||[];
    if(!patterns.length&&!findings.length)throw fail('No supported historical patterns or completed target-video findings are available.');
    const context={reportId,niche:niche.trim(),targetVideoId:target?.id||null,patterns,targetAnalysis:target?.analysis||null};
    context.reference=hash({reportId,niche:context.niche,posts:report.posts.map(post=>({id:post.postId,metrics:post.metrics,publishedAt:post.publishedAt,collectedAt:post.collectedAt,videoId:post.matchedVideoId})),patterns,target:target?analysisReference(target.analysis):null});
    return context;
  }
  async function queue(key,target,record,work){
    if(pending.has(key))return;
    if(!available)throw fail('Configure the backend OpenAI API key before generation.',503);
    if(pending.size>=10)throw fail('Generation queue is full. Try later.',429);
    pending.add(key);
    try{await target.transact(records=>[...records.filter(item=>item.id!==record.id),{...record,status:'queued',error:null,importedAt:new Date().toISOString()}]);}catch(error){pending.delete(key);throw error;}
    tail=tail.then(async()=>{try{await target.update(record.id,{status:'processing'});const generated=await work();await target.update(record.id,{...generated,error:null,generatedAt:new Date().toISOString()});}catch(error){await target.update(record.id,{status:'failed',error:{code:error instanceof AnalysisError?error.code:'GENERATION_FAILED',message:error instanceof AnalysisError?error.message:'Generation could not be completed or saved. Retry explicitly.',diagnostic:error instanceof AnalysisError?error.diagnostic||null:null}});}finally{pending.delete(key);}}).catch(()=>{pending.delete(key);console.error('Could not persist DNA/blueprint generation state.');});
  }
  return {
    available,get,
    async generate(videoId){const video=source(videoId);const reference=analysisReference(video.analysis);const previous=get(videoId);
      if(previous&&!previous.stale&&['completed','insufficient_evidence','queued','processing'].includes(previous.status))return previous;
      await queue(`dna:${videoId}`,store,{id:videoId,videoId,schemaVersion:1,analysisReference:reference,model:provider.models.vision},async()=>{
        const result=await provider.dna(video.analysis);const attributes=validateDna(result.data,video.analysis);
        if(analysisReference(source(videoId).analysis).hash!==reference.hash)throw new AnalysisError('ANALYSIS_CHANGED','The source analysis changed. Generate again from the current analysis.');
        return {attributes,assetHash:await assetHash(video),status:Object.keys(DNA_FIELDS).some(key=>attributes[key].uncertainty==='supported_inference')?'completed':'insufficient_evidence',usage:result.usage||null};
      });return get(videoId);
    },
    async generateBlueprint(input){const context=contextFor(input);const id=hash([context.reportId,context.niche,context.targetVideoId]);const previous=blueprints.get(id);
      if(previous?.sourceReference===context.reference&&['completed','queued','processing'].includes(previous.status))return previous;
      await queue(`blueprint:${id}`,blueprints,{id,reportId:context.reportId,niche:context.niche,targetVideoId:context.targetVideoId,sourceReference:context.reference,schemaVersion:1,model:provider.models.vision},async()=>{
        const result=await provider.blueprint(context);const blueprint=validateBlueprint(result.data,context);
        if(contextFor(input).reference!==context.reference)throw new AnalysisError('SOURCE_CHANGED','The niche evidence changed during generation. Generate again when ready.');
        return {status:'completed',blueprint,usage:result.usage||null,evidence:{patterns:context.patterns,targetVideoId:context.targetVideoId,targetAnalysisReference:context.targetAnalysis?analysisReference(context.targetAnalysis):null}};
      });return blueprints.get(id);
    },
    listBlueprints(reportId){return blueprints.list().filter(record=>record.reportId===reportId).map(record=>{let stale=true;try{stale=contextFor(record).reference!==record.sourceReference;}catch{/* No longer sufficient evidence. */}return {...record,stale};});},
    forgetVideo:videoId=>store.transact(records=>records.filter(record=>record.id!==videoId)),
    async idle(){await tail;},
  };
}
