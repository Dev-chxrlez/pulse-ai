// Uses the existing running PULSE service so atomic stores never have two writers.
const mode=process.argv[2],profileId=process.argv[3];
if(!['status','acquire'].includes(mode)){console.error('Use npm run tiktok:status or npm run tiktok:acquire -- <optional-source-profile-id>.');process.exit(1);}
const headers={'Content-Type':'application/json',Origin:'http://localhost:5173','X-Pulse-Local-Sync':'1'};
async function post(route,body={},extra={}){
  const response=await fetch(`http://127.0.0.1:3001/api/niche/local-sync${route}`,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(125000)});
  const data=await response.json();if(!response.ok)throw new Error(`${data.error?.code||'REQUEST_FAILED'}: ${data.error?.message||'Local request failed.'}`);return data;
}
try{
  const {capability}=await post('/session');
  const result=await post(`/tiktok/${mode}`,{profileId},{Authorization:`Bearer ${capability}`});
  // Never print tokens, request bodies, provider payloads, captions or private account details.
  if(mode==='status')console.log(JSON.stringify(result,null,2));
  else console.log(JSON.stringify({status:result.status,accountVerified:result.accountVerified,receivedVideos:result.receivedVideos,retainedVideos:result.report?.posts.length||0,persisted:result.persisted,hasMore:result.hasMore,posts:result.report?.posts.map(post=>({postId:post.postId,metrics:post.metrics}))||[]},null,2));
}catch(error){console.error(error.message.startsWith('fetch failed')?'PULSE API unavailable. Start npm run dev.':error.message);process.exitCode=1;}
