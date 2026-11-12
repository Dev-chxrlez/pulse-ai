import { parse } from 'csv-parse/sync';
import { randomUUID } from 'node:crypto';
import { createStore } from './store.js';

export const CSV_LIMIT = 1024 * 1024;
export const CSV_HEADERS = ['video_id','platform','published_at','views','likes','comments','shares','saves','observed_at','account','pulse_video_id','filename'];
const REQUIRED = ['video_id','platform','published_at','views'];
const ALIASES = { publication_date: 'published_at', published_date: 'published_at', publication_at: 'published_at', date: 'published_at', video_filename: 'filename', upload_id: 'pulse_video_id', snapshot_date: 'observed_at' };
const header = value => { const normalized = value.trim().toLowerCase().replace(/[\s-]+/g,'_'); return ALIASES[normalized] || normalized; };
const httpError = (message,status=400) => Object.assign(new Error(message),{status});
const key = row => JSON.stringify([row.platform,row.account,row.videoId]);
function clean(value,field,max,required=false) {
  const text = String(value || '').trim();
  if((required&&!text)||text.length>max||[...text].some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127)) throw new Error(`${field}: ${required?'required; ':''}use plain text up to ${max} characters.`);
  return text;
}
function count(value,field,required=false) {
  const text = String(value ?? '').trim();
  if(!text&&!required)return null;
  if(!/^\d+$/.test(text)||!Number.isSafeInteger(Number(text)))throw new Error(`${field}: use a non-negative whole number without separators (blank means unknown).`);
  return Number(text);
}
function date(value,field,required=false) {
  const text = String(value || '').trim();
  if(!text&&!required)return null;
  const pattern = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/;
  const first = text.slice(0,10);
  const calendar = new Date(`${first}T00:00:00Z`);
  if(!pattern.test(text)||!Number.isFinite(calendar.getTime())||calendar.toISOString().slice(0,10)!==first||!Number.isFinite(Date.parse(text)))throw new Error(`${field}: use a real YYYY-MM-DD date or ISO timestamp with timezone.`);
  return text.length===10?text:new Date(text).toISOString();
}
export function validateCsv(buffer, existing = [], videos = [], now = new Date()) {
  if(!buffer.length)throw httpError('The CSV file is empty.');
  if(buffer.length>CSV_LIMIT)throw httpError('CSV files must be 1 MiB or smaller.',413);
  let text;
  try { text = new TextDecoder('utf-8',{fatal:true}).decode(buffer); }
  catch { throw httpError('Save the CSV with UTF-8 encoding and try again.'); }
  let parsed;
  try { parsed = parse(text,{bom:true,skip_empty_lines:true,relax_column_count:true,trim:true,info:true,max_record_size:16384}); }
  catch { throw httpError('Could not parse the CSV. Check quoted fields and use comma-separated UTF-8 text.'); }
  if(parsed.length<2)throw httpError('Include a header and at least one data row.');
  if(parsed.length>2001)throw httpError('Import at most 2,000 rows per CSV.');
  const headers = parsed.shift().record.map(header);
  if(headers.length>40)throw httpError('The CSV contains too many columns (maximum 40).');
  if(new Set(headers).size!==headers.length||headers.some(value=>!value))throw httpError('CSV headers must be non-empty and unique, including aliases.');
  const missing = REQUIRED.filter(field=>!headers.includes(field));
  if(missing.length)throw httpError(`Missing required columns: ${missing.join(', ')}.`);
  const ignored = headers.filter(field=>!CSV_HEADERS.includes(field));
  const rows=[];const seen=new Set(existing.map(key));
  for(const {record,info} of parsed) {
    const preview = {line:info.lines,errors:[],warnings:[],duplicate:false,record:null,match:null,suggestions:[]};
    if(record.length!==headers.length){preview.errors.push(`Expected ${headers.length} columns, received ${record.length}.`);rows.push(preview);continue;}
    const source=Object.fromEntries(headers.map((field,index)=>[field,record[index]]));
    try {
      const platform=clean(source.platform,'platform',40,true).toLowerCase();
      if(!/^[a-z0-9][a-z0-9 ._-]*$/.test(platform))throw new Error('platform: use a plain platform name.');
      const row={videoId:clean(source.video_id,'video_id',160,true),platform,account:clean(source.account,'account',100),publishedAt:date(source.published_at,'published_at',true),views:count(source.views,'views',true),likes:count(source.likes,'likes'),comments:count(source.comments,'comments'),shares:count(source.shares,'shares'),saves:count(source.saves,'saves'),observedAt:date(source.observed_at,'observed_at'),filename:clean(source.filename,'filename',255),matchedVideoId:null};
      const uploadId=clean(source.pulse_video_id,'pulse_video_id',100);
      const measuredBeforePublication = row.observedAt && (row.observedAt.length===10 || row.publishedAt.length===10 ? row.observedAt.slice(0,10)<row.publishedAt.slice(0,10) : Date.parse(row.observedAt)<Date.parse(row.publishedAt));
      if(measuredBeforePublication)throw new Error('observed_at cannot precede published_at.');
      if(Date.parse(row.publishedAt)>now.getTime())preview.warnings.push('Publication date is in the future; verify this record.');
      if(row.observedAt&&Date.parse(row.observedAt)>now.getTime())preview.warnings.push('Measurement date is in the future; verify this record.');
      if(!row.observedAt)preview.warnings.push('No measurement date: performance windows may differ.');
      if([row.likes,row.comments,row.shares].some(value=>value===null))preview.warnings.push('Some interaction metrics are unknown; no interactions-per-view ratio will be calculated.');
      if(uploadId&&!videos.some(video=>video.id===uploadId))throw new Error('pulse_video_id does not identify an uploaded video.');
      const exact=videos.find(video=>video.id===(uploadId||row.videoId));
      if(exact){row.matchedVideoId=exact.id;preview.match={id:exact.id,name:exact.originalName,reason:uploadId?'Explicit PULSE ID':'Exact PULSE video ID'};}
      else if(row.filename){preview.suggestions=videos.filter(video=>video.originalName.toLowerCase()===row.filename.toLowerCase()).map(video=>({id:video.id,name:video.originalName}));if(preview.suggestions.length)preview.warnings.push('Filename match is a suggestion only. Confirm it after import.');}
      if(seen.has(key(row))){preview.duplicate=true;preview.warnings.push('Duplicate platform + account + video ID. Existing metrics will not be overwritten.');}
      else seen.add(key(row));
      preview.record=row;
    } catch(error) { preview.errors.push(error.message); }
    rows.push(preview);
  }
  return {rows,ignoredColumns:ignored,total:rows.length,valid:rows.filter(row=>!row.errors.length&&!row.duplicate).length,invalid:rows.filter(row=>row.errors.length).length,duplicates:rows.filter(row=>row.duplicate).length};
}
const median = values => {const sorted=[...values].sort((a,b)=>a-b);const middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;};
export function summarizePerformance(records,videos) {
  const byVideo=new Map(videos.map(video=>[video.id,video]));
  const groups=new Map();
  for(const row of records){const video=byVideo.get(row.matchedVideoId);if(video?.analysisStatus!=='completed'||!video.metadata)continue;
    const duration=video.metadata.duration;const bucket=duration<15?'Under 15s':duration<=30?'15–30s':'Over 30s';
    const groupKey=JSON.stringify([row.platform,row.account,bucket]);
    if(!groups.has(groupKey))groups.set(groupKey,{platform:row.platform,account:row.account,bucket,rows:[]});groups.get(groupKey).rows.push(row);
  }
  return {records:records.length,matched:records.filter(row=>byVideo.has(row.matchedVideoId)).length,analyzed:records.filter(row=>byVideo.get(row.matchedVideoId)?.analysisStatus==='completed').length,missingMeasurementDates:records.filter(row=>!row.observedAt).length,
    platforms:[...new Set(records.map(row=>row.platform))].sort().map(platform=>{const rows=records.filter(row=>row.platform===platform);return {platform,count:rows.length,medianViews:median(rows.map(row=>row.views))};}),
    durationGroups:[...groups.values()].map(group=>{const uniqueVideos=new Set(group.rows.map(row=>row.matchedVideoId)).size;return {platform:group.platform,account:group.account,bucket:group.bucket,count:group.rows.length,uniqueVideos,medianViews:uniqueVideos>=3?median(group.rows.map(row=>row.views)):null};}),
    prediction:{status:'not_trained',message:'Descriptive records only. No predictive model has been trained or validated.'},
  };
}
export async function createPerformanceService({dataDir,videos,clock=()=>new Date()}) {
  const store=await createStore(dataDir,'performance.json');
  const previews=new Map();
  return {
    list(){const records=store.list();return {records:records.map(record=>({...record,matchedVideo:videos.get(record.matchedVideoId)?{id:record.matchedVideoId,name:videos.get(record.matchedVideoId).originalName,analysisStatus:videos.get(record.matchedVideoId).analysisStatus||'uploaded'}:null,interactionsPerView:record.views>0&&[record.likes,record.comments,record.shares].every(value=>value!==null)?(record.likes+record.comments+record.shares)/record.views*100:null})),summary:summarizePerformance(records,videos.list())};},
    preview(buffer,filename){
      for(const [id,item] of previews)if(item.expiresAt<=clock().getTime())previews.delete(id);
      if(previews.size>=10)throw httpError('Too many pending previews. Import one or wait 15 minutes.',429);
      const result=validateCsv(buffer,store.list(),videos.list(),clock());const id=randomUUID();const expiresAt=clock().getTime()+15*60*1000;
      previews.set(id,{...result,filename,expiresAt});return {...result,id,expiresAt:new Date(expiresAt).toISOString()};
    },
    async commit(id){
      const preview=previews.get(id);if(!preview||preview.expiresAt<=clock().getTime())throw httpError('This preview expired. Choose the CSV again.',410);
      let imported=0,duplicates=0;
      await store.transact(current=>{const seen=new Set(current.map(key));const additions=[];
        for(const row of preview.rows){if(row.errors.length||row.duplicate)continue;if(seen.has(key(row.record))){duplicates++;continue;}seen.add(key(row.record));const record={...row.record,id:randomUUID(),importId:id,sourceFilename:preview.filename,sourceLine:row.line,importedAt:clock().toISOString()};if(record.matchedVideoId&&!videos.get(record.matchedVideoId))record.matchedVideoId=null;additions.push(record);imported++;}
        if(current.length+additions.length>10000)throw httpError('This local prototype supports up to 10,000 historical records.',413);
        return [...current,...additions];});previews.delete(id);
      return {imported,skippedInvalid:preview.invalid,skippedDuplicates:preview.duplicates+duplicates};
    },
    // A deleted video: unlink records that pointed to it (the imported metrics stay).
    forgetVideo:videoId=>store.transact(records=>records.map(record=>record.matchedVideoId===videoId?{...record,matchedVideoId:null}:record)),
    async match(id,videoId){if(!store.get(id))throw httpError('Historical record not found.',404);if(videoId!==null&&(typeof videoId!=='string'||!videos.get(videoId)))throw httpError('Choose an existing uploaded video, or unlink this record.');await store.update(id,{matchedVideoId:videoId,matchedAt:clock().toISOString()});return this.list();},
  };
}
