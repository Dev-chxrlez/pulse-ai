import { access, mkdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { findMediaTools } from '../server/src/media.js';
const serverDirectory = fileURLToPath(new URL('../server/', import.meta.url));
process.chdir(serverDirectory);
try { process.loadEnvFile('.env'); } catch (error) { if(error.code !== 'ENOENT') throw error; }
const tools = await findMediaTools({ffmpeg: process.env.FFMPEG_PATH, ffprobe: process.env.FFPROBE_PATH});
const dataDir = path.resolve(process.env.DATA_DIR || './data');
let writable = false;
try { await mkdir(dataDir, {recursive:true,mode:0o700}); await access(dataDir, constants.W_OK); writable = true; } catch { /* Report a safe readiness result below. */ }
let videos = [];
let metadataReadable = true;
try { videos = JSON.parse(await readFile(path.join(dataDir,'videos.json'),'utf8')); if(!Array.isArray(videos)) throw new Error('Invalid metadata'); }
catch(error) { if(error.code !== 'ENOENT') metadataReadable = false; videos = []; }
const results = {
  apiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
  ffmpegReady: Boolean(tools.ffmpeg && tools.ffprobe),
  storageWritable: writable,
  metadataReadable,
  savedAnalyses: videos.filter(video=>video.analysisStatus === 'completed').length,
  savedCreativeReviews: videos.filter(video=>video.creativeStatus === 'completed').length,
  activeJobs: videos.filter(video=>['queued','processing'].includes(video.analysisStatus)||['queued','processing'].includes(video.creativeStatus)).length,
};
console.log(JSON.stringify(results,null,2));
console.log('This checks local configuration only. It does not call OpenAI or validate billing/model access.');
if(!results.apiKeyConfigured || !results.ffmpegReady || !writable || !metadataReadable) process.exitCode = 1;
