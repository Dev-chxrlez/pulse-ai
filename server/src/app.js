import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { mkdir, unlink, stat, access, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createStore } from './store.js';
import { createAnalysisService } from './analysis.js';
import { createCreativeService } from './creative-service.js';
import { compareCreative } from './creative.js';
import { createPerformanceService } from './performance.js';
import { performanceRoutes } from './performance-routes.js';
import { createNicheService } from './niche/service.js';
import { nicheRoutes } from './niche/routes.js';
import { createDnaService } from './dna/service.js';
import { dnaRoutes } from './dna/routes.js';
import {createLocalSync} from './niche/local-sync.js';
import {createOfficialAcquisition} from './tiktok/local.js';
import {createVideoStorage,videoTypes} from './video-storage.js';
import {createLinkService} from './links/service.js';
import {linkRoutes} from './links/routes.js';
import {localSyncRoutes} from './niche/sync-routes.js';
import {createCreateService} from './create/service.js';
import {createRoutes} from './create/routes.js';
import {createTrendService} from './trends/service.js';
import {trendRoutes} from './trends/routes.js';
import {assistantRoutes} from './assistant.js';
import {createPlannerService, plannerRoutes} from './planner.js';

export const MAX_BYTES = 100 * 1024 * 1024;
const types=videoTypes;
export async function createApp({ dataDir, origin = 'http://localhost:5173', maxBytes = MAX_BYTES, rateMax = 20, analysisConfig = {}, analysisProvider, creativeProvider, dnaProvider, clientDir, localSyncConfig = {}, linkConfig = {}, nicheConfig = {}, createConfig = {}, trendConfig = {}, assistantConfig = {}, plannerConfig = {} } = {}) {
  const mediaDir = path.join(dataDir, 'uploads');
  const tempDir = path.join(dataDir, 'temporary');
  await mkdir(dataDir,{recursive:true,mode:0o700});
  await Promise.all([mkdir(mediaDir,{recursive:true,mode:0o700}),mkdir(tempDir,{recursive:true,mode:0o700})]);
  const store = await createStore(dataDir);
  const analysisService = await createAnalysisService({store, dataDir, mediaDir, config: analysisConfig, provider: analysisProvider});
  const creativeService = await createCreativeService({store, config: analysisConfig, provider: creativeProvider});
  const app = express();
  app.locals.analysisService = analysisService;
  app.locals.creativeService = creativeService;
  app.disable('x-powered-by');
  app.use(cors({origin}));
  app.use((_req,res,next) => { res.setHeader('X-Content-Type-Options','nosniff'); next(); });
  const performance = await createPerformanceService({dataDir,videos:store});
  app.use('/api/performance',performanceRoutes(performance));
  let niche;
  const dna=await createDnaService({dataDir,videos:store,config:analysisConfig,provider:dnaProvider,getNiche:id=>niche?.list().find(report=>report.id===id)});
  app.locals.dnaService=dna;
  app.use('/api/intelligence',dnaRoutes(dna,store));
  niche = await createNicheService({dataDir,videos:store,dna,...nicheConfig});
  const official=createOfficialAcquisition({niche,root:localSyncConfig.root??process.env.SOCIALMONITOR_LOCAL_ROOT,database:localSyncConfig.database??process.env.SOCIALMONITOR_LOCAL_DATABASE});
  app.use('/api/niche/local-sync',localSyncRoutes(createLocalSync({niche,...localSyncConfig}),{origin,official}));
  app.use('/api/niche',nicheRoutes(niche));
  const upload = multer({storage:multer.diskStorage({destination:tempDir,filename:(_req,_file,cb)=>cb(null,randomUUID())}),limits:{fileSize:maxBytes,files:1,fields:0,parts:1},fileFilter:(_req,file,cb)=>{
    const extension = path.extname(file.originalname).toLowerCase();
    cb(types[extension] ? null : Object.assign(new Error('Use an MP4, MOV, or WebM video.'),{status:415}),Boolean(types[extension]));
  }});
  const publicRecord = ({storageName: _storageName,...record}) => ({...record,fileUrl:`/api/videos/${record.id}/file`});
  const storage=createVideoStorage({store,mediaDir,maxBytes});
  const links=await createLinkService({dataDir,tempDir,maxBytes,storage,videos:store,analysis:analysisService,...linkConfig});
  app.locals.linkService=links;
  app.use('/api/video-links',linkRoutes(links,{origin}));
  const trends=await createTrendService({dataDir,tempDir,maxBytes,storage,videos:store,analysis:analysisService,...trendConfig});
  const creator=await createCreateService({dataDir,inspiration:id=>trends.inspiration(id),...createConfig});
  app.locals.createService=creator;
  app.use('/api/create',createRoutes(creator,{storage,analysis:analysisService,tempDir}));
  app.use('/api/trends',trendRoutes(trends));
  app.use('/api/assistant',assistantRoutes(assistantConfig));
  // Business context for POL's planning chat: only facts the user already gave PULSE.
  const plannerContext=()=>{const latest=creator.list().find(job=>job.brand?.name);const library=store.list();const reviewed=library.filter(video=>video.creative);
    return {business:latest?{name:latest.brand.name,description:latest.brand.description||null}:null,videosInLibrary:library.length,videosWithCreativeReview:reviewed.length,latestReviewPriorities:(reviewed[0]?.creative?.priorities||[]).slice(0,3).map(item=>String(item.title||'').slice(0,160)),trackedAccounts:(niche?.list()||[]).slice(0,5).map(report=>report.platform&&report.account?`${report.platform} @${report.account}`:null).filter(Boolean)};};
  const planner=await createPlannerService({dataDir,context:plannerContext,...plannerConfig});
  app.use('/api/planner',plannerRoutes(planner));
  app.get('/api/health',(_req,res)=>res.json({status:'ok',analysisAvailable:analysisService.setup.available,analysis:analysisService.setup,maxUploadBytes:maxBytes}));
  app.get('/api/analysis/setup',(_req,res)=>res.json(analysisService.setup));
  app.get('/api/videos',(_req,res)=>res.json({videos:store.list().map(publicRecord)}));
  app.get('/api/compare',(req,res,next)=>{
    const ids = typeof req.query.ids === 'string' ? req.query.ids.split(',') : [];
    if(ids.length<2 || ids.length>3 || new Set(ids).size!==ids.length) return next(Object.assign(new Error('Select two or three different videos.'),{status:400}));
    const videos = ids.map(id=>store.get(id));
    if(videos.some(video=>!video)) return next(Object.assign(new Error('A selected video was not found.'),{status:404}));
    if(videos.some(video=>video.creativeStatus!=='completed'||!video.creative)) return next(Object.assign(new Error('Complete creative reviews for every selected video first.'),{status:409}));
    res.json({...compareCreative(videos),videos:videos.map(publicRecord)});
  });
  app.post('/api/videos/:id/creative',rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-8',legacyHeaders:false,handler:(_req,res)=>res.status(429).json({error:{code:'RATE_LIMIT',message:'Too many creative review requests. Try again later.'}})}),async(req,res,next)=>{
    if(!store.get(req.params.id)) return next(Object.assign(new Error('Video not found.'),{status:404}));
    await creativeService.enqueue(req.params.id,{refresh:req.query.refresh==='1'});
    const video=store.get(req.params.id);
    res.status(video.creativeStatus==='completed'?200:202).json({video:publicRecord(video)});
  });
  app.post(['/api/videos','/api/niche/:reportId/posts/:postId/video'],rateLimit({windowMs:15*60*1000,limit:rateMax,standardHeaders:'draft-8',legacyHeaders:false,handler:(_req,res)=>res.status(429).json({error:{code:'RATE_LIMIT',message:'Too many uploads. Try again in 15 minutes.'}})}),(req,res,next)=>{
    let target;
    try { if(req.params.reportId) target=niche.uploadTarget(req.params.reportId,req.params.postId,req.get('X-Pulse-Profile')); }
    catch(error) { return next(error); }
    upload.single('video')(req,res,async error=>{
      let currentPath = req.file?.path;
      try {
        if(error) throw error;
        if(!req.file || !req.file.size) throw Object.assign(new Error('Choose a non-empty video using the video field.'),{status:400});
        const record=await storage.save({filename:currentPath,originalName:req.file.originalname});
        const id=record.id;currentPath=null;
        if(target) await niche.attachUpload(target,id);
        else await analysisService.enqueue(id);
        res.status(201).json({video:publicRecord(store.get(id))});
      } catch(failure) { if(currentPath) await unlink(currentPath).catch(()=>{}); next(failure); }
    });
  });
  app.post('/api/videos/:id/analyze',rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:'draft-8',legacyHeaders:false,handler:(_req,res)=>res.status(429).json({error:{code:'RATE_LIMIT',message:'Too many analysis requests. Try again later.'}})}),async(req,res,next)=>{
    if(!store.get(req.params.id)) return next(Object.assign(new Error('Video not found.'),{status:404}));
    await analysisService.enqueue(req.params.id);
    const video = store.get(req.params.id);
    res.status(video.analysisStatus==='blocked'?503:video.analysisStatus==='completed'?200:202).json({video:publicRecord(video),...(video.analysisStatus==='blocked'?{error:{code:'SETUP_REQUIRED',message:video.analysisError.message}}:{})});
  });
  // Delete one of the user's videos: unlink everything that referenced it, then remove its files.
  app.delete('/api/videos/:id',rateLimit({windowMs:15*60*1000,limit:60,standardHeaders:'draft-8',legacyHeaders:false,handler:(_req,res)=>res.status(429).json({error:{code:'RATE_LIMIT',message:'Too many delete requests. Try again later.'}})}),async(req,res,next)=>{
    try {
      const record=store.get(req.params.id);
      if(!record) return next(Object.assign(new Error('Video not found.'),{status:404}));
      if(['queued','processing'].includes(record.analysisStatus)||['queued','processing'].includes(record.creativeStatus)) return next(Object.assign(new Error('This video is still being analyzed. Delete it when that finishes.'),{status:409}));
      await Promise.all([performance.forgetVideo(record.id),niche.forgetVideo(record.id),dna.forgetVideo(record.id),creator.forgetVideo(record.id)]);
      await store.transact(records=>records.filter(item=>item.id!==record.id));
      await rm(path.join(mediaDir,path.basename(record.storageName)),{force:true});
      await rm(path.join(dataDir,'analysis',path.basename(record.id)),{recursive:true,force:true});
      res.json({deleted:true});
    } catch(error) { next(error); }
  });
  app.get('/api/videos/:id/frames/:index', (req,res,next)=>{
    const video = store.get(req.params.id);
    const index = Number(req.params.index);
    if(video?.analysisStatus!=='completed'||!/^\d+$/.test(req.params.index)||!video.analysis?.frames.some(frame=>frame.index===index)) return next(Object.assign(new Error('Frame not found.'),{status:404}));
    res.type('image/jpeg').sendFile(analysisService.framePath(video.id,index),{cacheControl:false},error=>{if(error)next(Object.assign(new Error('Frame unavailable.'),{status:404}));});
  });
  app.get('/api/videos/:id', (req,res,next)=>{
    const record=store.get(req.params.id);
    if(!record) return next(Object.assign(new Error('Video not found.'),{status:404}));
    res.json({video:publicRecord(record)});
  });
  app.get('/api/videos/:id/file',async(req,res,next)=>{
    const record=store.get(req.params.id);
    if(!record) return next(Object.assign(new Error('Video not found.'),{status:404}));
    const filename=path.join(mediaDir,record.storageName);
    try { await stat(filename); }
    catch(error) { return next(error.code==='ENOENT' ? Object.assign(new Error('The stored video is unavailable.'),{status:404}) : error); }
    res.type(record.mimeType);
    res.setHeader('Cache-Control','private, no-store');
    if(req.query.download==='1') return res.download(filename,record.originalName,error=>{if(error)next(error);});
    res.sendFile(filename,{acceptRanges:true},error=>{if(error)next(error);});
  });
  app.use('/api',(_req,_res,next)=>next(Object.assign(new Error('Endpoint not found.'),{status:404})));
  if(clientDir) {
    const root=path.resolve(clientDir);
    await access(path.join(root,'index.html'));
    app.use(express.static(root,{index:'index.html',dotfiles:'deny'}));
  }
  app.use((_req,_res,next)=>next(Object.assign(new Error('Endpoint not found.'),{status:404})));
  app.use((error,_req,res,next)=>{
    if(res.headersSent) return next(error);
    const status=error instanceof multer.MulterError ? (error.code==='LIMIT_FILE_SIZE'?413:400) : error.status || 500;
    if(status>=500) console.error('API failure:',error.code || error.name);
    const message=error.code==='LIMIT_FILE_SIZE' ? 'Video exceeds the 100 MiB upload limit.' : error instanceof multer.MulterError ? 'Upload one video using the video field.' : status>=500 ? 'Something went wrong. Please try again.' : error.message;
    res.status(status).json({error:{code:error instanceof multer.MulterError?error.code:`HTTP_${status}`,message}});
  });
  return app;
}
