import { randomUUID } from 'node:crypto';
import { createStore } from '../store.js';
import { normalizeSocialMonitor, NicheError } from './socialmonitor.js';
import { nicheStatistics } from './statistics.js';
import { creativePatternReport, savedCreativeInsights } from './patterns.js';
import { dnaPatterns } from '../dna/patterns.js';
import { MANUAL_POST_LIMIT, parseManualProfile, parsePostUrl, manualPostFields } from './manual.js';
import { readPublicPost } from './fetch.js';
import { commentText, validateComments } from './comments.js';
import { createCommentBrowser } from './browser.js';
import { createProvider } from '../provider.js';
import { AnalysisError } from '../media.js';
const PROFILE_LIMIT = 20;

export async function createNicheService({dataDir,videos,dna,readPost=readPublicPost,provider:injectedProvider,apiKey=process.env.OPENAI_API_KEY,commentBrowser}) {
  const browser=commentBrowser||createCommentBrowser({dataDir});
  const provider=injectedProvider||createProvider({apiKey,visionModel:process.env.OPENAI_VISION_MODEL});
  const commentsAvailable=Boolean(injectedProvider||apiKey);
  const analyzingComments=new Set();
  let fetching=false;
  const store = await createStore(dataDir,'niche.json');
  function report(record) {
    const statistics=nicheStatistics(record.posts);
    return {...record,statistics,patterns:creativePatternReport(record.posts,statistics,videos),dnaPatterns:dnaPatterns(record.posts,statistics,videos,dna),dnaAvailable:Boolean(dna?.available),posts:record.posts.map(post=>{
      const video = videos.get(post.matchedVideoId);
      return {...post,mediaStatus:video?'user_upload_linked':'upload_required',analysisStatus:video?.analysisStatus || (video?'uploaded':'not_linked'),matchedVideo:video?{id:video.id,name:video.originalName}:null,hasCreativeReview:video?.creativeStatus==='completed',insights:savedCreativeInsights(video),creativeDna:video?dna?.get(video.id)||null:null};
    })};
  }
  return {
    list:()=>store.list().map(report),
    uploadTarget(reportId,postId,profileUrl) {
      const record=store.get(reportId);const post=record?.posts.find(post=>post.postId===postId);
      if(!post)throw new NicheError('NOT_FOUND','Imported profile or post not found.',404);
      if(profileUrl!==record.profileUrl)throw new NicheError('TARGET_MISMATCH','The upload target account changed. Reopen the selected post.',409);
      if(post.matchedVideoId)throw new NicheError('ALREADY_LINKED','This post already has a video. Reuse its analysis or explicitly unlink it first.',409);
      return {reportId,postId,profileUrl:record.profileUrl};
    },
    async attachUpload(target,videoId) {
      await store.transact(records=>{
        const record=records.find(record=>record.id===target.reportId);const post=record?.posts.find(post=>post.postId===target.postId);
        if(!post||record.profileUrl!==target.profileUrl||post.matchedVideoId)throw new NicheError('TARGET_CHANGED','The video was saved to your library, but the target changed or is already linked. Select the saved file manually; do not upload it again.',409);
        return records.map(item=>item.id===target.reportId?{...item,posts:item.posts.map(post=>post.postId===target.postId?{...post,matchedVideoId:videoId}:post)}:item);
      });
    },
    async import(dump,profileUrl,{localReadOnly=false,officialTikTok=false}={}) {
      let normalized;
      try { normalized=normalizeSocialMonitor(dump,profileUrl); }
      catch(error) { if(error instanceof NicheError)throw error;throw new NicheError('INVALID_EXPORT','The export contains invalid values or timestamps.'); }
      if(localReadOnly)normalized.provenance.method='local_readonly_export';
      if(officialTikTok){normalized.source='tiktok_official';normalized.provenance={method:'official_tiktok_api',exportedAt:normalized.provenance.exportedAt,independentlyVerified:false,accountIdentityVerified:true};normalized.posts=normalized.posts.map(post=>{const original=dump.tables.posts.find(row=>row.ext_id===post.postId);return {...post,source:'tiktok_official',originalPostUrl:original.url,description:original.caption===null?null:post.description};});}
      let saved;
      await store.transact(records=>{
        // Manual reports for the same account are kept separately and never overwritten by an import.
        const previous = records.find(record=>record.profileUrl===normalized.profileUrl&&record.source!=='manual');
        if(!previous&&records.length>=PROFILE_LIMIT)throw new NicheError('PROFILE_LIMIT','This local proof of concept supports up to 20 imported profile reports.',413);
        saved={...normalized,id:previous?.id||randomUUID(),importedAt:new Date().toISOString(),posts:normalized.posts.map(post=>({...post,matchedVideoId:previous?.posts.find(prior=>prior.postId===post.postId)?.matchedVideoId||null}))};
        return [...records.filter(record=>record.id!==saved.id),saved];
      });
      return report(saved);
    },
    async createManual(input) {
      const profile=parseManualProfile(input);
      let saved;
      await store.transact(records=>{
        saved=records.find(record=>record.source==='manual'&&record.profileUrl===profile.profileUrl);
        if(saved)return records;
        if(records.length>=PROFILE_LIMIT)throw new NicheError('PROFILE_LIMIT','This local proof of concept supports up to 20 profile reports. Delete one first.',413);
        saved={...profile,id:randomUUID(),posts:[],warnings:[],duplicates:0,skipped:0,truncated:0,collectionStatus:'manual_entry',source:'manual',provenance:{method:'manual_entry',exportedAt:null,independentlyVerified:false},importedAt:new Date().toISOString()};
        return [...records,saved];
      });
      return report(saved);
    },
    // Pre-fill only: nothing is saved until the user submits addPost.
    async previewPost(reportId,postUrl) {
      const record=store.get(reportId);
      if(!record)throw new NicheError('NOT_FOUND','Profile report not found.',404);
      const parsed=parsePostUrl(postUrl);
      if(parsed.platform!==record.platform)throw new NicheError('PLATFORM_MISMATCH',`This is a ${parsed.platform} link, but @${record.account} is a ${record.platform} account.`,422);
      if(parsed.account&&parsed.account!==record.account)throw new NicheError('ACCOUNT_MISMATCH',`This link belongs to @${parsed.account}, not @${record.account}.`,422);
      if(fetching)throw new NicheError('FETCH_BUSY','Another post is being read. Try again in a moment.',429);
      fetching=true;
      try{
        const {id,...data}=await readPost(parsed.postUrl);
        // Share/watch links resolve to a numeric video ID; use the Reel link so duplicates are caught.
        const postUrl=parsed.platform==='facebook'&&/^\d{5,30}$/.test(id||'')?`https://www.facebook.com/reel/${id}/`:parsed.postUrl;
        return {postUrl,...data};
      }finally{fetching=false;}
    },
    async addPost(reportId,input={}) {
      const parsed=parsePostUrl(input.postUrl);
      const fields=manualPostFields(input);
      await store.transact(records=>{
        const record=records.find(item=>item.id===reportId);
        if(!record)throw new NicheError('NOT_FOUND','Profile report not found.',404);
        if(record.source!=='manual')throw new NicheError('NOT_MANUAL','Posts can be added only to manually entered accounts.',409);
        if(parsed.platform!==record.platform)throw new NicheError('PLATFORM_MISMATCH',`This is a ${parsed.platform} link, but @${record.account} is a ${record.platform} account.`,422);
        if(parsed.account&&parsed.account!==record.account)throw new NicheError('ACCOUNT_MISMATCH',`This link belongs to @${parsed.account}, not @${record.account}.`,422);
        if(record.posts.some(post=>post.postId===parsed.postId))throw new NicheError('DUPLICATE_POST','This post is already in the report. Edit its metrics instead.',409);
        if(record.posts.length>=MANUAL_POST_LIMIT)throw new NicheError('POST_LIMIT',`A manual report holds up to ${MANUAL_POST_LIMIT} posts.`,413);
        const post={platform:record.platform,profileUrl:record.profileUrl,account:record.account,postId:parsed.postId,postUrl:parsed.postUrl,mediaUrl:null,...fields,source:'manual',matchedVideoId:null};
        return records.map(item=>item.id===reportId?{...item,posts:[post,...item.posts].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)||a.postId.localeCompare(b.postId))}:item);
      });
      return report(store.get(reportId));
    },
    async updatePost(reportId,postId,input={}) {
      await store.transact(records=>{
        const record=records.find(item=>item.id===reportId);const post=record?.posts.find(item=>item.postId===postId);
        if(!post)throw new NicheError('NOT_FOUND','Profile report or post not found.',404);
        if(record.source!=='manual')throw new NicheError('NOT_MANUAL','Imported posts are read-only. Re-import to refresh them.',409);
        const fields=manualPostFields(input,post);
        return records.map(item=>item.id===reportId?{...item,posts:item.posts.map(entry=>entry.postId===postId?{...entry,...fields}:entry).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)||a.postId.localeCompare(b.postId))}:item);
      });
      return report(store.get(reportId));
    },
    async removePost(reportId,postId) {
      await store.transact(records=>{
        const record=records.find(item=>item.id===reportId);
        if(!record?.posts.some(post=>post.postId===postId))throw new NicheError('NOT_FOUND','Profile report or post not found.',404);
        if(record.source!=='manual')throw new NicheError('NOT_MANUAL','Imported posts are read-only. Re-import to refresh them.',409);
        return records.map(item=>item.id===reportId?{...item,posts:item.posts.filter(post=>post.postId!==postId)}:item);
      });
      return report(store.get(reportId));
    },
    // Removes only the report. Linked library videos, analyses and reviews are kept.
    // Pasted comments are summarized and discarded; only the summary is saved on the post.
    async analyzeComments(reportId,postId,value) {
      const text=commentText(value);
      const post=store.get(reportId)?.posts.find(item=>item.postId===postId);
      if(!post)throw new NicheError('NOT_FOUND','Profile report or post not found.',404);
      if(!commentsAvailable)throw new NicheError('COMMENTS_SETUP','Configure the backend AI API key to analyze comments.',503);
      const key=`${reportId}:${postId}`;
      if(analyzingComments.has(key))throw new NicheError('COMMENTS_BUSY','These comments are already being analyzed.',409);
      analyzingComments.add(key);
      try{
        let result;
        try{result=await provider.comments(text,{platform:post.platform,caption:(post.description||'').slice(0,500),commentCountOnPlatform:post.metrics.comments});}
        catch(error){if(error instanceof AnalysisError)throw new NicheError(error.code,error.message,502);throw error;}
        const commentAnalysis={...validateComments(result.data),analyzedAt:new Date().toISOString()};
        await store.transact(records=>{
          const record=records.find(item=>item.id===reportId);
          if(!record?.posts.some(item=>item.postId===postId))throw new NicheError('NOT_FOUND','The post was removed during analysis.',404);
          return records.map(item=>item.id===reportId?{...item,posts:item.posts.map(entry=>entry.postId===postId?{...entry,commentAnalysis}:entry)}:item);
        });
        return report(store.get(reportId));
      }finally{analyzingComments.delete(key);}
    },
    // Opens the user's own post in a visible, signed-in Chrome window, reads the comments, then analyzes them.
    async fetchComments(reportId,postId) {
      const post=store.get(reportId)?.posts.find(item=>item.postId===postId);
      if(!post)throw new NicheError('NOT_FOUND','Profile report or post not found.',404);
      const result=await browser.comments(post.postUrl,post.platform);
      if(result.status!=='ok')return {status:result.status,message:result.message,report:report(store.get(reportId))};
      return {status:'ok',report:await this.analyzeComments(reportId,postId,result.text)};
    },
    async remove(reportId) {
      await store.transact(records=>{
        if(!records.some(item=>item.id===reportId))throw new NicheError('NOT_FOUND','Profile report not found.',404);
        return records.filter(item=>item.id!==reportId);
      });
    },
    // A deleted video: unlink posts that pointed to it (posts and metrics stay).
    forgetVideo(videoId) { return store.transact(records=>records.map(record=>({...record,posts:record.posts.map(post=>post.matchedVideoId===videoId?{...post,matchedVideoId:null}:post)}))); },
    async match(reportId,postId,videoId) {
      const record=store.get(reportId);
      if(!record || !record.posts.some(post=>post.postId===postId))throw new NicheError('NOT_FOUND','Imported profile or post not found.',404);
      if(videoId!==null && (typeof videoId!=='string'||!videos.get(videoId)))throw new NicheError('INVALID_VIDEO','Select an existing uploaded video, or null to unlink.');
      await store.transact(records=>records.map(item=>item.id===reportId?{...item,posts:item.posts.map(post=>post.postId===postId?{...post,matchedVideoId:videoId}:post)}:item));
      return report(store.get(reportId));
    },
  };
}
