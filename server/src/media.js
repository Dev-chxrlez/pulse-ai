import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
const execute = promisify(execFile);

export class AnalysisError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

async function binary(name, configured) {
  const candidates = configured ? [configured] : [name, `/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`];
  for (const candidate of candidates) {
    try { await execute(candidate, ['-version'], { timeout: 5000 }); return candidate; }
    catch { /* Try the next known installation location. */ }
  }
  return null;
}
export async function findMediaTools(config = {}) {
  const [ffmpeg, ffprobe] = await Promise.all([binary('ffmpeg', config.ffmpeg), binary('ffprobe', config.ffprobe)]);
  return { ffmpeg, ffprobe };
}
export async function runMedia(command, args, timeout = 90000) {
  try { return await execute(command, args, { timeout, maxBuffer: 4 * 1024 * 1024, windowsHide: true }); }
  catch { throw new AnalysisError('MEDIA_PROCESSING', 'Could not decode this video within the processing limits. Try a shorter MP4 with a standard codec.'); }
}
const inputArgs = filename => ['-nostdin', '-hide_banner', '-protocol_whitelist', 'file,pipe', '-i', filename];
export async function probeVideo(filename, tools, maxDuration = 180) {
  await access(filename);
  const { stdout } = await runMedia(tools.ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_format', '-show_streams', '-of', 'json', filename], 15000);
  const data = JSON.parse(stdout);
  const video = data.streams?.find(stream => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
  const duration = Number(data.format?.duration || video?.duration);
  if (!video || !Number.isFinite(duration) || duration <= 0) throw new AnalysisError('INVALID_VIDEO', 'No playable video stream or usable duration was found.');
  if (duration > maxDuration) throw new AnalysisError('DURATION_LIMIT', `Analysis supports videos up to ${maxDuration} seconds. Upload a shorter cut.`);
  if (!video.width || !video.height || video.width * video.height > 16777216) throw new AnalysisError('RESOLUTION_LIMIT', 'This video exceeds the supported resolution. Export at 4K or below.');
  const [numerator, denominator] = (video.avg_frame_rate || '0/1').split('/').map(Number);
  const declaredVideoDuration=Number(video.duration);
  const videoDuration=Number.isFinite(declaredVideoDuration)&&declaredVideoDuration>0?Math.min(duration,declaredVideoDuration):duration;
  // Inspect decodable tail frames, not the longer audio/container end. No trimming.
  const tail=await runMedia(tools.ffprobe,['-v','error','-protocol_whitelist','file,pipe','-select_streams',String(video.index),'-read_intervals',`${Math.max(0,videoDuration-5)}%`,'-show_entries','frame=best_effort_timestamp_time','-of','json',filename],20000);
  const start=Number(data.format?.start_time)||0;
  const times=JSON.parse(tail.stdout).frames?.map(frame=>Number(frame.best_effort_timestamp_time)-start).filter(time=>Number.isFinite(time)&&time>=0)||[];
  if(!times.length)throw new AnalysisError('INVALID_VIDEO','No decodable video frames were found.');
  const lastFrameTimestamp=Math.max(...times);
  return { duration, videoDuration, lastFrameTimestamp, videoStreamIndex:video.index, width: video.width, height: video.height, codec: video.codec_name || 'unknown', fps: denominator ? Math.round(numerator / denominator * 100) / 100 : null, hasAudio: data.streams.some(stream => stream.codec_type === 'audio') };
}
export function frameTimes(duration) {
  const times = [0, .75, 1.5, 2.25, 2.95].filter(time => time < duration);
  const remaining = Math.max(0, duration - 3);
  if (remaining) for (let index = 0; index < 11; index++) times.push(3 + remaining * index / 11);
  times.push(Math.max(0, duration - .1));
  return [...new Set(times.map(time => Math.round(time * 1000) / 1000))].sort((a, b) => a - b);
}
export function audioWindows(duration) {
  const windows = [{ start: 0, end: Math.min(3, duration) }];
  for (let start = 3; start < duration; start += 30) {
    // Fold a tail under 1 s into this window: transcription rejects near-empty audio chunks.
    const end = duration - (start + 30) < 1 ? duration : start + 30;
    windows.push({ start, end });
    if (end === duration) break;
  }
  return windows;
}
export async function extractFrames(filename, directory, metadata, tools) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const frames = [];
  for (const [index, timestamp] of [...new Set(frameTimes(metadata.videoDuration??metadata.duration).map(time=>Math.min(time,Math.floor((metadata.lastFrameTimestamp??metadata.duration-.1)*1000)/1000)))].entries()) {
    const output = path.join(directory, `frame-${index}.jpg`);
    await runMedia(tools.ffmpeg, [...inputArgs(filename), '-ss', String(timestamp), '-map', `0:${metadata.videoStreamIndex??'v:0'}`, '-frames:v', '1', '-vf', 'scale=768:768:force_original_aspect_ratio=decrease', '-q:v', '4', '-threads', '1', '-y', output]);
    await access(output);
    frames.push({ index, timestamp, path: output });
  }
  return frames;
}
export async function detectScenes(filename, tools) {
  const { stderr } = await runMedia(tools.ffmpeg, [...inputArgs(filename), '-an', '-vf', "fps=4,scale=160:-2,select='gt(scene,0.3)',showinfo", '-threads', '1', '-f', 'null', '-']);
  return [...stderr.matchAll(/pts_time:([\d.]+)/g)].map(match => Number(match[1])).filter(Number.isFinite).slice(0, 200);
}
export async function extractAudio(filename, output, window, tools) {
  await runMedia(tools.ffmpeg, [...inputArgs(filename), '-ss', String(window.start), '-t', String(window.end - window.start), '-vn', '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-threads', '1', '-y', output]);
}
