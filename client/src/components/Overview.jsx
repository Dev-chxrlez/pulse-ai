import {useEffect, useState} from 'react';
import {ArrowRight, BarChart3, Clapperboard, Play, ScanLine, Sparkles, Target, TrendingUp} from 'lucide-react';
import {get} from '../api';
import {AgentSpot} from './Agent';
import {compact} from './PerformanceOverview';
import {timeLabel} from './AnalysisReport';

const median = values => {const sorted = [...values].sort((a, b) => a - b);const middle = Math.floor(sorted.length / 2);return sorted.length ? (sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2) : null;};


export default function Overview({videos, loading, onNavigate, onOpen}) {
  const [trends, setTrends] = useState([]);const [creations, setCreations] = useState([]);const [niche, setNiche] = useState([]);
  useEffect(() => {
    get('trends/picks').then(data => setTrends(data.picks)).catch(() => {});
    get('create/videos').then(data => setCreations(data.videos)).catch(() => {});
    get('niche').then(data => setNiche(data.reports)).catch(() => {});
  }, []);
  const analyzed = videos.filter(video => video.analysisStatus === 'completed');
  const scores = videos.map(video => video.creativeStatus === 'completed' ? video.creative?.overall : null).filter(Number.isFinite);
  const references = trends.filter(pick => pick.style);
  const cutMedian = median(references.map(pick => pick.style.cutInterval).filter(Number.isFinite));
  const posts = niche.flatMap(report => report.posts);
  const views = posts.reduce((sum, post) => sum + (post.metrics.views || 0), 0);
  const commented = posts.filter(post => post.commentAnalysis);
  const positive = commented.reduce((sum, post) => sum + post.commentAnalysis.counts.positive, 0), comments = commented.reduce((sum, post) => sum + post.commentAnalysis.total, 0);
  const done = creations.filter(job => job.status === 'completed');
  // "Fix first": top priority from the most recent creative review, otherwise the latest supported suggestion.
  const latest = [...analyzed].sort((a, b) => Date.parse(b.analysis.completedAt) - Date.parse(a.analysis.completedAt))[0];
  const fix = latest && (latest.creative?.priorities?.[0] ? {title: latest.creative.priorities[0].title, text: latest.creative.priorities[0].action} : (() => {const finding = latest.analysis.report.findings.find(item => item.certainty !== 'uncertain' && item.suggestion);return finding ? {title: finding.title, text: finding.suggestion} : null;})());
  const team = [
    {role: 'Market researcher', page: 'Trending Ads', icon: TrendingUp, value: references.length, unit: references.length === 1 ? 'trending ad studied' : 'trending ads studied', detail: references.length >= 2 && cutMedian ? `Winning ads cut every ~${cutMedian.toFixed(1)}s` : 'Find ads that keep running in your niche', action: 'See what works'},
    {role: 'Creative director', page: 'Video Analysis', icon: ScanLine, value: analyzed.length, unit: analyzed.length === 1 ? 'video reviewed' : 'videos reviewed', detail: scores.length ? `Average creative score ${Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)}/100` : 'Hook, pacing, text and CTA, with proof', action: 'Review a video'},
    {role: 'Video editor', page: 'Create', icon: Clapperboard, value: done.length, unit: done.length === 1 ? 'ad created' : 'ads created', detail: 'Business name + description → motion ad with voiceover', action: 'Create an ad'},
    {role: 'Social analyst', page: 'Performance', icon: BarChart3, value: posts.length, unit: posts.length === 1 ? 'post tracked' : 'posts tracked', detail: comments ? `${compact(views)} views · ${Math.round(positive / comments * 100)}% positive comments` : posts.length ? `${compact(views)} total views` : 'Real views, engagement and comment mood', action: 'See results'},
  ];
  return <div className="overview">
    <section className="overview-hero">
      <div><AgentSpot size="large"/><span className="eyebrow">YOUR AI MARKETING TEAM</span><h2>Everything a marketing team does, for a business that can’t hire one.</h2><p>Learn what works, make the ad, and measure the results, all in one place.</p></div>
      <div className="hero-actions">
        <button className="primary" onClick={() => onNavigate('Create')}><Sparkles size={16}/>Create an ad</button>
        <button className="secondary-button" onClick={() => onNavigate('Video Analysis')}><ScanLine size={15}/>Analyze a video</button>
        <button className="secondary-button" onClick={() => onNavigate('Trending Ads')}><TrendingUp size={15}/>Find trending ads</button>
      </div>
      <ol className="hero-loop" aria-label="How PULSE works"><li><b>Learn</b> what works</li><li><b>Make</b> the ad</li><li><b>Measure</b> results</li><li><b>Improve</b> the next one</li></ol>
    </section>

    <div className="team-grid">{team.map(({role, page, icon: Icon, value, unit, detail, action}) => <button key={role} className="team-card" onClick={() => onNavigate(page)}>
      <span className="team-icon"><Icon size={20}/></span>
      <span className="eyebrow">{role}</span>
      <strong>{loading ? '—' : value}<small>{unit}</small></strong>
      <span className="team-detail">{detail}</span>
      <span className="team-action">{action}<ArrowRight size={14}/></span>
    </button>)}</div>

    <div className="overview-grid">
      <section className="panel fix-first-panel"><div className="panel-title"><div><h2><Target size={16}/> Fix first</h2><p>{latest ? `From your latest review: ${latest.originalName}` : 'Your top improvement appears here after a video review'}</p></div></div>
        {fix ? <div className="fix-body"><h3>{fix.title}</h3><p>{fix.text}</p><button className="text-button" onClick={() => onOpen(latest)}>Open the full review<ArrowRight size={13}/></button></div>
          : <div className="fix-body"><p>Upload a video or paste a Facebook link in Video Analysis. PULSE reviews the hook, pacing, captions and call to action, then tells you the one thing to fix first.</p><button className="text-button" onClick={() => onNavigate('Video Analysis')}>Analyze a video<ArrowRight size={13}/></button></div>}
      </section>
      <section className="panel recent-panel"><div className="panel-title"><div><h2>Recent videos</h2><p>{videos.length} in your library</p></div><button className="text-button" onClick={() => onNavigate('History')}>All videos<ArrowRight size={13}/></button></div>
        {!videos.length ? <p className="empty">No videos yet. Upload one in Video Analysis.</p> :
        <div className="recent-grid">{videos.slice(0, 4).map(video => {const frame = video.analysisStatus === 'completed' ? video.analysis?.frames?.[Math.min(1, (video.analysis.frames.length || 1) - 1)] : null;const score = video.creativeStatus === 'completed' ? video.creative?.overall : null;const duration = video.metadata?.duration ?? video.analysis?.metadata?.duration;
          return <button key={video.id} className="recent-card" onClick={() => onOpen(video)}><span className="video-card-thumb">{frame ? <img src={`/api/videos/${video.id}/frames/${frame.index}`} alt=""/> : <video src={`${video.fileUrl}#t=0.1`} preload="metadata" muted/>}<span className="video-card-play"><Play size={14}/></span>{Number.isFinite(duration) && <span className="video-card-duration">{timeLabel(duration).replace(/\.\d$/, '')}</span>}{Number.isFinite(score) && <span className="video-card-score">{score}</span>}</span><strong>{video.originalName}</strong></button>;})}</div>}
      </section>
    </div>
  </div>;
}
