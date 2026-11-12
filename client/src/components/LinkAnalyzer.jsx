import {useEffect,useRef,useState} from 'react';
import {apiRequest,get} from '../api';
const steps=[['Check link',/checking/i],['Read details',/metadata/i],['Download',/download/i],['Validate',/validat/i],['Analyze',/analy|waiting|frames|transcrib|review|reading video|scene/i]];
function LinkSteps({job}){
  const failed=['failed','analysis_failed'].includes(job.status);
  const current=job.status==='completed'?steps.length:job.video?4:Math.max(0,steps.findIndex(([,pattern])=>pattern.test(job.stage||'')));
  return <div className="link-steps" role="status" aria-live="polite">
    <ol>{steps.map(([label],index)=><li key={label} className={index<current?'done':index===current?(failed?'failed':'current'):''}><span>{index<current?'✓':index+1}</span>{label}</li>)}</ol>
    <p>{job.status==='completed'?'Done. The report opens automatically.':job.stage}{job.progress!==null&&job.status==='retrieving'?` · ${Number(job.progress).toFixed(0)}%`:''}</p>
  </div>;
}
export default function LinkAnalyzer({setup,onCompleted}){
  const [url,setUrl]=useState(''),[permitted,setPermitted]=useState(false),[job,setJob]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const opened=useRef(null);
  const active=job&&['retrieving','analyzing','saved'].includes(job.status);
  async function refresh(){try{const result=await get(`video-links/${job.id}`);setJob(result.job);setError('');}catch(failure){setError(failure.message);}}
  useEffect(()=>{if(!active)return;const timer=setInterval(refresh,1500);return()=>clearInterval(timer);},[active,job?.id]);
  useEffect(()=>{if(job?.status==='completed'&&job.video&&opened.current!==job.id){opened.current=job.id;onCompleted(job.video);}},[job]);
  async function submit(event){event.preventDefault();setBusy(true);setError('');try{const result=await apiRequest('video-links',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,permitted})});setJob(result.job);}catch(failure){setError(failure.message);}finally{setBusy(false);}}
  return <section className="panel upload-panel link-panel"><div className="panel-title"><div><h2>Analyze from a link</h2><p>Paste one public Facebook video or Reel.</p></div><span className="file-spec">02 / LINK</span></div>
    <form onSubmit={submit}><label htmlFor="facebook-link">Facebook video link</label><input className="link-input" id="facebook-link" type="url" required maxLength={2000} value={url} disabled={busy||active} onChange={event=>{setUrl(event.target.value);setPermitted(false);}} placeholder="https://www.facebook.com/reel/…"/>
      <label className="upload-confirmation"><input type="checkbox" checked={permitted} disabled={busy||active} onChange={event=>setPermitted(event.target.checked)}/>I have permission to retrieve and analyze this public video.</label>
      <p className="report-caption">No Facebook sign-in or browser cookies are used. Successful retrieval sends sampled frames and audio for AI analysis. Limits: 100 MiB and {setup?.maxDuration||180} seconds.</p>
      <button className="primary" disabled={!setup?.available||!permitted||busy||active}>{busy?'Starting…':active?'Processing…':'Retrieve and analyze'}</button>
    </form>
    {job&&<LinkSteps job={job}/>}
    {(error||job?.error)&&<p className="notice error" role="alert">{error||job.error.message}</p>}
    {error&&active&&<button className="text-button" onClick={refresh}>Check progress again</button>}
    {job?.video&&['completed','analysis_failed'].includes(job.status)&&<button className="text-button" onClick={()=>onCompleted(job.video)}>Open saved video & report</button>}
  </section>;
}
