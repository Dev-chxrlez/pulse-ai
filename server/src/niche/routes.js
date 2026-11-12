import { Router, json } from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { SOURCE_STATUS, collectProfile, NicheError } from './socialmonitor.js';

export function nicheRoutes(service) {
  const router=Router();
  router.get('/source',(_req,res)=>res.json(SOURCE_STATUS));
  router.get('/',(_req,res)=>res.json({reports:service.list(),source:SOURCE_STATUS}));
  // Manual entry: frequent small edits, so a separate, more generous limit than imports.
  const manualLimit=rateLimit({windowMs:15*60*1000,limit:300,standardHeaders:'draft-8',legacyHeaders:false,handler:(_req,res)=>res.status(429).json({error:{code:'RATE_LIMIT',message:'Too many edits. Try again in a few minutes.'}})});
  const body=json({limit:'16kb'});
  router.post('/manual',manualLimit,body,async(req,res)=>res.status(201).json({report:await service.createManual(req.body||{})}));
  router.post('/:reportId/posts/preview',manualLimit,body,async(req,res)=>res.json({preview:await service.previewPost(req.params.reportId,req.body?.postUrl)}));
  router.post('/:reportId/posts',manualLimit,body,async(req,res)=>res.status(201).json({report:await service.addPost(req.params.reportId,req.body||{})}));
  router.patch('/:reportId/posts/:postId',manualLimit,body,async(req,res)=>res.json({report:await service.updatePost(req.params.reportId,req.params.postId,req.body||{})}));
  const commentLimit=rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,handler:(_req,res)=>res.status(429).json({error:{code:'RATE_LIMIT',message:'Too many comment analyses. Try again in a few minutes.'}})});
  router.post('/:reportId/posts/:postId/comments/fetch',commentLimit,async(req,res)=>res.json(await service.fetchComments(req.params.reportId,req.params.postId)));
  router.post('/:reportId/posts/:postId/comments',commentLimit,json({limit:'128kb'}),async(req,res)=>res.json({report:await service.analyzeComments(req.params.reportId,req.params.postId,req.body?.text)}));
  router.delete('/:reportId/posts/:postId',manualLimit,async(req,res)=>res.json({report:await service.removePost(req.params.reportId,req.params.postId)}));
  router.delete('/:reportId',manualLimit,async(req,res)=>{await service.remove(req.params.reportId);res.json({deleted:true});});
  router.use(rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:'draft-8',legacyHeaders:false,handler:(_req,res)=>res.status(429).json({error:{code:'RATE_LIMIT',message:'Too many niche import requests. Try again later.'}})}));
  router.post('/collect',json({limit:'4kb'}),async(req,res)=>res.json(await collectProfile(req.body?.profileUrl)));
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:1024*1024,files:1,fields:1,parts:2,fieldSize:500}});
  router.post('/import',(req,res,next)=>upload.single('export')(req,res,async error=>{
    try {
      if(error)throw new NicheError(error.code==='LIMIT_FILE_SIZE'?'EXPORT_LIMIT':'INVALID_UPLOAD',error.code==='LIMIT_FILE_SIZE'?'JSON exports must be 1 MiB or smaller.':'Upload one JSON export and a profileUrl.',error.code==='LIMIT_FILE_SIZE'?413:400);
      if(!req.file?.originalname.toLowerCase().endsWith('.json'))throw new NicheError('INVALID_EXPORT','Choose the SocialMonitor .json export.');
      let dump;
      try { dump=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(req.file.buffer)); }
      catch { throw new NicheError('INVALID_EXPORT','The export is not valid UTF-8 JSON.'); }
      res.status(201).json({report:await service.import(dump,req.body?.profileUrl)});
    }catch(failure){next(failure);}
  }));
  router.patch('/:reportId/posts/:postId/match',json({limit:'4kb'}),async(req,res)=>{
    if(!req.body||!Object.hasOwn(req.body,'videoId'))throw new NicheError('INVALID_VIDEO','Provide videoId or null to unlink.');
    res.json({report:await service.match(req.params.reportId,req.params.postId,req.body.videoId)});
  });
  router.use((error,_req,res,next)=>{if(!(error instanceof NicheError))return next(error);res.status(error.status).json({error:{code:error.code,message:error.message}});});
  return router;
}
