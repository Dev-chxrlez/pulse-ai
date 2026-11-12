import {parseTikTokProfile,NicheError} from './socialmonitor.js';
const pick=(row,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]]));
export function approvedExport(db,exportAll,profileUrl) {
  const profile=parseTikTokProfile(profileUrl);
  const matches=db.prepare("SELECT id,brand_id,url,handle FROM profiles WHERE network = 'tiktok'").all().filter(row=>{
    try{return parseTikTokProfile(row.url).profileUrl===profile.profileUrl&&String(row.handle).replace(/^@/,'').toLowerCase()===profile.account;}catch{return false;}
  });
  if(!matches.length)throw new NicheError('PROFILE_NOT_FOUND','The selected TikTok account is not configured in local SocialMonitor.',422);
  if(matches.length>1)throw new NicheError('AMBIGUOUS_PROFILE','This TikTok account belongs to multiple source brands. Use a brand-scoped manual export.',409);
  const selected=matches[0];
  if(!db.prepare('SELECT count(*) AS count FROM posts').get().count)throw new NicheError('SYNC_EMPTY','SocialMonitor contains zero posts. No import was performed and no collection was started.',422);
  const dump=exportAll(db,selected.brand_id);
  if(dump?.app!=='socialmonitor'||dump.version!==1||!Array.isArray(dump.tables?.profiles)||!Array.isArray(dump.tables?.posts))throw new NicheError('INVALID_EXPORT','Local SocialMonitor returned an unsupported JSON export format.',422);
  const rows=dump.tables.posts.filter(row=>row.profile_id===selected.id&&row.network==='tiktok');
  if(!rows.some(row=>row.kind==='video'))throw new NicheError('NO_VIDEO_POSTS','The matching TikTok profile has zero video posts. No existing report was replaced.',422);
  return {app:dump.app,version:dump.version,exported_at:dump.exported_at,tables:{
    profiles:dump.tables.profiles.filter(row=>row.id===selected.id).map(row=>pick(row,['id','network','url','handle','last_status'])),
    posts:rows.map(row=>pick(row,['profile_id','network','ext_id','url','kind','caption','posted_at','fetched_at','views','likes','comments_count','shares'])),
  }};
}
