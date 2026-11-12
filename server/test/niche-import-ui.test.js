import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectNicheExport,nicheImportError,exportHelp} from '../../client/src/nicheImport.js';

test('import diagnostics distinguish malformed JSON, overview JSON, missing profile, zero videos, invalid rows and platform',()=>{
  assert.throws(()=>inspectNicheExport('{'),/Invalid JSON/);
  assert.throws(()=>inspectNicheExport(JSON.stringify({brand:'Overview',posts:0})),/Incorrect export format/);
  const url='https://tiktok.com/@local_test';
  const dump=inspectNicheExport(JSON.stringify({app:'socialmonitor',version:1,tables:{profiles:[{id:1,network:'tiktok',url:'https://www.tiktok.com/@local_test',handle:'local_test'}],posts:[]}}));
  const failure=code=>({code,message:'Server diagnostic'});
  assert.match(nicheImportError(failure('PROFILE_NOT_FOUND'),dump,url),/Missing TikTok profile/);
  assert.match(nicheImportError(failure('NO_VIDEO_POSTS'),dump,url),/zero video posts/);
  dump.tables.posts.push({profile_id:1,network:'tiktok',kind:'video',ext_id:'invalid'});
  assert.match(nicheImportError(failure('NO_VIDEO_POSTS'),dump,url),/Invalid video records/);
  assert.match(nicheImportError(failure('SOURCE_UNSUPPORTED'),dump,url),/Unsupported platform/);
  assert.match(nicheImportError(failure('INVALID_EXPORT'),dump,url),/Server diagnostic.*Settings/);
  assert.equal(nicheImportError(failure('RATE_LIMIT'),dump,url),'Server diagnostic');
  assert.match(exportHelp,/Settings → Data → Export everything/);
});
