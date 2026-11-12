import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {LinkError,facebookUrl,resolveFacebook,restrictedProxy} from './network.js';
const exec=promisify(execFile);
export async function ytdlpBinary(configured=process.env.YTDLP_PATH){
  for(const binary of configured?[configured]:[fileURLToPath(new URL('../../.tools/yt-dlp/bin/yt-dlp',import.meta.url)),'yt-dlp','/opt/homebrew/bin/yt-dlp'])try{await exec(binary,['--version'],{timeout:5000});return binary;}catch{/* Try known installation. */}
  throw new LinkError('LINK_SETUP','Install yt-dlp or configure YTDLP_PATH in the backend environment.',503);
}
async function diskBytes(directory){let size=0;for(const name of await readdir(directory)){const item=await stat(path.join(directory,name));if(item.isDirectory())throw new LinkError('LINK_STORAGE','Unexpected retrieval output.',422);size+=item.size;}return size;}
export async function runDownloader(binary,args,{directory,maxBytes,timeout=90000,onProgress=()=>{}}){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.env.PYTHON_PATH||'python3',[fileURLToPath(new URL('./limit-download.py',import.meta.url)),String(maxBytes),binary,...args],{cwd:directory,env:{PATH:process.env.PATH,LANG:'en_US.UTF-8'},stdio:['ignore','pipe','pipe'],shell:false});
    let stdout='',stderr='',failure;let checking=false;
    const stop=error=>{failure=error;child.kill('SIGKILL');};
    const deadline=setTimeout(()=>stop(new LinkError('LINK_TIMEOUT','Facebook retrieval timed out. Retry a shorter public video.',422)),timeout);
    const disk=setInterval(async()=>{if(checking)return;checking=true;try{if(await diskBytes(directory)>maxBytes)stop(new LinkError('LINK_SIZE','Downloaded data exceeded the local retrieval size limit.',413));}catch(error){stop(error);}finally{checking=false;}},100);
    const progress=chunk=>{for(const match of String(chunk).matchAll(/PULSE_PROGRESS:\s*([\d.]+)/g))onProgress(Math.min(100,Number(match[1])));};
    child.stdout.on('data',chunk=>{progress(chunk);stdout+=chunk;if(stdout.length>4*1024*1024)stop(new LinkError('LINK_METADATA','Video metadata exceeded the supported size.',422));});
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-65536);progress(chunk);});
    child.on('error',()=>{failure=new LinkError('LINK_SETUP','yt-dlp could not start. Check the backend installation.',503);});
    child.on('close',(code,signal)=>{
      clearTimeout(deadline);clearInterval(disk);
      if(failure)return reject(failure);
      if(signal==='SIGXFSZ'||/EFBIG|File too large|file size limit/i.test(stderr))return reject(new LinkError('LINK_SIZE','The downloader reached the maximum video file size. No partial upload was kept.',413));
      if(code!==0&&code!==101){if(/timed out|timeout/i.test(stderr))return reject(new LinkError('LINK_TIMEOUT','Facebook retrieval timed out. Retry later or upload the original file.',422));const login=/login|log in|sign.in|cookies|private|checkpoint/i.test(stderr);return reject(new LinkError(login?'LINK_LOGIN':'LINK_UNAVAILABLE',login?'Facebook requires sign-in or the video is private. PULSE does not use cookies or credentials.':'Video retrieval failed. The public video may be unavailable or unsupported by the installed yt-dlp. Try another individual public video.',422));}
      resolve(stdout);
    });
  });
}
export function validateFacebookMetadata(info,{canonical,maxBytes,maxDuration}){
  if(info.entries||['playlist','multi_video'].includes(info._type)||!/^\d+$/.test(String(info.id)))throw new LinkError('LINK_PLAYLIST','The link did not resolve to one supported Facebook video.',422);
  facebookUrl(info.webpage_url||canonical);
  if(!Number.isFinite(info.duration)||info.duration<=0)throw new LinkError('LINK_DURATION','Video duration is unavailable. Upload the original file instead.',422);
  if(info.duration>maxDuration)throw new LinkError('LINK_DURATION',`This video exceeds the ${maxDuration}-second analysis limit.`,413);
  if([info.filesize,info.filesize_approx].some(value=>Number.isFinite(value)&&value>maxBytes))throw new LinkError('LINK_SIZE','This video exceeds the upload size limit. Choose a smaller video.',413);
}
export async function retrieveFacebook({url,directory,maxBytes,maxDuration,onStage,binary,timeout=90000}){
  const canonical=await resolveFacebook(url);
  const executable=binary||await ytdlpBinary();
  const proxy=await restrictedProxy({maxBytes:maxBytes+12*1024*1024});
  const common=['--ignore-config','--no-plugin-dirs','--no-cookies','--no-cookies-from-browser','--no-playlist','--use-extractors','facebook,facebook:reel,FacebookRedirectURL','--proxy',proxy.url,'--socket-timeout','15','--retries','1','--fragment-retries','0','--no-cache-dir','--no-check-formats','--no-warnings','--downloader','native','--format','best[ext=mp4][protocol=https]'];
  const started=Date.now();const remaining=()=>Math.max(1,timeout-(Date.now()-started));
  try{
    await onStage('Reading Facebook metadata');
    let info;try{info=JSON.parse(await runDownloader(executable,[...common,'--skip-download','--dump-single-json','--',canonical],{directory,maxBytes,timeout:remaining()}));}catch(error){if(error instanceof LinkError)throw error;throw new LinkError('LINK_METADATA','Facebook returned invalid video metadata.',422);}
    validateFacebookMetadata(info,{canonical,maxBytes,maxDuration});
    await onStage('Downloading video');
    await runDownloader(executable,[...common,'--max-filesize',String(maxBytes),'--max-downloads','1','--newline','--progress','--progress-template','download:PULSE_PROGRESS:%(progress._percent_str)s','--output','video.%(ext)s','--',canonical],{directory,maxBytes,timeout:remaining(),onProgress:percent=>onStage('Downloading video',percent).catch(()=>{})});
    const files=await readdir(directory);if(files.length!==1||files[0]!=='video.mp4')throw new LinkError('LINK_DOWNLOAD','The download did not produce one complete MP4. No upload was saved.',422);
    const filename=path.join(directory,'video.mp4');if((await stat(filename)).size>maxBytes)throw new LinkError('LINK_SIZE','Downloaded video exceeds the upload limit.',413);
    return {filename,originalName:`facebook-${info.id}.mp4`,source:{kind:'facebook_link',url:facebookUrl(url),canonicalUrl:info.webpage_url||canonical,videoId:String(info.id),retrievedAt:new Date().toISOString()}};
  }finally{await proxy.close();}
}
