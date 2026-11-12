import {Router,json} from 'express';
import {randomBytes} from 'node:crypto';
import {rateLimit} from 'express-rate-limit';
import {NicheError} from './socialmonitor.js';
const loopback=value=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(value);
export function localSyncRoutes(service,{origin,official}) {
  const router=Router();const grants=new Map();
  const trusted=new Set([origin,origin.replace('localhost','127.0.0.1')]);
  router.use((req,res,next)=>{
    let host;try{host=new URL(`http://${req.headers.host}`).hostname;}catch{/* Rejected below. */}
    if(!loopback(req.socket.remoteAddress)||!['127.0.0.1','localhost','[::1]'].includes(host)||!trusted.has(req.headers.origin)||['forwarded','x-forwarded-for','x-forwarded-host','x-forwarded-proto'].some(header=>req.headers[header])||req.headers['x-pulse-local-sync']!=='1')return res.status(403).json({error:{code:'LOCAL_ONLY',message:'Local sync requires the trusted PULSE page on this computer.'}});
    next();
  });
  router.use(rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,handler:(_req,res)=>res.status(429).json({error:{code:'RATE_LIMIT',message:'Too many local sync requests. Try later.'}})}));
  router.post('/session',(_req,res)=>{
    for(const [key,expires] of grants)if(expires<Date.now())grants.delete(key);
    if(!service.enabled)return res.status(503).json({error:{code:'SYNC_DISABLED',message:'Configure SOCIALMONITOR_LOCAL_ROOT in the backend environment to enable local transfer.'}});
    const capability=randomBytes(32).toString('hex');grants.set(capability,Date.now()+60000);
    res.set('Cache-Control','no-store').json({capability});
  });
  function authorized(req,res,next){
    const token=String(req.headers.authorization||'').replace(/^Bearer /,'');const expiry=grants.get(token);grants.delete(token);
    if(!expiry||expiry<Date.now())return res.status(401).json({error:{code:'SYNC_AUTH',message:'The local authorization expired. Request another capability.'}});
    next();
  }
  router.post('/',json({limit:'4kb'}),authorized,async(req,res,next)=>{try{res.set('Cache-Control','no-store').json(await service.sync(req.body?.profileUrl));}catch(error){next(error);}});
  if(official)for(const [route,action] of [['/tiktok/status','status'],['/tiktok/acquire','acquire']])router.post(route,json({limit:'4kb'}),authorized,async(req,res,next)=>{
    try{res.set('Cache-Control','no-store').json(await official[action](req.body?.profileId));}catch(error){next(error);}
  });
  router.use((error,_req,res,next)=>{if(!(error instanceof NicheError))return next(error);res.status(error.status).json({error:{code:error.code,message:error.message}});});
  return router;
}
