import {randomUUID} from 'node:crypto';
import {mkdir, readFile, rm, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileTypeFromBuffer} from 'file-type';
import {createStore} from '../store.js';
import {createProvider} from '../provider.js';
import {AnalysisError} from '../media.js';
import {TEMPLATES, template} from './templates.js';
import {SCRIPT_INSTRUCTIONS, scriptJsonSchema, scriptText, validateScript} from './script.js';
import {createVoice, timingsFrom, VoiceError} from './voice.js';
import {renderVideo} from './render.js';
import {QUICK_INSTRUCTIONS, quickJsonSchema, pickVoice, validQuick} from './quick.js';
import {MOTION_INSTRUCTIONS, motionJsonSchema, motionProps, DESIGN_INSTRUCTIONS, designJsonSchema, validDesign} from './motion.js';
import {createImages, ImageError} from './images.js';

const fail = (message, status = 400) => Object.assign(new Error(message), {status});
const color = (value, fallback) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
const text = (value, max, field, required = false) => {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (required && !clean) throw fail(`Enter the ${field}.`);
  if (clean.length > max) throw fail(`The ${field} must be ${max} characters or fewer.`);
  return clean;
};
export const LOGO_MAX = 3 * 1024 * 1024;
// PULSE's own synthesized music beds and sound effects (server/scripts/make-audio.mjs), sent to the renderer as data URIs.
const AUDIO_DIR = new URL('../../assets/audio/', import.meta.url);
const audioCache = new Map();
async function audioAsset(name) {
  if (!audioCache.has(name)) audioCache.set(name, readFile(new URL(`${name}.mp3`, AUDIO_DIR)).then(data => `data:audio/mpeg;base64,${data.toString('base64')}`).catch(() => null));
  return audioCache.get(name);
}
export async function soundtrack(music) {
  if (!['upbeat', 'chill', 'premium'].includes(music)) return null;
  const [bed, whoosh, pop, riser] = await Promise.all([audioAsset(`music-${music}`), audioAsset('sfx-whoosh'), audioAsset('sfx-pop'), audioAsset('sfx-riser')]);
  return bed ? {music: bed, sfx: {whoosh, pop, riser}} : null;
}

export async function createCreateService({dataDir, provider: injectedProvider, voice: injectedVoice, images: injectedImages, render = renderVideo, apiKey = process.env.OPENAI_API_KEY, inspiration: findInspiration = () => null}) {
  const root = path.join(dataDir, 'creations');
  await mkdir(root, {recursive: true, mode: 0o700});
  const store = await createStore(dataDir, 'creations.json');
  const provider = injectedProvider || createProvider({apiKey, visionModel: process.env.OPENAI_VISION_MODEL});
  const voice = injectedVoice || createVoice({cacheDir: path.join(root, 'voice-cache')});
  const images = injectedImages || createImages({cacheDir: path.join(root, 'image-cache')});
  for (const job of store.list()) if (['queued', 'voicing', 'rendering'].includes(job.status)) await store.update(job.id, {status: 'failed', stage: 'Interrupted', error: {code: 'INTERRUPTED', message: 'Generation was interrupted by a restart. Generate again when ready.'}});
  let tail = Promise.resolve();
  const brandFrom = input => ({name: text(input.brandName, 60, 'brand name', true), tagline: text(input.tagline, 90, 'tagline'), description: text(input.description, 600, 'description', true), primary: color(input.primary, '#1f6feb'), accent: color(input.accent, '#ffd23f'), background: color(input.background, '#0b1020')});
  const publicJob = job => job && ({...job, fileUrl: job.status === 'completed' ? `/api/create/videos/${job.id}/file` : null});
  return {
    setup: () => ({script: Boolean(injectedProvider || apiKey), voice: voice.configured}),
    templates: () => Object.entries(TEMPLATES).filter(([, value]) => !value.hidden).map(([id, value]) => ({id, ...value})),
    voices: () => voice.voices(),
    list: () => store.list().map(publicJob),
    get: id => publicJob(store.get(id)),
    file: id => { const job = store.get(id); return job?.status === 'completed' ? path.join(root, id, 'video.mp4') : null; },
    // Step 1: OpenAI only. The user can edit the result before any voice is generated.
    async script(input = {}) {
      const chosen = template(input.templateId);
      const brand = brandFrom(input);
      if (!(injectedProvider || apiKey)) throw fail('Configure the backend AI API key to write scripts.', 503);
      try {
        const result = await provider.structured('ad_script', scriptJsonSchema, SCRIPT_INSTRUCTIONS, {brand: {name: brand.name, tagline: brand.tagline, description: brand.description}, tone: chosen.tone, templateStyle: chosen.style});
        return validateScript(result.data);
      } catch (error) { if (error instanceof AnalysisError) throw fail(`The script could not be written (${error.message}) Retry, or write it yourself.`, 502); throw error; }
    },
    // Step 2: ElevenLabs (cached) + local render. Only called when the user clicks Generate.
    async generate(input = {}, logo, scene = null) {
      const chosen = template(input.templateId);
      const brand = brandFrom(input);
      let script;
      try { script = validateScript(typeof input.script === 'string' ? JSON.parse(input.script) : input.script); }
      catch (error) { throw fail(error instanceof AnalysisError ? error.message : 'The script is missing or invalid.'); }
      if (typeof input.voiceId !== 'string' || !input.voiceId) throw fail('Choose a voice.');
      let logoData = null;
      if (logo?.buffer?.length) {
        if (logo.buffer.length > LOGO_MAX) throw fail('Logos must be 3 MiB or smaller.', 413);
        const type = await fileTypeFromBuffer(logo.buffer);
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(type?.mime)) throw fail('Use a PNG, JPG or WebP logo.', 415);
        logoData = `data:${type.mime};base64,${logo.buffer.toString('base64')}`;
      }
      let motion = null;
      if (input.motion) { try { motion = motionProps(typeof input.motion === 'string' ? JSON.parse(input.motion) : input.motion); } catch { throw fail('Invalid motion settings.'); } }
      // Prompt-based style (advanced editor): turn the user's words into Motion Pro design settings.
      const stylePrompt = text(input.stylePrompt, 200, 'style');
      if (stylePrompt && input.templateId === 'motion') {
        try { const result = await provider.structured('motion_design', designJsonSchema, DESIGN_INSTRUCTIONS, {styleRequest: stylePrompt, business: brand.description}); motion = {...(motion || {}), design: validDesign(result.data)}; }
        catch (error) { if (error instanceof AnalysisError) throw fail('The style could not be read. Try different words, or leave it empty.', 502); throw error; }
      }
      const reference = input.inspirationId ? findInspiration(String(input.inspirationId)) : null;
      if (input.inspirationId && !reference?.style) throw fail('The reference ad has not finished analysis yet.', 409);
      if (input.templateId === 'matched' && !reference) throw fail('Matched style needs a reference ad from Trending Ads.');
      const inspiration = reference ? {advertiser: reference.advertiser, transparencyUrl: reference.transparencyUrl, creativeId: reference.creativeId, pace: reference.style.pace, cutInterval: reference.style.cutInterval, reasons: reference.style.reasons, blueprint: reference.style.blueprint} : null;
      const id = randomUUID();
      const job = {id, inspiration, templateId: input.templateId, templateName: chosen.name, brand: {name: brand.name, tagline: brand.tagline, primary: brand.primary, accent: brand.accent, background: brand.background, hasLogo: Boolean(logoData)}, script, voiceId: input.voiceId, status: 'queued', stage: 'Waiting to start', progress: 0, error: null, uploadedAt: new Date().toISOString()};
      await store.add(job);
      tail = tail.then(async () => {
        const directory = path.join(root, id);
        try {
          await mkdir(directory, {recursive: true, mode: 0o700});
          let visuals = [];
          if (scene?.prompts?.length) {
            await store.update(id, {status: 'voicing', stage: scene.photos?.length ? 'Preparing your photos' : 'Creating scene photos'});
            try { visuals = await images.scenes(scene.prompts, scene.photos || []); await store.update(id, {visualSources: visuals.map(item => item.source)}); }
            catch (error) { if (!(scene.optional && error instanceof ImageError)) throw error; await store.update(id, {visualSources: [], visualNote: `${error.message} Made with motion graphics instead.`}); }
          }
          const audioBed = input.templateId === 'motion' && motion?.music && input.music !== 'none' ? await soundtrack(motion.music) : null;
          await store.update(id, {status: 'voicing', stage: 'Recording voiceover'});
          const spoken = await voice.synthesize(scriptText(script), input.voiceId);
          const {durationSeconds, timings, words} = timingsFrom(script, spoken.alignment);
          await store.update(id, {status: 'rendering', stage: 'Rendering video', voiceCached: spoken.cached, durationSeconds: Math.round(durationSeconds * 10) / 10});
          let last = 0;
          await render({templateId: input.templateId, output: path.join(directory, 'video.mp4'), inputProps: {motion: motion || null, visuals: visuals.map(item => item.src), music: audioBed?.music || null, sfx: audioBed?.sfx || null, style: {pace: inspiration?.pace || 'medium', blueprint: inspiration?.blueprint || null}, brand: {...brand, logo: logoData}, script, audio: `data:audio/mpeg;base64,${spoken.audioBase64}`, timings, words, durationSeconds}, onProgress: progress => { if (progress - last >= .05 || progress === 1) { last = progress; store.update(id, {progress: Math.round(progress * 100)}).catch(() => {}); } }});
          const size = (await stat(path.join(directory, 'video.mp4'))).size;
          await store.update(id, {status: 'completed', stage: 'Done', progress: 100, size, completedAt: new Date().toISOString()});
        } catch (error) {
          await rm(directory, {recursive: true, force: true}).catch(() => {});
          const known = error instanceof VoiceError || error instanceof ImageError;
          await store.update(id, {status: 'failed', stage: 'Failed', error: {code: known ? error.code : 'RENDER_FAILED', message: known ? error.message : 'The video could not be rendered. Retry; if it repeats, check the server log.'}});
          if (!known) console.error('Create render failed:', error.message);
        }
      }).catch(() => console.error('Could not persist creation state.'));
      return publicJob(store.get(id));
    },
    linkLibrary: (id, videoId) => store.update(id, {libraryVideoId: videoId}),
    forgetVideo: videoId => store.transact(records => records.map(record => record.libraryVideoId === videoId ? {...record, libraryVideoId: null} : record)),
    // One step from a reference ad: brand name + description in, finished video out.
    async quick(input = {}, logo, photos = []) {
      const name = text(input.brandName, 60, 'brand name', true), description = text(input.description, 600, 'brand description', true);
      if (!logo?.buffer?.length) throw fail('Add your logo first.');
      const styleRequest = text(input.style, 200, 'style');
      const offer = text(input.offer, 60, 'offer');
      const photoMode = input.visuals === 'none' ? 'none' : 'photos';
      const reference = input.inspirationId ? findInspiration(String(input.inspirationId)) : null;
      if (input.inspirationId && !reference?.style?.blueprint) throw fail('That reference ad is not ready.', 409);
      if (!(injectedProvider || apiKey)) throw fail('Configure the backend AI API key.', 503);
      let plan;
      try { plan = validQuick(reference ? (await provider.structured('quick_ad_plan', quickJsonSchema, QUICK_INSTRUCTIONS, {brand: {name, description}, referenceStyle: {pace: reference.style.pace, scenes: reference.style.blueprint.cuts.length + 1, opensWithBrand: reference.style.blueprint.brandEarly, textLed: reference.style.blueprint.textHeavy}, styleRequest: styleRequest || null})).data : (await provider.structured('motion_ad_plan', motionJsonSchema, MOTION_INSTRUCTIONS, {business: {name, description}, offer: offer || null, styleRequest: styleRequest || null})).data); }
      catch (error) { if (error instanceof AnalysisError) throw fail(`The AI could not plan the video (${error.message})`, 502); throw error; }
      let script;
      try { script = validateScript(plan.script); } catch { script = validateScript({hook: plan.script.hook.split(/\s+/).slice(0, 7).join(' '), lines: plan.script.lines.map(line => line.split(/\s+/).slice(0, 9).join(' ')), cta: plan.script.cta.split(/\s+/).slice(0, 4).join(' ')}); }
      const chosen = pickVoice(await voice.voices(), plan.voice);
      if (!chosen) throw fail('No ElevenLabs voices are available on this account.', 503);
      const motion = reference ? null : motionProps({...plan, offer});
      // Motion Pro scenes: the user's photos first, AI photos for the rest; falls back to graphics if images fail.
      const motionScene = photoMode === 'none' ? null : photos.length || plan.visuals?.length ? {prompts: plan.visuals?.length ? plan.visuals : photos.map(() => ''), photos, optional: true} : null;
      const job = await this.generate({templateId: reference ? 'matched' : 'motion', ...(reference ? {inspirationId: input.inspirationId} : {motion: JSON.stringify(motion)}), brandName: name, tagline: plan.tagline, description, ...plan.colors, script: JSON.stringify(script), voiceId: chosen.id}, logo, reference ? {prompts: plan.visuals || [], photos} : motionScene);
      await store.update(job.id, {aiPlan: {voiceCharacter: plan.voice, voiceName: chosen.name, colors: plan.colors, tagline: plan.tagline, motion, visuals: plan.visuals || [], userPhotos: photos.length, photoMode}});
      return publicJob(store.get(job.id));
    },
    async idle() { await tail; },
  };
}
