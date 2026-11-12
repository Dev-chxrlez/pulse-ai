import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp,MAX_BYTES} from '../src/app.js';

test('upload validation, persistence, streaming, and rate limiting',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'pulse-test-'));
  const fixture=await readFile(new URL('./fixtures/tiny.webm',import.meta.url));
  let server;
  async function start(options={}){const app=await createApp({dataDir:directory,...options});server=await new Promise((resolve,reject)=>{const instance=app.listen(0,'127.0.0.1',error=>error?reject(error):resolve(instance));instance.on('error',reject);});return `http://127.0.0.1:${server.address().port}`;}
  async function stop(){await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  function form(bytes,name='clip.webm',type='video/webm'){const body=new FormData();body.append('video',new Blob([bytes],{type}),name);return body;}
  try{
    assert.equal(MAX_BYTES,104857600);
    let base=await start();
    let response=await fetch(`${base}/api/health`);assert.equal(response.status,200);assert.equal((await response.json()).analysisAvailable,false);
    response=await fetch(`${base}/api/videos`,{method:'POST',body:form(fixture)});assert.equal(response.status,201,JSON.stringify(await response.clone().json()));
    const {video}=await response.json();assert.equal(video.status,'uploaded');assert.equal(video.size,fixture.length);assert.equal(video.mimeType,'video/webm');assert.ok(!('storageName' in video));
    response=await fetch(`${base}${video.fileUrl}`);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),fixture);
    response=await fetch(`${base}${video.fileUrl}`,{headers:{Range:'bytes=0-9'}});assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes 0-9/${fixture.length}`);assert.equal((await response.arrayBuffer()).byteLength,10);
    response=await fetch(`${base}${video.fileUrl}`,{headers:{Range:'bytes=999999-'}});assert.equal(response.status,416);
    for(const [bytes,name] of [[Buffer.from('not video'),'bad.mp4'],[fixture,'bad.exe'],[Buffer.alloc(0),'empty.webm'],[fixture,'mismatch.mp4']]){response=await fetch(`${base}/api/videos`,{method:'POST',body:form(bytes,name)});assert.ok([400,415].includes(response.status));assert.ok((await response.json()).error.message);}
    response=await fetch(`${base}/api/videos`,{method:'POST',body:new FormData()});assert.equal(response.status,400);
    response=await fetch(`${base}/api/videos`,{method:'POST',body:form(Buffer.alloc(MAX_BYTES+1))});assert.equal(response.status,413);
    assert.deepEqual(await readdir(path.join(directory,'temporary')),[]);
    await stop();base=await start({maxBytes:1024});
    response=await fetch(`${base}/api/videos`);assert.equal((await response.json()).videos[0].id,video.id);
    response=await fetch(`${base}/api/videos/${video.id}`);assert.equal((await response.json()).video.originalName,'clip.webm');
    response=await fetch(`${base}/api/videos`,{method:'POST',body:form(Buffer.alloc(1025))});assert.equal(response.status,413);
    assert.deepEqual(await readdir(path.join(directory,'temporary')),[]);
    response=await fetch(`${base}/api/videos/missing`);assert.equal(response.status,404);
    response=await fetch(`${base}/api/health`,{headers:{Origin:'https://example.com'}});assert.equal(response.headers.get('access-control-allow-origin'),'http://localhost:5173');
    await stop();base=await start({rateMax:1});
    await fetch(`${base}/api/videos`,{method:'POST',body:new FormData()});
    response=await fetch(`${base}/api/videos`,{method:'POST',body:new FormData()});assert.equal(response.status,429);
  }finally{if(server?.listening)await stop();await rm(directory,{recursive:true,force:true});}
});
