const attributes=['hookType','editingPace','productRevealSeconds','ctaPresent','visualStyle','storyStructure'];
const median=values=>{const sorted=[...values].sort((a,b)=>a-b);const half=Math.floor(sorted.length/2);return sorted.length%2?sorted[half]:(sorted[half-1]+sorted[half])/2;};
export function dnaPatterns(posts,statistics,videos,dna){
  const completed=posts.flatMap(post=>{const video=videos.get(post.matchedVideoId);const record=video?.analysisStatus==='completed'?dna?.get(video.id):null;return record&&!record.stale&&['completed','insufficient_evidence'].includes(record.status)?[{post,video,record}]:[];});
  const base={status:'insufficient_data',performancePosts:posts.filter(post=>post.metrics.views!==null).length,completedDna:completed.filter(item=>item.record.status==='completed').length,insufficientDna:completed.filter(item=>item.record.status==='insufficient_evidence').length,patterns:[],exclusions:[],limitations:['A small sample of posts; exploratory associations, not causal or predictive results.','Two assets per group is a display safeguard, not statistical validation.','Equal or mature (7+ day) observation age is only a comparison proxy.','DNA classifications are AI inferences from saved analysis, not verified annotations.']};
  if(!statistics.comparable)return {...base,reason:'Fewer than two posts have comparable observation ages.'};
  if(new Set(completed.map(item=>item.video.id)).size!==completed.length)return {...base,reason:'Repeated publications of the same video are not independent assets.'};
  if(completed.some(item=>!item.record.assetHash))return {...base,reason:'Underlying file identity is unavailable for some DNA records. Independent-asset comparisons are withheld.'};
  if(new Set(completed.map(item=>item.record.assetHash)).size!==completed.length)return {...base,reason:'Identical uploaded file content appears more than once. Duplicate underlying assets are not independent examples.'};
  const patterns=[];const exclusions=[];
  for(const attribute of attributes)for(const metric of ['views','interactionsPerView']){
    const groups=new Map();
    for(const {post,video,record} of completed){const item=record.attributes[attribute];const measured=statistics.rows.find(row=>row.postId===post.postId);const value=measured?.comparable?measured[metric]:null;
      if(!item||item.value===null||item.value==='unknown'||item.uncertainty!=='supported_inference'||value===null||value===undefined)continue;
      const label=attribute==='productRevealSeconds'?(item.value<=3?'First cited sample ≤3s':'First cited sample >3s'):String(item.value);
      if(!groups.has(label))groups.set(label,[]);groups.get(label).push({postId:post.postId,videoId:video.id,attribute,value:item.value,metricValue:value,analysisHash:record.analysisReference.hash,evidence:item.evidence});
    }
    const eligible=[...groups.entries()].filter(([,rows])=>rows.length>=2).map(([label,rows])=>({label,count:rows.length,median:median(rows.map(row=>row.metricValue)),evidence:rows}));
    if(eligible.length<2){exclusions.push({attribute,metric,reason:'Need two known groups with at least two distinct analyzed assets each; unknown values and missing metrics excluded.'});continue;}
    patterns.push({id:`${attribute}:${metric}`,attribute,metric,groups:eligible,interpretation:'Observed group medians in this sample only; do not attribute differences to the editing choice.'});
  }
  return {...base,status:patterns.length?'available':'insufficient_data',reason:patterns.length?'Supported attributes and comparable observations form exploratory groups.':'Not enough distinct, known DNA groups and measured values.',patterns,exclusions};
}
