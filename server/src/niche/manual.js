// Manual post entry: the user types metrics they can see in their own app/analytics.
// No social request is made. Values are user-supplied and never independently verified.
import { NicheError } from './socialmonitor.js';
import { facebookUrl, LinkError } from '../links/network.js';

export const MANUAL_POST_LIMIT = 50;
export const METRIC_KEYS = ['views', 'likes', 'comments', 'shares', 'saves'];
export const PLATFORMS = ['tiktok', 'instagram', 'facebook'];
const profileBase = { tiktok: 'https://www.tiktok.com/@', instagram: 'https://www.instagram.com/', facebook: 'https://www.facebook.com/' };
const handlePattern = { tiktok: /^[a-z0-9._]{1,64}$/, instagram: /^[a-z0-9._]{1,64}$/, facebook: /^[a-z0-9.-]{1,100}$/ };

// A pasted profile URL is accepted too; its host decides the platform.
function profileFromUrl(value) {
  let link;
  try { link = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); } catch { return null; }
  const host = link.hostname.toLowerCase().replace(/^(www|m|web)\./, '');
  const segment = decodeURIComponent(link.pathname.split('/').filter(Boolean)[0] || '');
  if (host === 'tiktok.com') return { platform: 'tiktok', handle: segment.startsWith('@') ? segment.slice(1) : '' };
  if (host === 'instagram.com') return { platform: 'instagram', handle: segment };
  if (host === 'facebook.com') return { platform: 'facebook', handle: segment === 'profile.php' ? link.searchParams.get('id') || '' : segment };
  return null;
}
export function parseManualProfile({ platform, account } = {}) {
  let handle = typeof account === 'string' ? account.trim() : '';
  if (/^(https?:\/\/)?([a-z0-9-]+\.)*(tiktok|instagram|facebook)\.com(\/|$)/i.test(handle)) {
    const parsed = profileFromUrl(handle);
    if (!parsed?.handle) throw new NicheError('INVALID_PROFILE', 'That link is not a profile. Paste the profile address (e.g. https://www.tiktok.com/@yourbrand) or just the handle.');
    ({ platform, handle } = parsed);
  }
  if (!PLATFORMS.includes(platform)) throw new NicheError('INVALID_PLATFORM', 'Choose TikTok, Instagram, or Facebook.');
  handle = handle.replace(/^@/, '').toLowerCase();
  if (!handlePattern[platform].test(handle)) throw new NicheError('INVALID_PROFILE', 'Enter the handle (e.g. @yourbrand) or paste the profile link.');
  return { platform, account: handle, profileUrl: profileBase[platform] + handle };
}

function url(value) {
  try { if (typeof value !== 'string' || value.length > 2000) throw Error(); return new URL(value.trim()); }
  catch { throw new NicheError('INVALID_POST_URL', 'Paste the complete https:// link to one post.'); }
}

// Returns {platform, postId, postUrl, account|null}. account is only set when the URL itself names it.
export function parsePostUrl(value) {
  const link = url(value);
  if (link.protocol !== 'https:' || link.username || link.password || link.port) throw new NicheError('INVALID_POST_URL', 'Use an https:// post link without credentials or custom ports.');
  const host = link.hostname.toLowerCase();
  if (['vm.tiktok.com', 'vt.tiktok.com'].includes(host)) throw new NicheError('INVALID_POST_URL', 'Short TikTok links are not accepted. Open the link in a browser and copy the full tiktok.com/@account/video/… address.');
  if (['www.tiktok.com', 'tiktok.com', 'm.tiktok.com'].includes(host)) {
    const match = /^\/@([A-Za-z0-9._]{1,64})\/video\/(\d{1,40})\/?$/.exec(link.pathname);
    if (!match) throw new NicheError('INVALID_POST_URL', 'Use a TikTok video link like https://www.tiktok.com/@account/video/123….');
    const account = match[1].toLowerCase();
    return { platform: 'tiktok', account, postId: match[2], postUrl: `https://www.tiktok.com/@${account}/video/${match[2]}` };
  }
  if (['www.instagram.com', 'instagram.com', 'm.instagram.com'].includes(host)) {
    const match = /^\/(?:([A-Za-z0-9._]{1,64})\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,64})\/?$/.exec(link.pathname);
    if (!match) throw new NicheError('INVALID_POST_URL', 'Use an Instagram post or Reel link like https://www.instagram.com/reel/ABC123/.');
    const kind = match[2] === 'reels' ? 'reel' : match[2];
    return { platform: 'instagram', account: match[1]?.toLowerCase() || null, postId: match[3], postUrl: `https://www.instagram.com/${kind}/${match[3]}/` };
  }
  if (host === 'fb.watch') throw new NicheError('INVALID_POST_URL', 'Short fb.watch links are not accepted. Open the link and copy the full facebook.com address.');
  if (host === 'facebook.com' || host.endsWith('.facebook.com')) {
    let canonical;
    try { canonical = new URL(facebookUrl(link.href)); }
    catch (error) { throw new NicheError('INVALID_POST_URL', error instanceof LinkError ? error.message : 'Use an individual Facebook video, Reel, or share link.'); }
    const path = canonical.pathname;
    let match;
    if ((match = /^\/reel\/(\d+)/.exec(path))) return { platform: 'facebook', account: null, postId: match[1], postUrl: `https://www.facebook.com/reel/${match[1]}/` };
    if ((match = /^\/share\/([vr])\/([A-Za-z0-9]+)/.exec(path))) return { platform: 'facebook', account: null, postId: `share-${match[2]}`, postUrl: `https://www.facebook.com/share/${match[1]}/${match[2]}/` };
    if ((match = /^\/([^/]+)\/videos\/(?:[^/]+\/)?(\d+)/.exec(path))) return { platform: 'facebook', account: decodeURIComponent(match[1]).toLowerCase(), postId: match[2], postUrl: `https://www.facebook.com/${match[1]}/videos/${match[2]}/` };
    const id = canonical.searchParams.get('v');
    return { platform: 'facebook', account: null, postId: id, postUrl: `https://www.facebook.com/watch/?v=${id}` };
  }
  throw new NicheError('INVALID_POST_URL', 'Use a TikTok, Instagram, or Facebook post link.');
}

function count(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const number = typeof value === 'string' && /^\s*\d[\d,\s]*$/.test(value) ? Number(value.replace(/[,\s]/g, '')) : value;
  if (!Number.isSafeInteger(number) || number < 0) throw new NicheError('INVALID_METRIC', `${field} must be a whole number of 0 or more, or left blank if unknown. Use exact counts, not rounded values like 1.2K.`);
  return number;
}
function moment(value, field, { required }) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new NicheError('INVALID_DATE', `Enter the ${field}.`);
    return null;
  }
  if (typeof value !== 'string') throw new NicheError('INVALID_DATE', `Invalid ${field}.`);
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(iso) || !Number.isFinite(Date.parse(iso))) throw new NicheError('INVALID_DATE', `Invalid ${field}. Use a calendar date.`);
  const day = iso.slice(0, 10);
  if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) throw new NicheError('INVALID_DATE', `Invalid ${field} calendar date.`);
  return new Date(iso).toISOString();
}

// Validates a full or partial post entry. `existing` supplies unchanged fields on edit.
export function manualPostFields(input = {}, existing = null, now = Date.now()) {
  if (!input || typeof input !== 'object') throw new NicheError('INVALID_POST', 'Provide the post details.');
  const has = key => Object.hasOwn(input, key);
  const publishedAt = has('publishedAt') || !existing ? moment(input.publishedAt, 'publication date', { required: true }) : existing.publishedAt;
  // Default "measured now"; never earlier than a date-only publication (midnight UTC can be ahead of local time).
  const measuredNow = new Date(Math.max(now, Date.parse(publishedAt))).toISOString();
  // New metric values are a new measurement unless the user states when they were read.
  const collectedAt = has('collectedAt') ? (moment(input.collectedAt, 'measurement date', { required: false }) ?? measuredNow) : existing && !has('metrics') ? existing.collectedAt : measuredNow;
  const tolerance = 36 * 3600 * 1000; // Date-only inputs are midnight UTC; allow local-timezone "today".
  if (Date.parse(publishedAt) > now + tolerance) throw new NicheError('INVALID_DATE', 'The publication date is in the future.');
  if (Date.parse(collectedAt) > now + tolerance) throw new NicheError('INVALID_DATE', 'The measurement date is in the future.');
  if (Date.parse(collectedAt) < Date.parse(publishedAt)) throw new NicheError('INVALID_DATE', 'The measurement date cannot be before the publication date.');
  let description = existing?.description ?? '';
  if (has('description')) {
    if (input.description !== null && typeof input.description !== 'string') throw new NicheError('INVALID_POST', 'Caption must be text.');
    description = (input.description ?? '').slice(0, 5000);
  }
  const prior = { saves: null, ...(existing?.metrics || { views: null, likes: null, comments: null, shares: null }) };
  const metrics = { ...prior };
  if (has('metrics')) {
    if (!input.metrics || typeof input.metrics !== 'object') throw new NicheError('INVALID_METRIC', 'Provide metrics as views, likes, comments, shares, and saves.');
    for (const key of METRIC_KEYS) if (Object.hasOwn(input.metrics, key)) metrics[key] = count(input.metrics[key], key);
  }
  // Counts the platform only shows rounded (e.g. Facebook "7.7K") are kept but flagged as approximate.
  let approximate = existing?.approximateMetrics || [];
  if (has('approximate')) {
    if (!Array.isArray(input.approximate)) throw new NicheError('INVALID_METRIC', 'approximate must be a list of metric names.');
    approximate = input.approximate;
  } else if (has('metrics')) approximate = approximate.filter(key => !Object.hasOwn(input.metrics, key));
  const approximateMetrics = [...new Set(approximate)].filter(key => METRIC_KEYS.includes(key) && metrics[key] !== null);
  return { publishedAt, collectedAt, description, metrics, approximateMetrics };
}
