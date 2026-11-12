import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../src/app.js';

// Test-double provider only; no AI request is made.
test('POL AI answers questions with an optional page, validates input and ignores unknown pages', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'pulse-pol-'));
  let seen = null;
  const provider = {models: {vision: 'test-only'}, async structured(name, _schema, instructions, input) { seen = {name, instructions, input}; return {data: {answer: 'Go to Video Analysis and upload your video.', page: input.question.includes('bad') ? 'Nowhere' : 'Video Analysis'}}; }};
  const app = await createApp({dataDir, assistantConfig: {provider}});
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const ask = body => fetch(`http://127.0.0.1:${server.address().port}/api/assistant/ask`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  try {
    let response = await ask({question: 'How do I analyze a video?', page: 'Create', history: [{q: 'hi', a: 'hello'}, {q: 1, a: 2}]});
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), {answer: 'Go to Video Analysis and upload your video.', page: 'Video Analysis'});
    assert.equal(seen.name, 'pol_answer'); assert.equal(seen.input.currentPage, 'Create'); assert.equal(seen.input.recentConversation.length, 1); assert.match(seen.instructions, /untrusted/);
    response = await ask({question: 'bad page please'}); assert.equal((await response.json()).page, null);
    assert.equal((await ask({question: ''})).status, 400);
    assert.equal((await ask({question: 'x'.repeat(401)})).status, 400);
    const offline = await createApp({dataDir: await mkdtemp(path.join(tmpdir(), 'pulse-pol2-')), assistantConfig: {apiKey: ''}});
    const server2 = offline.listen(0, '127.0.0.1'); await new Promise(resolve => server2.once('listening', resolve));
    const r2 = await fetch(`http://127.0.0.1:${server2.address().port}/api/assistant/ask`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({question: 'help'})});
    assert.equal(r2.status, 503); await new Promise(resolve => server2.close(resolve));
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dataDir, {recursive: true, force: true}); }
});

test('POL AI brief: turns notes into a description with brand name and missing-fact questions', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'pulse-brief-'));
  let seen = null;
  const provider = {models: {vision: 'test-only'}, async structured(name, _schema, instructions, input) { seen = {name, instructions, input}; return {data: {brandName: 'Kape Kanto', description: 'Neighborhood coffee shop in Las Piñas. Bestseller: iced Spanish latte. Open 7am to 10pm.', missing: ['Where can people order?']}}; }};
  const app = await createApp({dataDir, assistantConfig: {provider}});
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const brief = body => fetch(`http://127.0.0.1:${server.address().port}/api/assistant/brief`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  try {
    const response = await brief({notes: 'kape kanto, coffee shop las pinas, iced spanish latte best seller, 7am-10pm'});
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.brandName, 'Kape Kanto'); assert.match(data.description, /Las Piñas/); assert.deepEqual(data.missing, ['Where can people order?']);
    assert.equal(seen.name, 'pol_brief'); assert.match(seen.instructions, /ONLY facts/);
    assert.equal((await brief({notes: 'hi'})).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dataDir, {recursive: true, force: true}); }
});
