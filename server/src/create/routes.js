import {Router, json} from 'express';
import multer from 'multer';
import {rateLimit} from 'express-rate-limit';
import {copyFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {LOGO_MAX} from './service.js';
import {VoiceError} from './voice.js';

const limit = (max, message) => rateLimit({windowMs: 15 * 60 * 1000, limit: max, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, res) => res.status(429).json({error: {code: 'RATE_LIMIT', message}})});
export function createRoutes(service, {storage, analysis, tempDir}) {
  const router = Router();
  const upload = multer({storage: multer.memoryStorage(), limits: {fileSize: LOGO_MAX, files: 1, fields: 20, fieldSize: 8000}});
  router.get('/setup', (_req, res) => res.json(service.setup()));
  router.get('/templates', (_req, res) => res.json({templates: service.templates()}));
  router.get('/voices', async (_req, res, next) => { try { res.json({voices: await service.voices()}); } catch (error) { next(error); } });
  router.get('/videos', (_req, res) => res.json({videos: service.list()}));
  router.get('/videos/:id', (req, res) => { const job = service.get(req.params.id); if (!job) return res.status(404).json({error: {code: 'NOT_FOUND', message: 'Video not found.'}}); res.set('Cache-Control', 'no-store').json({video: job}); });
  router.get('/videos/:id/file', (req, res, next) => {
    const file = service.file(req.params.id);
    if (!file) return res.status(404).json({error: {code: 'NOT_FOUND', message: 'Video not ready.'}});
    res.type('video/mp4'); res.setHeader('Cache-Control', 'private, no-store');
    if (req.query.download === '1') return res.download(file, `${service.get(req.params.id).brand.name.replace(/[^\w-]+/g, '-')}-${req.params.id.slice(0, 6)}.mp4`, error => { if (error) next(error); });
    res.sendFile(file, {acceptRanges: true}, error => { if (error) next(error); });
  });
  router.post('/script', limit(30, 'Too many script requests. Try again shortly.'), json({limit: '8kb'}), async (req, res, next) => { try { res.json({script: await service.script(req.body || {})}); } catch (error) { next(error); } });
  router.post('/videos', limit(20, 'Too many video generations. Try again shortly.'), (req, res, next) => upload.single('logo')(req, res, async error => {
    try {
      if (error) throw Object.assign(new Error(error.code === 'LIMIT_FILE_SIZE' ? 'Logos must be 3 MiB or smaller.' : 'Invalid form upload.'), {status: error.code === 'LIMIT_FILE_SIZE' ? 413 : 400});
      res.status(202).json({video: await service.generate(req.body || {}, req.file)});
    } catch (failure) { next(failure); }
  }));
  const photoUpload = multer({storage: multer.memoryStorage(), limits: {fileSize: 8 * 1024 * 1024, files: 5, fields: 10, fieldSize: 8000}, fileFilter: (_req, file, cb) => cb(null, /^image\/(png|jpeg|webp)$/.test(file.mimetype))});
  router.post('/quick', limit(20, 'Too many video generations. Try again shortly.'), (req, res, next) => photoUpload.fields([{name: 'logo', maxCount: 1}, {name: 'photos', maxCount: 4}])(req, res, async error => {
    try { if (error) throw Object.assign(new Error(error.code === 'LIMIT_FILE_SIZE' ? 'Photos must be 8 MiB or smaller.' : 'Invalid form upload.'), {status: error.code === 'LIMIT_FILE_SIZE' ? 413 : 400}); res.status(202).json({video: await service.quick(req.body || {}, req.files?.logo?.[0], (req.files?.photos || []).map(file => file.buffer))}); } catch (failure) { next(failure); }
  }));
  // Add a finished video to the PULSE library and run the normal analysis on it.
  router.post('/videos/:id/library', limit(20, 'Too many requests.'), async (req, res, next) => {
    try {
      const file = service.file(req.params.id), job = service.get(req.params.id);
      if (!file) return res.status(404).json({error: {code: 'NOT_FOUND', message: 'Video not ready.'}});
      if (job.libraryVideoId) return res.json({videoId: job.libraryVideoId});
      const copy = path.join(tempDir, randomUUID());
      await copyFile(file, copy);
      const record = await storage.save({filename: copy, originalName: `${job.brand.name} - ${job.templateName}.mp4`, source: {kind: 'pulse_create', creationId: job.id}});
      await service.linkLibrary(job.id, record.id);
      await analysis.enqueue(record.id);
      res.status(201).json({videoId: record.id});
    } catch (error) { next(error); }
  });
  router.use((error, _req, res, next) => {
    if (error instanceof VoiceError) return res.status(error.status).json({error: {code: error.code, message: error.message}});
    if (error.status && error.status < 500) return res.status(error.status).json({error: {code: `HTTP_${error.status}`, message: error.message}});
    next(error);
  });
  return router;
}
