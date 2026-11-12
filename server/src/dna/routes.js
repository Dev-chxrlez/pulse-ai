import {Router,json} from 'express';
import {rateLimit} from 'express-rate-limit';
export function dnaRoutes(service,videos){
  const router=Router();
  router.get('/videos/:id',(req,res)=>{const video=videos.get(req.params.id);if(!video)return res.status(404).json({error:{code:'NOT_FOUND',message:'Video not found.'}});res.json({record:service.get(req.params.id),ready:video.analysisStatus==='completed'&&Boolean(video.analysis),available:service.available});});
  router.get('/blueprints',(req,res)=>res.json({records:service.listBlueprints(String(req.query.reportId||'')),available:service.available}));
  router.use(rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-8',legacyHeaders:false,handler:(_req,res)=>res.status(429).json({error:{code:'RATE_LIMIT',message:'Too many generation requests. Try later.'}})}));
  router.post('/videos/:id',async(req,res)=>{const record=await service.generate(req.params.id);res.status(['queued','processing'].includes(record.status)?202:200).json({record});});
  router.post('/blueprints',json({limit:'4kb'}),async(req,res)=>{const record=await service.generateBlueprint(req.body||{});res.status(['queued','processing'].includes(record.status)?202:200).json({record});});
  return router;
}
