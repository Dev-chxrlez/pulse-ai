import { AnalysisError } from './media.js';
import { createProvider } from './provider.js';
import { RUBRIC, validateCreative, scoreCreative } from './creative.js';

export async function createCreativeService({ store, config = {}, provider: injectedProvider }) {
  const provider = injectedProvider || createProvider({ apiKey: config.apiKey ?? process.env.OPENAI_API_KEY, visionModel: config.visionModel ?? process.env.OPENAI_VISION_MODEL });
  const available = Boolean(injectedProvider || (config.apiKey ?? process.env.OPENAI_API_KEY));
  for (const video of store.list()) if (['queued', 'processing'].includes(video.creativeStatus)) await store.update(video.id, { creativeStatus: 'failed', creativeError: 'Creative review was interrupted. Retry when ready.' });
  // refresh re-runs a completed review only when it predates criteria now in the rubric.
  const outdated = video => video?.creativeStatus === 'completed' && RUBRIC.some(dimension => !video.creative?.criteria?.some(item => item.id === dimension.id));
  let tail = Promise.resolve();
  const pending = new Set();
  return {
    async enqueue(id, { refresh = false } = {}) {
      const video = store.get(id);
      if (video.analysisStatus !== 'completed' || !video.analysis) throw Object.assign(new Error('Complete video analysis before requesting a creative review.'), { status: 409 });
      if (!video.analysis.report.findings.some(finding => finding.certainty !== 'uncertain' && finding.evidence.length)) throw Object.assign(new Error('This analysis has insufficient supported findings for a creative review. Review the footage and analysis limitations first.'), { status: 409 });
      if (pending.has(id) || (video.creativeStatus === 'completed' && !(refresh && outdated(video)))) return;
      if (!available) throw Object.assign(new Error('Configure OPENAI_API_KEY on the backend and restart.'), { status: 503 });
      if (pending.size >= 10) throw Object.assign(new Error('Creative review queue is full. Try again later.'), { status: 429 });
      pending.add(id);
      try { await store.update(id, { creativeStatus: 'queued', creativeError: null, creativeDiagnostic: null }); }
      catch (error) { pending.delete(id); throw error; }
      tail = tail.then(async () => {
        try {
          await store.update(id, { creativeStatus: 'processing' });
          const generated = await provider.creative(video.analysis, RUBRIC);
          const validated = validateCreative(generated.review, video.analysis);
          const creative = { ...scoreCreative(validated, video.analysis.metadata), version: 1, model: provider.models.vision, completedAt: new Date().toISOString(), usage: generated.usage || null };
          await store.update(id, { creativeStatus: 'completed', creativeError: null, creativeDiagnostic: null, creative });
        } catch (error) {
          const diagnostic = error instanceof AnalysisError ? error.diagnostic || null : null;
          if (diagnostic) console.warn('Creative review validation failed:', JSON.stringify(diagnostic));
          await store.update(id, { creativeStatus: 'failed', creativeError: error instanceof AnalysisError ? error.message : 'Creative review could not be completed or saved. Please retry.', creativeDiagnostic: diagnostic });
        } finally { pending.delete(id); }
      }).catch(() => { pending.delete(id); console.error('Could not persist creative review state.'); });
    },
    outdated,
    async idle() { await tail; },
  };
}
