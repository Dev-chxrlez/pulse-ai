// Reads ONE public post's metadata with plain yt-dlp (no cookies, no login, no impersonation,
// no retries past a block). Used only to pre-fill the manual form; the user reviews and saves.
import {execFile} from 'node:child_process';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {ytdlpBinary} from '../links/retrieve.js';
import {NicheError} from './socialmonitor.js';
const run=promisify(execFile);
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;

// "7.7K" -> {value:7700, approximate:true}; "167" / "1,234" -> exact.
export function parseDisplayedCount(text) {
  const match=/^([\d.,]+)\s*([KMB])?$/i.exec(String(text).trim());
  if(!match)return null;
  const suffix=match[2]?.toUpperCase();
  const number=Number(suffix?match[1].replace(/,/g,''):match[1].replace(/[,.](?=\d{3}\b)/g,''));
  if(!Number.isFinite(number)||number<0)return null;
  const decimals=suffix?(match[1].split('.')[1]||'').length:0;const unit={K:1e3,M:1e6,B:1e9}[suffix]||1;
  return {value:Math.round(number*unit),approximate:Boolean(suffix),text:match[1].trim()+(suffix||''),step:unit/10**decimals};
}
const facebookLabels={views:'views',plays:'views',reactions:'likes',likes:'likes',comments:'comments',shares:'shares'};
// Facebook's page title carries the counts it displays: "7.7K views · 167 reactions | caption".
// yt-dlp's view_count for Facebook is a different, lower figure, so the displayed counts win.
function facebookDisplayedCounts(info) {
  const head=String(info.fulltitle||info.title||'').split(' | ')[0];
  const found={};
  for(const part of head.split(/\s+·\s+/)) {
    const match=/^([\d.,]+\s*[KMB]?)\s+([a-z]+)$/i.exec(part.trim());
    const key=match&&facebookLabels[match[2].toLowerCase()];
    const parsed=key&&parseDisplayedCount(match[1]);
    if(parsed&&!(key in found))found[key]=parsed;
  }
  return found;
}

// Facebook's page data carries exact counts next to the rounded ones it displays, e.g.
// "play_count_reduced":"7.7K","play_count":7768. Only accept a value that sits beside THIS post's
// displayed figure, rounds back to it, and is unambiguous; suggested videos share the page.
const consistent=(exact,shown)=>!shown.approximate?exact===shown.value:exact>=shown.value-shown.step/2&&exact<shown.value+shown.step;
const single=values=>{const unique=[...new Set(values)];return unique.length===1?unique[0]:null;};
const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function facebookExactCounts(page,shown) {
  const exact={};
  if(shown.views?.approximate) {
    const values=[...page.matchAll(new RegExp(`"play_count_reduced":"${escape(shown.views.text)}","play_count":(\\d+)`,'g'))].map(match=>Number(match[1]));
    const value=single(values);if(value!==null&&consistent(value,shown.views))exact.views=value;
  }
  if(shown.likes) {
    const reactions=[],comments=[];
    for(const match of page.matchAll(new RegExp(`"i18n_reaction_count":"${escape(shown.likes.text)}"`,'g'))) {
      const after=page.slice(match.index,match.index+600),before=page.slice(Math.max(0,match.index-800),match.index);
      const reaction=/"reaction_count":\{"count":(\d+)/.exec(after);if(reaction)reactions.push(Number(reaction[1]));
      const comment=[...before.matchAll(/"comments":\{"total_count":(\d+)\}/g)].at(-1);if(comment)comments.push(Number(comment[1]));
    }
    const likes=single(reactions);if(likes!==null&&consistent(likes,shown.likes))exact.likes=likes;
    // Comments are only trusted when found in the same block as this post's reaction figure.
    if(exact.likes!==undefined||!shown.likes.approximate){const value=single(comments);if(value!==null)exact.comments=value;}
  }
  return exact;
}

export function mapPostMetadata(info,page='') {
  const published=Number.isFinite(info.timestamp)?new Date(info.timestamp*1000):/^\d{8}$/.test(info.upload_date||'')?new Date(`${info.upload_date.slice(0,4)}-${info.upload_date.slice(4,6)}-${info.upload_date.slice(6)}T00:00:00Z`):null;
  const facebook=/^facebook/i.test(info.extractor_key||info.extractor||'');
  const displayed=facebook?facebookDisplayedCounts(info):{};
  const metrics={views:count(info.view_count),likes:count(info.like_count),comments:count(info.comment_count),shares:count(info.repost_count),saves:count(info.save_count??info.collect_count)};
  // Never present yt-dlp's Facebook view_count as views: it does not match what Facebook shows.
  if(facebook)metrics.views=null;
  const approximate=[];
  const exact=facebook&&page?facebookExactCounts(page,displayed):{};
  for(const [key,parsed] of Object.entries(displayed)){metrics[key]=parsed.value;if(parsed.approximate&&exact[key]===undefined)approximate.push(key);}
  Object.assign(metrics,exact);
  const caption=facebook?[info.description].find(value=>typeof value==='string'&&value.trim()):null;
  const text=caption||[info.description,info.title].find(value=>typeof value==='string'&&value.trim())||'';
  return {
    publishedAt:published&&Number.isFinite(published.getTime())?published.toISOString().slice(0,10):null,
    metrics,approximate,
    description:text.trim().slice(0,5000),
    uploader:typeof info.uploader==='string'?info.uploader:null,
    duration:Number.isFinite(info.duration)?info.duration:null,
    id:info.id===undefined||info.id===null?null:String(info.id),
  };
}

export async function readPublicPost(postUrl,{binary}={}) {
  let executable;
  try{executable=binary||await ytdlpBinary();}catch{throw new NicheError('FETCH_SETUP','yt-dlp is not installed. Enter the numbers manually.',503);}
  // Facebook: keep a copy of the same page yt-dlp already fetches, to read its exact counts.
  const facebook=/^https:\/\/www\.facebook\.com\//.test(postUrl);
  const directory=await mkdtemp(path.join(tmpdir(),'pulse-post-'));
  try{
    let stdout;
    try{({stdout}=await run(executable,['--ignore-config','--no-plugin-dirs','--no-cookies','--no-cookies-from-browser','--no-playlist','--skip-download','--no-warnings','--socket-timeout','15','--retries','0',...(facebook?['--write-pages']:[]),'-J','--',postUrl],{cwd:directory,timeout:40000,maxBuffer:8*1024*1024,env:{PATH:process.env.PATH,LANG:'en_US.UTF-8'},windowsHide:true}));}
    catch{throw new NicheError('FETCH_UNAVAILABLE','Couldn’t read this post’s public numbers. The platform may have blocked the request or the post is private. Enter the numbers manually.',422);}
    let info;try{info=JSON.parse(stdout);}catch{throw new NicheError('FETCH_UNAVAILABLE','The platform returned unreadable post data. Enter the numbers manually.',422);}
    let page='';
    if(facebook)for(const name of (await readdir(directory)).filter(name=>name.endsWith('.dump')).slice(0,5))page+=(await readFile(path.join(directory,name),'utf8')).slice(0,20*1024*1024);
    return mapPostMetadata(info,page);
  }finally{await rm(directory,{recursive:true,force:true});}
}
