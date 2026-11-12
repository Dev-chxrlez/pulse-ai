import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowUpRight, Download, FileSpreadsheet, RefreshCw, Upload } from 'lucide-react';
import { get, previewPerformance, commitPerformance, matchPerformance } from '../api';
import PerformanceOverview, { performanceRows } from './PerformanceOverview';

const number = value => value === null ? '—' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
function MatchControl({ record, videos, onSaved, onOpen }) {
  const [chosen, setChosen] = useState(record.matchedVideoId || '');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const suggestions = record.filename ? videos.filter(video=>video.originalName.toLowerCase()===record.filename.toLowerCase()) : [];
  async function save() {
    setBusy(true);setError('');
    try { onSaved(await matchPerformance(record.id,chosen || null)); }
    catch(failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <div className="match-control"><label><span className="sr-only">Uploaded video for {record.videoId} on {record.platform}</span><select value={chosen} onChange={event=>setChosen(event.target.value)} disabled={busy}><option value="">Not matched</option>{videos.map(video=><option key={video.id} value={video.id}>{video.originalName}</option>)}</select></label>{chosen!==(record.matchedVideoId||'')&&<button className="text-button" disabled={busy} onClick={save}>{busy?'Saving…':'Save match'}</button>}{record.matchedVideo&&<button className="text-button" onClick={()=>onOpen(videos.find(video=>video.id===record.matchedVideo.id))}>Open video<ArrowUpRight size={11}/></button>}{!record.matchedVideoId&&suggestions.length>0&&<small>Filename suggestion: {suggestions.map(video=>video.originalName).join(', ')}. Select and save to confirm.</small>}{error&&<p className="inline-error" role="alert">{error}</p>}</div>;
}
export default function Performance({videos,onOpen}) {
  const [data,setData] = useState(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [preview,setPreview] = useState(null);
  const [filename,setFilename] = useState('');
  const [previewVisible,setPreviewVisible] = useState(100);
  const [invalidOnly,setInvalidOnly] = useState(false);
  const [message,setMessage] = useState('');
  const [platform,setPlatform] = useState('all');
  const [unmatched,setUnmatched] = useState(false);
  const [visible,setVisible] = useState(25);
  const input=useRef();
  const [niche,setNiche] = useState([]);
  async function load(){setLoading(true);setError('');try{const [performance,nicheData]=await Promise.all([get('performance'),get('niche').catch(()=>({reports:[]}))]);setData(performance);setNiche(nicheData.reports||[]);}catch{setError('Could not load historical data. Check the server and retry.');}finally{setLoading(false);}}
  useEffect(()=>{load();},[]);
  async function choose(file) {
    if(!file)return;
    setError('');setMessage('');setPreview(null);setFilename(file.name);setPreviewVisible(100);setInvalidOnly(false);
    if(!file.name.toLowerCase().endsWith('.csv'))return setError('Choose a .csv file.');
    if(file.size>1024*1024)return setError('CSV files must be 1 MiB or smaller.');
    setBusy(true);
    try { setPreview(await previewPerformance(file)); }
    catch(failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function commit(){setBusy(true);setError('');try{const result=await commitPerformance(preview.id);setMessage(`Imported ${result.imported} records. Skipped ${result.skippedInvalid} invalid rows and ${result.skippedDuplicates} duplicates.`);setPreview(null);await load();}catch(failure){setError(failure.message);}finally{setBusy(false);}}
  const previewRows=(preview?.rows||[]).filter(row=>!invalidOnly||row.errors.length>0);
  const summary=data?.summary;
  const filtered=(data?.records || []).filter(record=>(platform==='all'||record.platform===platform)&&(!unmatched||!record.matchedVideoId));
  const groups=(summary?.durationGroups || []).filter(group=>platform==='all'||group.platform===platform);
  const rows=data?performanceRows(niche,data.records,videos):[];
  return <div className="performance-page">
    {loading?<p className="empty" role="status">Loading results…</p>:rows.length?<PerformanceOverview rows={rows} onOpen={onOpen}/>:<section className="panel empty perf-empty"><FileSpreadsheet size={30}/><h3>No results yet.</h3><p>Add your posts in <strong>Niche Intelligence</strong> (paste links and PULSE reads the numbers), or import a CSV below. They all appear here.</p></section>}
    <details className="perf-csv" open={Boolean(preview)||Boolean(data?.records.length)}><summary>Import from a CSV <span>{data?.records.length?`${data.records.length} imported records`:'for platform exports or spreadsheets'}</span></summary>
    <section className="panel performance-import"><div className="panel-title"><div><h2>Bring your actual results</h2><p>Import a CSV, review the rows, then connect the original videos.</p></div><FileSpreadsheet size={20}/></div><div className="performance-import-body"><div><p>Required: <code>video_id, platform, published_at, views</code></p><p>Optional: likes, comments, shares, saves, observed_at, account, pulse_video_id, filename.</p><p className="report-caption">UTF-8, comma separated · 1 MiB · 2,000 rows per import. Missing metrics stay unknown. Use YYYY-MM-DD dates and whole-number counts without commas.</p></div><div className="import-actions"><input className="sr-only" ref={input} aria-label="Choose historical performance CSV" type="file" accept=".csv,text/csv" disabled={busy} onChange={event=>{choose(event.target.files[0]);event.target.value='';}}/><button className="primary" disabled={busy} onClick={()=>input.current.click()}><Upload size={15}/>{busy?'Working…':'Choose CSV'}</button><a className="text-button" href="/api/performance/template"><Download size={14}/>Blank CSV template</a></div></div></section>
    {error&&<p className="notice error" role="alert"><AlertCircle size={16}/>{error}</p>}{message&&<p className="notice success" role="status">{message}</p>}
    {preview&&<section className="panel csv-preview"><div className="panel-title"><div><h2>Review import</h2><p>{filename} · Nothing saved yet</p></div><button className="text-button" disabled={busy} onClick={()=>setPreview(null)}>Discard preview</button></div><div className="preview-summary"><span>{preview.valid} ready</span><span>{preview.invalid} invalid</span><span>{preview.duplicates} duplicates</span></div>{preview.ignoredColumns.length>0&&<p className="import-warning">Ignored columns: {preview.ignoredColumns.join(', ')}</p>}<div className="preview-filters"><label><input type="checkbox" checked={invalidOnly} onChange={event=>{setInvalidOnly(event.target.checked);setPreviewVisible(100);}}/>Invalid rows only</label><span>{previewRows.length} rows</span></div><div className="performance-scroll"><table className="performance-table preview-table"><caption>CSV preview; line numbers refer to the ending line of each record</caption><thead><tr><th>Line</th><th>Video / platform</th><th>Views</th><th>Video match</th><th>Validation</th></tr></thead><tbody>{previewRows.slice(0,previewVisible).map(row=><tr key={row.line}><td>{row.line}</td><td>{row.record?.videoId||'Invalid row'}<small>{row.record?.platform} {row.record?.account}</small></td><td>{row.record?number(row.record.views):'—'}</td><td>{row.match?.name||'Not matched'}{row.suggestions.length>0&&<small>{row.suggestions.length} filename suggestion(s)</small>}</td><td><span className={row.errors.length?'validation-error':row.duplicate?'validation-warning':'validation-ready'}>{row.errors.length?'Invalid':row.duplicate?'Duplicate · skipped':'Ready'}</span>{row.errors.map(text=><small className="inline-error" key={text}>{text}</small>)}{row.warnings.map(text=><small key={text}>{text}</small>)}</td></tr>)}</tbody></table></div>{!previewRows.length&&<p className="import-warning">No invalid rows.</p>}{previewRows.length>previewVisible&&<div className="preview-more"><button className="text-button" onClick={()=>setPreviewVisible(value=>value+100)}>Show 100 more rows</button><span>Showing {previewVisible} of {previewRows.length}. All rows were validated.</span></div>}<div className="import-confirm"><p>Import only valid, non-duplicate rows. Duplicates never overwrite saved metrics. Explicit PULSE IDs shown above are linked on import; filename suggestions need confirmation afterward.</p><button className="primary" disabled={busy||!preview.valid} onClick={commit}>{busy?'Importing…':`Import ${preview.valid} valid rows`}</button></div></section>}
    </details>
    {data?.records.length>0&&<div className="performance-section-heading"><h2>CSV records</h2><button className="text-button" disabled={loading} onClick={load}><RefreshCw size={14}/>Refresh</button></div>}
    {!loading&&data&&<>
      {data.records.length>0&&<div className="workspace-summary performance-summary"><div><strong>{summary.records}</strong><span>records</span></div><div><strong>{summary.matched}</strong><span>matched</span></div><div><strong>{summary.analyzed}</strong><span>analyzed matches</span></div><div><strong>{summary.missingMeasurementDates}</strong><span>without measurement date</span></div></div>}
      {!data.records.length?null:<>
        <div className="performance-filters"><label>Platform<select value={platform} onChange={event=>{setPlatform(event.target.value);setVisible(25);}}><option value="all">All platforms</option>{summary.platforms.map(item=><option key={item.platform} value={item.platform}>{item.platform}</option>)}</select></label><label className="unmatched-filter"><input type="checkbox" checked={unmatched} onChange={event=>{setUnmatched(event.target.checked);setVisible(25);}}/>Unmatched only</label><span>{filtered.length} records</span></div>
        <div className="panel performance-scroll"><table className="performance-table"><caption>Imported metrics are user-supplied historical observations, not predictions</caption><thead><tr><th>Video / platform</th><th>Published / measured</th><th>Views</th><th>Likes</th><th>Comments</th><th>Shares</th><th>Saves</th><th>Interactions / view</th><th>Uploaded video</th><th>Source</th></tr></thead><tbody>{filtered.slice(0,visible).map(record=><tr key={record.id}><td><strong>{record.videoId}</strong><small>{record.platform}{record.account?` / ${record.account}`:''}</small></td><td>{record.publishedAt}<small>{record.observedAt||'Measurement date unknown'}</small></td><td>{number(record.views)}</td><td>{number(record.likes)}</td><td>{number(record.comments)}</td><td>{number(record.shares)}</td><td>{number(record.saves)}</td><td>{record.interactionsPerView===null?'—':`${number(record.interactionsPerView)}%`}</td><td><MatchControl key={`${record.id}-${record.matchedVideoId}`} record={record} videos={videos} onSaved={setData} onOpen={onOpen}/></td><td>{record.sourceFilename}<small>Line {record.sourceLine} · {new Date(record.importedAt).toLocaleString()}</small></td></tr>)}</tbody></table>{!filtered.length&&<p className="empty">No records match these filters.</p>}</div>{filtered.length>visible&&<button className="text-button show-more" onClick={()=>setVisible(value=>value+25)}>Show 25 more</button>}
        <p className="report-caption">Interactions per view = (likes + comments + shares) ÷ views × 100. Only shown when all three metrics are known and views exceed zero. It is not a unique-viewer engagement rate; repeated interactions may exceed 100%.</p>
        <section className="panel exploratory"><div className="panel-title"><div><h2>Duration & historical views</h2><p>Descriptive groups from matched, analyzed videos. Grouped by platform and account.</p></div><span className="pill">EXPLORATORY</span></div>{!groups.length?<p className="empty">Match imported records to analyzed videos to explore duration groups.</p>:<div className="performance-scroll"><table className="performance-table duration-table"><thead><tr><th>Platform / account</th><th>Duration</th><th>Records</th><th>Distinct videos</th><th>Median views</th></tr></thead><tbody>{groups.map(group=><tr key={`${group.platform}-${group.account}-${group.bucket}`}><td>{group.platform}<small>{group.account||'Account unspecified'}</small></td><td>{group.bucket}</td><td>{group.count}</td><td>{group.uniqueVideos}</td><td>{group.medianViews===null?'Need 3 distinct matched videos':number(group.medianViews)}</td></tr>)}</tbody></table></div>}<p className="exploratory-caveat">These groups do not establish that duration causes views. Publication age, measurement windows, audience, paid distribution, and other factors can differ. The three-video display rule is not statistical validation. Unknown accounts may mix audiences. Repeated matches are not independent examples.</p></section>
      </>}

    </>}
  </div>;
}
