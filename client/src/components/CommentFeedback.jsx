import {useState} from 'react';
import {MessageSquareText} from 'lucide-react';
import {apiRequest} from '../api';

export const sentimentParts=[['positive','Positive'],['neutral','Neutral'],['negative','Criticism'],['abusive','Bashing']];

// Labelled segments (counts always printed), so sentiment never relies on color alone.
export function SentimentBar({counts,total}){
  if(!total)return <p className="report-caption">No comments found in the pasted text.</p>;
  return <div className="sentiment">
    <div className="sentiment-bar" role="img" aria-label={sentimentParts.map(([key,label])=>`${label} ${counts[key]}`).join(', ')}>{sentimentParts.filter(([key])=>counts[key]>0).map(([key])=><i key={key} className={`s-${key}`} style={{flexGrow:counts[key]}}/>)}</div>
    <ul className="sentiment-legend">{sentimentParts.map(([key,label])=><li key={key}><i className={`s-${key}`}/>{label} <b>{counts[key]}</b><span>{Math.round(counts[key]/total*100)}%</span></li>)}{counts.questions>0&&<li className="questions">Questions <b>{counts.questions}</b></li>}</ul>
  </div>;
}

export default function CommentFeedback({post,reportId,onChanged}){
  const analysis=post.commentAnalysis;
  const [open,setOpen]=useState(!analysis);const [text,setText]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [fetching,setFetching]=useState(false);const [notice,setNotice]=useState('');
  async function analyze(event){event.preventDefault();setBusy(true);setError('');
    try{const data=await apiRequest(`niche/${reportId}/posts/${encodeURIComponent(post.postId)}/comments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})},90000);setText('');setOpen(false);onChanged(data.report);}
    catch(failure){setError(failure.message);}finally{setBusy(false);}}
  // Reads the comments from the user's own post in a visible, signed-in Chrome window, then analyzes them.
  async function fetchAutomatically(){setFetching(true);setError('');setNotice('Opening the post in Chrome…');
    try{const data=await apiRequest(`niche/${reportId}/posts/${encodeURIComponent(post.postId)}/comments/fetch`,{method:'POST'},150000);
      if(data.status==='ok'){setNotice('');setOpen(false);onChanged(data.report);}else setNotice(data.message);}
    catch(failure){setNotice('');setError(failure.message);}finally{setFetching(false);}}
  return <section className="comment-feedback">
    <div className="comment-head"><h4><MessageSquareText size={14}/>Comments</h4>{analysis&&<button className="text-button" onClick={()=>setOpen(value=>!value)}>{open?'Cancel':'Analyze new comments'}</button>}</div>
    {analysis&&<div className="comment-result">
      <SentimentBar counts={analysis.counts} total={analysis.total}/>
      <p className="comment-summary">{analysis.summary}</p>
      {analysis.themes.length>0&&<div className="comment-themes">{analysis.themes.map(theme=><span key={theme.label} className={`theme theme-${theme.sentiment}`} title={theme.paraphrase}>{theme.label}<b>{theme.mentions}</b></span>)}</div>}
      <div className="comment-columns">
        {analysis.praise.length>0&&<div><h5>Viewers liked</h5><ul>{analysis.praise.map(item=><li key={item}>{item}</li>)}</ul></div>}
        {analysis.criticism.length>0&&<div><h5>Viewers criticized</h5><ul>{analysis.criticism.map(item=><li key={item}>{item}</li>)}</ul></div>}
        {analysis.questions.length>0&&<div><h5>Viewers asked</h5><ul>{analysis.questions.map(item=><li key={item}>{item}</li>)}</ul></div>}
      </div>
      <div className="comment-next"><h5>For your next video</h5><ol>{analysis.nextVideo.map(item=><li key={item}>{item}</li>)}</ol></div>
      <p className="report-caption">{analysis.total} comments analyzed {new Date(analysis.analyzedAt).toLocaleString()}{post.metrics.comments!==null&&post.metrics.comments>analysis.total?` · the post has ${post.metrics.comments}; paste more for a fuller picture`:''}. AI summary; pasted text and names are not stored.</p>
    </div>}
    {open&&<div className="comment-auto"><button type="button" className="secondary-button" disabled={fetching||busy} onClick={fetchAutomatically}>{fetching?'Reading comments…':'Fetch comments automatically'}</button><small className="report-caption">Opens your post in Chrome. Sign in there yourself the first time; PULSE never sees your password.</small>{notice&&<p className="comment-notice" role="status">{notice}</p>}</div>}
    {open&&<form className="manual-form" onSubmit={analyze}>
      <label>Or paste comments<textarea value={text} onChange={event=>setText(event.target.value)} rows={5} placeholder={'Open the post, expand all comments, select them and copy.\nNames, “Reply” and “Like” text are fine. PULSE ignores them and doesn’t keep them.'} disabled={busy}/></label>
      <div className="manual-actions"><button className="primary" disabled={busy||text.trim().length<10}>{busy?'Analyzing comments…':'Analyze comments'}</button><small className="report-caption">{text.length?`${text.length.toLocaleString()} characters`:''}</small></div>
      {error&&<p className="inline-error" role="alert">{error}</p>}
    </form>}
  </section>;
}
