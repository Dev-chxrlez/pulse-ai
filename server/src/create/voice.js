// ElevenLabs is called ONLY from synthesize(), i.e. when the user generates a video.
// Identical text + voice is served from a local cache, so regenerating never pays twice.
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

const API = 'https://api.elevenlabs.io/v1';
export class VoiceError extends Error { constructor(code, message, status = 502) { super(message); this.code = code; this.status = status; } }

export function createVoice({apiKey = process.env.ELEVENLABS_API_KEY, cacheDir, request = fetch, model = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2'}) {
  async function call(url, options) {
    if (!apiKey) throw new VoiceError('VOICE_SETUP', 'Add ELEVENLABS_API_KEY to server/.env and restart the backend.', 503);
    let response;
    try { response = await request(url, {...options, headers: {'xi-api-key': apiKey, 'Content-Type': 'application/json', ...options?.headers}, signal: AbortSignal.timeout(90000)}); }
    catch { throw new VoiceError('VOICE_UNAVAILABLE', 'ElevenLabs could not be reached. Check your connection and retry.'); }
    if (!response.ok) throw new VoiceError(`VOICE_${response.status}`, response.status === 401 ? 'ElevenLabs rejected the API key. Check ELEVENLABS_API_KEY.' : response.status === 429 ? 'ElevenLabs rate or credit limit reached. Check your plan, then retry.' : 'ElevenLabs could not create the voiceover. Try another voice or retry.');
    return response.json();
  }
  let voices = null;
  return {
    configured: Boolean(apiKey),
    // Listing voices is free; cached for the session.
    async voices() {
      if (!voices) {
        const data = await call(`${API}/voices`, {method: 'GET'});
        voices = (data.voices || []).map(voice => ({id: voice.voice_id, name: voice.name, category: voice.category, accent: voice.labels?.accent || null, gender: voice.labels?.gender || null, description: voice.labels?.description || voice.labels?.descriptive || null})).slice(0, 60);
      }
      return voices;
    },
    async synthesize(text, voiceId) {
      if (!/^[A-Za-z0-9]{10,40}$/.test(voiceId || '')) throw new VoiceError('VOICE_INVALID', 'Choose a voice.', 400);
      const key = createHash('sha256').update(JSON.stringify([model, voiceId, text])).digest('hex');
      const file = path.join(cacheDir, `${key}.json`);
      try { return {...JSON.parse(await readFile(file, 'utf8')), cached: true}; } catch { /* not cached */ }
      const data = await call(`${API}/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {method: 'POST', body: JSON.stringify({text, model_id: model})});
      const alignment = data.alignment || data.normalized_alignment;
      if (!data.audio_base64 || !alignment?.characters?.length) throw new VoiceError('VOICE_INVALID_RESPONSE', 'ElevenLabs returned no audio. Retry.');
      const result = {audioBase64: data.audio_base64, alignment: {characters: alignment.characters, starts: alignment.character_start_times_seconds, ends: alignment.character_end_times_seconds}};
      await mkdir(cacheDir, {recursive: true, mode: 0o700});
      await writeFile(file, JSON.stringify(result), {mode: 0o600});
      return {...result, cached: false};
    },
  };
}

// Map the joined script back onto character timings: per-segment windows and per-word times.
export function timingsFrom(script, alignment) {
  const segments = [script.hook, ...script.lines, script.cta].map(part => part.trim().replace(/[.!?]*$/, '.'));
  const text = alignment.characters.join('');
  const windows = []; const words = [];
  let cursor = 0;
  for (const [segmentIndex, segment] of segments.entries()) {
    const start = text.indexOf(segment, cursor);
    const from = start >= 0 ? start : cursor, to = start >= 0 ? start + segment.length - 1 : Math.min(text.length - 1, cursor + segment.length - 1);
    windows.push([alignment.starts[from] ?? 0, alignment.ends[to] ?? alignment.ends.at(-1)]);
    for (const match of segment.matchAll(/\S+/g)) {
      const first = from + match.index, last = first + match[0].length - 1;
      if (alignment.starts[first] !== undefined) words.push({text: match[0].replace(/[.!?,]+$/, ''), start: alignment.starts[first], end: alignment.ends[Math.min(last, alignment.ends.length - 1)], segment: segmentIndex});
    }
    cursor = to + 1;
  }
  const speechEnd = alignment.ends.at(-1) || windows.at(-1)[1];
  const durationSeconds = speechEnd + 2.2; // hold the CTA end card
  const lines = windows.slice(1, -1).map(([start], index, all) => [start, index + 1 < all.length ? all[index + 1][0] : windows.at(-1)[0]]);
  return {durationSeconds, timings: {hook: [0, windows[1][0]], lines, cta: [windows.at(-1)[0], durationSeconds]}, words};
}
