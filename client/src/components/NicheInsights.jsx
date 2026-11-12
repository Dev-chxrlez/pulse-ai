import CreativeDna from './CreativeDna';
import { useState } from 'react';
import { analyzeVideo } from '../api';
import { timeLabel } from './AnalysisReport';
import { FindingSources, CreativeAction } from './CreativeReview';

export default function NicheInsights({post,video,setup,onChanged,onOpen}) {
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function analyze(){setBusy(true);setError('');try{await analyzeVideo(video.id);await onChanged();}catch(failure){setError(failure.message);}finally{setBusy(false);}}
  if(!video)return null;
  const insight=post.insights;
  const active=['queued','processing'].includes(video.analysisStatus);
  if(video.analysisStatus!=='completed')return <div className="niche-insights"><p>{active?'Analysis is pending. Saved results will appear here.':'The linked file has not completed analysis. Starting analysis sends extracted frames/audio to OpenAI and uses API credits.'}</p>{!active&&<button className="primary" disabled={busy||!setup?.available} onClick={analyze}>{busy?'Starting…':video.analysisStatus==='failed'?'Retry analysis':'Analyze linked video'}</button>}{error&&<p role="alert" className="inline-error">{error}</p>}</div>;
  if(!insight)return <p className="report-caption">Refreshing saved editing insights…</p>;
  const creative=video.creativeStatus==='completed'?video.creative:null;
  return <section className="niche-insights"><h3>Editing insights · saved analysis</h3><p className="report-caption">Actual post metrics above are separate from subjective creative assessments below. Reopening these results makes no AI request.</p>
    {creative?<div className="inline-creative-score"><strong>{creative.overall===null?'Unscored':`${creative.overall}/100`}</strong><span>{creative.coverage}% rubric coverage · not predicted performance</span></div>:<CreativeAction video={video} setup={setup} onChanged={onChanged}/>}
    <details className="report-details" open><summary>Hook, pacing, visuals & CTA</summary>{insight.observations.map(finding=><article className="niche-observation" key={finding.findingIndex}><span className="eyebrow">{finding.category.replaceAll('_',' ')} · {finding.certainty}</span><h4>{finding.title}</h4><p>{finding.assessment}</p>{finding.evidence.map((reference,index)=><button className="text-button" key={index} onClick={()=>onOpen(video,reference.start)}>{reference.source==='frame'?'Frame':'Audio window'} {reference.start===null?'(timing unavailable)':`~${timeLabel(reference.start)}${reference.end!==null?`–${timeLabel(reference.end)}`:''}`} · open evidence</button>)}</article>)}{insight.missingCategories.length>0&&<p className="report-caption">Not covered in the saved analysis: {insight.missingCategories.join(', ').replaceAll('_',' ')}. No findings are inferred for these categories.</p>}</details>
    {creative&&<details className="report-details"><summary>Ratings, proposed hooks & edit list</summary>{creative.criteria.map(item=><div className="niche-observation" key={item.id}><h4>{item.label} · {item.rating===null?'Unknown':`${item.rating}/4`}</h4><p>{item.rationale}</p><FindingSources indexes={item.findingIndexes} video={video} onOpen={onOpen}/></div>)}<h4>Proposed hooks</h4>{creative.hooks.map((hook,index)=><div className="niche-observation" key={index}><blockquote>{hook.text}</blockquote><p>{hook.execution}</p><FindingSources indexes={hook.findingIndexes} video={video} onOpen={onOpen}/></div>)}<h4>Editing recommendations</h4>{creative.priorities.map((priority,index)=><div className="niche-observation" key={index}><h4>{index+1}. {priority.title}</h4><p>{priority.action}</p><FindingSources indexes={priority.findingIndexes} video={video} onOpen={onOpen}/></div>)}</details>}
    <CreativeDna video={video} record={post.creativeDna} available={Boolean(setup?.keyConfigured)} onChanged={onChanged} onOpen={onOpen}/><button className="text-button" onClick={()=>onOpen(video)}>Open full analysis & creative review</button>
  </section>;
}
