import {NicheError,parseTikTokProfile,normalizeSocialMonitor} from '../niche/socialmonitor.js';
export const REQUIRED_SCOPES=['user.info.basic','user.info.profile','video.list'];
export const VIDEO_ENDPOINT='https://open.tiktokapis.com/v2/video/list/';
const fail=(code,message,status=409)=>new NicheError(code,message,status);
const scopes=value=>new Set(String(value||'').split(/[ ,]+/).filter(Boolean));
function requireScopes(value){if(!REQUIRED_SCOPES.every(scope=>scopes(value).has(scope)))throw fail('TIKTOK_SCOPE_REQUIRED',`Authorize required scopes: ${REQUIRED_SCOPES.join(', ')}.`);}
function metric(value){if(value===undefined||value===null)return null;if(!Number.isSafeInteger(value)||value<0)throw fail('TIKTOK_INVALID_RESPONSE','TikTok returned an invalid metric.',502);return value;}

// Only fixed official endpoints. No browser, collector, media download, or logging.
export function createTikTokConnector({request=fetch,now=()=>Date.now(),clientKey,clientSecret,maxPages=5}={}) {
  if(!Number.isInteger(maxPages)||maxPages<1||maxPages>5)throw new RangeError('maxPages must be between 1 and 5.');
  async function call(url,options) {
    let response,data;
    try{response=await request(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});data=await response.json();}
    catch{throw fail('TIKTOK_UNAVAILABLE','The official TikTok API could not be reached or returned invalid JSON.',502);}
    const code=typeof data.error==='string'?data.error:data.error?.code;
    if(!response.ok||(code&&code!=='ok')) {
      if(response.status===401||['access_token_invalid','invalid_grant','invalid_token'].includes(code))throw fail('TIKTOK_REAUTHORIZE','The TikTok token was expired, revoked or rejected. Reauthorize the registered account.');
      if(response.status===403||code==='scope_not_authorized')throw fail('TIKTOK_SCOPE_REQUIRED',`TikTok rejected account permissions. Required scopes: ${REQUIRED_SCOPES.join(', ')}.`);
      if(response.status===429||code==='rate_limit_exceeded')throw fail('TIKTOK_RATE_LIMIT','TikTok rate limit reached. Retry later.',429);
      throw fail('TIKTOK_API_ERROR','The official TikTok API rejected the request. No post snapshot was saved.',502);
    }
    return data;
  }
  return {async acquire({profile,grant,saveGrant}) {
    const identity=parseTikTokProfile(profile.url);
    if(profile.network!=='tiktok'||identity.account!==String(profile.handle).replace(/^@/,'').toLowerCase())throw fail('TIKTOK_PROFILE_INVALID','The registered TikTok identity is inconsistent.');
    if(!grant?.access_token||!grant.open_id)throw fail('TIKTOK_AUTH_REQUIRED','Authorize the registered account through SocialMonitor’s TikTok OAuth flow first.');
    requireScopes(grant.scope);
    let current={...grant};
    if(!(Date.parse(current.expires_at)>now()+60000)) {
      if(!current.refresh_token||!(Date.parse(current.refresh_expires_at)>now()))throw fail('TIKTOK_REAUTHORIZE','The refresh grant is missing or expired. Reauthorize the registered account.');
      if(!clientKey||!clientSecret)throw fail('TIKTOK_APP_REQUIRED','Configure TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in SocialMonitor’s backend environment before refreshing.');
      const refreshed=await call('https://open.tiktokapis.com/v2/oauth/token/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_key:clientKey,client_secret:clientSecret,grant_type:'refresh_token',refresh_token:current.refresh_token})});
      requireScopes(refreshed.scope);
      if(refreshed.open_id!==current.open_id||!refreshed.access_token||!refreshed.refresh_token||!Number.isFinite(refreshed.expires_in)||refreshed.expires_in<=0||!Number.isFinite(refreshed.refresh_expires_in)||refreshed.refresh_expires_in<=0)throw fail('TIKTOK_INVALID_TOKEN','TikTok returned an invalid or different-account refresh response.',502);
      current={...current,...refreshed,expires_at:new Date(now()+refreshed.expires_in*1000).toISOString(),refresh_expires_at:new Date(now()+refreshed.refresh_expires_in*1000).toISOString()};
      if(typeof saveGrant!=='function')throw fail('TIKTOK_TOKEN_STORAGE','A secure refresh-token persistence callback is required.');
      await saveGrant(current,grant.refresh_token); // Persist rotation before another API call.
    }
    const headers={Authorization:`Bearer ${current.access_token}`,'Content-Type':'application/json'};
    const info=await call('https://open.tiktokapis.com/v2/user/info/?fields=open_id,username',{method:'GET',headers});
    const user=info.data?.user;
    if(!user?.username||user.open_id!==current.open_id||user.username.toLowerCase()!==identity.account)throw fail('TIKTOK_IDENTITY_MISMATCH','The authorized TikTok identity does not match the registered profile. No posts were saved.');
    const videos=new Map();let cursor;let duplicateVideos=0,pages=0,hasMore=false;
    for(let page=0;page<maxPages;page++) {
      const response=await call(VIDEO_ENDPOINT+'?fields=id,create_time,share_url,video_description,title,view_count,like_count,comment_count,share_count',{method:'POST',headers,body:JSON.stringify({max_count:20,...(cursor!==undefined?{cursor}:{})})});
      const data=response.data;
      if(!Array.isArray(data?.videos)||typeof data.has_more!=='boolean')throw fail('TIKTOK_INVALID_RESPONSE','TikTok returned an invalid video-list response.',502);
      pages++;hasMore=data.has_more;
      for(const video of data.videos) {
        if(typeof video.id!=='string'||!/^\d{1,40}$/.test(video.id))throw fail('TIKTOK_INVALID_RESPONSE','TikTok returned an invalid video identifier.',502);
        if(videos.has(video.id)){duplicateVideos++;continue;}
        let url;try{url=new URL(video.share_url);}catch{throw fail('TIKTOK_INVALID_RESPONSE','TikTok returned no valid original post URL.',502);}
        if(url.protocol!=='https:'||url.username||url.password||url.port||!['www.tiktok.com','tiktok.com'].includes(url.hostname)||url.pathname.replace(/\/$/,'').toLowerCase()!==`/@${identity.account}/video/${video.id}`)throw fail('TIKTOK_INVALID_RESPONSE','A returned post URL does not match the authorized account.',502);
        let posted_at=null;
        if(video.create_time!==null&&video.create_time!==undefined){if(!Number.isSafeInteger(video.create_time)||video.create_time<0||!Number.isFinite(new Date(video.create_time*1000).getTime()))throw fail('TIKTOK_INVALID_RESPONSE','TikTok returned an invalid publication timestamp.',502);posted_at=new Date(video.create_time*1000).toISOString();}
        const caption=video.video_description??video.title??null;
        if(caption!==null&&(typeof caption!=='string'||caption.length>5000))throw fail('TIKTOK_INVALID_RESPONSE','TikTok returned an invalid caption.',502);
        videos.set(video.id,{profile_id:profile.id,network:'tiktok',ext_id:video.id,url:video.share_url,kind:'video',caption,posted_at,views:metric(video.view_count),likes:metric(video.like_count),comments_count:metric(video.comment_count),shares:metric(video.share_count)});
      }
      if(!hasMore)break;
      if(!Number.isSafeInteger(data.cursor)||data.cursor<0||(cursor!==undefined&&data.cursor>=cursor))throw fail('TIKTOK_PAGINATION','TikTok returned a missing or non-advancing pagination cursor. No snapshot was saved.',502);
      cursor=data.cursor;
    }
    const collectedAt=new Date(now()).toISOString();
    const summary={status:videos.size?'acquired':'authorized_empty',accountVerified:true,receivedVideos:videos.size,duplicateVideos,pages,hasMore,collectedAt};
    if(!videos.size){if(hasMore)throw fail('TIKTOK_PAGINATION','The bounded response is incomplete, so an authorized empty result cannot be asserted.',502);return summary;}
    const dump={app:'socialmonitor',version:1,exported_at:collectedAt,tables:{profiles:[{id:profile.id,network:'tiktok',url:identity.profileUrl,handle:identity.account}],posts:[...videos.values()].map(video=>({...video,fetched_at:collectedAt}))}};
    const normalized=normalizeSocialMonitor(dump,identity.profileUrl); // Validate the complete mapped batch before returning.
    return {...summary,dump,profileUrl:identity.profileUrl,retainedVideos:normalized.posts.length};
  }};
}
