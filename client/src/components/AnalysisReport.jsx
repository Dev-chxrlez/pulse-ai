import { useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, LoaderCircle, RefreshCw, ScanLine, Target } from 'lucide-react';
import { analyzeVideo } from '../api';
import CreativeReview from './CreativeReview';
import VideoDna from './VideoDna';

export function analysisLabel(video) {
  return ({ queued: 'Queued', processing: video.analysisStage || 'Processing', completed: 'Analyzed', failed: 'Analysis failed', blocked: 'Setup required' })[video.analysisStatus] || 'Not analyzed';
}
export function timeLabel(seconds) {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
}
export function SetupNotice({ setup }) {
  if (!setup || setup.available) return null;
  return <section className="setup-notice" aria-label="Analysis setup required"><AlertCircle size={18}/><div><h3>One setup step before analysis</h3>{setup.issues.map(issue => <p key={issue}>{issue}</p>)}<p>Uploads still work. Keep your API key in the backend environment file; don’t paste it into this page.</p></div></section>;
}
const certaintyLabel = { observed: 'Observed', inferred: 'Inferred', uncertain: 'Uncertain' };
// Left column beside the player: facts, a clickable timeline and the sampled frames.
export function VideoPanel({ video, onSeek, currentTime = 0 }) {
  const analysis = video.analysis;
  const duration = video.metadata?.duration;
  const at = time => `${Math.min(100, Math.max(0, time / duration * 100))}%`;
  const activeFrame = analysis?.frames.reduce((best, frame) => frame.timestamp <= currentTime + .05 ? frame : best, analysis.frames[0]);
  return <div className="video-panel">
    {video.metadata && <div className="media-facts"><span>{timeLabel(video.metadata.duration)}</span><span>{video.metadata.width} × {video.metadata.height}</span><span>{video.metadata.fps || '—'} fps</span><span>{video.metadata.hasAudio ? 'Audio' : 'No audio'}</span></div>}
    {analysis && Number.isFinite(duration) && duration > 0 && <>
      <div className="timeline" role="group" aria-label="Video timeline">
        <button className="timeline-track" aria-label="Seek in video" onClick={event => { const box = event.currentTarget.getBoundingClientRect(); onSeek((event.clientX - box.left) / box.width * duration); }}>
          <span className="timeline-hook" style={{ width: at(3) }} title="Opening hook (0–3 s)"/>
          {analysis.sceneChanges.map((time, index) => <span key={`s${index}`} className="timeline-scene" style={{ left: at(time) }}/>)}
          {analysis.frames.map(frame => <span key={`f${frame.index}`} className="timeline-frame" style={{ left: at(frame.timestamp) }}/>)}
          <span className="timeline-playhead" style={{ left: at(currentTime) }}/>
        </button>
        <div className="timeline-legend"><span><i className="hook"/>Hook 0–3 s</span><span><i className="frame"/>Sampled frame</span><span><i className="scene"/>Scene change</span><span>{timeLabel(currentTime)} / {timeLabel(duration)}</span></div>
      </div>
      <div className="frame-grid">{analysis.frames.map(frame => <button key={frame.index} className={frame === activeFrame ? 'active' : ''} onClick={() => onSeek(frame.timestamp)} aria-label={`Seek to frame at ${timeLabel(frame.timestamp)}`}><img src={`/api/videos/${video.id}/frames/${frame.index}`} alt="" loading="lazy"/><span>{timeLabel(frame.timestamp)}</span></button>)}</div>
    </>}
  </div>;
}
function AtAGlance({ video, onSeek, sourceTime }) {
  const { report } = video.analysis;
  const counts = Object.fromEntries(Object.keys(certaintyLabel).map(key => [key, report.findings.filter(finding => finding.certainty === key).length]));
  const creative = video.creativeStatus === 'completed' ? video.creative : null;
  const priority = creative?.priorities[0];
  const fallback = priority ? null : report.findings.find(finding => finding.certainty !== 'uncertain' && finding.suggestion) || null;
  return <section className="at-a-glance" aria-label="At a glance">
    <div className="glance-top">
      <div className="glance-score">{creative ? <><strong>{creative.overall ?? '—'}<small>/100</small></strong><span>Creative rubric · {creative.coverage}% coverage</span></> : <><strong className="pending">—</strong><span>Creative score: generate the review below</span></>}</div>
      <div className="glance-counts">{Object.entries(counts).map(([key, value]) => <span key={key} className={`cert cert-${key}`}><b>{value}</b>{certaintyLabel[key].toLowerCase()}</span>)}</div>
    </div>
    <p className="report-summary">{report.summary}</p>
    {(priority || fallback) && <div className="glance-fix"><Target size={16}/><div><span className="eyebrow">FIX FIRST</span><h3>{priority ? priority.title : fallback.title}</h3><p>{priority ? priority.action : fallback.suggestion}</p>{fallback?.evidence?.[0] && <button className="text-button" onClick={() => onSeek(sourceTime(fallback.evidence[0]))}>See the moment<ArrowRight size={12}/></button>}</div></div>}
  </section>;
}
export default function AnalysisReport({ video, setup, onChanged, onSeek }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('all');
  const active = ['queued', 'processing'].includes(video.analysisStatus);
  const analysis = video.analysis;
  async function analyze() {
    setBusy(true); setError('');
    try { await analyzeVideo(video.id); await onChanged(); }
    catch (failure) { setError(failure.message); await onChanged(); }
    finally { setBusy(false); }
  }
  function sourceLabel(reference) {
    if (reference.source === 'frame') return `Frame · ~${timeLabel(analysis.frames.find(frame => frame.index === reference.index).timestamp)}`;
    const window = analysis.transcript.windows.find(window => window.index === reference.index);
    return `Audio window · ${timeLabel(window.start)}–${timeLabel(window.end)}`;
  }
  function sourceTime(reference) {
    return reference.source === 'frame' ? analysis.frames.find(frame => frame.index === reference.index).timestamp : analysis.transcript.windows.find(window => window.index === reference.index).start;
  }
  return <div className="analysis-report">
    <div className="analysis-heading"><div><span className="eyebrow">VIDEO INTELLIGENCE</span><h2>{analysis ? 'A closer look.' : 'Analysis'}</h2></div><span className={`analysis-state state-${video.analysisStatus || 'uploaded'}`}>{active ? <LoaderCircle size={14} className="spin"/> : analysis ? <CheckCircle2 size={14}/> : <ScanLine size={14}/>}<span role="status">{analysisLabel(video)}</span></span></div>
    {active && <div className="analysis-progress"><div className="indeterminate"/><p>Processing on the server. You can close this view and come back.</p></div>}
    {video.analysisError && <p className="notice error" role="alert"><AlertCircle size={15}/>{video.analysisError.message}</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {!active && !analysis && <div className="analysis-start"><p>Review sampled visuals, spoken content, the opening hook, captions, and calls to action. Analysis sends extracted frames and audio for AI review.</p><button className="primary" disabled={busy || !setup?.available} onClick={analyze}>{busy ? 'Starting…' : video.analysisStatus === 'failed' ? 'Retry analysis' : 'Analyze video'}{video.analysisStatus === 'failed' ? <RefreshCw size={14}/> : <ArrowRight size={14}/>}</button></div>}
    {analysis && <>
      <AtAGlance video={video} onSeek={onSeek} sourceTime={sourceTime}/>
      <div className="report-section-title"><h3>Findings</h3><span>Select evidence to jump to that moment</span></div>
      <div className="finding-filters" role="group" aria-label="Filter findings">{[['all', analysis.report.findings.length], ...[...new Set(analysis.report.findings.map(finding => finding.category))].map(value => [value, analysis.report.findings.filter(finding => finding.category === value).length])].map(([value, total]) => <button key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{value === 'all' ? 'All' : value.replaceAll('_', ' ')}<b>{total}</b></button>)}</div>
      <div className="findings">{analysis.report.findings.filter(finding => category === 'all' || finding.category === category).map((finding, index) => <article className={`finding finding-${finding.certainty}`} key={`${finding.category}-${index}`}><div className="finding-meta"><span>{finding.category.replaceAll('_', ' ')}</span><span className={`cert cert-${finding.certainty}`}>{certaintyLabel[finding.certainty]}</span></div><h3>{finding.title}</h3><p>{finding.assessment}</p>{finding.suggestion && <p className="finding-suggestion"><strong>Try this</strong>{finding.suggestion}</p>}{finding.evidence.map((reference, index) => <button className="evidence" key={index} onClick={() => onSeek(sourceTime(reference))}><span>{sourceLabel(reference)} <ArrowRight size={12}/></span><span>{reference.observation}</span></button>)}</article>)}</div>
      <CreativeReview video={video} setup={setup} onChanged={onChanged} onSeek={onSeek}/>
      {video.analysisStatus==='completed'&&<VideoDna key={video.id} video={video} onSeek={onSeek}/>}
      <details className="report-details" open><summary>Transcript</summary><p className="report-caption">Time ranges show the extracted audio windows, not exact word timing. Transcription may contain errors.</p>{analysis.transcript.status === 'no_audio' ? <p>No audio track was found.</p> : analysis.transcript.windows.map(window => <div className="transcript-window" key={window.index}><button onClick={() => onSeek(window.start)}>{timeLabel(window.start)}–{timeLabel(window.end)}</button><p>{window.text || 'No speech returned for this window.'}</p></div>)}</details>
      <details className="report-details"><summary>Scene-change measurements</summary><p className="report-caption">FFmpeg checks at 4 frames per second using a 0.3 scene-change threshold. These are candidate changes, not a verified cut count.</p><div className="scene-times">{analysis.sceneChanges.length ? analysis.sceneChanges.map((time, index) => <button key={index} onClick={() => onSeek(time)}>~{timeLabel(time)}</button>) : <p>No changes crossed the threshold.</p>}</div></details>
      <details className="report-details"><summary>Method & limitations</summary><p>Sampled frames and audio transcription support qualitative observations. They do not measure actual viewer engagement or predict performance.</p><ul>{analysis.report.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul><p className="report-caption">{analysis.frames.length} frames · {analysis.transcript.status === 'no_audio' ? 'No transcription needed' : 'Audio transcribed'}<br/>Saved {new Date(analysis.completedAt).toLocaleString()}</p></details>
    </>}
  </div>;
}
