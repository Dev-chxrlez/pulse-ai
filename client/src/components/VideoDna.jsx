import {useCallback,useEffect,useState} from 'react';
import {get} from '../api';
import CreativeDna from './CreativeDna';

// Read-only on mount/poll. The existing CreativeDna button owns explicit POSTs.
export default function VideoDna({video,onSeek}) {
  const [data,setData]=useState(null);
  const [error,setError]=useState('');
  const load=useCallback(async()=>{
    try {const result=await get(`intelligence/videos/${video.id}`);setData(result);setError('');}
    catch(failure){setError(failure.message);}
  },[video.id]);
  useEffect(()=>{load();},[load,video.analysis?.completedAt]);
  return <section aria-label="Video Creative DNA">
    {!data&&!error&&<p role="status">Loading saved Creative DNA…</p>}
    {error&&<div className="notice error" role="alert"><p>{error}</p><button className="text-button" onClick={load}>Reload Creative DNA</button></div>}
    {data&&<><CreativeDna video={video} record={data.record} available={data.available&&data.ready&&!error} onChanged={load} onOpen={(_video,time)=>onSeek(time)}/>
      {!data.available&&<p className="report-caption">Configure the backend AI API key to generate DNA. Saved results remain available.</p>}
      <p className="report-caption">Creative DNA works from this saved analysis without a social import. Editing Blueprint currently requires an imported niche report; target-video guidance is available only within that report.</p>
    </>}
  </section>;
}
