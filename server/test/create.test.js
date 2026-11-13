import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {validateScript, scriptText} from '../src/create/script.js';
import {createVoice, timingsFrom} from '../src/create/voice.js';
import {createCreateService} from '../src/create/service.js';
import {createApp} from '../src/app.js';

// Test-only brand and script; no AI, ElevenLabs or Remotion calls are made.
const script = {hook: 'Stop scrolling for coffee', lines: ['Freshly roasted local beans', 'Iced Spanish latte bestseller', 'Open seven to ten'], cta: 'Order today'};
const brand = {brandName: 'Test Cafe', tagline: 'Test tagline', description: 'Test-only description of a cafe.', primary: '#112233', accent: '#ffcc00', background: '#000000'};
// Tiny valid 1x1 PNG used as a test-only logo.
const TEST_LOGO = {buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')};
function fakeAlignment(text) { const characters = [...text]; return {characters, starts: characters.map((_, index) => index * .05), ends: characters.map((_, index) => (index + 1) * .05)}; }

test('scripts enforce word limits and timings map onto each segment and word', () => {
  assert.deepEqual(validateScript(script), script);
  assert.throws(() => validateScript({...script, hook: 'one two three four five six seven eight'}), error => error.code === 'INVALID_SCRIPT');
  assert.throws(() => validateScript({...script, lines: ['only one']}), error => error.code === 'INVALID_SCRIPT');
  const text = scriptText(script);
  assert.equal(text, 'Stop scrolling for coffee. Freshly roasted local beans. Iced Spanish latte bestseller. Open seven to ten. Order today.');
  const {timings, words, durationSeconds} = timingsFrom(script, fakeAlignment(text));
  assert.equal(timings.hook[0], 0); assert.equal(timings.lines.length, 3);
  assert.ok(timings.lines[0][0] > timings.hook[0] && timings.lines[2][1] <= timings.cta[0]);
  assert.equal(words.length, text.split(' ').length); assert.equal(words[0].text, 'Stop'); assert.equal(words.at(-1).text, 'today');
  assert.deepEqual([...new Set(words.map(word => word.segment))], [0, 1, 2, 3, 4]);
  assert.ok(durationSeconds > words.at(-1).end + 2);
});

test('ElevenLabs is called once per script and voice, then served from cache; missing key is explained', async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'pulse-voice-'));
  try {
    let calls = 0;
    const request = async (url, options) => { calls++; assert.match(url, /text-to-speech\/voice1234567\/with-timestamps/); assert.equal(options.headers['xi-api-key'], 'test-key'); const text = JSON.parse(options.body).text; return Response.json({audio_base64: 'AAAA', alignment: {characters: [...text], character_start_times_seconds: [...text].map((_, i) => i * .05), character_end_times_seconds: [...text].map((_, i) => (i + 1) * .05)}}); };
    const voice = createVoice({apiKey: 'test-key', cacheDir, request});
    assert.equal((await voice.synthesize('Hello there.', 'voice1234567')).cached, false);
    assert.equal((await voice.synthesize('Hello there.', 'voice1234567')).cached, true);
    assert.equal(calls, 1);
    await voice.synthesize('Different text.', 'voice1234567'); assert.equal(calls, 2);
    await assert.rejects(voice.synthesize('Hi.', 'bad id!'), error => error.code === 'VOICE_INVALID');
    await assert.rejects(createVoice({apiKey: '', cacheDir, request}).synthesize('Hi.', 'voice1234567'), error => error.code === 'VOICE_SETUP');
    const failing = createVoice({apiKey: 'test-key', cacheDir, request: async () => new Response('{}', {status: 401})});
    await assert.rejects(failing.synthesize('New words.', 'voice1234567'), error => error.code === 'VOICE_401');
  } finally { await rm(cacheDir, {recursive: true, force: true}); }
});

test('generation records voice only on Generate, renders with brand props, and rejects bad logos', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'pulse-create-'));
  try {
    let voiceCalls = 0, renderInput = null;
    const voice = {configured: true, voices: async () => [{id: 'voice1234567', name: 'Test'}], async synthesize(text) { voiceCalls++; return {audioBase64: 'AAAA', alignment: fakeAlignment(text), cached: false}; }};
    const render = async ({inputProps, output}) => { renderInput = inputProps; await writeFile(output, 'test-only mp4 bytes'); return {frames: 1, fps: 30}; };
    const provider = {models: {vision: 'test-only'}, async structured(name) { assert.equal(name, 'ad_script'); return {data: script}; }};
    const service = await createCreateService({dataDir, voice, render, provider});
    assert.deepEqual(await service.script({templateId: 'bold-hook', ...brand}), script);
    assert.equal(voiceCalls, 0, 'writing a script never calls ElevenLabs');
    await assert.rejects(service.script({templateId: 'nope', ...brand}), error => error.status === 400);
    await assert.rejects(service.script({templateId: 'bold-hook', ...brand, description: ''}), error => error.status === 400);
    const job = await service.generate({templateId: 'product-reveal', ...brand, script: JSON.stringify(script), voiceId: 'voice1234567'});
    await service.idle();
    const done = service.get(job.id);
    assert.equal(done.status, 'completed'); assert.equal(voiceCalls, 1); assert.ok(done.fileUrl);
    assert.equal(renderInput.brand.name, 'Test Cafe'); assert.equal(renderInput.brand.primary, '#112233'); assert.match(renderInput.audio, /^data:audio\/mpeg;base64,/); assert.equal(renderInput.words.length > 5, true);
    await assert.rejects(service.generate({templateId: 'bold-hook', ...brand, script: JSON.stringify(script), voiceId: 'voice1234567'}, {buffer: Buffer.from('not an image at all')}), error => error.status === 415);
    await assert.rejects(service.generate({templateId: 'bold-hook', ...brand, script: '{bad', voiceId: 'voice1234567'}), error => error.status === 400);
    await assert.rejects(service.generate({templateId: 'bold-hook', ...brand, script: JSON.stringify(script)}), error => error.status === 400);
    assert.equal(voiceCalls, 1, 'rejected requests never call ElevenLabs');
    const failingRender = await createCreateService({dataDir, voice, provider, render: async () => { throw new Error('render broke'); }});
    const broken = await failingRender.generate({templateId: 'bold-hook', ...brand, script: JSON.stringify(script), voiceId: 'voice1234567'});
    await failingRender.idle(); assert.equal(failingRender.get(broken.id).status, 'failed'); assert.equal(failingRender.file(broken.id), null);
  } finally { await rm(dataDir, {recursive: true, force: true}); }
});

test('create HTTP API lists templates and reports setup without exposing keys', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'pulse-create-http-'));
  const app = await createApp({dataDir, analysisConfig: {apiKey: 'test-key'}, createConfig: {voice: {configured: false, voices: async () => []}}});
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/create`;
  try {
    let response = await fetch(`${base}/templates`); assert.deepEqual((await response.json()).templates.map(item => item.id), ['motion', 'bold-hook', 'product-reveal', 'story-captions']);
    response = await fetch(`${base}/setup`); const setup = await response.json(); assert.equal(setup.voice, false); assert.ok(!JSON.stringify(setup).includes('test-key'));
    response = await fetch(`${base}/videos/missing`); assert.equal(response.status, 404);
    response = await fetch(`${base}/videos/missing/file`); assert.equal(response.status, 404);
    response = await fetch(`${base}/script`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({templateId: 'bold-hook'})}); assert.equal(response.status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dataDir, {recursive: true, force: true}); }
});

test('quick create: brand name + description in; AI plan, matching voice and matched style out', async () => {
  const {pickVoice} = await import('../src/create/quick.js');
  const voices = [{id: 'voiceAAAAAAAAAA', name: 'Roger - Laid-Back, Casual', category: 'premade'}, {id: 'voiceBBBBBBBBBB', name: 'Laura - Enthusiast, Quirky', category: 'premade'}, {id: 'voiceCCCCCCCCCC', name: 'Charlie - Deep, Confident', category: 'premade'}];
  assert.equal(pickVoice(voices, 'energetic').id, 'voiceBBBBBBBBBB'); assert.equal(pickVoice(voices, 'confident').id, 'voiceCCCCCCCCCC'); assert.equal(pickVoice(voices, 'warm').id, 'voiceAAAAAAAAAA');
  const dataDir = await mkdtemp(path.join(tmpdir(), 'pulse-quick-'));
  try {
    let voiceUsed = null, renderInput = null, planInput = null;
    const voice = {configured: true, voices: async () => voices, async synthesize(text, id) { voiceUsed = id; return {audioBase64: 'AAAA', alignment: fakeAlignment(text), cached: false}; }};
    const provider = {models: {vision: 'test-only'}, async structured(name, _schema, _instructions, input) { assert.ok(['quick_ad_plan', 'motion_ad_plan'].includes(name)); planInput = input; return {data: {script, tagline: 'Test tagline here', colors: {primary: '#123456', accent: '#ffcc00', background: '#000000'}, voice: 'energetic', icons: ['Coffee', 'NotAnIcon', 'Clock', 'MapPin'], emphasis: ['coffee', 'beans', 'latte', 'open']}}; }};
    const reference = {advertiser: 'Test Advertiser', transparencyUrl: 'https://example.invalid/ad', creativeId: 'CR1', style: {pace: 'fast', cutInterval: 1.2, reasons: ['test'], blueprint: {pace: 'fast', cuts: [.2, .4, .6], brandEarly: true, textHeavy: true, ctaFound: true}}};
    const service = await createCreateService({dataDir, voice, provider, render: async ({inputProps, output}) => { renderInput = inputProps; await writeFile(output, 'test'); }, inspiration: id => id === 'CR1' ? reference : null});
    // Motion Pro (no reference ad): AI picks icons and emphasis; unknown icons fall back safely.
    await assert.rejects(service.quick({brandName: 'Test Cafe', description: 'Test-only cafe description.'}), error => error.status === 400 && /logo/i.test(error.message));
    const motionJob = await service.quick({brandName: 'Test Cafe', description: 'Test-only cafe description.', style: 'pastel and calm'}, TEST_LOGO);
    await service.idle();
    assert.equal(service.get(motionJob.id).templateId, 'motion'); assert.equal(service.get(motionJob.id).status, 'completed');
    assert.deepEqual(renderInput.motion.icons, ['Coffee', 'Sparkles', 'Clock', 'MapPin']); assert.equal(planInput.business.name, 'Test Cafe'); assert.equal(planInput.styleRequest, 'pastel and calm');
    assert.deepEqual(renderInput.motion.design, {font: 'clean', background: 'gradient', energy: 'balanced', corners: 'rounded', textCase: 'normal'}); assert.match(renderInput.brand.logo, /^data:image\/png;base64,/);
    // No format or music from the AI: safe defaults, and PULSE's own music bed + sound effects are attached.
    assert.equal(renderInput.motion.format, 'showcase'); assert.equal(renderInput.motion.music, 'premium'); assert.match(renderInput.music, /^data:audio\/mpeg;base64,/); assert.match(renderInput.sfx.whoosh, /^data:audio\/mpeg;base64,/);
    await assert.rejects(service.quick({inspirationId: 'missing', brandName: 'Test Cafe', description: 'Test description.'}, TEST_LOGO), error => error.status === 409);
    await assert.rejects(service.quick({inspirationId: 'CR1', brandName: 'Test Cafe'}, TEST_LOGO), error => error.status === 400);
    const job = await service.quick({inspirationId: 'CR1', brandName: 'Test Cafe', description: 'Test-only cafe description.'}, TEST_LOGO);
    await service.idle();
    const done = service.get(job.id);
    assert.equal(done.status, 'completed'); assert.equal(done.templateId, 'matched'); assert.equal(voiceUsed, 'voiceBBBBBBBBBB');
    assert.equal(done.aiPlan.voiceName, 'Laura - Enthusiast, Quirky'); assert.equal(done.inspiration.advertiser, 'Test Advertiser');
    assert.equal(renderInput.brand.primary, '#123456'); assert.deepEqual(renderInput.style.blueprint.cuts, [.2, .4, .6]);
    assert.equal(planInput.referenceStyle.pace, 'fast'); assert.equal(planInput.brand.name, 'Test Cafe');
  } finally { await rm(dataDir, {recursive: true, force: true}); }
});

test('motion plan: format, music, kickers and the user\'s offer are validated', async () => {
  const {motionProps} = await import('../src/create/motion.js');
  const props = motionProps({format: 'promo', music: 'upbeat', kickers: ['  New   this week ', 'x'.repeat(50)], offer: ' Buy 1 Take 1 ', icons: [], emphasis: [], design: {energy: 'calm'}});
  assert.equal(props.format, 'promo'); assert.equal(props.music, 'upbeat'); assert.equal(props.kickers[0], 'New this week'); assert.equal(props.kickers[1].length, 28); assert.equal(props.offer, 'Buy 1 Take 1');
  const fallback = motionProps({format: 'hack', music: 'loud', design: {energy: 'calm'}});
  assert.equal(fallback.format, 'showcase'); assert.equal(fallback.music, 'chill'); assert.equal(fallback.offer, null);
});
