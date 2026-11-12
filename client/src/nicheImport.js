export const exportHelp='In SocialMonitor, open global Settings → Data → Export everything. Use its version-1 transfer file, not the overview JSON.';

// Shallow format preflight only. The server remains the canonical record validator.
export function inspectNicheExport(text) {
  let dump;
  try {dump=JSON.parse(text);}
  catch {throw new Error(`Invalid JSON: the file could not be parsed. ${exportHelp}`);}
  if(dump?.app!=='socialmonitor'||dump.version!==1||!Array.isArray(dump.tables?.profiles)||!Array.isArray(dump.tables?.posts)) {
    throw new Error(`Incorrect export format: expected app="socialmonitor", version=1, tables.profiles and tables.posts. ${exportHelp}`);
  }
  return dump;
}
export function nicheImportError(failure,dump,profileUrl) {
  if(failure.code==='PROFILE_NOT_FOUND')return 'Missing TikTok profile: this export has no matching TikTok account. Check the profile URL and exported brand.';
  if(failure.code==='SOURCE_UNSUPPORTED')return 'Unsupported platform: this importer accepts TikTok profile exports only. Instagram and Facebook are not supported.';
  if(failure.code==='NO_VIDEO_POSTS') {
    const canonical=value=>value.trim().replace(/\/$/,'').toLowerCase().replace(/^https:\/\/(?:www\.)?tiktok\.com\//,'https://www.tiktok.com/');
    const account=canonical(profileUrl);
    const ids=new Set(dump.tables.profiles.filter(row=>row.network==='tiktok'&&typeof row.url==='string'&&canonical(row.url)===account).map(row=>row.id));
    const candidates=dump.tables.posts.filter(row=>ids.has(row.profile_id)&&row.network==='tiktok'&&row.kind==='video');
    return candidates.length
      ? 'Invalid video records: the matching profile has video rows, but none passed validation. Check post IDs, account-specific permalinks, metric types and timestamps. No report was saved.'
      : 'Matching TikTok profile, zero video posts: configuring an account does not populate its data. Supply an existing permitted export containing video posts. No report was saved.';
  }
  if(failure.code==='INVALID_EXPORT')return `${failure.message} ${exportHelp}`;
  return failure.message;
}
