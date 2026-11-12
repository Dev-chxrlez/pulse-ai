import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import net from 'node:net';
import {facebookUrl,publicAddress,publicIPv4,restrictedProxy,LinkError} from '../src/links/network.js';
import {validateFacebookMetadata,runDownloader} from '../src/links/retrieve.js';
import {createApp} from '../src/app.js';
import {findMediaTools,probeVideo,runMedia,extractFrames,audioWindows} from '../src/media.js';
const share='https://www.facebook.com/share/v/1A2a3Ttsos/';
const report={summary:'Isolated generated-fixture review.',findings:[{category:'visual_content',title:'Fixture',assessment:'Generated frame.',suggestion:'',certainty:'observed',evidence:[{source:'frame',index:0,observation:'Synthetic color.'}]}],limitations:['Test only.']};

test('Facebook URLs restrict individual videos and public IPv4; redirects cannot introduce another host',async()=>{
  for(const url of [share,'https://www.facebook.com/reel/969514082319139/','https://m.facebook.com/watch/?v=123','https://www.facebook.com/name/videos/123/','https://www.facebook.com/video.php?v=123'])assert.ok(facebookUrl(url));
  for(const url of ['http://www.facebook.com/reel/123/','https://127.0.0.1/reel/123/','https://facebook.com.evil.invalid/reel/123/','https://user:pass@facebook.com/reel/123/','https://www.facebook.com:8443/reel/123/','https://www.facebook.com/name','https://www.facebook.com/watch/?v=123&list=456','https://www.facebook.com/reel/123/#x','https://l.facebook.com/l.php?u=http://127.0.0.1'])assert.throws(()=>facebookUrl(url),LinkError);
  for(const address of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.0.1','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','198.18.0.1','203.0.113.1','::1','::ffff:127.0.0.1'])assert.equal(publicIPv4(address),false,address);
  assert.equal(publicIPv4('157.240.1.1'),true);
  await assert.rejects(publicAddress('www.facebook.com',async()=>[{address:'127.0.0.1'}]),e=>e.code==='LINK_NETWORK');
  await assert.rejects(publicAddress('www.facebook.com',async()=>[{address:'157.240.1.1'},{address:'10.0.0.1'}]),e=>e.code==='LINK_NETWORK');
  assert.equal(await publicAddress('www.facebook.com',async()=>[{address:'157.240.1.1'}]),'157.240.1.1');
});

test('restricted downloader proxy rejects foreign hosts, private DNS, and non-443 destinations',async()=>{
  let resolutions=0;const proxy=await restrictedProxy({maxBytes:100,resolve:async()=>{resolutions++;return [{address:'127.0.0.1'}];}});
  try{
    for(const host of ['127.0.0.1:443','evil.invalid:443','www.facebook.com:80','www.facebook.com:443']){
      const response=await new Promise((resolve,reject)=>{const socket=net.connect(new URL(proxy.url).port,'127.0.0.1',()=>socket.write(`CONNECT ${host} HTTP/1.1\r\nHost: ${host}\r\n\r\n`));let text='';socket.on('data',chunk=>text+=chunk);socket.on('end',()=>resolve(text));socket.on('error',reject);});assert.match(response,/403/);
    }
    assert.equal(resolutions,1);
  }finally{await proxy.close();}
});

test('downloader time and disk budgets kill subprocesses and return safe errors',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'pulse-downloader-'));
  try{
    await assert.rejects(runDownloader(process.execPath,['-e','setTimeout(()=>{},10000)'],{directory,maxBytes:1024,timeout:30}),e=>e.code==='LINK_TIMEOUT');
    await assert.rejects(runDownloader(process.execPath,['-e',"require('fs').writeFileSync('partial.mp4',Buffer.alloc(4096));setTimeout(()=>{},10000)"],{directory,maxBytes:1024,timeout:3000}),e=>e.code==='LINK_SIZE');
    assert.ok((await readdir(directory)).includes('partial.mp4'));
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('audio-tail fixture samples decodable video only while audio windows retain container duration',async context=>{
  const tools=await findMediaTools();if(!tools.ffmpeg||!tools.ffprobe)return context.skip('FFmpeg unavailable');
  const directory=await mkdtemp(path.join(tmpdir(),'pulse-tail-'));
  try{
    const file=path.join(directory,'tail.mp4');
    await runMedia(tools.ffmpeg,['-nostdin','-v','error','-f','lavfi','-i','color=c=blue:s=160x120:r=25:d=25','-f','lavfi','-i','sine=frequency=440:duration=25.108','-map','0:v','-map','1:a','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-y',file]);
    const metadata=await probeVideo(file,tools);assert.ok(metadata.duration>metadata.videoDuration);assert.equal(metadata.videoDuration,25);assert.ok(metadata.lastFrameTimestamp<=25);
    const frames=await extractFrames(file,path.join(directory,'frames'),metadata,tools);assert.equal(frames.length,17);assert.ok(frames.every(frame=>frame.timestamp<=metadata.lastFrameTimestamp));
    assert.equal(audioWindows(metadata.duration).at(-1).end,metadata.duration);assert.ok(audioWindows(metadata.duration).at(-1).end>25);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('link flow reuses storage/analysis; failure cleans partials; completed jobs reuse uploads and survive restart',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'pulse-link-api-'));let server;let calls=0,reviews=0,fail=false;
  const provider={models:{vision:'test-only',transcription:'test-only'},transcribe:async()=>'',review:async()=>{reviews++;return {report,usage:null};}};
  const tools=await findMediaTools();const original=path.join(directory,'source.mp4');
  await runMedia(tools.ffmpeg,['-nostdin','-v','error','-f','lavfi','-i','color=s=160x120:r=12:d=2','-c:v','libx264','-pix_fmt','yuv420p','-y',original]);
  const retrieve=async({directory:workspace,onStage})=>{calls++;await onStage('Downloading video',50);const filename=path.join(workspace,'video.mp4');if(fail){await writeFile(filename,'partial');throw new LinkError('LINK_UNAVAILABLE','Fixture retrieval failed.',422);}await copyFile(original,filename);return {filename,originalName:'facebook-test.mp4',source:{kind:'facebook_link',videoId:'123',url:share}};};
  async function start(){const app=await createApp({dataDir:directory,analysisProvider:provider,linkConfig:{retrieve}});server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});return {app,base:`http://127.0.0.1:${server.address().port}`};}
  try{
    let {app,base}=await start();const request=url=>fetch(`${base}/api/video-links`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:5173'},body:JSON.stringify({url,permitted:true})});
    assert.equal((await request('https://127.0.0.1/reel/123/')).status,400);assert.equal(calls,0);
    let response=await request(share);assert.equal(response.status,202);const id=(await response.json()).job.id;await app.locals.linkService.idle();await app.locals.analysisService.idle();
    let job=(await (await fetch(`${base}/api/video-links/${id}`)).json()).job;assert.equal(job.status,'completed');assert.equal(job.video.analysisStatus,'completed');assert.equal(reviews,1);assert.ok(!('storageName' in job.video));
    const library=await (await fetch(`${base}/api/videos`)).json();assert.equal(library.videos.length,1);assert.deepEqual(await readdir(path.join(directory,'temporary')),[]);
    await request(share);assert.equal(calls,1);assert.equal(reviews,1);
    fail=true;response=await request('https://www.facebook.com/reel/456/');const failedId=(await response.json()).job.id;await app.locals.linkService.idle();
    job=(await (await fetch(`${base}/api/video-links/${failedId}`)).json()).job;assert.equal(job.status,'failed');assert.equal(job.video,null);assert.deepEqual(await readdir(path.join(directory,'temporary')),[]);assert.equal((await readdir(path.join(directory,'uploads'))).length,1);
    assert.equal(JSON.parse(await readFile(path.join(directory,'videos.json'),'utf8')).length,1);
    await new Promise(resolve=>server.close(resolve));({app,base}=await start());job=(await (await fetch(`${base}/api/video-links/${id}`)).json()).job;assert.equal(job.status,'completed');assert.equal(reviews,1);
  }finally{if(server?.listening)await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
});


test('metadata validation rejects playlists, unknown/long durations, oversized media and foreign webpage URLs before download',()=>{
  const limits={canonical:share,maxBytes:1000,maxDuration:180};const good={id:'123',duration:25,webpage_url:'https://www.facebook.com/reel/123/',filesize:500};
  assert.doesNotThrow(()=>validateFacebookMetadata(good,limits));
  for(const [change,code] of [[{entries:[]},'LINK_PLAYLIST'],[{id:'not-video'},'LINK_PLAYLIST'],[{duration:null},'LINK_DURATION'],[{duration:181},'LINK_DURATION'],[{filesize:1001},'LINK_SIZE'],[{filesize_approx:1001},'LINK_SIZE'],[{webpage_url:'https://127.0.0.1/reel/123/'},'LINK_URL']])assert.throws(()=>validateFacebookMetadata({...good,...change},limits),e=>e.code===code);
});
