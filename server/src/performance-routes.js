import { Router, json } from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { CSV_HEADERS, CSV_LIMIT } from './performance.js';

export function performanceRoutes(service) {
  const router=Router();
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:CSV_LIMIT,files:1,fields:0,parts:1}});
  router.get('/',(_req,res)=>res.json(service.list()));
  router.get('/template',(_req,res)=>{res.setHeader('Content-Disposition','attachment; filename="pulse-performance-template.csv"');res.type('text/csv').send(CSV_HEADERS.join(',')+'\r\n');});
  router.use(rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,handler:(_req,res)=>res.status(429).json({error:{code:'RATE_LIMIT',message:'Too many import or matching requests. Try again later.'}})}));
  router.post('/preview',(req,res,next)=>{
    upload.single('csv')(req,res,error=>{
      try{
        if(error)throw Object.assign(new Error(error.code==='LIMIT_FILE_SIZE'?'CSV files must be 1 MiB or smaller.':'Upload one CSV using the csv field.'),{status:error.code==='LIMIT_FILE_SIZE'?413:400});
        if(!req.file||!req.file.originalname.toLowerCase().endsWith('.csv'))throw Object.assign(new Error('Choose a UTF-8 .csv file.'),{status:400});
        const filename=req.file.originalname.split(/[\\/]/).at(-1).slice(0,255);
        res.json(service.preview(req.file.buffer,filename));
      }catch(failure){next(failure);}
    });
  });
  router.post('/imports/:id',async(req,res)=>res.status(201).json(await service.commit(req.params.id)));
  router.patch('/:id/match',json({limit:'4kb'}),async(req,res)=>{
    if(!req.body||!Object.hasOwn(req.body,'videoId'))throw Object.assign(new Error('Provide videoId, or null to unlink.'),{status:400});
    res.json(await service.match(req.params.id,req.body.videoId));
  });
  return router;
}
