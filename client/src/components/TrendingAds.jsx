import {useEffect, useState} from 'react';
import {AlertCircle, ArrowUpRight, LoaderCircle, Play, Search, Sparkles} from 'lucide-react';
import {apiRequest, get} from '../api';
import TrendBreakdown, {TrendPatterns} from './TrendBreakdown';

const RECENT_KEY = 'pulse.trends.recent';
const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };
const saveRecent = list => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8))); } catch { /* optional */ } };
const day = value => value ? new Date(value).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'}) : '—';

export default function TrendingAds({videos, libraryVideos = videos, onOpen, onVideosChanged}) {
  const [openPick, setOpenPick] = useState(null);
  const [status, setStatus] = useState(null);const [query, setQuery] = useState('');const [result, setResult] = useState(null);
  const [picks, setPicks] = useState([]);const [busy, setBusy] = useState('');const [error, setError] = useState('');const [recent, setRecent] = useState(readRecent);
  const refreshStatus = () => get('trends/status').then(setStatus).catch(failure => setError(failure.message));
  const loadPicks = () => get('trends/picks').then(data => setPicks(data.picks)).catch(() => {});
  useEffect(() => {refreshStatus();loadPicks();}, []);
  // Poll while a reference video is still downloading or being analyzed.
  const pending = picks.some(pick => pick.status === 'downloading' || (pick.video && ['queued', 'processing'].includes(pick.video.analysisStatus)));
  useEffect(() => {if (!pending) return;const timer = setInterval(async () => {await loadPicks();onVideosChanged?.();}, 3000);return () => clearInterval(timer);}, [pending]);
  async function search(value = query) {
    const text = value.trim();if (!text) return;
    setBusy('search');setError('');setQuery(text);
    try {const data = await apiRequest('trends/search', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({query: text})}, 60000);setResult(data);const next = [text, ...recent.filter(item => item.toLowerCase() !== text.toLowerCase())];setRecent(next);saveRecent(next);if (!data.cached) refreshStatus();}
    catch (failure) {setError(failure.message);} finally {setBusy('');}
  }
  async function reference(ad) {
    setBusy(ad.creativeId);setError('');
    try {await apiRequest('trends/picks', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(ad)}, 180000);await loadPicks();await onVideosChanged?.();refreshStatus();}
    catch (failure) {setError(failure.message);} finally {setBusy('');}
  }
  async function attach(pick, videoId) {
    if (!videoId) return;setError('');
    try {await apiRequest(`trends/picks/${pick.id}`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({videoId})});await loadPicks();}
    catch (failure) {setError(failure.message);}
  }
  const picked = new Set(picks.map(pick => pick.id));
  return <div className="trends-page">
    <section className="panel trends-search"><div className="panel-title"><div><h2>Find long-running video ads</h2><p>Public ads from Google Ads Transparency Center (Philippines), via SerpApi. Ranked by “still running + running longest”: advertisers keep paying for ads that work.</p></div></div>
      <form className="trends-form" onSubmit={event => {event.preventDefault();search();}}>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Advertiser website, e.g. shopee.ph, jollibee.com.ph, nescafe.com" maxLength={80} disabled={busy === 'search'}/>
        <button className="primary" disabled={busy === 'search' || query.trim().length < 2 || !status?.configured}>{busy === 'search' ? <LoaderCircle size={14} className="spin"/> : <Search size={14}/>}{busy === 'search' ? 'Searching…' : 'Search'}</button>
      </form>
      <p className="report-caption trends-note">Search by an <b>advertiser’s website</b> (e.g. shopee.ph). Transparency Center does not search ad topics; pick successful brands in your niche. A new name uses <b>1 search</b>. Repeating a keyword is served from PULSE’s cache and is <b>free</b>, even after a restart.</p>
      {recent.length > 0 && <div className="trends-recent"><span>Recent (free):</span>{recent.map(item => <button key={item} className="theme" onClick={() => search(item)}>{item}</button>)}</div>}
      {status && !status.configured && <p className="notice error"><AlertCircle size={14}/>Add SERPAPI_API_KEY to server/.env and restart the backend.</p>}
      {error && <p className="notice error" role="alert"><AlertCircle size={14}/>{error}</p>}
    </section>

    <TrendPatterns picks={picks}/>
    {picks.length > 0 && <section className="panel trends-picks"><div className="panel-title"><div><h2>Your reference ads</h2><p>PULSE analyzes each video to show how it holds attention: hook, pacing, text, product and call to action.</p></div></div>
      <div className="pick-list">{picks.map(pick => {const video = pick.video;const analyzing = video && ['queued', 'processing'].includes(video.analysisStatus);
        return <article key={pick.id} className="pick-card">
          <div className="pick-head"><div><strong>{pick.advertiser}</strong><small>{pick.daysRunning ? `Ran ${pick.daysRunning} days · ` : ''}picked {day(pick.pickedAt)}</small></div><span className="pick-links"><a className="text-button" href={pick.transparencyUrl} target="_blank" rel="noreferrer">Source<ArrowUpRight size={12}/></a><button className="text-button" onClick={async () => {if (!window.confirm(`Remove ${pick.advertiser} from your references?`)) return;await apiRequest(`trends/picks/${pick.id}`, {method: 'DELETE'});loadPicks();}}>Remove</button></span></div>
          {video?.id && <button className="pick-video" onClick={() => {const full = videos.find(item => item.id === video.id);if (full) onOpen(full);}} aria-label={`Play ${pick.advertiser} reference ad`}>{video.analysisStatus === 'completed' && video.analysis?.frames?.length ? <img src={`/api/videos/${video.id}/frames/${video.analysis.frames[Math.min(1, video.analysis.frames.length - 1)].index}`} alt=""/> : <video src={`/api/videos/${video.id}/file#t=1`} preload="metadata" muted/>}<span className="video-card-play"><Play size={16}/></span>{Number.isFinite(video.analysis?.metadata?.duration) && <span className="video-card-duration">{Math.round(video.analysis.metadata.duration)}s</span>}</button>}
          {pick.status === 'downloading' && <p className="pick-status"><LoaderCircle size={13} className="spin"/>Downloading the ad video…</p>}
          {pick.status === 'failed' && <div className="pick-status failed"><p>{pick.error?.message}</p><label>Attach a screen recording from your library<select defaultValue="" onChange={event => attach(pick, event.target.value)}><option value="" disabled>Choose a video…</option>{libraryVideos.map(item => <option key={item.id} value={item.id}>{item.originalName}</option>)}</select></label></div>}
          {analyzing && <p className="pick-status"><LoaderCircle size={13} className="spin"/>Analyzing the ad’s style…</p>}
          {pick.style && <div className="pick-style"><span className={`badge pace-${pick.style.pace}`}>{pick.style.pace} pace</span><ul>{pick.style.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}
          <div className="pick-actions">{video?.analysisStatus === 'completed' && <button className="primary" onClick={() => setOpenPick(openPick === pick.id ? null : pick.id)}><Sparkles size={14}/>{openPick === pick.id ? 'Hide breakdown' : 'See why it works'}</button>}{video?.analysisStatus === 'completed' && <button className="text-button" onClick={() => onOpen(videos.find(item => item.id === video.id))}>Play & see analysis<ArrowUpRight size={12}/></button>}</div>
        </article>;})}</div>
      {(() => {const pick = picks.find(item => item.id === openPick);const full = pick?.video && videos.find(item => item.id === pick.video.id);return pick && full ? <TrendBreakdown pick={pick} video={full} onOpen={onOpen} onChanged={async () => {await onVideosChanged?.();await loadPicks();}}/> : null;})()}
    </section>}

    {result && <section className="panel trends-results"><div className="panel-title"><div><h2>“{result.query}” · {result.ads.length} video ads</h2><p>{result.cached ? `From cache · free · fetched ${day(result.fetchedAt)}` : 'New search · used 1 search'}</p></div></div>
      {!result.ads.length ? <p className="chart-empty">No video ads found for this advertiser in the Philippines{result.message ? ` (SerpApi: ${result.message})` : ''}. Try the advertiser’s website domain. Repeating this search is free.</p> :
      <div className="ad-grid">{result.ads.map((ad, index) => <article key={ad.creativeId} className="ad-card">
        <div className="ad-rank">#{index + 1}</div>
        {ad.image && <img src={ad.image} alt="" loading="lazy"/>}
        <strong>{ad.advertiser}</strong>
        <div className="post-badges">{ad.active && <span className="badge badge-analyzed">Still running</span>}{ad.daysRunning && <span className="badge badge-new">{ad.daysRunning} days</span>}</div>
        <small>{day(ad.firstShown)} → {day(ad.lastShown)}</small>
        <div className="ad-actions"><a className="text-button" href={ad.transparencyUrl} target="_blank" rel="noreferrer">View ad<ArrowUpRight size={12}/></a>
          <button className="secondary-button" disabled={picked.has(ad.creativeId) || Boolean(busy)} onClick={() => reference(ad)}>{busy === ad.creativeId ? 'Importing…' : picked.has(ad.creativeId) ? 'Added' : 'Use as reference'}</button></div>
        {!picked.has(ad.creativeId) && <small className="ad-cost">uses 1 search</small>}
      </article>)}</div>}
    </section>}
  </div>;
}
