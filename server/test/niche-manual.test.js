import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parsePostUrl,parseManualProfile,manualPostFields} from '../src/niche/manual.js';
import {createNicheService} from '../src/niche/service.js';
import {createStore} from '../src/store.js';
import {createApp} from '../src/app.js';

// Hand-authored test fixtures, NOT real accounts or verified social metrics.
const now=Date.parse('2026-11-12T00:00:00Z');
const old=days=>new Date(now-days*86400000).toISOString().slice(0,10);

test('post links are parsed per platform; short, foreign and malformed links are refused',()=>{
  assert.deepEqual(parsePostUrl('https://www.tiktok.com/@Brand.X/video/7350000000000000001?lang=en'),{platform:'tiktok',account:'brand.x',postId:'7350000000000000001',postUrl:'https://www.tiktok.com/@brand.x/video/7350000000000000001'});
  assert.deepEqual(parsePostUrl('https://www.instagram.com/reels/C9abcDEF_12/'),{platform:'instagram',account:null,postId:'C9abcDEF_12',postUrl:'https://www.instagram.com/reel/C9abcDEF_12/'});
  assert.equal(parsePostUrl('https://instagram.com/brand/p/C9abcDEF12').account,'brand');
  assert.deepEqual(parsePostUrl('https://www.facebook.com/reel/969514082319139/'),{platform:'facebook',account:null,postId:'969514082319139',postUrl:'https://www.facebook.com/reel/969514082319139/'});
  assert.equal(parsePostUrl('https://m.facebook.com/share/v/1A2a3Ttsos/').postId,'share-1A2a3Ttsos');
  assert.equal(parsePostUrl('https://www.facebook.com/watch/?v=123456').postUrl,'https://www.facebook.com/watch/?v=123456');
  assert.equal(parsePostUrl('https://www.facebook.com/SomePage/videos/987654321/').account,'somepage');
  for(const value of ['not a link','http://www.tiktok.com/@a/video/1','https://vm.tiktok.com/ZMabc/','https://www.tiktok.com/@a','https://fb.watch/abc/','https://www.facebook.com/SomePage','https://www.instagram.com/brand/','https://youtube.com/watch?v=1','https://user:pw@www.tiktok.com/@a/video/1','https://www.tiktok.com.evil.invalid/@a/video/1'])
    assert.throws(()=>parsePostUrl(value),error=>error.code==='INVALID_POST_URL',value);
  assert.deepEqual(parseManualProfile({platform:'tiktok',account:'@Brand.X'}),{platform:'tiktok',account:'brand.x',profileUrl:'https://www.tiktok.com/@brand.x'});
  assert.throws(()=>parseManualProfile({platform:'youtube',account:'a'}),error=>error.code==='INVALID_PLATFORM');
  assert.deepEqual(parseManualProfile({platform:'tiktok',account:'https://www.tiktok.com/@YKcharles777?lang=en'}),{platform:'tiktok',account:'ykcharles777',profileUrl:'https://www.tiktok.com/@ykcharles777'});
  assert.equal(parseManualProfile({platform:'tiktok',account:'instagram.com/yk.chxrles/'}).platform,'instagram');
  assert.equal(parseManualProfile({platform:'tiktok',account:'https://m.facebook.com/Ch4rles.Gu4rin0'}).profileUrl,'https://www.facebook.com/ch4rles.gu4rin0');
  assert.equal(parseManualProfile({platform:'facebook',account:'https://www.facebook.com/profile.php?id=10001'}).account,'10001');
  for(const account of ['https://www.tiktok.com/','https://www.tiktok.com/explore'])assert.throws(()=>parseManualProfile({platform:'tiktok',account}),error=>error.code==='INVALID_PROFILE',account);
  assert.throws(()=>parseManualProfile({platform:'instagram',account:'has space'}),error=>error.code==='INVALID_PROFILE');
});

test('manual metrics keep unknown as null, accept exact counts, refuse rounded/negative values and impossible dates',()=>{
  const fields=manualPostFields({publishedAt:old(10),metrics:{views:'12,345',likes:0,comments:'',shares:null}},null,now);
  assert.deepEqual(fields.metrics,{views:12345,likes:0,comments:null,shares:null,saves:null});assert.deepEqual(fields.approximateMetrics,[]);
  assert.equal(fields.collectedAt,new Date(now).toISOString());assert.equal(fields.description,'');
  for(const views of ['1.2K',-1,1.5,'abc'])assert.throws(()=>manualPostFields({publishedAt:old(3),metrics:{views}},null,now),error=>error.code==='INVALID_METRIC',String(views));
  assert.throws(()=>manualPostFields({metrics:{}},null,now),error=>error.code==='INVALID_DATE');
  assert.throws(()=>manualPostFields({publishedAt:'2026-02-30'},null,now),error=>error.code==='INVALID_DATE');
  assert.throws(()=>manualPostFields({publishedAt:old(-5)},null,now),error=>error.code==='INVALID_DATE');
  assert.throws(()=>manualPostFields({publishedAt:old(3),collectedAt:old(5)},null,now),error=>error.code==='INVALID_DATE');
  const edited=manualPostFields({metrics:{likes:'7'}},fields,now);assert.equal(edited.metrics.views,12345);assert.equal(edited.metrics.likes,7);assert.equal(edited.publishedAt,fields.publishedAt);
});

test('manual reports: add/edit/remove posts, enforce account identity, coexist with imports and compare mature posts',async()=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'pulse-manual-'));
  try{
    const videos=await createStore(dataDir);await videos.add({id:'v1',originalName:'cut.mp4',uploadedAt:new Date().toISOString(),analysisStatus:'uploaded'});
    const service=await createNicheService({dataDir,videos});
    const report=await service.createManual({platform:'tiktok',account:'@fixture_brand'});
    assert.equal(report.source,'manual');assert.equal(report.posts.length,0);
    assert.equal((await service.createManual({platform:'tiktok',account:'fixture_brand'})).id,report.id);
    const link=id=>`https://www.tiktok.com/@fixture_brand/video/${id}`;
    let saved=await service.addPost(report.id,{postUrl:link(1),publishedAt:old(20),metrics:{views:100,likes:10,comments:1,shares:1}});
    saved=await service.addPost(report.id,{postUrl:link(2),publishedAt:old(12),metrics:{views:300,likes:30,comments:3,shares:3}});
    saved=await service.addPost(report.id,{postUrl:link(3),publishedAt:old(1),metrics:{views:50}});
    assert.deepEqual(saved.posts.map(post=>post.postId),['3','2','1']);
    assert.equal(saved.statistics.comparable,true);assert.deepEqual(saved.statistics.excludedPostIds,['3']);assert.equal(saved.statistics.viewsRanking[0].postId,'2');
    await assert.rejects(service.addPost(report.id,{postUrl:link(1),publishedAt:old(5)}),error=>error.code==='DUPLICATE_POST');
    await assert.rejects(service.addPost(report.id,{postUrl:'https://www.tiktok.com/@someone_else/video/9',publishedAt:old(5)}),error=>error.code==='ACCOUNT_MISMATCH');
    await assert.rejects(service.addPost(report.id,{postUrl:'https://www.instagram.com/reel/ABCDE1/',publishedAt:old(5)}),error=>error.code==='PLATFORM_MISMATCH');
    saved=await service.updatePost(report.id,'1',{metrics:{views:'1,000'}});assert.equal(saved.posts.find(post=>post.postId==='1').metrics.views,1000);assert.equal(saved.posts.find(post=>post.postId==='1').metrics.likes,10);
    await assert.rejects(service.updatePost(report.id,'1',{metrics:{views:'2K'}}),error=>error.code==='INVALID_METRIC');
    saved=await service.match(report.id,'1','v1');assert.equal(saved.posts.find(post=>post.postId==='1').matchedVideo.id,'v1');
    saved=await service.removePost(report.id,'3');assert.equal(saved.posts.length,2);
    // A later SocialMonitor import of the same account must not overwrite manual entries.
    const dump={app:'socialmonitor',version:1,exported_at:'2026-11-01T00:00:00Z',tables:{profiles:[{id:1,network:'tiktok',handle:'fixture_brand',url:'https://www.tiktok.com/@fixture_brand'}],posts:[{profile_id:1,network:'tiktok',ext_id:'77',url:link(77),kind:'video',posted_at:'2026-10-01T00:00:00Z',fetched_at:'2026-11-01T00:00:00Z',views:5}]}};
    const imported=await service.import(dump,'https://www.tiktok.com/@fixture_brand');assert.notEqual(imported.id,report.id);
    assert.equal(service.list().find(item=>item.id===report.id).posts.length,2);
    await assert.rejects(service.addPost(imported.id,{postUrl:link(5),publishedAt:old(5)}),error=>error.code==='NOT_MANUAL');
    await assert.rejects(service.updatePost(imported.id,'77',{metrics:{views:1}}),error=>error.code==='NOT_MANUAL');
    const reloaded=await createNicheService({dataDir,videos});assert.equal(reloaded.list().find(item=>item.id===report.id).posts.find(post=>post.postId==='1').matchedVideoId,'v1');
    await reloaded.remove(report.id);assert.equal(reloaded.list().length,1);assert.ok(videos.get('v1'));
  }finally{await rm(dataDir,{recursive:true,force:true});}
});

test('manual entry HTTP API validates bodies and persists across restart',async()=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'pulse-manual-http-'));
  let server;
  const start=async()=>{const app=await createApp({dataDir,analysisConfig:{apiKey:'test-key'}});server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));return `http://127.0.0.1:${server.address().port}`;};
  const stop=()=>new Promise(resolve=>server.close(resolve));
  const send=(base,route,method,body)=>fetch(`${base}/api/niche${route}`,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  try{
    let base=await start();
    let response=await send(base,'/manual','POST',{platform:'facebook',account:'fixture.page'});assert.equal(response.status,201);const {report}=await response.json();
    assert.equal(report.profileUrl,'https://www.facebook.com/fixture.page');
    response=await send(base,`/${report.id}/posts`,'POST',{postUrl:'https://www.facebook.com/reel/123456789/',publishedAt:old(30),metrics:{views:'4,200',likes:'12'},description:'Test caption'});assert.equal(response.status,201);
    let body=await response.json();assert.equal(body.report.posts[0].metrics.views,4200);assert.equal(body.report.posts[0].description,'Test caption');
    response=await send(base,`/${report.id}/posts`,'POST',{postUrl:'https://www.facebook.com/reel/123456789/',publishedAt:old(30)});assert.equal(response.status,409);
    response=await send(base,`/${report.id}/posts`,'POST',{postUrl:'https://www.tiktok.com/@x/video/1',publishedAt:old(30)});assert.equal(response.status,422);
    response=await send(base,`/${report.id}/posts`,'POST',{postUrl:'https://www.facebook.com/reel/1/',publishedAt:old(3),metrics:{views:'1.2K'}});assert.equal(response.status,400);assert.equal((await response.json()).error.code,'INVALID_METRIC');
    response=await send(base,'/missing/posts','POST',{postUrl:'https://www.facebook.com/reel/1/',publishedAt:old(3)});assert.equal(response.status,404);
    response=await send(base,`/${report.id}/posts/123456789`,'PATCH',{metrics:{shares:3}});assert.equal(response.status,200);assert.equal((await response.json()).report.posts[0].metrics.shares,3);
    await stop();base=await start();
    response=await fetch(`${base}/api/niche`);body=await response.json();assert.equal(body.reports[0].posts[0].metrics.views,4200);
    response=await send(base,`/${report.id}/posts/123456789`,'DELETE');assert.equal(response.status,200);assert.equal((await response.json()).report.posts.length,0);
    response=await send(base,`/${report.id}`,'DELETE');assert.equal(response.status,200);
    response=await fetch(`${base}/api/niche`);assert.equal((await response.json()).reports.length,0);
  }finally{if(server?.listening)await stop();await rm(dataDir,{recursive:true,force:true});}
});

test('fetch numbers maps public metadata, keeps missing counts unknown, checks the account and saves nothing',async()=>{
  const {mapPostMetadata}=await import('../src/niche/fetch.js');
  assert.deepEqual(mapPostMetadata({timestamp:Date.parse('2026-10-25T04:00:00Z')/1000,view_count:710,like_count:24,comment_count:2,repost_count:1,title:' Outfit check ',uploader:'fixture',duration:12}),{publishedAt:'2026-10-25',metrics:{views:710,likes:24,comments:2,shares:1,saves:null},approximate:[],description:'Outfit check',uploader:'fixture',duration:12,id:null});
  const sparse=mapPostMetadata({upload_date:'20261001',view_count:-5,like_count:'9'});
  assert.equal(sparse.publishedAt,'2026-10-01');assert.deepEqual(sparse.metrics,{views:null,likes:null,comments:null,shares:null,saves:null});
  // Facebook: yt-dlp view_count (2697) differs from the displayed "7.7K views"; displayed counts win and rounding is flagged.
  const fb=mapPostMetadata({extractor_key:'Facebook',view_count:2697,title:'7.7K views · 167 reactions | What if Las Piñas had its own c',description:'What if Las Piñas had its own community reporting system too',upload_date:'20261018'});
  assert.deepEqual(fb.metrics,{views:7700,likes:167,comments:null,shares:null,saves:null});assert.deepEqual(fb.approximate,['views']);assert.equal(fb.description,'What if Las Piñas had its own community reporting system too');
  assert.equal(mapPostMetadata({extractor_key:'Facebook',view_count:2697,title:'Caption only'}).metrics.views,null);
  assert.deepEqual(mapPostMetadata({extractor_key:'Facebook',title:'1,204 views · 3 comments · 1.1K reactions · 12 shares | x'}).metrics,{views:1204,likes:1100,comments:3,shares:12,saves:null});
  assert.equal(mapPostMetadata({save_count:9}).metrics.saves,9);
  // Exact counts from Facebook's page data, anchored to THIS post's displayed figures; a suggested video is ignored.
  const fbInfo={extractor_key:'Facebook',view_count:2697,title:'7.7K views · 167 reactions | caption',upload_date:'20261018'};
  const page='{"suggested":{"play_count_reduced":"9.1K","play_count":9170,"comments":{"total_count":5}},"i18n_reaction_count":"17","reaction_count":{"count":17}}'
    +'{"video_post_view_count":2697,"play_count_reduced":"7.7K","play_count":7768}'
    +'{"comments":{"total_count":43}},"x":1,"i18n_reaction_count":"167","important_reactors":{},"reaction_count":{"count":167,"is_empty":false}';
  const exactFb=mapPostMetadata(fbInfo,page);
  assert.deepEqual(exactFb.metrics,{views:7768,likes:167,comments:43,shares:null,saves:null});assert.deepEqual(exactFb.approximate,[]);
  // A candidate that does not round back to the displayed "7.7K" is rejected; the rounded value stays flagged.
  const wrong=mapPostMetadata(fbInfo,'"play_count_reduced":"7.7K","play_count":9999');assert.equal(wrong.metrics.views,7700);assert.deepEqual(wrong.approximate,['views']);
  // Two different candidates for the same displayed figure are ambiguous: keep the rounded value.
  const ambiguous=mapPostMetadata(fbInfo,'"play_count_reduced":"7.7K","play_count":7701 "play_count_reduced":"7.7K","play_count":7790');assert.equal(ambiguous.metrics.views,7700);
  assert.deepEqual(mapPostMetadata(fbInfo,'').approximate,['views']);
  const kept=manualPostFields({publishedAt:'2026-10-18',metrics:{views:7700,likes:167},approximate:['views','comments']},null,now);assert.deepEqual(kept.approximateMetrics,['views']);
  assert.deepEqual(manualPostFields({metrics:{views:7712}},kept,now).approximateMetrics,[]);
  assert.deepEqual(manualPostFields({metrics:{likes:170}},kept,now).approximateMetrics,['views']);
  const dataDir=await mkdtemp(path.join(tmpdir(),'pulse-fetch-'));
  try{
    const videos=await createStore(dataDir);const calls=[];
    const service=await createNicheService({dataDir,videos,readPost:async url=>{calls.push(url);return mapPostMetadata({upload_date:'20261001',view_count:50});}});
    const report=await service.createManual({platform:'tiktok',account:'fixture_brand'});
    const preview=await service.previewPost(report.id,'https://tiktok.com/@Fixture_Brand/video/123?x=1');
    assert.equal(preview.postUrl,'https://www.tiktok.com/@fixture_brand/video/123');assert.equal(preview.metrics.views,50);assert.deepEqual(calls,[preview.postUrl]);
    assert.equal(service.list()[0].posts.length,0);
    await assert.rejects(service.previewPost(report.id,'https://www.tiktok.com/@other/video/1'),error=>error.code==='ACCOUNT_MISMATCH');
    await assert.rejects(service.previewPost(report.id,'https://www.instagram.com/reel/ABCDE1/'),error=>error.code==='PLATFORM_MISMATCH');
    assert.equal(calls.length,1);
    const facebook=await createNicheService({dataDir,videos,readPost:async()=>({...mapPostMetadata({upload_date:'20261018',view_count:2697}),id:'969514082319139'})});
    const page=await facebook.createManual({platform:'facebook',account:'fixture.page'});
    const shared=await facebook.previewPost(page.id,'https://www.facebook.com/share/v/1A2a3Ttsos/');assert.equal(shared.postUrl,'https://www.facebook.com/reel/969514082319139/');
    await facebook.addPost(page.id,{postUrl:shared.postUrl,publishedAt:shared.publishedAt,metrics:shared.metrics});
    await assert.rejects(facebook.addPost(page.id,{postUrl:'https://www.facebook.com/reel/969514082319139/',publishedAt:'2026-10-18'}),error=>error.code==='DUPLICATE_POST');
  }finally{await rm(dataDir,{recursive:true,force:true});}
});

test('comment feedback is summarized by AI, validated, saved without the pasted text, and refused when counts do not add up',async()=>{
  const {validateComments,commentText}=await import('../src/niche/comments.js');
  const dataDir=await mkdtemp(path.join(tmpdir(),'pulse-comments-'));
  const good={summary:'Mostly positive; viewers asked about location.',total:4,counts:{positive:2,neutral:0,negative:1,abusive:1,questions:1},themes:[{label:'Community safety',sentiment:'positive',mentions:2,paraphrase:'Viewers liked the idea.'}],praise:['Clear idea'],criticism:['Audio is quiet'],questions:['Where is this?'],nextVideo:['Raise voice volume']};
  try{
    const videos=await createStore(dataDir);const seen=[];let reply=good;
    const service=await createNicheService({dataDir,videos,provider:{async comments(text,context){seen.push({text,context});return {data:reply};}}});
    const report=await service.createManual({platform:'facebook',account:'fixture.page'});
    await service.addPost(report.id,{postUrl:'https://www.facebook.com/reel/123456/',publishedAt:old(10),description:'Test caption',metrics:{comments:4}});
    const pasted='Fixture Person\nLove this idea!\nReply\nAnother Person\nWhere is this?\nThird\nAudio too quiet\nFourth\n[test insult]';
    const saved=await service.analyzeComments(report.id,'123456',pasted);
    const analysis=saved.posts[0].commentAnalysis;assert.equal(analysis.counts.positive,2);assert.equal(analysis.counts.abusive,1);assert.ok(analysis.analyzedAt);
    assert.equal(seen[0].context.commentCountOnPlatform,4);assert.equal(seen[0].context.caption,'Test caption');
    const stored=await (await import('node:fs/promises')).readFile(path.join(dataDir,'niche.json'),'utf8');assert.ok(!stored.includes('Fixture Person'));assert.ok(!stored.includes('Love this idea'));
    reply={...good,total:9};await assert.rejects(service.analyzeComments(report.id,'123456',pasted),error=>error.code==='INVALID_AI_RESPONSE');
    assert.equal(service.list()[0].posts[0].commentAnalysis.total,4);
    await assert.rejects(service.analyzeComments(report.id,'missing',pasted),error=>error.code==='NOT_FOUND');
    assert.throws(()=>commentText('hi'),error=>error.code==='INVALID_COMMENTS');assert.throws(()=>commentText('x'.repeat(40001)),error=>error.status===413);
    assert.throws(()=>validateComments({...good,nextVideo:[]}),error=>error.code==='INVALID_AI_RESPONSE');
    const offline=await createNicheService({dataDir,videos,apiKey:''});await assert.rejects(offline.analyzeComments(report.id,'123456',pasted),error=>error.code==='COMMENTS_SETUP');
  }finally{await rm(dataDir,{recursive:true,force:true});}
});

test('automatic comment fetch: asks the user to sign in, stops at security checks, analyzes read comments', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'pulse-fetch-comments-'));
  try {
    const videos = await createStore(dataDir); let next = {status: 'login', message: 'Sign in to Facebook in the Chrome window PULSE opened.'}; const opened = [];
    const commentBrowser = {async comments(url, platform) { opened.push([url, platform]); return next; }};
    const summary = {summary: 'Positive.', total: 2, counts: {positive: 2, neutral: 0, negative: 0, abusive: 0, questions: 0}, themes: [], praise: ['Nice'], criticism: [], questions: [], nextVideo: ['Keep it up']};
    const service = await createNicheService({dataDir, videos, commentBrowser, provider: {async comments(text) { assert.match(text, /Great video/); return {data: summary}; }}});
    const report = await service.createManual({platform: 'facebook', account: 'fixture.page'});
    await service.addPost(report.id, {postUrl: 'https://www.facebook.com/reel/123456/', publishedAt: old(10)});
    let result = await service.fetchComments(report.id, '123456');
    assert.equal(result.status, 'login'); assert.deepEqual(opened[0], ['https://www.facebook.com/reel/123456/', 'facebook']); assert.equal(result.report.posts[0].commentAnalysis, undefined);
    next = {status: 'blocked', message: 'Security check.'}; assert.equal((await service.fetchComments(report.id, '123456')).status, 'blocked');
    next = {status: 'ok', text: 'Fixture Person\nGreat video!\nReply\nAnother Person\nLove it'};
    result = await service.fetchComments(report.id, '123456');
    assert.equal(result.status, 'ok'); assert.equal(result.report.posts[0].commentAnalysis.total, 2);
    await assert.rejects(service.fetchComments(report.id, 'missing'), error => error.code === 'NOT_FOUND');
  } finally { await rm(dataDir, {recursive: true, force: true}); }
});
