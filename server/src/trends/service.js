import {createWriteStream} from 'node:fs';
import {mkdir, rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {pipeline} from 'node:stream/promises';
import {Readable, Transform} from 'node:stream';
import {createStore} from '../store.js';
import {createSerpApi, rankAds, TrendError} from './serpapi.js';
import {deriveStyle} from './style.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readdir} from 'node:fs/promises';
import {ytdlpBinary} from '../links/retrieve.js';
const run=promisify(execFile);

export const PH = '2608';
// Video files are only fetched from Google/YouTube media hosts returned by the ad details.
const mediaHost = host => /(^|\.)(googlevideo\.com|googleusercontent\.com|googlesyndication\.com|gstatic\.com|ytimg\.com|youtube\.com|google\.com|doubleclick\.net)$/i.test(host);

export async function createTrendService({dataDir, tempDir, maxBytes, storage, videos, analysis, serp: injected, request = fetch}) {
  const serp = injected || createSerpApi({cacheDir: path.join(dataDir, 'serpapi-cache')});
  const picks = await createStore(dataDir, 'trend-picks.json');
  const text = value => { const clean = typeof value === 'string' ? value.trim() : ''; if (clean.length < 2 || clean.length > 80) throw new TrendError('TRENDS_QUERY', 'Enter 2–80 characters to search, e.g. "milk tea" or "coffee".', 400); return clean; };
  // YouTube watch links: one plain yt-dlp download (no cookies, no impersonation, no retries).
  async function youtube(url) {
    const directory = path.join(tempDir, `yt-${randomUUID()}`);
    await mkdir(directory, {recursive: true, mode: 0o700});
    try {
      const binary = await ytdlpBinary();
      await run(binary, ['--ignore-config', '--no-cookies', '--no-playlist', '--retries', '0', '--socket-timeout', '20', '--max-filesize', String(maxBytes), '-f', 'best[ext=mp4][height<=1080]/best[ext=mp4]', '-o', 'video.%(ext)s', '--', url], {cwd: directory, timeout: 120000, env: {PATH: process.env.PATH, LANG: 'en_US.UTF-8'}});
      const [name] = (await readdir(directory)).filter(item => item.startsWith('video.'));
      if (!name) throw new Error('no file');
      const file = path.join(tempDir, `trend-${randomUUID()}.mp4`);
      await (await import('node:fs/promises')).rename(path.join(directory, name), file);
      return file;
    } catch { throw new TrendError('TRENDS_VIDEO', 'YouTube would not let PULSE download this ad. Upload a screen recording of it and attach it below.', 422); }
    finally { await rm(directory, {recursive: true, force: true}); }
  }
  async function download(url) {
    let link;
    try { link = new URL(url); } catch { throw new TrendError('TRENDS_VIDEO', 'The ad has no downloadable video link.', 422); }
    const embed = /^\/embed\/([\w-]{6,20})/.exec(link.pathname);
    if (link.protocol === 'https:' && /(^|\.)youtube\.com$/i.test(link.hostname) && embed) return youtube(`https://www.youtube.com/watch?v=${embed[1]}`);
    if (link.protocol === 'https:' && /(^|\.)youtube\.com$|^youtu\.be$/i.test(link.hostname) && /\/watch|youtu\.be\//.test(link.href)) return youtube(link.href);
    if (link.protocol !== 'https:' || !mediaHost(link.hostname)) throw new TrendError('TRENDS_VIDEO', 'This ad’s video is hosted where PULSE does not download from. Upload a screen recording of it instead.', 422);
    const response = await request(link, {signal: AbortSignal.timeout(60000), redirect: 'follow'}).catch(() => null);
    if (!response?.ok || !response.body) throw new TrendError('TRENDS_VIDEO', 'The ad video could not be downloaded. Upload a screen recording of it instead.', 422);
    await mkdir(tempDir, {recursive: true, mode: 0o700});
    const file = path.join(tempDir, `trend-${randomUUID()}`);
    let size = 0;
    try { await pipeline(Readable.fromWeb(response.body), new Transform({transform(chunk, _encoding, done) { size += chunk.length; done(size > maxBytes ? new TrendError('TRENDS_VIDEO', 'The ad video is larger than the upload limit.', 413) : null, chunk); }}), createWriteStream(file, {mode: 0o600})); }
    catch (error) { await rm(file, {force: true}); throw error instanceof TrendError ? error : new TrendError('TRENDS_VIDEO', 'The ad video download was interrupted. Try again or upload a screen recording.', 422); }
    return file;
  }
  return {
    configured: serp.configured,
    // Attach a video already in the library (e.g. a screen recording) to a picked ad; keeps attribution.
    remove: id => picks.transact(records => records.filter(item => item.id !== id)),
    async attach(creativeId, videoId) {
      if (!picks.get(creativeId)) throw new TrendError('TRENDS_AD', 'Pick the ad first.', 404);
      if (!videos.get(videoId)) throw new TrendError('TRENDS_AD', 'Choose a video from your library.', 400);
      await picks.update(creativeId, {status: 'imported', videoId, error: null, attachedManually: true});
      await analysis.enqueue(videoId);
      return picks.get(creativeId);
    },
    account: () => serp.account(),
    async search(query) {
      const result = await serp.search({text: text(query), region: PH});
      return {query: text(query), cached: result.cached, fetchedAt: result.fetchedAt, message: result.data.serpapiMessage || null, ads: rankAds(result.data.ad_creatives).slice(0, 40)};
    },
    inspiration(creativeId) { const pick = picks.get(creativeId); if (!pick) return null; return {advertiser: pick.advertiser, transparencyUrl: pick.transparencyUrl, creativeId: pick.id, style: deriveStyle(videos.get(pick.videoId))}; },
    picks: () => picks.list().map(pick => ({...pick, style: deriveStyle(videos.get(pick.videoId)), video: pick.videoId ? (({storageName: _hidden, ...video}) => ({...video, fileUrl: `/api/videos/${video.id}/file`}))(videos.get(pick.videoId) || {id: pick.videoId}) : null})),
    // Costs one search (cached forever), then downloads the video into the library and starts analysis.
    async importAd({advertiserId, creativeId, advertiser, transparencyUrl, daysRunning}) {
      if (!/^AR\d{5,30}$/.test(advertiserId || '') || !/^CR\d{5,30}$/.test(creativeId || '')) throw new TrendError('TRENDS_AD', 'Choose an ad from the search results.', 400);
      const existing = picks.get(creativeId);
      if (existing?.videoId && videos.get(existing.videoId)) return existing;
      const details = await serp.details({advertiserId, creativeId, region: PH});
      const creative = (details.data.ad_creatives || [])[0] || details.data;
      const source = {advertiser: advertiser || creative.advertiser || 'Unknown advertiser', advertiserId, creativeId, transparencyUrl: transparencyUrl || `https://adstransparency.google.com/advertiser/${advertiserId}/creative/${creativeId}?region=PH`, videoLink: creative.video_link || null, headline: creative.headline || null, callToAction: creative.call_to_action || null, screenshots: (creative.screenshots || []).slice(0, 6), daysRunning: Number.isFinite(daysRunning) ? daysRunning : null, pickedAt: new Date().toISOString()};
      await picks.transact(records => [...records.filter(item => item.id !== creativeId), {id: creativeId, ...source, importedAt: source.pickedAt, status: 'downloading', error: null}]);
      try {
        // Real videos only: ads without a downloadable video (app-install campaigns, blocked YouTube
        // embeds) are skipped. Their style is never guessed from screenshots.
        if (!creative.raw_video_link && !creative.video_link) throw new TrendError('TRENDS_NO_VIDEO', 'No video available: Google shows this ad only as screenshots (e.g. an app-install ad). Pick another ad.', 422);
        const file = await download(creative.raw_video_link || creative.video_link);
        // Name the file by its real container (YouTube often serves WebM), so the library accepts it.
        const detected = await (await import('file-type')).fileTypeFromFile(file).catch(() => null);
        const extension = {'video/webm': '.webm', 'video/quicktime': '.mov'}[detected?.mime] || '.mp4';
        const record = await storage.save({filename: file, originalName: `Trend - ${source.advertiser}`.replace(/[^\w .-]+/g, '').slice(0, 80) + extension, source: {kind: 'ads_transparency', ...source}});
        await picks.update(creativeId, {status: 'imported', videoId: record.id});
        await analysis.enqueue(record.id);
      } catch (error) {
        await picks.update(creativeId, {status: 'failed', error: {code: error.code || 'TRENDS_VIDEO', message: error instanceof TrendError ? error.message : 'The ad video could not be saved. Upload a screen recording of it instead.'}});
        if (!(error instanceof TrendError) && !error.status) throw error;
      }
      return picks.get(creativeId);
    },
  };
}
