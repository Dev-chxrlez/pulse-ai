import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { AnalysisError, findMediaTools, probeVideo, extractFrames, detectScenes, audioWindows, extractAudio } from './media.js';
import { createProvider } from './provider.js';
import { validateReport } from './report.js';

export async function createAnalysisService({ store, dataDir, mediaDir, config = {}, provider: injectedProvider }) {
  const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
  const tools = await findMediaTools({ ffmpeg: config.ffmpeg ?? process.env.FFMPEG_PATH, ffprobe: config.ffprobe ?? process.env.FFPROBE_PATH });
  const maxDuration = Number(config.maxDuration ?? process.env.MAX_ANALYSIS_SECONDS ?? 180);
  if (!Number.isFinite(maxDuration) || maxDuration < 3 || maxDuration > 600) throw new Error('MAX_ANALYSIS_SECONDS must be between 3 and 600.');
  const issues = [];
  if (!apiKey && !injectedProvider) issues.push('Add OPENAI_API_KEY to server/.env and restart the backend.');
  if (!tools.ffmpeg || !tools.ffprobe) issues.push('Install FFmpeg with ffprobe, or configure FFMPEG_PATH and FFPROBE_PATH.');
  const setup = { available: issues.length === 0, keyConfigured: Boolean(apiKey || injectedProvider), ffmpegReady: Boolean(tools.ffmpeg && tools.ffprobe), maxDuration, issues };
  const provider = injectedProvider || createProvider({ apiKey, visionModel: config.visionModel ?? process.env.OPENAI_VISION_MODEL, transcriptionModel: config.transcriptionModel ?? process.env.OPENAI_TRANSCRIPTION_MODEL });
  const root = path.join(dataDir, 'analysis');
  await mkdir(root, { recursive: true, mode: 0o700 });
  // Do not repeat paid work after a crash. The user explicitly retries an interrupted job.
  for (const video of store.list()) {
    if (['queued', 'processing'].includes(video.analysisStatus)) await store.update(video.id, { analysisStatus: 'failed', analysisStage: null, analysisError: { code: 'INTERRUPTED', message: 'Analysis was interrupted by a server restart. Retry when ready.' } });
  }
  const pending = new Set();
  let tail = Promise.resolve();
  async function stage(id, label) { await store.update(id, { analysisStatus: 'processing', analysisStage: label }); }
  async function processVideo(id) {
    let workspace;
    let assetsCommitted = false;
    try {
      const video = store.get(id);
      const filename = path.join(mediaDir, video.storageName);
      workspace = await mkdtemp(path.join(root, '.work-'));
      await stage(id, 'Reading video');
      const metadata = await probeVideo(filename, tools, maxDuration);
      await store.update(id, { metadata });
      await stage(id, 'Sampling frames');
      const frames = await extractFrames(filename, workspace, metadata, tools);
      await stage(id, 'Measuring scene changes');
      const sceneChanges = await detectScenes(filename, tools);
      const transcript = { status: metadata.hasAudio ? 'transcribed' : 'no_audio', timing: 'extraction_windows', windows: [], text: '' };
      if (metadata.hasAudio) {
        const windows = audioWindows(metadata.duration);
        for (const [index, window] of windows.entries()) {
          await stage(id, `Transcribing audio ${index + 1}/${windows.length}`);
          const audioPath = path.join(workspace, `audio-${index}.wav`);
          await extractAudio(filename, audioPath, window, tools);
          const text = await provider.transcribe(audioPath);
          transcript.windows.push({ index, ...window, text });
          await rm(audioPath, { force: true });
        }
        transcript.text = transcript.windows.map(window => window.text).filter(Boolean).join(' ');
      }
      await stage(id, 'Reviewing visuals and narration');
      const result = await provider.review(metadata, frames, transcript, sceneChanges);
      const report = validateReport(result.report, frames, transcript);
      const savedFrames = frames.map(({ index, timestamp }) => ({ index, timestamp }));
      const analysis = { version: 1, completedAt: new Date().toISOString(), models: provider.models, metadata, frames: savedFrames, sceneChanges, transcript, report, usage: result.usage };
      await rm(path.join(root, id), { recursive: true, force: true });
      await rename(workspace, path.join(root, id));
      workspace = null;
      assetsCommitted = true;
      await store.update(id, { analysisStatus: 'completed', analysisStage: null, analysisError: null, analysis });
    } catch (error) {
      if (assetsCommitted) await rm(path.join(root, id), { recursive: true, force: true }).catch(() => {});
      const failure = error instanceof AnalysisError ? { code: error.code, message: error.message } : { code: 'ANALYSIS_FAILED', message: 'Analysis could not be saved or completed. Check the server and retry.' };
      await store.update(id, { analysisStatus: 'failed', analysisStage: null, analysisError: failure });
    } finally {
      if (workspace) await rm(workspace, { recursive: true, force: true }).catch(() => {});
      pending.delete(id);
    }
  }
  return {
    setup,
    inspect:filename=>probeVideo(filename,tools,maxDuration),
    async enqueue(id) {
      if (pending.has(id) || store.get(id)?.analysisStatus === 'completed') return;
      if (!setup.available) {
        await store.update(id, { analysisStatus: 'blocked', analysisStage: null, analysisError: { code: 'SETUP_REQUIRED', message: issues.join(' ') } });
        return;
      }
      if (pending.size >= 20) {
        await store.update(id, { analysisStatus: 'failed', analysisError: { code: 'QUEUE_FULL', message: 'Analysis queue is full. Retry after other videos finish.' } });
        return;
      }
      pending.add(id);
      try { await store.update(id, { analysisStatus: 'queued', analysisStage: 'Waiting for analysis', analysisError: null }); }
      catch (error) { pending.delete(id); throw error; }
      tail = tail.then(() => processVideo(id)).catch(() => { pending.delete(id); console.error('Could not persist analysis state.'); });
    },
    async idle() { await tail; },
    framePath: (id, index) => path.join(root, id, `frame-${index}.jpg`),
  };
}
