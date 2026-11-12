import {useState} from 'react';
import {ArrowUpRight} from 'lucide-react';
import {SentimentBar} from './CommentFeedback';

const platformName={tiktok:'TikTok',instagram:'Instagram',facebook:'Facebook'};
const full=value=>value===null||value===undefined?'—':new Intl.NumberFormat().format(value);
export const compact=value=>value===null||value===undefined?'—':new Intl.NumberFormat(undefined,{notation:'compact',maximumFractionDigits:1}).format(value);
const DAY=86400000;

// One row per published post, from Niche Intelligence posts and CSV-imported records.
export function performanceRows(reports,records,videos){
  const byId=new Map(videos.map(video=>[video.id,video]));
  const rows=[];
  for(const report of reports)for(const post of report.posts)rows.push({key:`n:${report.id}:${post.postId}`,source:'Niche Intelligence',platform:post.platform||report.platform,account:report.account,postId:post.postId,url:post.postUrl,caption:post.description||'',publishedAt:post.publishedAt,measuredAt:post.collectedAt,metrics:{saves:null,...post.metrics},approximate:post.approximateMetrics||[],video:byId.get(post.matchedVideoId)||null,comments:post.commentAnalysis||null});
  for(const record of records)rows.push({key:`c:${record.id}`,source:'CSV import',platform:record.platform,account:record.account,postId:record.videoId,url:null,caption:'',publishedAt:record.publishedAt,measuredAt:record.observedAt,metrics:{views:record.views,likes:record.likes,comments:record.comments,shares:record.shares,saves:record.saves},approximate:[],video:byId.get(record.matchedVideoId)||null,comments:null});
  return rows.map(row=>{
    const {views,likes,comments,shares}=row.metrics;
    const interactions=views>0&&[likes,comments,shares].every(value=>value!==null&&value!==undefined)?(likes+comments+shares)/views*100:null;
    const age=row.publishedAt&&row.measuredAt?(Date.parse(row.measuredAt)-Date.parse(row.publishedAt))/DAY:null;
    const score=row.video?.creativeStatus==='completed'?row.video.creative?.overall??null:null;
    return {...row,interactions,young:age!==null&&age<7,score,label:`${platformName[row.platform]||row.platform} · ${row.publishedAt?new Date(row.publishedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'}):'undated'}`};
  });
}
const median=values=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);const middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;};

export function Tooltip({row,x,y}){
  if(!row)return null;
  return <div className="chart-tooltip" style={{left:x,top:y}} role="status"><strong>{row.label}{row.account?` · @${row.account}`:''}</strong>{row.caption&&<span className="tip-caption">{row.caption.slice(0,90)}{row.caption.length>90?'…':''}</span>}
    <dl>{['views','likes','comments','shares','saves'].map(key=>row.metrics[key]!==null&&row.metrics[key]!==undefined&&<div key={key}><dt>{key}</dt><dd>{row.approximate.includes(key)?'≈':''}{full(row.metrics[key])}</dd></div>)}{row.interactions!==null&&<div><dt>interactions/view</dt><dd>{row.interactions.toFixed(1)}%</dd></div>}{row.score!==null&&<div><dt>creative score</dt><dd>{row.score}/100</dd></div>}{row.comments&&<div><dt>comment mood</dt><dd>{Math.round(row.comments.counts.positive/Math.max(1,row.comments.total)*100)}% positive</dd></div>}</dl></div>;
}

export function ViewsChart({rows,onOpen}){
  const [hover,setHover]=useState(null);
  const measured=rows.filter(row=>row.metrics.views!==null&&row.metrics.views!==undefined).sort((a,b)=>b.metrics.views-a.metrics.views).slice(0,12);
  if(!measured.length)return <p className="empty">No posts with view counts yet.</p>;
  const max=Math.max(...measured.map(row=>row.metrics.views))||1;
  // Tooltip sits just below the hovered row, aligned with the bars.
  const place=(event,row)=>{const box=event.currentTarget.getBoundingClientRect(),parent=event.currentTarget.parentElement.getBoundingClientRect();setHover({row,x:Math.min(150,box.width*.3),y:box.bottom-parent.top+4});};
  return <div className="bar-chart" onMouseLeave={()=>setHover(null)}>
    {measured.map(row=><button key={row.key} className="bar-row" onMouseEnter={event=>place(event,row)} onFocus={event=>place(event,row)} onBlur={()=>setHover(null)} onClick={()=>row.video?onOpen(row.video):row.url&&window.open(row.url,'_blank','noopener')} aria-label={`${row.label}: ${full(row.metrics.views)} views`}>
      <span className="bar-label">{row.label}{row.young&&<em title="Under 7 days old when measured; still growing">new</em>}</span>
      <span className="bar-track"><i style={{width:`${Math.max(1.5,row.metrics.views/max*100)}%`}}/></span>
      <span className="bar-value">{row.approximate.includes('views')?'≈':''}{compact(row.metrics.views)}</span>
    </button>)}
    <Tooltip row={hover?.row} x={hover?.x} y={hover?.y}/>
  </div>;
}

function ScoreScatter({rows,onOpen}){
  const [hover,setHover]=useState(null);
  const points=rows.filter(row=>row.score!==null&&row.metrics.views!==null&&row.metrics.views!==undefined);
  if(points.length<2)return <div className="chart-empty"><p>Needs at least two posts with a linked, reviewed video.</p><p className="report-caption">In Niche Intelligence, link each post's video, then generate its creative review. {points.length} of {rows.length} posts ready.</p></div>;
  const W=520,H=260,left=56,right=16,top=14,bottom=40;
  const maxViews=Math.max(...points.map(row=>row.metrics.views))*1.1||1;
  const x=score=>left+score/100*(W-left-right),y=views=>top+(1-views/maxViews)*(H-top-bottom);
  const ticks=[0,.25,.5,.75,1].map(step=>Math.round(maxViews*step));
  return <div className="scatter" onMouseLeave={()=>setHover(null)}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Creative score against views for ${points.length} posts`}>
      {ticks.map(value=><g key={value}><line x1={left} x2={W-right} y1={y(value)} y2={y(value)} className="grid"/><text x={left-8} y={y(value)+3} textAnchor="end" className="axis">{compact(value)}</text></g>)}
      {[0,25,50,75,100].map(value=><text key={value} x={x(value)} y={H-bottom+16} textAnchor="middle" className="axis">{value}</text>)}
      <text x={(left+W-right)/2} y={H-6} textAnchor="middle" className="axis-title">Creative rubric score</text>
      <text x={12} y={(top+H-bottom)/2} textAnchor="middle" className="axis-title" transform={`rotate(-90 12 ${(top+H-bottom)/2})`}>Views</text>
      {points.map(row=><g key={row.key} className="dot" tabIndex={0} role="button" aria-label={`${row.label}: score ${row.score}, ${full(row.metrics.views)} views`} onMouseEnter={()=>setHover(row)} onFocus={()=>setHover(row)} onBlur={()=>setHover(null)} onClick={()=>row.video&&onOpen(row.video)}>
        <circle cx={x(row.score)} cy={y(row.metrics.views)} r={14} className="hit"/><circle cx={x(row.score)} cy={y(row.metrics.views)} r={hover===row?7:5.5} className="mark"/></g>)}
    </svg>
    {hover&&<Tooltip row={hover} x={`${Math.min(60,x(hover.score)/W*100)}%`} y={`${y(hover.metrics.views)/H*100}%`}/>}
    <p className="report-caption">Each dot is a post with a linked, reviewed video. A pattern here is descriptive only: audience, timing and promotion also affect views.</p>
  </div>;
}


const quantile=(sorted,q)=>{const position=(sorted.length-1)*q,low=Math.floor(position),high=Math.ceil(position);return sorted[low]+(sorted[high]-sorted[low])*(position-low);};
export const BASELINE_MIN=5,MODEL_MIN=30;
// Level 1 forecast: the account's own typical range, from posts at least 7 days old when measured.
export function predictionStatus(rows){
  const mature=rows.filter(row=>!row.young&&row.publishedAt&&row.measuredAt&&row.metrics.views!==null&&row.metrics.views!==undefined);
  const sorted=mature.map(row=>row.metrics.views).sort((a,b)=>a-b);
  const baseline=sorted.length>=BASELINE_MIN?{low:Math.round(quantile(sorted,.25)),median:Math.round(quantile(sorted,.5)),high:Math.round(quantile(sorted,.75)),n:sorted.length}:null;
  const reviewed=mature.filter(row=>row.score!==null).length;
  const latest=[...rows].filter(row=>row.metrics.views!==null&&row.metrics.views!==undefined&&row.publishedAt).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt))[0]||null;
  const position=baseline&&latest?(latest.metrics.views>baseline.high?'above':latest.metrics.views<baseline.low?'below':'within'):null;
  return {mature:sorted.length,baseline,reviewed,latest,position};
}
function PredictionStatus({rows}){
  const status=predictionStatus(rows);
  const {baseline}=status;
  return <section className="panel prediction-card" aria-label="Prediction status">
    <div className="panel-title"><div><h2>Prediction status</h2><p>Forecasts unlock as your own history grows. Nothing is shown before it can be supported.</p></div><span className={`pill ${baseline?'pill-ready':''}`}>{baseline?'BASELINE READY':'COLLECTING DATA'}</span></div>
    <div className="prediction-body">
      <div className="prediction-level">
        <span className="eyebrow">LEVEL 1 · TYPICAL RANGE</span>
        {baseline?<><h3>Your posts typically reach <b>{compact(baseline.low)}–{compact(baseline.high)}</b> views</h3><p>The middle half of your {baseline.n} mature posts (7+ days old when measured). Median {compact(baseline.median)}. A new post landing in this range is normal for your account.</p>
          {status.latest&&<p className={`prediction-latest ${status.position}`}>Latest post ({status.latest.label}): <b>{full(status.latest.metrics.views)}</b> views, <b>{status.position}</b> your typical range{status.latest.young?'. Still under 7 days old, so it may keep growing':''}.</p>}</>
        :<><h3>{status.mature} of {BASELINE_MIN} mature posts collected</h3><p>Add posts that were at least 7 days old when their numbers were read. With {BASELINE_MIN} or more, PULSE shows the view range your posts usually reach.</p></>}
        <div className="prediction-progress" aria-hidden="true"><i style={{width:`${Math.min(100,status.mature/BASELINE_MIN*100)}%`}}/></div>
      </div>
      <div className="prediction-level locked">
        <span className="eyebrow">LEVEL 2 · CREATIVE-AWARE MODEL</span>
        <h3>{status.reviewed} of {MODEL_MIN} reviewed posts</h3>
        <p>Links creative ratings (hook, clarity, pacing…) to views. It is shown only if it beats the typical-range baseline on posts it has not seen.</p>
        <div className="prediction-progress" aria-hidden="true"><i style={{width:`${Math.min(100,status.reviewed/MODEL_MIN*100)}%`}}/></div>
      </div>
    </div>
  </section>;
}

// Totals sentiment across posts whose comments were analyzed and gathers next-video advice.
function AudienceFeedback({rows}){
  const analyzed=rows.filter(row=>row.comments);
  if(!analyzed.length)return <section className="panel audience-panel"><div className="panel-title"><div><h2>Audience feedback</h2><p>What viewers say in the comments: praise, criticism and bashing.</p></div></div><p className="chart-empty">No comments analyzed yet. In <strong>Niche Intelligence</strong>, open a post and paste its comments under <em>Comments</em>.</p></section>;
  const counts=['positive','neutral','negative','abusive','questions'].reduce((sum,key)=>({...sum,[key]:analyzed.reduce((total,row)=>total+row.comments.counts[key],0)}),{});
  const total=analyzed.reduce((sum,row)=>sum+row.comments.total,0);
  const recent=[...analyzed].sort((a,b)=>Date.parse(b.comments.analyzedAt)-Date.parse(a.comments.analyzedAt));
  const pick=key=>[...new Set(recent.flatMap(row=>row.comments[key]))].slice(0,5);
  const worst=[...analyzed].sort((a,b)=>(b.comments.counts.negative+b.comments.counts.abusive)/Math.max(1,b.comments.total)-(a.comments.counts.negative+a.comments.counts.abusive)/Math.max(1,a.comments.total))[0];
  return <section className="panel audience-panel"><div className="panel-title"><div><h2>Audience feedback</h2><p>{total} comments across {analyzed.length} {analyzed.length===1?'post':'posts'} · AI summary of pasted comments</p></div></div>
    <div className="audience-body">
      <SentimentBar counts={counts} total={total}/>
      <div className="comment-columns">
        <div><h5>Viewers liked</h5>{pick('praise').length?<ul>{pick('praise').map(item=><li key={item}>{item}</li>)}</ul>:<p className="report-caption">No praise noted yet.</p>}</div>
        <div><h5>Viewers criticized</h5>{pick('criticism').length?<ul>{pick('criticism').map(item=><li key={item}>{item}</li>)}</ul>:<p className="report-caption">No criticism noted yet.</p>}</div>
        <div className="comment-next"><h5>For your next video</h5><ol>{pick('nextVideo').map(item=><li key={item}>{item}</li>)}</ol></div>
      </div>
      {worst&&(worst.comments.counts.negative+worst.comments.counts.abusive)>0&&<p className="report-caption">Most criticized post: {worst.label} ({worst.comments.counts.negative} criticism, {worst.comments.counts.abusive} bashing of {worst.comments.total}). Bashing is counted separately from genuine criticism.</p>}
    </div>
  </section>;
}
export default function PerformanceOverview({rows,onOpen}){
  const [showTable,setShowTable]=useState(false);
  const views=rows.map(row=>row.metrics.views).filter(value=>value!==null&&value!==undefined);
  const rates=rows.map(row=>row.interactions).filter(value=>value!==null);
  const top=[...rows].filter(row=>row.metrics.views!==null&&row.metrics.views!==undefined).sort((a,b)=>b.metrics.views-a.metrics.views)[0];
  const linked=rows.filter(row=>row.video).length;
  return <section className="perf-overview">
    <div className="kpi-row">
      <div className="kpi"><span>Posts tracked</span><strong>{rows.length}</strong><small>{[...new Set(rows.map(row=>row.platform))].map(key=>platformName[key]||key).join(' · ')}</small></div>
      <div className="kpi"><span>Total views</span><strong>{compact(views.reduce((sum,value)=>sum+value,0))}</strong><small>{views.length} posts with views</small></div>
      <div className="kpi"><span>Median views</span><strong>{compact(median(views))}</strong><small>per post</small></div>
      <div className="kpi"><span>Avg interactions / view</span><strong>{rates.length?`${(rates.reduce((sum,value)=>sum+value,0)/rates.length).toFixed(1)}%`:'—'}</strong><small>{rates.length?`${rates.length} posts with likes, comments & shares`:'Needs likes, comments & shares'}</small></div>
      <div className="kpi"><span>Top post</span><strong>{top?compact(top.metrics.views):'—'}</strong><small>{top?top.label:'No views yet'}</small></div>
      <div className="kpi"><span>Videos linked</span><strong>{linked}<em>/{rows.length}</em></strong><small>for creative analysis</small></div>
    </div>
    <div className="chart-grid">
      <section className="panel chart-panel"><div className="panel-title"><div><h2>Views by post</h2><p>Lifetime views when last read · top {Math.min(12,views.length)} · select a post to open it</p></div></div><ViewsChart rows={rows} onOpen={onOpen}/></section>
      <section className="panel chart-panel"><div className="panel-title"><div><h2>Creative score vs. views</h2><p>Do better-rated edits get more views in your posts?</p></div></div><ScoreScatter rows={rows} onOpen={onOpen}/></section>
    </div>
    <AudienceFeedback rows={rows}/>
    <PredictionStatus rows={rows}/>
    <button className="text-button" onClick={()=>setShowTable(value=>!value)} aria-expanded={showTable}>{showTable?'Hide':'Show'} all posts as a table</button>
    {showTable&&<div className="panel performance-scroll"><table className="performance-table overview-table"><caption>All tracked posts · ≈ marks counts the platform shows rounded</caption><thead><tr><th>Post</th><th>Source</th><th>Views</th><th>Likes</th><th>Comments</th><th>Shares</th><th>Saves</th><th>Interactions / view</th><th>Creative score</th></tr></thead><tbody>{[...rows].sort((a,b)=>(b.metrics.views??-1)-(a.metrics.views??-1)).map(row=><tr key={row.key}><td><strong>{row.label}</strong><small>{row.account?`@${row.account} · `:''}{row.url?<a href={row.url} target="_blank" rel="noreferrer">post <ArrowUpRight size={10}/></a>:row.postId}</small></td><td>{row.source}</td>{['views','likes','comments','shares','saves'].map(key=><td key={key}>{row.approximate.includes(key)?'≈':''}{full(row.metrics[key])}</td>)}<td>{row.interactions===null?'—':`${row.interactions.toFixed(1)}%`}</td><td>{row.score??'—'}</td></tr>)}</tbody></table></div>}
  </section>;
}
