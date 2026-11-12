import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { findMediaTools, runMedia, probeVideo, frameTimes, audioWindows, AnalysisError } from '../src/media.js';
import { createProvider } from '../src/provider.js';
import { validateReport } from '../src/report.js';
import { createStore } from '../src/store.js';

// Explicit test data only: never saved into the user's application library.
const testReport = {
  summary: 'Test-only report for generated color footage.',
  findings: [{ category: 'visual_content', title: 'Generated color frame', assessment: 'The supplied test frame is a solid color.', suggestion: '', certainty: 'observed', evidence: [{ source: 'frame', index: 0, observation: 'A solid color fills frame 0.' }] }],
  limitations: ['Synthetic fixture; no live AI output was used.'],
};
async function serve(app) {
  const server = await new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', error => error ? reject(error) : resolve(server));
    server.on('error', reject);
  });
  return { base: `http://127.0.0.1:${server.address().port}`, stop: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}
function form(bytes) { const body = new FormData(); body.append('video', new Blob([bytes], { type: 'video/mp4' }), 'test.mp4'); return body; }

test('real FFmpeg pipeline: auto queue, evidence, frames, no-audio, failure/retry, persistence', async context => {
  const tools = await findMediaTools();
  if (!tools.ffmpeg || !tools.ffprobe) return context.skip('FFmpeg/ffprobe not installed');
  const directory = await mkdtemp(path.join(tmpdir(), 'pulse-analysis-'));
  const filename = path.join(directory, 'fixture.mp4');
  const silentFilename = path.join(directory, 'silent.mp4');
  let service;
  let transcriptions = 0;
  let reviews = 0;
  let failNext = false;
  const provider = {
    models: { vision: 'test-only', transcription: 'test-only' },
    async transcribe(audio) {
      transcriptions++;
      assert.ok((await readFile(audio)).length > 44);
      return 'TEST DOUBLE: generated tone, not a real transcript.';
    },
    async review(metadata, frames, transcript, scenes) {
      reviews++;
      if (failNext) { failNext = false; throw new AnalysisError('PROVIDER_429', 'Test-only provider failure.'); }
      assert.ok(metadata.duration >= 3.9 && metadata.duration <= 4.1);
      assert.ok(frames.length >= 5);
      assert.ok(scenes.some(time => time >= 1.5 && time <= 2.5));
      assert.equal(transcript.timing, 'extraction_windows');
      return { report: testReport, usage: null };
    },
  };
  try {
    await runMedia(tools.ffmpeg, ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=160x120:r=12:d=2', '-f', 'lavfi', '-i', 'color=c=blue:s=160x120:r=12:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-y', filename]);
    await runMedia(tools.ffmpeg, ['-nostdin', '-v', 'error', '-i', filename, '-an', '-c:v', 'copy', '-y', silentFilename]);
    const metadata = await probeVideo(filename, tools);
    assert.equal(metadata.hasAudio, true);
    assert.equal(metadata.width, 160);
    await assert.rejects(probeVideo(filename, tools, 3), error => error.code === 'DURATION_LIMIT');
    const dataDir = path.join(directory, 'data');
    let app = await createApp({ dataDir, analysisProvider: provider });
    service = await serve(app);
    let response = await fetch(`${service.base}/api/videos`, { method: 'POST', body: form(await readFile(filename)) });
    assert.equal(response.status, 201);
    let video = (await response.json()).video;
    assert.ok(['queued', 'processing'].includes(video.analysisStatus));
    const id = video.id;
    // Repeated start requests must not duplicate a running job or bill again.
    await Promise.all([fetch(`${service.base}/api/videos/${id}/analyze`, { method: 'POST' }), fetch(`${service.base}/api/videos/${id}/analyze`, { method: 'POST' })]);
    await app.locals.analysisService.idle();
    response = await fetch(`${service.base}/api/videos/${id}`);
    video = (await response.json()).video;
    assert.equal(video.analysisStatus, 'completed', JSON.stringify(video.analysisError));
    assert.equal(transcriptions, 2);
    assert.equal(reviews, 1);
    assert.equal(video.analysis.transcript.windows[0].end, 3);
    assert.equal(video.analysis.transcript.windows[1].start, 3);
    assert.ok(video.analysis.frames.every(frame => !('path' in frame)));
    response = await fetch(`${service.base}/api/videos/${id}/frames/0`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/jpeg');
    assert.ok((await response.arrayBuffer()).byteLength > 50);
    response = await fetch(`${service.base}/api/videos/${id}/frames/9999`); assert.equal(response.status, 404);
    response = await fetch(`${service.base}/api/videos/${id}/analyze`, { method: 'POST' }); assert.equal(response.status, 200);
    assert.equal(reviews, 1);
    assert.ok((await readdir(path.join(dataDir, 'analysis', id))).every(name => name.endsWith('.jpg')));
    await service.stop(); service = null;
    app = await createApp({ dataDir, analysisProvider: provider }); service = await serve(app);
    response = await fetch(`${service.base}/api/videos/${id}`); assert.equal((await response.json()).video.analysisStatus, 'completed');
    failNext = true;
    response = await fetch(`${service.base}/api/videos`, { method: 'POST', body: form(await readFile(silentFilename)) });
    const silentId = (await response.json()).video.id;
    await app.locals.analysisService.idle();
    response = await fetch(`${service.base}/api/videos/${silentId}`); assert.equal((await response.json()).video.analysisError.code, 'PROVIDER_429');
    response = await fetch(`${service.base}/api/videos/${silentId}/analyze`, { method: 'POST' }); assert.equal(response.status, 202);
    await app.locals.analysisService.idle();
    response = await fetch(`${service.base}/api/videos/${silentId}`); video = (await response.json()).video;
    assert.equal(video.analysisStatus, 'completed'); assert.equal(video.analysis.transcript.status, 'no_audio'); assert.equal(transcriptions, 2);
    assert.ok(!(await readdir(path.join(dataDir, 'analysis'))).some(name => name.startsWith('.work-')));
  } finally { if (service) await service.stop(); await rm(directory, { recursive: true, force: true }); }
});

test('missing credentials block analysis; interrupted jobs are recoverable; concurrent JSON updates persist', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'pulse-recovery-'));
  let service;
  try {
    const store = await createStore(dataDir);
    await store.add({ id: 'interrupted', originalName: 'test.mp4', storageName: 'test.mp4', uploadedAt: new Date().toISOString(), status: 'uploaded', analysisStatus: 'processing' });
    await Promise.all([store.update('interrupted', { size: 123 }), store.update('interrupted', { mimeType: 'video/mp4' })]);
    const app = await createApp({ dataDir, analysisConfig: { apiKey: '' } }); service = await serve(app);
    let response = await fetch(`${service.base}/api/videos/interrupted`);
    const video = (await response.json()).video;
    assert.equal(video.analysisError.code, 'INTERRUPTED'); assert.equal(video.size, 123); assert.equal(video.mimeType, 'video/mp4');
    response = await fetch(`${service.base}/api/videos/interrupted/analyze`, { method: 'POST' }); assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'SETUP_REQUIRED');
    response = await fetch(`${service.base}/api/analysis/setup`); assert.equal((await response.json()).keyConfigured, false);
  } finally { if (service) await service.stop(); await rm(dataDir, { recursive: true, force: true }); }
});

test('OpenAI adapter formats real requests and rejects malformed or unsupported evidence', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pulse-provider-'));
  try {
    const fixture = new URL('./fixtures/tiny.webm', import.meta.url);
    const frames = [{ index: 0, timestamp: 0, path: fixture }];
    const transcript = { windows: [{ index: 0, start: 0, end: 3, text: 'Test-only.' }] };
    let calls = 0;
    const provider = createProvider({ apiKey: 'test-only', request: async (url, options) => {
      calls++;
      assert.equal(options.headers.Authorization, 'Bearer test-only');
      if (url.endsWith('/audio/transcriptions')) { assert.ok(options.body instanceof FormData); assert.equal(options.body.get('model'), 'gpt-transcribe'); return Response.json({ text: 'Test transcript.' }); }
      const body = JSON.parse(options.body);
      assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
      assert.equal(body.input[0].content[2].type, 'input_image');
      return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(testReport) }] }] });
    } });
    assert.equal(await provider.transcribe(fixture), 'Test transcript.');
    assert.equal((await provider.review({}, frames, transcript, [])).report.summary, testReport.summary); assert.equal(calls, 2);
    const invalid = structuredClone(testReport); invalid.findings[0].evidence[0].index = 999;
    assert.throws(() => validateReport(invalid, frames, transcript), error => error.code === 'INVALID_EVIDENCE');
    invalid.findings[0].evidence = [];
    assert.throws(() => validateReport(invalid, frames, transcript), error => error.code === 'INVALID_EVIDENCE');
    const failure = createProvider({ apiKey: 'test-only', request: async () => Response.json({}, { status: 401 }) });
    await assert.rejects(failure.transcribe(fixture), error => error.code === 'PROVIDER_401' && !error.message.includes('test-only'));
    const refusal = createProvider({ apiKey: 'test-only', request: async () => Response.json({ status: 'completed', output: [{ content: [{ type: 'refusal' }] }] }) });
    await assert.rejects(refusal.review({}, frames, transcript, []), error => error.code === 'AI_REFUSAL');
    const incomplete = createProvider({ apiKey: 'test-only', request: async () => Response.json({ status: 'incomplete' }) });
    await assert.rejects(incomplete.review({}, frames, transcript, []), error => error.code === 'INCOMPLETE_AI_RESPONSE');
    assert.ok(frameTimes(180).length <= 17); assert.ok(frameTimes(1).every(time => time < 1)); assert.equal(audioWindows(4)[1].end, 4);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('audio windows never end with a near-empty chunk', async () => {
  const { audioWindows } = await import('../src/media.js');
  assert.deepEqual(audioWindows(33.041995), [{ start: 0, end: 3 }, { start: 3, end: 33.041995 }]);
  assert.deepEqual(audioWindows(63.5), [{ start: 0, end: 3 }, { start: 3, end: 33 }, { start: 33, end: 63.5 }]);
  assert.deepEqual(audioWindows(40), [{ start: 0, end: 3 }, { start: 3, end: 33 }, { start: 33, end: 40 }]);
  assert.deepEqual(audioWindows(2), [{ start: 0, end: 2 }]);
  assert.ok(audioWindows(185).every(window => window.end - window.start >= 1));
});
