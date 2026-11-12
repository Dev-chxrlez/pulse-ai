import {useState} from 'react';
import {AlertCircle,CheckCircle2,LoaderCircle,Play,ScanLine} from 'lucide-react';
import {timeLabel} from './AnalysisReport';

const groups={all:'All',analyzed:'Analyzed',working:'In progress',attention:'Needs attention',new:'Not analyzed'};
function group(video){
  if(video.analysisStatus==='completed')return 'analyzed';
  if(['queued','processing'].includes(video.analysisStatus))return 'working';
  if(['failed','blocked'].includes(video.analysisStatus))return 'attention';
  return 'new';
}
function Badge({video}){
  const kind=group(video);
  const icon={analyzed:<CheckCircle2 size={12}/>,working:<LoaderCircle size={12} className="spin"/>,attention:<AlertCircle size={12}/>,new:<ScanLine size={12}/>}[kind];
  const label={analyzed:'Analyzed',working:video.analysisStage||'Processing',attention:video.analysisStatus==='blocked'?'Setup required':'Analysis failed',new:'Not analyzed'}[kind];
  return <span className={`badge badge-${kind}`}>{icon}{label}</span>;
}
export default function VideoGrid({videos,onSelect}){
  const [filter,setFilter]=useState('all');
  const counts=Object.fromEntries(Object.keys(groups).map(key=>[key,key==='all'?videos.length:videos.filter(video=>group(video)===key).length]));
  const shown=videos.filter(video=>filter==='all'||group(video)===filter);
  return <section className="panel library video-library">
    <div className="panel-title"><div><h2>Your videos</h2><p>Open a video to see its report, evidence and creative review.</p></div></div>
    <div className="library-filters" role="group" aria-label="Filter videos">{Object.entries(groups).filter(([key])=>key==='all'||counts[key]>0).map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}<b>{counts[key]}</b></button>)}</div>
    {!shown.length?<p className="empty">{videos.length?'No videos in this group.':'No videos yet. Upload a file or paste a link above.'}</p>:
    <div className="video-grid">{shown.map(video=>{
      const analysis=video.analysisStatus==='completed'?video.analysis:null;
      const score=video.creativeStatus==='completed'?video.creative?.overall:null;
      const duration=video.metadata?.duration??analysis?.metadata?.duration;
      return <button key={video.id} className="video-card" onClick={()=>onSelect(video)}>
        <span className="video-card-thumb">{analysis?.frames?.length?<img src={`/api/videos/${video.id}/frames/${analysis.frames[Math.min(1,analysis.frames.length-1)].index}`} alt="" loading="lazy"/>:<video src={`${video.fileUrl}#t=0.1`} preload="metadata" muted aria-hidden="true"/>}<span className="video-card-play"><Play size={16}/></span>{Number.isFinite(duration)&&<span className="video-card-duration">{timeLabel(duration).replace(/\.\d$/,'')}</span>}{score!==null&&score!==undefined&&<span className="video-card-score" title="Creative rubric score">{score}</span>}</span>
        <span className="video-card-body"><strong>{video.originalName}</strong><small>{new Date(video.uploadedAt).toLocaleDateString()}{video.source?.kind==='facebook_link'?' · from Facebook link':''}</small>
          <span className="video-card-meta"><Badge video={video}/>{analysis&&<span className="video-card-findings">{analysis.report.findings.length} findings</span>}</span></span>
      </button>;})}</div>}
  </section>;
}
