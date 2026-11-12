import {Router,json} from 'express';
import {rateLimit} from 'express-rate-limit';
import {LinkError} from './network.js';
export function linkRoutes(service,{origin}){
  const router=Router();const origins=new Set([origin,origin.replace('localhost','127.0.0.1')]);
  router.use((req,res,next)=>{if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return next(new LinkError('LINK_LOCAL','Link retrieval is available only on this computer.',403));next();});
  router.post('/',rateLimit({windowMs:15*60*1000,limit:5,standardHeaders:'draft-8',legacyHeaders:false,handler:(_req,res)=>res.status(429).json({error:{code:'RATE_LIMIT',message:'Too many link requests. Wait before retrying.'}})}),json({limit:'4kb'}),async(req,res,next)=>{
    if(!origins.has(req.headers.origin))return next(new LinkError('LINK_ORIGIN','Start link analysis from the local PULSE page.',403));
    try{res.status(202).json({job:await service.start(req.body?.url,req.body?.permitted)});}catch(error){next(error);}
  });
  router.get('/:id',(req,res)=>{const job=service.get(req.params.id);if(!job)return res.status(404).json({error:{code:'NOT_FOUND',message:'Link job not found.'}});res.set('Cache-Control','no-store').json({job});});
  router.use((error,_req,res,next)=>{if(!(error instanceof LinkError))return next(error);res.status(error.status).json({error:{code:error.code,message:error.message}});});
  return router;
}
