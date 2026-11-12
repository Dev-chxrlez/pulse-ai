import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import path from 'node:path';
import {createTikTokConnector,REQUIRED_SCOPES} from './connector.js';
import {NicheError} from '../niche/socialmonitor.js';
let db;
try {
  const [root,database,mode,profileId]=process.argv.slice(2);
  if(!root||!database||!path.isAbsolute(root)||!path.isAbsolute(database)||!['status','acquire'].includes(mode))throw Error();
  db=new DatabaseSync(database,{readOnly:true});
  const profiles=db.prepare("SELECT id,brand_id,network,url,handle FROM profiles WHERE network='tiktok'").all();
  const profile=profileId?profiles.find(row=>String(row.id)===profileId):profiles.length===1?profiles[0]:null;
  if(!profile)throw new NicheError('TIKTOK_PROFILE_REQUIRED','Select one existing registered TikTok profile by its source profile ID.',409);
  let env={};try{env=parseEnv(await readFile(path.join(root,'.env'),'utf8'));}catch{/* Readiness reports missing configuration. */}
  const grant=db.prepare("SELECT open_id,access_token,refresh_token,expires_at,refresh_expires_at,scope FROM network_tokens WHERE brand_id=? AND network='tiktok'").get(profile.brand_id);
  if(mode==='status') {
    process.stdout.write(JSON.stringify({status:{registeredProfiles:profiles.length,selectedProfileId:profile.id,profileUrl:profile.url,authorizationStored:Boolean(grant),requiredScopes:REQUIRED_SCOPES,grantedScopes:grant?String(grant.scope||'').split(/[ ,]+/).filter(Boolean):[],configuration:{TIKTOK_CLIENT_KEY:Boolean(env.TIKTOK_CLIENT_KEY?.trim()),TIKTOK_CLIENT_SECRET:Boolean(env.TIKTOK_CLIENT_SECRET?.trim()),TIKTOK_REDIRECT_URI:Boolean(env.TIKTOK_REDIRECT_URI?.trim())},redirectConfigurationVerified:false}}));
  } else {
    const connector=createTikTokConnector({clientKey:env.TIKTOK_CLIENT_KEY,clientSecret:env.TIKTOK_CLIENT_SECRET});
    const result=await connector.acquire({profile,grant,saveGrant:async(updated,previous)=>{
      // Never migrate, alter source posts, or copy tokens to PULSE. CAS protects rotation.
      const writeDb=new DatabaseSync(database);
      try{const result=writeDb.prepare("UPDATE network_tokens SET access_token=?,refresh_token=?,expires_at=?,refresh_expires_at=?,scope=? WHERE brand_id=? AND network='tiktok' AND refresh_token=? AND open_id=?").run(updated.access_token,updated.refresh_token,updated.expires_at,updated.refresh_expires_at,updated.scope,profile.brand_id,previous,updated.open_id);if(result.changes!==1)throw new NicheError('TIKTOK_REFRESH_CONFLICT','The authorization changed during refresh. Retry after other token operations finish.',409);}finally{writeDb.close();}
    }});
    process.stdout.write(JSON.stringify({result}));
  }
} catch(error) {
  process.stdout.write(JSON.stringify({error:error instanceof NicheError?{code:error.code,message:error.message,status:error.status}:{code:'TIKTOK_LOCAL_SOURCE',message:'The configured local TikTok registration or authorization store is unavailable.',status:503}}));
} finally{db?.close();}
