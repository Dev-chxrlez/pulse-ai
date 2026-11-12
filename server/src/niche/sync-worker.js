// Independent, short-lived local transfer. Never import SocialMonitor's server or openDb.
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {approvedExport} from './sync-export.js';

const audited={
  'transfer.ts':'f19a657226cb5f4ed2f0ebce1f38d5a18c190854f6778ab8a300fa499c3325ff',
  'types.ts':'bb929a8400aa98bff2a08c0365dddc006a60ae6dd67c579998739c917661901e',
};
let db;
try {
  const [root,database,profileUrl]=process.argv.slice(2);
  if(!root||!database||!path.isAbsolute(root)||!path.isAbsolute(database))throw Error('Source configuration');
  for(const [name,digest] of Object.entries(audited)) {
    const bytes=await readFile(path.join(root,'apps/app/src/core',name));
    if(createHash('sha256').update(bytes).digest('hex')!==digest)throw Object.assign(Error(),{code:'SOURCE_VERSION'});
  }
  const {exportAll}=await import(pathToFileURL(path.join(root,'apps/app/src/core/transfer.ts')).href);
  db=new DatabaseSync(database,{readOnly:true});
  db.exec('PRAGMA query_only=ON; BEGIN');
  const dump=approvedExport(db,exportAll,profileUrl);
  db.exec('COMMIT');
  process.stdout.write(JSON.stringify({dump}));
} catch(error) {
  // Never emit upstream errors, SQL, filesystem paths, stderr, or raw source records.
  const safe=['PROFILE_NOT_FOUND','AMBIGUOUS_PROFILE','SYNC_EMPTY','NO_VIDEO_POSTS','INVALID_EXPORT','SOURCE_UNSUPPORTED','INVALID_PROFILE'];
  process.stdout.write(JSON.stringify({error:safe.includes(error.code)?{code:error.code,message:error.message,status:error.status}:{code:error.code==='SOURCE_VERSION'?'SOURCE_VERSION':'SOURCE_UNAVAILABLE',message:error.code==='SOURCE_VERSION'?'The local export source differs from the audited version. Sync is disabled until it is reviewed.':'The configured local export source or database is unavailable.',status:503}}));
} finally {db?.close();}
