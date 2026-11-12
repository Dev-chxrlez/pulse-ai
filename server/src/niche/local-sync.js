import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {NicheError,parseTikTokProfile,normalizeSocialMonitor} from './socialmonitor.js';
const execute=promisify(execFile);
export async function readLocalExport({root,database,profileUrl}) {
  try {
    const {stdout}=await execute(process.execPath,['--max-old-space-size=128',fileURLToPath(new URL('./sync-worker.js',import.meta.url)),root,database,profileUrl],{timeout:15000,maxBuffer:1024*1024,env:{},windowsHide:true});
    const result=JSON.parse(stdout);
    if(result.error)throw new NicheError(result.error.code,result.error.message,result.error.status);
    return result.dump;
  } catch(error) {
    if(error instanceof NicheError)throw error;
    throw new NicheError('SOURCE_UNAVAILABLE','Local export failed, timed out, or exceeded the 1 MiB transfer limit. No report was replaced.',503);
  }
}
export function createLocalSync({niche,root=process.env.SOCIALMONITOR_LOCAL_ROOT,database=process.env.SOCIALMONITOR_LOCAL_DATABASE,readExport=readLocalExport,health=async()=>{
  const response=await fetch('http://127.0.0.1:4401/api/health',{signal:AbortSignal.timeout(2000),redirect:'error'});
  const body=await response.json();return response.ok&&body.ok===true&&body.db==='ok'&&body.commit==='53302c9';
}}) {
  let busy=false;
  return {enabled:Boolean(root),async sync(profileUrl){
    const profile=parseTikTokProfile(profileUrl);
    if(!root)throw new NicheError('SYNC_DISABLED','Local sync is not configured. Set SOCIALMONITOR_LOCAL_ROOT in the backend environment.',503);
    if(busy)throw new NicheError('SYNC_BUSY','A local synchronization is already in progress. Wait before retrying.',409);
    busy=true;
    try {
      let ready=false;try{ready=await health();}catch{/* Safe unavailable response below. */}
      if(!ready)throw new NicheError('SOURCE_UNAVAILABLE','The audited local SocialMonitor API is unavailable. Start it locally before syncing.',503);
      const dump=await readExport({root:path.resolve(root),database:path.resolve(database||path.join(root,'data/socialmonitor.db')),profileUrl:profile.profileUrl});
      // Validate before any write. Service import repeats canonical validation atomically.
      normalizeSocialMonitor(dump,profile.profileUrl);
      const report=await niche.import(dump,profile.profileUrl,{localReadOnly:true});
      return {report,missingMetrics:report.posts.reduce((count,post)=>count+Object.values(post.metrics).filter(value=>value===null).length,0)};
    } finally {busy=false;}
  }};
}
