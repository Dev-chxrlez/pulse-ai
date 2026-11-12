// Only structured attributes are eligible. Never classify report prose by keywords.
export function creativePatternReport(posts, statistics, videos) {
  const joined = posts.flatMap(post => {
    const video=videos.get(post.matchedVideoId);
    return video?.analysisStatus==='completed'&&video.analysis ? [{post,video}] : [];
  });
  const comparableRow=post=>statistics.rows?.find(row=>row.postId===post.postId)?.comparable;
  const measured=joined.filter(({post})=>post.metrics.views!==null&&comparableRow(post));
  const unique=new Set(measured.map(({video})=>video.id));
  const base={status:'insufficient_data',importedPosts:posts.length,comparableMetricPosts:statistics.comparable?posts.filter(post=>post.metrics.views!==null&&comparableRow(post)).length:0,analyzedPosts:joined.length,distinctAnalyzedVideos:new Set(joined.map(({video})=>video.id)).size,patterns:[],experiment:null,unsupportedAttributes:['Hook style','Product reveal timing','Editing pace','CTA presence','Visual structure'],limitations:['A small sample of posts; exploratory observations only.','Equal or mature (7+ day) post age is a proxy, not proof of equal audience or distribution.','Finding categories and free-text descriptions do not establish structured creative attributes.','Views are measured counts; creative ratings are subjective and are not used to rank real performance.']};
  if(!statistics.comparable)return {...base,reason:'Fewer than two posts have comparable measurement ages. No stronger/weaker creative-pattern comparison is made.'};
  if(unique.size!==measured.length)return {...base,reason:'Multiple measured posts link to the same creative asset. Independent-video comparison is withheld.'};
  if(measured.length<4)return {...base,reason:'Need at least four distinct analyzed videos with measured views, including two in each duration group.'};
  const groups=new Map();
  for(const {post,video} of measured){const duration=video.analysis.metadata?.duration;
    if(!Number.isFinite(duration)||duration<=0)continue;
    const label=duration<15?'Under 15s':duration<=30?'15–30s':'Over 30s';
    if(!groups.has(label))groups.set(label,[]);
    groups.get(label).push({postId:post.postId,videoId:video.id,duration,views:post.metrics.views,evidence:'ffprobe duration'});
  }
  const eligible=[...groups.entries()].filter(([,entries])=>entries.length>=2).map(([label,entries])=>{
    const values=entries.map(entry=>entry.views).sort((a,b)=>a-b);const middle=Math.floor(values.length/2);
    return {label,count:entries.length,medianViews:values.length%2?values[middle]:(values[middle-1]+values[middle])/2,evidence:entries};
  });
  if(eligible.length<2)return {...base,reason:'Duration groups need at least two distinct measured, analyzed videos each. No style is declared stronger from one video.'};
  const pattern={attribute:'duration',title:'Duration groups in this imported sample',groups:eligible,interpretation:'These groups differ in duration and may differ in observed views; this does not establish a duration effect.'};
  const differing = new Set(eligible.map(group=>group.medianViews)).size>1;
  return {...base,status:'available',reason:'Structured duration supports a small descriptive comparison; no other style attributes were inferred.',patterns:[pattern],experiment:differing?{title:'Test one tighter edit',hypothesis:'A shorter cut might change viewer response; the imported sample does not prove it.',action:'Create two cuts of your own video with the same opening, subject and CTA; change only duration by trimming repetition. Do not copy another creator’s script.',measurement:'Choose a fixed post-publication measurement age for both cuts. Record views and interaction counts, and note audience/distribution differences before comparing.',sourcePostIds:eligible.flatMap(group=>group.evidence.map(entry=>entry.postId))}:null};
}
export function savedCreativeInsights(video) {
  if(video?.analysisStatus!=='completed'||!video.analysis)return null;
  const analysis=video.analysis;
  const categories=['opening_hook','pacing','visual_content','call_to_action','product'];
  const observations=analysis.report.findings.flatMap((finding,index)=>categories.includes(finding.category)?[{...finding,findingIndex:index,evidence:finding.evidence.map(reference=>{
    const frame=reference.source==='frame'?analysis.frames.find(frame=>frame.index===reference.index):null;
    const window=reference.source==='transcript'?analysis.transcript.windows.find(window=>window.index===reference.index):null;
    return {...reference,start:frame?.timestamp??window?.start??null,end:window?.end??null,approximate:true};
  })}]:[]);
  return {videoId:video.id,title:video.originalName,observations,missingCategories:categories.filter(category=>!observations.some(finding=>finding.category===category)),creative:video.creativeStatus==='completed'?video.creative:null};
}
