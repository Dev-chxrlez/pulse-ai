import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {NicheError} from '../niche/socialmonitor.js';
const run=promisify(execFile);
export async function officialWorker({root,database,mode,profileId}) {
  if(!root)throw new NicheError('SYNC_DISABLED','Configure SOCIALMONITOR_LOCAL_ROOT in PULSE’s backend environment.',503);
  try{
    const {stdout}=await run(process.execPath,['--max-old-space-size=128',fileURLToPath(new URL('./worker.js',import.meta.url)),path.resolve(root),path.resolve(database||path.join(root,'data/socialmonitor.db')),mode,profileId?String(profileId):''],{env:{},timeout:120000,maxBuffer:1024*1024});
    const data=JSON.parse(stdout);if(data.error)throw new NicheError(data.error.code,data.error.message,data.error.status);return data;
  }catch(error){if(error instanceof NicheError)throw error;throw new NicheError('TIKTOK_LOCAL_SOURCE','Official acquisition failed, timed out, or exceeded the transfer limit. No post snapshot was saved.',503);}
}
export function createOfficialAcquisition({niche,root,database,worker=officialWorker}) {
  let busy=false;
  return {status:profileId=>worker({root,database,mode:'status',profileId}),async acquire(profileId){
    if(busy)throw new NicheError('TIKTOK_BUSY','An official TikTok acquisition is already in progress.',409);busy=true;
    try{
      const {result}=await worker({root,database,mode:'acquire',profileId});
      if(!result.accountVerified)throw new NicheError('TIKTOK_IDENTITY_MISMATCH','No verified authorized identity was returned.',409);
      if(result.status==='authorized_empty')return {...result,persisted:false};
      if(result.status!=='acquired'||!result.accountVerified||!result.dump)throw new NicheError('TIKTOK_INVALID_RESPONSE','The connector did not return a verified acquisition.',502);
      const report=await niche.import(result.dump,result.profileUrl,{officialTikTok:true});
      const {dump,...summary}=result;void dump;
      return {...summary,persisted:true,report};
    }finally{busy=false;}
  }};
}
