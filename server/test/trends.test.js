import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createSerpApi, rankAds} from '../src/trends/serpapi.js';
import {deriveStyle} from '../src/trends/style.js';

// Test-only ad records; no SerpApi credits are used.
test('SerpApi responses are cached on disk: the same search never costs a second credit', async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'pulse-serp-'));
  try {
    let calls = 0;
    const request = async url => { calls++; assert.equal(url.searchParams.get('creative_format'), 'video'); assert.equal(url.searchParams.get('region'), '2608'); assert.equal(url.searchParams.get('platform'), 'YOUTUBE'); return Response.json({ad_creatives: [{advertiser: 'Test Co', advertiser_id: 'AR123456', ad_creative_id: 'CR123456', first_shown: 1700000000, last_shown: 1790000000, total_days_shown: 30}]}); };
    const serp = createSerpApi({apiKey: 'test-key', cacheDir, request});
    assert.equal((await serp.search({text: 'coffee', region: '2608'})).cached, false);
    assert.equal((await serp.search({text: 'coffee', region: '2608'})).cached, true);
    assert.equal(calls, 1);
    const reloaded = createSerpApi({apiKey: 'test-key', cacheDir, request});
    assert.equal((await reloaded.search({text: 'coffee', region: '2608'})).cached, true); assert.equal(calls, 1, 'cache survives a restart');
    await reloaded.search({text: 'milk tea', region: '2608'}); assert.equal(calls, 2);
    await assert.rejects(createSerpApi({apiKey: '', cacheDir, request}).search({text: 'x', region: '2608'}), error => error.code === 'TRENDS_SETUP');
    const quota = createSerpApi({apiKey: 'test-key', cacheDir, request: async () => Response.json({error: 'Your account has run out of searches.'}, {status: 429})});
    await assert.rejects(quota.search({text: 'new words', region: '2608'}), error => error.code === 'TRENDS_QUOTA');
  } finally { await rm(cacheDir, {recursive: true, force: true}); }
});

test('ranking prefers ads still running, then the longest-running; handles unix and date strings', () => {
  const now = Date.parse('2026-11-12T00:00:00Z'), sec = value => Date.parse(value) / 1000;
  const ranked = rankAds([
    {advertiser: 'Old', advertiser_id: 'AR1', ad_creative_id: 'CR1', first_shown: sec('2025-01-01'), last_shown: sec('2025-06-01'), total_days_shown: 150},
    {advertiser: 'Active short', advertiser_id: 'AR2', ad_creative_id: 'CR2', first_shown: '2026-11-01T00:00:00Z', last_shown: '2026-11-10T00:00:00Z'},
    {advertiser: 'Active long', advertiser_id: 'AR3', ad_creative_id: 'CR3', first_shown: sec('2026-08-01'), last_shown: sec('2026-11-11'), total_days_shown: 100},
    {advertiser: 'Missing ids'},
  ], now);
  assert.deepEqual(ranked.map(ad => ad.advertiser), ['Active long', 'Active short', 'Old']);
  assert.equal(ranked[1].daysRunning, 9); assert.equal(ranked[2].active, false);
});

test('style measurement uses only timing and structure from a completed analysis', () => {
  const frame = (index, timestamp) => ({index, timestamp});
  const video = {analysisStatus: 'completed', analysis: {metadata: {duration: 15}, sceneChanges: [1.2, 2.4, 3.6, 4.8, 6, 7.2, 8.4, 9.6, 10.8, 12], frames: [frame(0, 0), frame(1, 2)],
    report: {findings: [{category: 'on_screen_text', certainty: 'observed', evidence: [{source: 'frame', index: 0}]}, {category: 'call_to_action', certainty: 'observed', evidence: [{source: 'frame', index: 1}]}]}}};
  const style = deriveStyle(video);
  assert.equal(style.pace, 'fast'); assert.equal(style.templateId, 'bold-hook'); assert.equal(style.cutInterval, 1.4); assert.ok(style.ctaFound);
  video.analysis.report.findings.push({category: 'product', certainty: 'observed', evidence: [{source: 'frame', index: 1}]});
  assert.equal(deriveStyle(video).templateId, 'product-reveal'); assert.equal(deriveStyle(video).productAt, 2);
  assert.equal(deriveStyle({analysisStatus: 'processing'}), null);
});
