import {Router, json} from 'express';
import {rateLimit} from 'express-rate-limit';
import {TrendError} from './serpapi.js';

export function trendRoutes(service) {
  const router = Router();
  const limit = rateLimit({windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, res) => res.status(429).json({error: {code: 'RATE_LIMIT', message: 'Too many trend requests. Try again shortly.'}})});
  router.get('/status', async (_req, res, next) => { try { res.json({configured: service.configured, account: service.configured ? await service.account().catch(() => null) : null}); } catch (error) { next(error); } });
  router.get('/picks', (_req, res) => res.json({picks: service.picks()}));
  router.post('/search', limit, json({limit: '2kb'}), async (req, res, next) => { try { res.json(await service.search(req.body?.query)); } catch (error) { next(error); } });
  router.post('/picks', limit, json({limit: '4kb'}), async (req, res, next) => { try { res.json({pick: await service.importAd(req.body || {})}); } catch (error) { next(error); } });
  router.delete('/picks/:id', async (req, res, next) => { try { await service.remove(req.params.id); res.json({removed: true}); } catch (error) { next(error); } });
  router.patch('/picks/:id', json({limit: '2kb'}), async (req, res, next) => { try { res.json({pick: await service.attach(req.params.id, req.body?.videoId)}); } catch (error) { next(error); } });
  router.use((error, _req, res, next) => { if (!(error instanceof TrendError)) return next(error); res.status(error.status).json({error: {code: error.code, message: error.message}}); });
  return router;
}
