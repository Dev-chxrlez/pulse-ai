import {useEffect, useRef, useState} from 'react';
import {ArrowUpRight, LoaderCircle, Play} from 'lucide-react';
import {requestCreative} from '../api';
import {timeLabel} from './AnalysisReport';
import {ratingLabels} from './CreativeReview';

const tactics = [
  ['opening_hook', 'Opening hook', 'How the first 3 seconds stop the scroll'],
  ['pacing', 'Pacing', 'How fast it moves'],
  ['on_screen_text', 'On-screen text', 'Words viewers read without sound'],
  ['product', 'Product', 'When and how the product appears'],
  ['visual_content', 'Visuals', 'What the camera shows'],
  ['narration', 'Voice & audio', 'What viewers hear'],
  ['call_to_action', 'Call to action', 'What it asks viewers to do'],
];
const median = values => {const sorted = [...values].sort((a, b) => a - b);const middle = Math.floor(sorted.length / 2);return sorted.length ? (sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2) : null;};
const frameAt = (analysis, reference) => reference.source === 'frame' ? analysis.frames.find(frame => frame.index === reference.index)?.timestamp : analysis.transcript.windows.find(window => window.index === reference.index)?.start;

// Free summary across every analyzed reference ad.
export function TrendPatterns({picks}) {
  const analyzed = picks.filter(pick => pick.video?.analysisStatus === 'completed' && pick.style);
  if (analyzed.length < 2) return null;
  const share = test => `${analyzed.filter(test).length} of ${analyzed.length}`;
  const durations = analyzed.map(pick => pick.style.duration).filter(Number.isFinite);
  const cuts = analyzed.map(pick => pick.style.cutInterval).filter(Number.isFinite);
  const voiced = pick => pick.video.analysis?.transcript?.text?.trim().length > 20;
  const stats = [
    ['Typical length', durations.length ? `${Math.round(median(durations))}s` : '—', `range ${Math.round(Math.min(...durations))}–${Math.round(Math.max(...durations))}s`],
    ['Cut every', cuts.length ? `${median(cuts).toFixed(1)}s` : '—', 'median time between scene changes'],
    ['Product in first 3s', share(pick => Number.isFinite(pick.style.productAt) && pick.style.productAt <= 3), 'show what they sell almost immediately'],
    ['Text-led', share(pick => pick.style.textHeavy), 'rely on on-screen words (sound-off viewing)'],
    ['Voiceover', share(voiced), 'use spoken narration'],
    ['Ends with a CTA', share(pick => pick.style.ctaFound), 'tell viewers what to do next'],
  ];
  return <section className="panel trend-patterns"><div className="panel-title"><div><h2>Patterns across trending ads</h2><p>What {analyzed.length} long-running ads have in common, measured from their videos. A small sample: patterns, not rules.</p></div></div>
    <div className="kpi-row">{stats.map(([label, value, note]) => <div className="kpi" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}</div>
  </section>;
}

export default function TrendBreakdown({pick, video, onOpen, onChanged}) {
  const [busy, setBusy] = useState(false);const [error, setError] = useState('');const panel = useRef();
  useEffect(() => {panel.current?.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start'});}, [pick.id]);
  const analysis = video?.analysis;
  if (!analysis) return null;
  const findings = analysis.report.findings.filter(finding => finding.certainty !== 'uncertain');
  const creative = video.creativeStatus === 'completed' ? video.creative : null;
  const reviewing = ['queued', 'processing'].includes(video.creativeStatus);
  async function score() {setBusy(true);setError('');try {await requestCreative(video.id);await onChanged();} catch (failure) {setError(failure.message);} finally {setBusy(false);}}
  const play = time => onOpen(video, time);
  const style = pick.style || {};
  return <section className="panel trend-breakdown" ref={panel}>
    <div className="panel-title"><div><span className="eyebrow">WHY IT WORKS</span><h2>{pick.advertiser}</h2><p>{analysis.report.summary}</p></div><button className="secondary-button" onClick={() => play(0)}><Play size={14}/>Play ad</button></div>
    <div className="success-signal"><strong>{pick.daysRunning ? `${pick.daysRunning} days` : 'Long-running'}</strong><span>{pick.daysRunning ? 'and still running. Advertisers keep paying only for ads that perform, so this is a success signal (not a view count).' : 'Still running.'}</span><a className="text-button" href={pick.transparencyUrl} target="_blank" rel="noreferrer">Source<ArrowUpRight size={12}/></a></div>
    <div className="breakdown-facts">
      <span><b>{Math.round(style.duration || analysis.metadata.duration)}s</b> long</span>
      {Number.isFinite(style.cutInterval) && <span><b>{(analysis.sceneChanges || []).length}</b> scene changes · one every <b>{style.cutInterval}s</b> ({style.pace} pace)</span>}
      {Number.isFinite(style.productAt) && <span>product first seen at <b>~{style.productAt.toFixed(1)}s</b></span>}
      <span>{analysis.transcript?.text?.trim() ? 'voiceover' : 'no speech'} · {style.textHeavy ? 'text-led' : 'little on-screen text'}</span>
    </div>
    <h3 className="breakdown-heading">How they did it</h3>
    <div className="tactic-grid">{tactics.map(([category, label, hint]) => {const items = findings.filter(finding => finding.category === category);if (!items.length) return null;
      return <article key={category} className="tactic"><span className="eyebrow">{label}</span><small>{hint}</small>{items.slice(0, 2).map((finding, index) => <div key={index}><h4>{finding.title}</h4><p>{finding.assessment}</p>
        <div className="tactic-frames">{finding.evidence.slice(0, 3).map((reference, position) => {const time = frameAt(analysis, reference);if (!Number.isFinite(time)) return null;return reference.source === 'frame'
          ? <button key={position} onClick={() => play(time)} title={reference.observation}><img src={`/api/videos/${video.id}/frames/${reference.index}`} alt=""/><span>{timeLabel(time)}</span></button>
          : <button key={position} className="audio-chip" onClick={() => play(time)} title={reference.observation}>🔊 {timeLabel(time)}</button>;})}</div></div>)}</article>;})}</div>
    <h3 className="breakdown-heading">Scorecard</h3>
    {creative ? <div className="scorecard">
      <div className="scorecard-total"><strong>{creative.overall ?? '—'}</strong><span>/100 creative rubric</span></div>
      <div className="scorecard-rows">{creative.criteria.filter(item => item.rating !== null).map(item => <div key={item.id}><span>{item.label}</span><span className="rating-bar"><i style={{width: `${item.rating / 4 * 100}%`}}/></span><b>{ratingLabels[item.rating]}</b></div>)}</div>
    </div> : <div className="manual-actions"><button className="secondary-button" disabled={busy || reviewing} onClick={score}>{reviewing || busy ? <><LoaderCircle size={14} className="spin"/>Scoring…</> : 'Score how well it’s made'}</button><small className="report-caption">One AI request. Rates hook, clarity, pacing, branding, sound-off and CTA.</small></div>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    {creative && <><h3 className="breakdown-heading">Lessons you can use</h3><ul className="lessons">{creative.criteria.filter(item => item.rating >= 3).map(item => <li key={item.id}><b>{item.label}:</b> {item.rationale}</li>)}{!creative.criteria.some(item => item.rating >= 3) && <li>No criterion rated strong; its success may come from targeting or spend rather than the edit.</li>}</ul></>}
    <p className="report-caption breakdown-note">AI analysis of sampled frames and audio. Running time shows the advertiser kept paying for it; it does not prove the edit alone caused success.</p>
  </section>;
}
