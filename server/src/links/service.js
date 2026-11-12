import {mkdir,mkdtemp,readdir,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {createStore} from '../store.js';
import {AnalysisError} from '../media.js';
import {facebookUrl,LinkError} from './network.js';
import {retrieveFacebook} from './retrieve.js';
export async function createLinkService({dataDir,tempDir,maxBytes,storage,videos,analysis,retrieve=retrieveFacebook}){
  const jobs=await createStore(dataDir,'link-jobs.json');const pending=new Set();let tail=Promise.resolve();
  await mkdir(tempDir,{recursive:true,mode:0o700});
  for(const name of await readdir(tempDir))if(name.startsWith('.link-'))await rm(path.join(tempDir,name),{recursive:true,force:true});
  for(const job of jobs.list())if(job.status==='retrieving')await jobs.update(job.id,{status:'failed',stage:'Retrieval interrupted',error:{code:'LINK_INTERRUPTED',message:'Retrieval was interrupted. Submit the link again.'}});
  function get(id){const job=jobs.get(id);if(!job)return null;const video=videos.get(job.videoId);let status=job.status,stage=job.stage,error=job.error;
    if(video){if(video.analysisStatus==='completed'){status='completed';stage='Analysis completed';}else if(['failed','blocked'].includes(video.analysisStatus)){status='analysis_failed';stage='Video saved; analysis needs attention';error=video.analysisError;}else{status='analyzing';stage=video.analysisStage||'Waiting for analysis';}}
    const publicVideo={...video};delete publicVideo.storageName;
    return {...job,status,stage,error,video:video?{...publicVideo,fileUrl:`/api/videos/${video.id}/file`}:null};
  }
  return {get,async start(value,permitted){
    if(permitted!==true)throw new LinkError('LINK_PERMISSION','Confirm you have permission to retrieve and analyze this video.',403);
    const url=facebookUrl(value);
    const previous=jobs.list().find(job=>job.sourceUrl===url&&(job.status==='retrieving'||videos.get(job.videoId)));
    if(previous)return get(previous.id);
    if(!analysis.setup.available)throw new LinkError('LINK_SETUP','Configure OpenAI and FFmpeg before analyzing a link.',503);
    if(pending.size)throw new LinkError('LINK_BUSY','Another video is being retrieved. Wait for it to finish before starting another.',429);
    const id=randomUUID();pending.add(id);
    try{await jobs.transact(records=>[...records.slice(-99),{id,sourceUrl:url,status:'retrieving',stage:'Checking public link',progress:null,importedAt:new Date().toISOString(),error:null}]);}catch(error){pending.delete(id);throw error;}
    tail=tail.then(async()=>{let directory;try{
      directory=await mkdtemp(path.join(tempDir,'.link-'));
      const onStage=(stage,progress=null)=>jobs.update(id,{stage,progress});
      const result=await retrieve({url,directory,maxBytes,maxDuration:analysis.setup.maxDuration,onStage});
      await onStage('Validating downloaded video');await analysis.inspect(result.filename);
      const video=await storage.save(result);
      await jobs.update(id,{status:'saved',stage:'Waiting for analysis',progress:100,videoId:video.id});
      await analysis.enqueue(video.id);
    }catch(error){const safe=error instanceof LinkError||error instanceof AnalysisError;await jobs.update(id,{status:'failed',stage:'Retrieval failed',error:{code:safe?error.code:'LINK_FAILED',message:safe?error.message:error.status&&error.status<500?error.message:'The video could not be retrieved or saved. No partial upload was kept.'}});
    }finally{if(directory)await rm(directory,{recursive:true,force:true});pending.delete(id);}}).catch(()=>{pending.delete(id);console.error('Could not persist link retrieval state.');});
    return get(id);
  },async idle(){await tail;}};
}
