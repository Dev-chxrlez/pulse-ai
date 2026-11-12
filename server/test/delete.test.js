import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readdir, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../src/app.js';

// Uses the tiny test fixture only; no AI calls (analysis is not configured in tests).
test('deleting a video removes its file and record, and unlinks posts without deleting them', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'pulse-delete-'));
  const app = await createApp({dataDir, analysisConfig: {apiKey: ''}});
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const json = (method, body) => ({method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  try {
    const form = new FormData(); form.append('video', new Blob([await readFile(new URL('./fixtures/tiny.webm', import.meta.url))], {type: 'video/webm'}), 'test-cut.webm');
    let response = await fetch(`${base}/videos`, {method: 'POST', body: form}); assert.equal(response.status, 201);
    const video = (await response.json()).video;
    assert.equal((await readdir(path.join(dataDir, 'uploads'))).length, 1);
    const {report} = await (await fetch(`${base}/niche/manual`, json('POST', {platform: 'tiktok', account: 'fixture_brand'}))).json();
    await fetch(`${base}/niche/${report.id}/posts`, json('POST', {postUrl: 'https://www.tiktok.com/@fixture_brand/video/123', publishedAt: '2026-10-01', metrics: {views: '50'}}));
    response = await fetch(`${base}/niche/${report.id}/posts/123/match`, json('PATCH', {videoId: video.id})); assert.equal((await response.json()).report.posts[0].matchedVideoId, video.id);
    response = await fetch(`${base}/videos/${video.id}`, {method: 'DELETE'}); assert.equal(response.status, 200);
    assert.equal((await fetch(`${base}/videos/${video.id}`)).status, 404);
    assert.equal((await (await fetch(`${base}/videos`)).json()).videos.length, 0);
    assert.equal((await readdir(path.join(dataDir, 'uploads'))).length, 0);
    const post = (await (await fetch(`${base}/niche`)).json()).reports[0].posts[0];
    assert.equal(post.matchedVideoId, null); assert.equal(post.metrics.views, 50);
    assert.equal((await fetch(`${base}/videos/${video.id}`, {method: 'DELETE'})).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dataDir, {recursive: true, force: true}); }
});
