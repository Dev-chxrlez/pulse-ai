// Independent adapter: no SocialMonitor runtime, browser sessions, or network calls.
export const SOCIALMONITOR_COMMIT = '53302c9704a50dd3aea2518df08c35637d0e2b2b';
export class NicheError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export const SOURCE_STATUS = {
  mode: 'json_import', liveCollection: false, status: 'source_unsupported',
  message: 'Live collection is not enabled: the audited TikTok collector includes a protected-page browser fallback. Import a permitted SocialMonitor JSON export instead. No social credentials or cookies are used or retained.',
};
export function parseTikTokProfile(value) {
  if(typeof value !== 'string' || value.length > 500) throw new NicheError('INVALID_PROFILE','Enter a TikTok HTTPS profile URL.');
  let url;
  try { url = new URL(value.trim()); } catch { throw new NicheError('INVALID_PROFILE','Enter a complete TikTok HTTPS profile URL.'); }
  if(['instagram.com','www.instagram.com'].includes(url.hostname)) throw new NicheError('SOURCE_UNSUPPORTED','Instagram is not supported by this TikTok-only proof of concept.',422);
  if(url.protocol !== 'https:' || url.username || url.password || url.port || !['www.tiktok.com','tiktok.com'].includes(url.hostname)) throw new NicheError('INVALID_PROFILE','Use https://www.tiktok.com/@account. Other hosts and credentials are not accepted.');
  const match = /^\/@([A-Za-z0-9._]{1,64})\/?$/.exec(url.pathname);
  if(!match) throw new NicheError('INVALID_PROFILE','Enter a profile URL, not a video, shortened link, or search page.');
  return { platform: 'tiktok', account: match[1].toLowerCase(), profileUrl: `https://www.tiktok.com/@${match[1].toLowerCase()}` };
}
export async function collectProfile(value) {
  parseTikTokProfile(value);
  throw new NicheError('SOURCE_UNSUPPORTED',SOURCE_STATUS.message,409);
}
function timestamp(value, field) {
  if(value === undefined || value === null || value === '') return null;
  if(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`Invalid ${field}. Use an ISO timestamp with timezone or null.`);
  const date = value.slice(0,10);
  if(new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date) throw new Error(`Invalid ${field} calendar date.`);
  return new Date(value).toISOString();
}
function metric(value,field) {
  if(value === undefined || value === null) return null;
  if(!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${field}: expected a non-negative integer or null.`);
  return value;
}
export function normalizeSocialMonitor(dump, profileUrl) {
  const profile = parseTikTokProfile(profileUrl);
  if(dump?.app !== 'socialmonitor' || dump.version !== 1 || !Array.isArray(dump.tables?.profiles) || !Array.isArray(dump.tables?.posts)) throw new NicheError('INVALID_EXPORT','Choose the SocialMonitor version-1 JSON export with tables.profiles and tables.posts, not a database backup or MCP text.');
  if(dump.tables.posts.length > 5000 || dump.tables.profiles.length > 1000) throw new NicheError('EXPORT_LIMIT','Export a single brand: at most 5,000 source posts and 1,000 profiles are accepted.',413);
  const profiles = dump.tables.profiles.filter(row => {
    if(row.network !== 'tiktok') return false;
    try { return parseTikTokProfile(row.url).profileUrl === profile.profileUrl && typeof row.handle === 'string' && row.handle.replace(/^@/,'').toLowerCase() === profile.account; } catch { return false; }
  });
  if(!profiles.length) throw new NicheError('PROFILE_NOT_FOUND','This export has no matching TikTok profile. Check the selected account or export another brand.',422);
  const ids = new Set(profiles.map(row => row.id));
  if(profiles.some(row => !Number.isSafeInteger(row.id))) throw new NicheError('INVALID_EXPORT','The export contains invalid profile identifiers.');
  const posts = new Map(); const warnings = []; let duplicates = 0; let skipped = 0;
  const sourceRows = dump.tables.posts.filter(row => ids.has(row.profile_id) && row.network === 'tiktok');
  for(const row of sourceRows) {
    if(row.kind !== 'video') { skipped++; continue; }
    try {
      if(typeof row.ext_id !== 'string' || !/^\d{1,40}$/.test(row.ext_id)) throw new Error('Invalid TikTok post ID.');
      const url = new URL(row.url);
      const expected = `/@${profile.account}/video/${row.ext_id}`;
      if(url.protocol !== 'https:' || url.username || url.password || url.port || !['www.tiktok.com','tiktok.com'].includes(url.hostname) || url.pathname.replace(/\/$/,'').toLowerCase() !== expected) throw new Error('Post URL does not match the selected account and post ID.');
      if(row.caption !== undefined && row.caption !== null && (typeof row.caption !== 'string' || row.caption.length > 5000)) throw new Error('Invalid or oversized caption.');
      const publishedAt = timestamp(row.posted_at,'posted_at');
      const collectedAt = timestamp(row.fetched_at,'fetched_at');
      if(publishedAt && collectedAt && Date.parse(collectedAt) < Date.parse(publishedAt)) throw new Error('Collection timestamp precedes publication.');
      const post = { platform: 'tiktok', profileUrl: profile.profileUrl, account: profile.account, postId: row.ext_id, postUrl: `https://www.tiktok.com${expected}`, mediaUrl: null, publishedAt, description: row.caption ?? '', metrics: { views: metric(row.views,'views'), likes: metric(row.likes,'likes'), comments: metric(row.comments_count,'comments_count'), shares: metric(row.shares,'shares') }, collectedAt, source: 'socialmonitor', matchedVideoId: null };
      if(posts.has(post.postId)) {
        duplicates++;
        const prior = posts.get(post.postId);
        if(Date.parse(post.collectedAt || '') > Date.parse(prior.collectedAt || '') || (!prior.collectedAt && post.collectedAt)) posts.set(post.postId,post);
      } else posts.set(post.postId,post);
    } catch(error) { skipped++; warnings.push(error.message); }
  }
  const selected = [...posts.values()].sort((a,b)=>(Date.parse(b.publishedAt || '') || -Infinity) - (Date.parse(a.publishedAt || '') || -Infinity) || a.postId.localeCompare(b.postId)).slice(0,5);
  if(!selected.length) throw new NicheError('NO_VIDEO_POSTS','No valid video posts for this profile were found in the export.',422);
  const failed = profiles.some(row => row.last_status === 'error');
  const authorization = failed && profiles.some(row => /auth|login|sign.?in|captcha|challenge|forbidden|401|403/i.test(String(row.last_error || '')));
  return { ...profile, posts: selected, warnings: [...new Set(warnings)].slice(0,20), duplicates, skipped, truncated: Math.max(0,posts.size-5), collectionStatus: authorization ? 'authorization_required' : failed ? 'collection_failed' : 'exported_metadata', source: 'socialmonitor', provenance: { method: 'user_supplied_json', auditedCommit: SOCIALMONITOR_COMMIT, exportedAt: timestamp(dump.exported_at,'exported_at'), independentlyVerified: false } };
}
