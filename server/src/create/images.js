// Scene images for generated videos: user photos first, otherwise OpenAI image generation.
// Generated images are cached by prompt (regenerating never pays twice) and compressed to JPEG.
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {promisify} from 'node:util';
import path from 'node:path';
const run = promisify(execFile);

export class ImageError extends Error { constructor(message, status = 502) { super(message); this.code = 'IMAGE_FAILED'; this.status = status; } }

export function createImages({cacheDir, apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1-mini', quality = process.env.OPENAI_IMAGE_QUALITY || 'low', request = fetch, ffmpeg = 'ffmpeg'}) {
  // Re-encode to a small vertical JPEG so render props stay light.
  async function toJpeg(buffer, key) {
    await mkdir(cacheDir, {recursive: true, mode: 0o700});
    const input = path.join(cacheDir, `${key}.src`), output = path.join(cacheDir, `${key}.jpg`);
    await writeFile(input, buffer, {mode: 0o600});
    try { await run(ffmpeg, ['-v', 'error', '-y', '-i', input, '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920', '-q:v', '4', output], {timeout: 30000}); }
    catch { throw new ImageError('An image could not be processed. Use PNG or JPG photos.', 415); }
    finally { await rm(input, {force: true}); }
    return readFile(output);
  }
  async function generate(prompt) {
    const key = createHash('sha256').update(JSON.stringify([model, quality, prompt])).digest('hex');
    try { return {data: await readFile(path.join(cacheDir, `${key}.jpg`)), cached: true}; } catch { /* not cached */ }
    if (!apiKey) throw new ImageError('Configure the backend AI API key to generate scene images.', 503);
    let response;
    try { response = await request('https://api.openai.com/v1/images/generations', {method: 'POST', headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json'}, body: JSON.stringify({model, prompt, size: '1024x1536', quality, n: 1}), signal: AbortSignal.timeout(150000)}); }
    catch { throw new ImageError('Scene images could not be generated (connection). Retry.'); }
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.data?.[0]?.b64_json) throw new ImageError(response.status === 400 ? 'The image request was rejected. Try a different description.' : 'Scene images could not be generated. Retry.');
    return {data: await toJpeg(Buffer.from(body.data[0].b64_json, 'base64'), key), cached: false};
  }
  return {
    model,
    // prompts: up to 4 strings; photos: user-uploaded buffers that take the first slots.
    async scenes(prompts, photos = []) {
      const slots = await Promise.all(prompts.slice(0, 4).map(async (prompt, index) => {
        if (photos[index]) return {data: await toJpeg(photos[index], createHash('sha256').update(photos[index]).digest('hex')), source: 'upload'};
        const result = await generate(`${prompt}. Vertical 9:16 advertising photo, no text, no letters, no logos, no watermarks.`);
        return {data: result.data, source: result.cached ? 'cache' : 'generated'};
      }));
      return slots.map(slot => ({src: `data:image/jpeg;base64,${slot.data.toString('base64')}`, source: slot.source}));
    },
  };
}
