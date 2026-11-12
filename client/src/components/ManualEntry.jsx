import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight} from 'lucide-react';
import {apiRequest,get} from '../api';

export const platformLabel={tiktok:'TikTok',instagram:'Instagram',facebook:'Facebook'};
const placeholders={tiktok:'https://www.tiktok.com/@account/video/7350…',instagram:'https://www.instagram.com/reel/C9abc…/',facebook:'https://www.facebook.com/reel/9695…/'};
const today=()=>new Date().toLocaleDateString('en-CA');
const json=(method,body)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const metricKeys=['views','likes','comments','shares','saves'];

export function NewAccountForm({onCreated}){
  const [platform,setPlatform]=useState('tiktok');const [account,setAccount]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function submit(event){event.preventDefault();setBusy(true);setError('');
    try{const data=await apiRequest('niche/manual',json('POST',{platform,account}));setAccount('');onCreated(data.report);}catch(failure){setError(failure.message);}finally{setBusy(false);}}
  return <form className="manual-form" onSubmit={submit}>
    <div className="manual-row">
      <label>Platform<select value={platform} onChange={event=>setPlatform(event.target.value)} disabled={busy}>{Object.entries(platformLabel).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label className="grow">Handle or profile link<input value={account} onChange={event=>{const value=event.target.value;setAccount(value);const host=/(tiktok|instagram|facebook)\.com/i.exec(value)?.[1]?.toLowerCase();if(host)setPlatform(host);}} placeholder="@yourbrand or profile link" required maxLength={300} disabled={busy} autoComplete="off"/></label>
      <button className="primary" disabled={busy||!account.trim()}>{busy?'Adding…':'Add account'}</button>
    </div>
    {error&&<p className="inline-error" role="alert">{error}</p>}
  </form>;
}

// Add (no `post`) or edit (with `post`) one manually entered post.
export function PostForm({report,post,onSaved,onCancel}){
  const editing=Boolean(post);
  const [values,setValues]=useState(()=>({postUrl:'',publishedAt:post?.publishedAt?.slice(0,10)||'',collectedAt:editing?today():today(),description:post?.description||'',...Object.fromEntries(metricKeys.map(key=>[key,post?.metrics[key]??'']))}));
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [fetching,setFetching]=useState(false);const [note,setNote]=useState('');const [approx,setApprox]=useState(()=>Object.fromEntries((post?.approximateMetrics||[]).map(key=>[key,String(post.metrics[key])])));
  // Reads the public post once and fills the form; nothing is saved until "Add post"/"Save metrics".
  async function fetchNumbers(){const link=editing?post.postUrl:values.postUrl;if(!link.trim())return setError('Paste the post link first.');setFetching(true);setError('');setNote('');
    try{const {preview}=await apiRequest(`niche/${report.id}/posts/preview`,json('POST',{postUrl:link}),45000);
      setValues(current=>({...current,...(editing?{}:{postUrl:preview.postUrl,publishedAt:preview.publishedAt||current.publishedAt,description:preview.description||current.description}),collectedAt:today(),...Object.fromEntries(metricKeys.map(key=>[key,preview.metrics[key]??'']))}));
      const missing=metricKeys.filter(key=>preview.metrics[key]===null);setApprox(Object.fromEntries((preview.approximate||[]).map(key=>[key,String(preview.metrics[key])])));
      setNote(`Filled from the public post${preview.approximate?.length?`; ${preview.approximate.join(', ')} ${preview.approximate.length===1?'is':'are'} rounded by the platform (≈), so replace with the exact number from your insights if you can`:''}${missing.length?`; ${missing.join(', ')} not public, so fill those in from your insights`:''}. Check the numbers, then ${editing?'save':'add the post'}.`);
    }catch(failure){setError(failure.message);}finally{setFetching(false);}}
  const set=key=>event=>setValues(current=>({...current,[key]:event.target.value}));
  async function submit(event){event.preventDefault();setBusy(true);setError('');
    const body={publishedAt:values.publishedAt,description:values.description,metrics:Object.fromEntries(metricKeys.map(key=>[key,String(values[key]).trim()])),approximate:Object.keys(approx).filter(key=>String(values[key]).trim()===approx[key])};
    // Leaving "measured on" as today lets the server record the exact current time.
    if(values.collectedAt&&values.collectedAt!==today())body.collectedAt=values.collectedAt;
    try{
      const data=editing?await apiRequest(`niche/${report.id}/posts/${encodeURIComponent(post.postId)}`,json('PATCH',body)):await apiRequest(`niche/${report.id}/posts`,json('POST',{...body,postUrl:values.postUrl}));
      if(!editing)setValues(current=>({...current,postUrl:'',publishedAt:'',description:'',...Object.fromEntries(metricKeys.map(key=>[key,'']))}));setNote('');setApprox({});
      onSaved(data.report);
    }catch(failure){setError(failure.message);}finally{setBusy(false);}
  }
  return <form className="manual-form" onSubmit={submit}>
    <div className="manual-row">{!editing&&<label className="grow">Post link<input type="url" value={values.postUrl} onChange={set('postUrl')} placeholder={placeholders[report.platform]} required maxLength={2000} disabled={busy||fetching}/></label>}<button type="button" className="secondary-button" onClick={fetchNumbers} disabled={busy||fetching||(!editing&&!values.postUrl.trim())}>{fetching?'Reading post…':editing?'Refresh numbers from post':'Fetch numbers'}</button></div>
    {note&&<p className="notice success" role="status">{note}</p>}
    <div className="manual-row">
      <label>Published on<input type="date" value={values.publishedAt} onChange={set('publishedAt')} max={today()} required disabled={busy}/></label>
      <label>Metrics read on<input type="date" value={values.collectedAt} onChange={set('collectedAt')} max={today()} min={values.publishedAt||undefined} disabled={busy}/></label>
    </div>
    <div className="manual-row metrics">{metricKeys.map(key=><label key={key}>{key}{approx[key]!==undefined&&String(values[key]).trim()===approx[key]?' ≈':''}<input inputMode="numeric" pattern="[0-9][0-9,]*" value={values[key]} onChange={set(key)} placeholder="unknown" disabled={busy} title="Exact whole number, e.g. 12,345. Leave blank if unknown."/></label>)}</div>
    <label>Caption <small>(optional)</small><textarea value={values.description} onChange={set('description')} maxLength={5000} rows={2} disabled={busy}/></label>
    <p className="report-caption">“Fetch numbers” reads the post’s public counts once, without logging in; if a platform blocks it, type them in. Use exact counts from the app’s insights/analytics, not rounded profile numbers like “1.2K”. Leave a metric blank if you can’t see it; blank stays unknown, never zero. Posts become comparable once they were at least 7 days old when you read the metrics.</p>
    <div className="manual-actions"><button className="primary" disabled={busy}>{busy?'Saving…':editing?'Save metrics':'Add post'}</button>{onCancel&&<button type="button" className="text-button" onClick={onCancel} disabled={busy}>Cancel</button>}</div>
    {error&&<p className="inline-error" role="alert">{error}</p>}
  </form>;
}

// Paste many links: each is read once (plain public request) and added. Stops at the first platform block.
export function BulkAdd({report,onSaved}){
  const [text,setText]=useState('');const [busy,setBusy]=useState(false);const [results,setResults]=useState([]);
  async function run(event){event.preventDefault();
    const links=[...new Set(text.split(/\s+/).map(item=>item.trim()).filter(Boolean))].slice(0,30);
    if(!links.length)return;setBusy(true);
    const rows=links.map(link=>({link,state:'waiting',message:'Waiting…'}));setResults([...rows]);
    const mark=(index,state,message)=>{rows[index]={...rows[index],state,message};setResults([...rows]);};
    let blocked=false;
    for(const [index,link] of links.entries()){
      if(blocked){mark(index,'skipped','Not tried: the platform blocked an earlier request. Add it manually or try later.');continue;}
      mark(index,'working','Reading public post…');
      try{
        const {preview}=await apiRequest(`niche/${report.id}/posts/preview`,json('POST',{postUrl:link}),45000);
        if(!preview.publishedAt){mark(index,'error','No publish date available. Add this one with the single-post form.');continue;}
        const data=await apiRequest(`niche/${report.id}/posts`,json('POST',{postUrl:preview.postUrl,publishedAt:preview.publishedAt,description:preview.description,approximate:preview.approximate||[],metrics:Object.fromEntries(metricKeys.map(key=>[key,preview.metrics[key]??'']))}));
        onSaved(data.report);
        const known=metricKeys.filter(key=>preview.metrics[key]!==null).map(key=>`${preview.approximate?.includes(key)?'≈':''}${Number(preview.metrics[key]).toLocaleString()} ${key}`);const missing=metricKeys.filter(key=>preview.metrics[key]===null);
        mark(index,'done',`Added · ${known.join(' · ')||'no public counts'}${missing.length?` · not public: ${missing.join(', ')} (use Update metrics)`:''}`);
      }catch(failure){
        if(failure.code==='FETCH_UNAVAILABLE'){blocked=true;mark(index,'error',failure.message);}
        else mark(index,failure.code==='DUPLICATE_POST'?'done':'error',failure.code==='DUPLICATE_POST'?'Already in this report.':failure.message);
      }
    }
    setBusy(false);if(!blocked)setText('');
  }
  return <form className="manual-form bulk-add" onSubmit={run}>
    <label>Post links <small>(one per line, up to 30)</small><textarea value={text} onChange={event=>setText(event.target.value)} rows={4} placeholder={`${placeholders[report.platform]}\n${placeholders[report.platform]}`} disabled={busy}/></label>
    <div className="manual-actions"><button className="primary" disabled={busy||!text.trim()}>{busy?'Adding posts…':'Fetch and add all'}</button></div>
    {results.length>0&&<ul className="bulk-results" aria-live="polite">{results.map(row=><li key={row.link} className={row.state}><span>{row.link}</span><small>{row.message}</small></li>)}</ul>}
  </form>;
}

// Facebook only: retrieve the public video through the existing link analyzer, then link it.
export function FacebookRetrieve({post,reportId,onChanged,onVideosChanged}){
  const [permitted,setPermitted]=useState(false);const [job,setJob]=useState(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const linked=useRef(false);
  const waiting=job&&!job.video&&job.status==='retrieving';
  useEffect(()=>{if(!waiting)return;const timer=setInterval(async()=>{try{setJob((await get(`video-links/${job.id}`)).job);}catch(failure){setError(failure.message);}},1500);return()=>clearInterval(timer);},[waiting,job?.id]);
  useEffect(()=>{
    if(job?.status==='failed'){setError(job.error?.message||'Retrieval failed.');return;}
    if(!job?.video||linked.current)return;linked.current=true;
    apiRequest(`niche/${reportId}/posts/${encodeURIComponent(post.postId)}/match`,json('PATCH',{videoId:job.video.id})).then(async data=>{await onVideosChanged?.();onChanged(data.report);}).catch(failure=>setError(failure.message));
  },[job]);
  async function start(){setBusy(true);setError('');linked.current=false;try{setJob((await apiRequest('video-links',json('POST',{url:post.postUrl,permitted}))).job);}catch(failure){setError(failure.message);}finally{setBusy(false);}}
  return <div className="facebook-retrieve">
    <label className="upload-confirmation"><input type="checkbox" checked={permitted} onChange={event=>setPermitted(event.target.checked)} disabled={busy||waiting}/>I have permission to retrieve and analyze this public video. Analysis starts automatically; OpenAI charges apply.</label>
    <button className="text-button" onClick={start} disabled={!permitted||busy||waiting}>{waiting?`${job.stage}${job.progress!=null?` · ${Number(job.progress).toFixed(0)}%`:''}`:busy?'Starting…':'Retrieve video from Facebook'}<ArrowUpRight size={12}/></button>
    {error&&<p className="inline-error" role="alert">{error}</p>}
  </div>;
}
