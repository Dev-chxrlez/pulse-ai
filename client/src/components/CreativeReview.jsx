import { useState } from 'react';
import { ArrowRight, LoaderCircle, RefreshCw } from 'lucide-react';
import { requestCreative } from '../api';

export const ratingLabels = ['Severe weakness', 'Needs work', 'Mixed / adequate', 'Strong', 'Especially effective'];
export function ScoreMethod() {
  return <details className="report-details score-method"><summary>How these scores work</summary><p>AI-assessed ratings: 0 severe weakness, 1 needs work, 2 mixed or adequate, 3 strong, 4 especially effective. Unknown criteria stay unscored.</p><p>Weights: opening hook 22%, message clarity 16%, pacing 12%, call to action 12%, early branding 10%, text readability 8%, works without sound 8%, emotional connection 7%, platform format fit 5%. Criteria follow Google’s ABCD framework (Attract, Brand, Connect, Direct) and TikTok/Meta short-form guidance. Format fit is measured from the video’s dimensions, not judged by AI. The score is 100 × Σ(weight × rating ÷ 4) ÷ assessed weight. It requires at least three assessed criteria and 60% of rubric weight. Coverage is assessed rubric weight, not confidence.</p><p>These are subjective creative assessments from sampled evidence. They are not probabilities, predicted engagement, or validated performance metrics. Model judgments can vary.</p></details>;
}
export function FindingSources({ indexes, video, onSeek, onOpen }) {
  return <div className="finding-sources">{indexes.map(index => {
    const finding = video.analysis.report.findings[index];
    return <button key={index} onClick={() => {
      if(onOpen) return onOpen(video);
      const reference = finding.evidence[0];
      const time = reference?.source === 'frame' ? video.analysis.frames.find(frame => frame.index === reference.index)?.timestamp : video.analysis.transcript.windows.find(window => window.index === reference?.index)?.start;
      if(time !== undefined) onSeek?.(time);
    }}>Source {index + 1}: {finding.title}<ArrowRight size={11}/></button>;
  })}</div>;
}
export function CreativeAction({ video, setup, onChanged, refresh = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = ['queued', 'processing'].includes(video.creativeStatus);
  async function generate() {
    setBusy(true); setError('');
    try { await requestCreative(video.id, refresh); await onChanged(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <div className="creative-action">
    {active ? <p className="analysis-state" role="status"><LoaderCircle className="spin" size={14}/>{video.creativeStatus === 'queued' ? 'Creative review queued' : 'Reviewing creative choices…'}</p> : <><p>{refresh ? 'This review was made before Early branding, Works without sound and Emotional connection were added. Update it to rate them; this makes one additional AI request.' : 'Generate a rubric-based review, suggested hooks, and a prioritized edit list from this saved analysis. This makes one additional AI request.'}</p><button className="primary" disabled={busy || !setup?.keyConfigured} onClick={generate}>{busy ? 'Starting…' : refresh ? 'Update review to latest rubric' : video.creativeStatus === 'failed' ? 'Retry creative review' : 'Generate creative review'}{video.creativeStatus === 'failed' ? <RefreshCw size={14}/> : <ArrowRight size={14}/>}</button></>}
    {(error || video.creativeError) && <p className="notice error" role="alert">{error || video.creativeError}</p>}
  </div>;
}
const AI_CRITERIA = ['hook','clarity','pacing','text','cta','brand','silent','connect'];
export const outdatedReview = creative => Boolean(creative) && AI_CRITERIA.some(id => !creative.criteria.some(item => item.id === id));
export default function CreativeReview({ video, setup, onChanged, onSeek }) {
  const creative = video.creative;
  return <section className="creative-review"><div className="analysis-heading"><div><span className="eyebrow">CREATIVE REVIEW</span><h2>What to keep. What to change.</h2></div></div>
    {(!creative || ['queued','processing'].includes(video.creativeStatus)) ? <CreativeAction video={video} setup={setup} onChanged={onChanged}/> : <>
      {outdatedReview(creative) && <CreativeAction video={video} setup={setup} onChanged={onChanged} refresh/>}
      <div className="creative-score"><div><span className="eyebrow">CREATIVE RUBRIC SCORE</span><strong>{creative.overall ?? '—'}<small>/100</small></strong></div><p>{creative.overall === null ? 'Not enough assessed criteria for an overall score.' : 'A weighted assessment of the criteria supported by this report.'}<span>{creative.coverage}% rubric coverage · not a performance prediction</span></p></div>
      <div className="rubric-grid">{creative.criteria.map(item => <article className="rubric-item" key={item.id}><div><h3>{item.label}</h3><span>{item.rating === null ? 'Unknown' : `${item.rating}/4`}</span></div><meter min="0" max="4" value={item.rating ?? 0} aria-label={`${item.label}: ${item.rating === null ? 'unscored' : item.rating+' out of 4'}`}/><small>{item.rating === null ? 'Insufficient evidence' : ratingLabels[item.rating]} · {item.weight}% weight{item.measured ? ' · measured from file' : ''}</small><p>{item.rationale}</p><FindingSources indexes={item.findingIndexes} video={video} onSeek={onSeek}/></article>)}</div>
      <div className="strength-weakness"><div><h3>Keep</h3>{creative.strengths.length ? creative.criteria.filter(item => creative.strengths.includes(item.id)).map(item => <p key={item.id}><strong>{item.label}</strong>{item.rationale}</p>) : <p>No criterion was rated strong enough to highlight. Review the individual ratings.</p>}</div><div><h3>Rework</h3>{creative.weaknesses.length ? creative.criteria.filter(item => creative.weaknesses.includes(item.id)).map(item => <p key={item.id}><strong>{item.label}</strong>{item.rationale}</p>) : <p>No assessed criterion was rated 0 or 1. Unknown criteria still need review.</p>}</div></div>
      <div className="report-section-title"><h3>Suggested opening hooks</h3><span>Proposed edits · not present in the original</span></div>
      <div className="hook-options">{creative.hooks.map((hook,index) => <article className="finding" key={index}><span className="eyebrow">OPTION {String(index+1).padStart(2,'0')}</span><blockquote>{hook.text}</blockquote><p><strong>First 3 seconds</strong> {hook.execution}</p><p className="hook-reason">{hook.rationale}</p><FindingSources indexes={hook.findingIndexes} video={video} onSeek={onSeek}/></article>)}</div>
      <div className="report-section-title"><h3>Before you publish</h3><span>Prioritized edit list</span></div><ol className="edit-priorities">{creative.priorities.map((priority,index) => <li key={index}><span className="section-number">{String(index+1).padStart(2,'0')}</span><div><h3>{priority.title}</h3><p>{priority.action}</p><FindingSources indexes={priority.findingIndexes} video={video} onSeek={onSeek}/></div></li>)}</ol>
      <ScoreMethod/><p className="report-caption">Saved {new Date(creative.completedAt).toLocaleString()} · rubric v{creative.version}</p>
    </>}
  </section>;
}
