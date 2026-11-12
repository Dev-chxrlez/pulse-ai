// SerpApi client for Google Ads Transparency Center data. Credit-saving rules:
// every response is cached on disk forever (same request = 0 searches), nothing runs automatically,
// and the account check uses SerpApi's free account endpoint.
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

export class TrendError extends Error { constructor(code, message, status = 502) { super(message); this.code = code; this.status = status; } }

export function createSerpApi({apiKey = process.env.SERPAPI_API_KEY, cacheDir, request = fetch}) {
  async function get(url) {
    let response;
    try { response = await request(url, {signal: AbortSignal.timeout(45000)}); }
    catch { throw new TrendError('TRENDS_UNAVAILABLE', 'SerpApi could not be reached. Check your connection.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
      const message = String(data.error || '');
      if (response.status === 401 || /invalid api key/i.test(message)) throw new TrendError('TRENDS_KEY', 'SerpApi rejected the API key. Check SERPAPI_API_KEY.', 503);
      if (response.status === 429 || /run out of searches|plan/i.test(message)) throw new TrendError('TRENDS_QUOTA', 'Your SerpApi searches are used up for this month. Cached results still work.', 429);
      if (/hasn't returned any results|no results/i.test(message)) return {ad_creatives: [], serpapiMessage: message};
      throw new TrendError('TRENDS_FAILED', 'SerpApi could not complete the search. Try different keywords.');
    }
    return data;
  }
  async function cached(params) {
    if (!apiKey) throw new TrendError('TRENDS_SETUP', 'Add SERPAPI_API_KEY to server/.env and restart the backend.', 503);
    const key = createHash('sha256').update(JSON.stringify(params)).digest('hex');
    const file = path.join(cacheDir, `${key}.json`);
    try { return {...JSON.parse(await readFile(file, 'utf8')), cached: true}; } catch { /* not cached: costs one search */ }
    const url = new URL('https://serpapi.com/search.json');
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    url.searchParams.set('api_key', apiKey);
    const data = await get(url);
    const saved = {data, fetchedAt: new Date().toISOString()};
    await mkdir(cacheDir, {recursive: true, mode: 0o700});
    await writeFile(file, JSON.stringify(saved), {mode: 0o600});
    return {...saved, cached: false};
  }
  return {
    configured: Boolean(apiKey),
    // Free: SerpApi does not count account requests as searches.
    async account() {
      if (!apiKey) return null;
      const data = await get(`https://serpapi.com/account.json?api_key=${encodeURIComponent(apiKey)}`);
      return {searchesLeft: data.total_searches_left ?? data.plan_searches_left ?? null, monthly: data.searches_per_month ?? null, used: data.this_month_usage ?? null};
    },
    // YouTube placements: video ads with a playable video (Play-store ads are screenshots only).
    search: ({text, region}) => cached({engine: 'google_ads_transparency_center', text, region, creative_format: 'video', platform: 'YOUTUBE', num: '40'}),
    details: ({advertiserId, creativeId, region}) => cached({engine: 'google_ads_transparency_center_ad_details', advertiser_id: advertiserId, creative_id: creativeId, region}),
  };
}

// "Trending" proxy: still running recently AND long-running (advertisers keep paying for ads that work).
export function rankAds(creatives, now = Date.now()) {
  const day = 86400000;
  const time = value => typeof value === 'number' ? value * (value < 1e12 ? 1000 : 1) : Date.parse(value || '') || null;
  return (creatives || []).map(ad => {
    const last = time(ad.last_shown_datetime ?? ad.last_shown);
    const first = time(ad.first_shown_datetime ?? ad.first_shown);
    const days = Number.isFinite(ad.total_days_shown) ? ad.total_days_shown : first && last ? Math.max(1, Math.round((last - first) / day)) : null;
    const active = last ? now - last < 14 * day : false;
    return {advertiser: ad.advertiser || 'Unknown advertiser', advertiserId: ad.advertiser_id, creativeId: ad.ad_creative_id, format: ad.format, transparencyUrl: ad.details_link || ad.link || null, firstShown: first ? new Date(first).toISOString() : null, lastShown: last ? new Date(last).toISOString() : null, daysRunning: days, active, image: ad.image || ad.thumbnail || null, score: (active ? 1000 : 0) + (days || 0)};
  }).filter(ad => ad.advertiserId && ad.creativeId).sort((a, b) => b.score - a.score);
}
