import {useEffect, useMemo, useRef, useState} from 'react';
import {Player} from '@remotion/player';
import {AlertCircle, ArrowUpRight, Check, ChevronDown, Download, Film, ImagePlus, Mic, Music2, Palette, SlidersHorizontal, Sparkles, Upload, Wand2, X} from 'lucide-react';
import {apiRequest, get} from '../api';
import {TEMPLATES} from '../video/templates.jsx';
import BriefChat from './BriefChat';
import {FPS, HEIGHT, WIDTH, sampleProps} from '../video/shared.jsx';

const emptyScript = {hook: '', lines: ['', '', ''], cta: ''};
const words = text => text.trim().split(/\s+/).filter(Boolean).length;

const STYLE_IDEAS = [['Minimal & elegant', 'minimal and elegant, serif font, calm, soft colors'], ['Bold & energetic', 'bold and energetic, heavy font, fast, all caps'], ['Pastel & soft', 'pastel colors, light background, playful rounded font, calm'], ['Luxury', 'luxurious black and gold, elegant serif, slow and calm'], ['Neon night', 'neon colors on dark, grid background, fast, sharp corners'], ['Techy', 'modern tech look, monospace font, grid, sharp corners']];
const FORMAT_NAMES = {'problem-solution': 'Problem → Solution', promo: 'Promo / Sale', showcase: 'Product showcase', reasons: '3 reasons why', story: 'Story / recommendation'};
const StepNumber = ({n, done}) => <span className={`step-num ${done ? 'done' : ''}`} aria-hidden="true">{done ? <Check size={13} strokeWidth={3}/> : n}</span>;

export default function Create({onOpen, onLibraryChanged, inspiration, onClearInspiration}) {
  const [templates, setTemplates] = useState([]);const [setup, setSetup] = useState(null);
  const matchable = Boolean(inspiration?.style?.blueprint);
  const [templateId, setTemplateId] = useState(matchable ? 'matched' : 'bold-hook');
  useEffect(() => {setTemplateId(inspiration?.style?.blueprint ? 'matched' : 'bold-hook');}, [inspiration?.id]);
  const [brand, setBrand] = useState({brandName: '', tagline: '', description: '', primary: '#1f6feb', accent: '#ffd23f', background: '#0b1020'});
  const [logo, setLogo] = useState(null);const [logoUrl, setLogoUrl] = useState(null);
  const [script, setScript] = useState(emptyScript);
  const [voices, setVoices] = useState([]);const [voiceId, setVoiceId] = useState('');const [voiceError, setVoiceError] = useState('');
  const [busy, setBusy] = useState('');const [error, setError] = useState('');
  const [jobs, setJobs] = useState([]);const [active, setActive] = useState(null);
  const logoInput = useRef();
  // POL AI's writing helper fills the brand fields.
  useEffect(() => {const onFill = event => setBrand(current => ({...current, brandName: event.detail.brandName || current.brandName, description: event.detail.description || current.description}));window.addEventListener('pulse:fill-create', onFill);return () => window.removeEventListener('pulse:fill-create', onFill);}, []);
  const [advanced, setAdvanced] = useState(false);const [style, setStyle] = useState('');const [dragging, setDragging] = useState(false);const [motionPlan, setMotionPlan] = useState(null);
  const [nudge, setNudge] = useState('');const [extrasOpen, setExtrasOpen] = useState(false);const [photos, setPhotos] = useState([]);const [photoMode, setPhotoMode] = useState('photos');const [offer, setOffer] = useState('');const photoInput = useRef();
  const photoUrls = useMemo(() => photos.map(file => URL.createObjectURL(file)), [photos]);
  useEffect(() => () => photoUrls.forEach(url => URL.revokeObjectURL(url)), [photoUrls]);
  useEffect(() => {
    Promise.all([get('create/templates'), get('create/setup'), get('create/videos')]).then(([list, status, history]) => {setTemplates(list.templates);setSetup(status);setJobs(history.videos);}).catch(failure => setError(failure.message));
    get('create/voices').then(data => {setVoices(data.voices);setVoiceId(current => current || data.voices.find(voice => voice.category === 'premade')?.id || data.voices[0]?.id || '');}).catch(failure => setVoiceError(failure.message));
  }, []);
  useEffect(() => {if (!logo) {setLogoUrl(null);return;}const reader = new FileReader();reader.onload = () => setLogoUrl(reader.result);reader.readAsDataURL(logo);}, [logo]);
  // Poll the running generation.
  useEffect(() => {
    if (!active || ['completed', 'failed'].includes(active.status)) return;
    const timer = setInterval(async () => {try {const {video} = await get(`create/videos/${active.id}`);setActive(video);if (['completed', 'failed'].includes(video.status)) setJobs((await get('create/videos')).videos);} catch (failure) {setError(failure.message);}}, 1200);
    return () => clearInterval(timer);
  }, [active?.id, active?.status]);
  const hasScript = script.hook.trim() && script.lines.every(line => line.trim()) && script.cta.trim();
  const previewProps = useMemo(() => ({
    ...sampleProps,
    brand: {name: brand.brandName || sampleProps.brand.name, tagline: brand.tagline || sampleProps.brand.tagline, logo: logoUrl, primary: brand.primary, accent: brand.accent, background: brand.background},
    script: hasScript ? script : sampleProps.script,
    durationSeconds: 15,
    style: {pace: inspiration?.style?.pace || 'medium', blueprint: inspiration?.style?.blueprint || null},
    ...(motionPlan ? {motion: motionPlan} : {}),
  }), [brand, logoUrl, script, hasScript, inspiration?.style?.pace, inspiration?.style?.blueprint, motionPlan]);
  const set = key => event => setBrand(current => ({...current, [key]: event.target.value}));
  async function writeScript() {
    setBusy('script');setError('');
    try {const data = await apiRequest('create/script', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({templateId, ...brand})}, 60000);setScript(data.script);}
    catch (failure) {setError(failure.message);} finally {setBusy('');}
  }
  async function generate() {
    setBusy('generate');setError('');
    try {
      const form = new FormData();
      for (const [key, value] of Object.entries({templateId, ...brand, voiceId, script: JSON.stringify(script), ...(inspiration ? {inspirationId: inspiration.id} : {}), ...(templateId === 'motion' && motionPlan ? {motion: JSON.stringify(motionPlan)} : {}), ...(templateId === 'motion' && style.trim() ? {stylePrompt: style.trim()} : {})})) form.append(key, value);
      if (logo) form.append('logo', logo);
      const data = await apiRequest('create/videos', {method: 'POST', body: form}, 30000);setActive(data.video);
    } catch (failure) {setError(failure.message);} finally {setBusy('');}
  }
  async function quickGenerate(event) {
    event.preventDefault();
    // Instead of a dead button: point the user at the first step that still needs something.
    if (missing.length) {
      const first = missing[0];setNudge(first);setError('');
      const target = first === 'brand name' ? 'brand-input' : first === 'business description' ? 'brief-input' : 'logo-step';
      const node = document.getElementById(target);node?.scrollIntoView({behavior: 'smooth', block: 'center'});if (node?.focus) setTimeout(() => node.focus({preventScroll: true}), 350);
      return;
    }
    setNudge('');setBusy('generate');setError('');
    try {
      const form = new FormData();
      for (const [key, value] of Object.entries({...(inspiration?.style?.blueprint ? {inspirationId: inspiration.id} : {}), brandName: brand.brandName, description: brand.description, ...(style.trim() ? {style: style.trim()} : {}), ...(offer.trim() ? {offer: offer.trim()} : {}), ...(photoMode === 'none' ? {visuals: 'none'} : {})})) form.append(key, value);
      form.append('logo', logo);
      if (photoMode === 'photos') photos.forEach(file => form.append('photos', file));
      const data = await apiRequest('create/quick', {method: 'POST', body: form}, 90000);setActive(data.video);
    } catch (failure) {setError(failure.message);} finally {setBusy('');}
  }
  // Fill the detailed editor with what the AI chose, so the user can tweak and regenerate.
  function customize() {
    if (active?.script) setScript(active.script);
    if (active?.brand) setBrand(current => ({...current, tagline: active.brand.tagline || current.tagline, primary: active.brand.primary, accent: active.brand.accent, background: active.brand.background}));
    if (active?.voiceId) setVoiceId(active.voiceId);
    if (active?.aiPlan?.motion) {setMotionPlan(active.aiPlan.motion);setTemplateId('motion');}
    setAdvanced(true);
  }
  async function addToLibrary(job) {
    setError('');
    try {const data = await apiRequest(`create/videos/${job.id}/library`, {method: 'POST'});const library = await onLibraryChanged();const video = library?.find(item => item.id === data.videoId);if (video) onOpen(video);setJobs((await get('create/videos')).videos);}
    catch (failure) {setError(failure.message);}
  }
  function pickLogo(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setError('Logos must be PNG, JPG or WebP.');
    if (file.size > 3 * 1024 * 1024) return setError('Logos must be 3 MiB or smaller.');
    setError('');setLogo(file);
  }
  function addPhotos(files) {
    const good = [...files].filter(file => /^image\/(png|jpeg|webp)$/.test(file.type) && file.size <= 8 * 1024 * 1024);
    if (good.length < files.length) setError('Photos must be PNG, JPG or WebP, up to 8 MB each.');
    setPhotos(current => [...current, ...good].slice(0, 4));
  }
  const missing = [!brand.brandName.trim() && 'brand name', brand.description.trim().length < 10 && 'business description', !logo && 'logo'].filter(Boolean);
  const chosen = TEMPLATES[templateId];
  const working = active && !['completed', 'failed'].includes(active.status);
  if (!advanced) return <div className="create-page">
    {inspiration?.style?.blueprint && <section className="inspiration-banner"><Sparkles size={16}/><div><span className="eyebrow">STYLE FROM A TRENDING AD</span><p><b>{inspiration.advertiser}</b>{inspiration.daysRunning ? ` · ran ${inspiration.daysRunning} days` : ''} · <a href={inspiration.transparencyUrl} target="_blank" rel="noreferrer">source<ArrowUpRight size={11}/></a></p><p className="report-caption">PULSE reuses its style ({inspiration.style.blueprint.cuts.length + 1} scenes, {inspiration.style.pace} pace, {inspiration.style.blueprint.brandEarly ? 'brand-first' : 'text-first'} opening), not its content. Your video will look different.</p></div><button className="text-button" onClick={onClearInspiration}>Remove</button></section>}
    <div className="create-grid">
      <section className="panel create-form quick-form"><div className="panel-title"><div><h2>Make a video ad</h2><p>2 quick steps · about 2 minutes</p></div></div>
        <form className="create-steps" onSubmit={quickGenerate}>
          <div className={`create-step ${brand.brandName.trim() && logo ? 'done' : ''} ${['brand name', 'logo'].includes(nudge) && !(brand.brandName.trim() && logo) ? 'needs' : ''}`}><StepNumber n={1} done={brand.brandName.trim() && logo}/><div className="step-body">
            <span className="step-label">Your brand</span>
            <div className="brand-row">
              <input id="brand-input" value={brand.brandName} onChange={set('brandName')} maxLength={60} placeholder="Brand name, e.g. Kape Kanto" aria-label="Brand name" required/>
              <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Choose logo" onChange={event => {pickLogo(event.target.files[0]);event.target.value = '';}}/>
              {logo ? <div id="logo-step" className="logo-mini chosen"><img src={logoUrl || undefined} alt="Your logo"/><button type="button" className="text-button" onClick={() => logoInput.current.click()}>Change</button><button type="button" className="logo-mini-remove" aria-label="Remove logo" onClick={() => setLogo(null)}><X size={12}/></button></div>
                : <button id="logo-step" type="button" className={`logo-mini ${dragging ? 'dragging' : ''}`} title="PNG with a transparent background looks best · up to 3 MB" onClick={() => logoInput.current.click()} onDragOver={event => {event.preventDefault();setDragging(true);}} onDragLeave={() => setDragging(false)} onDrop={event => {event.preventDefault();setDragging(false);pickLogo(event.dataTransfer.files[0]);}}><Upload size={15}/>Add logo</button>}
            </div>
          </div></div>
          <div className={`create-step ${brand.description.trim().length >= 10 ? 'done' : ''} ${nudge === 'business description' && brand.description.trim().length < 10 ? 'needs' : ''}`}><StepNumber n={2} done={brand.description.trim().length >= 10}/><div className="step-body"><BriefChat brandName={brand.brandName} description={brand.description} onDescription={value => setBrand(current => ({...current, description: value}))} onBrandName={value => setBrand(current => ({...current, brandName: value}))}/></div></div>
          <div className={`create-extras ${extrasOpen ? 'open' : ''}`}>
            <button type="button" className="extras-toggle" aria-expanded={extrasOpen} aria-controls="create-extras" onClick={() => setExtrasOpen(value => !value)}>
              <SlidersHorizontal size={15}/><span><strong>Optional extras</strong><small>{[style.trim() ? (STYLE_IDEAS.find(([, prompt]) => prompt === style)?.[0] || 'Custom style') : 'Auto style', photoMode === 'none' ? 'Motion graphics' : photos.length ? `${photos.length} photo${photos.length > 1 ? 's' : ''}` : 'AI photos', offer.trim() ? 'Offer added' : 'No offer'].join(' · ')}</small></span><ChevronDown size={16} className="extras-chevron"/>
            </button>
            {extrasOpen && <div id="create-extras" className="extras-body">
              <div className="extra-group"><span className="extra-label">Look</span>
                <div className="style-chips">{STYLE_IDEAS.map(([label, prompt]) => <button key={label} type="button" className={`style-chip ${style === prompt ? 'chosen' : ''}`} aria-pressed={style === prompt} onClick={() => setStyle(current => current === prompt ? '' : prompt)}>{label}</button>)}</div>
                <input id="style-input" value={style} onChange={event => setStyle(event.target.value)} maxLength={200} placeholder="…or describe it: pastel colors, calm, elegant" aria-label="Describe the look"/>
              </div>
              <div className="extra-group"><span className="extra-label">Scenes</span>
                <div className="segmented" role="radiogroup" aria-label="Video look">
                  <button type="button" role="radio" aria-checked={photoMode === 'photos'} className={photoMode === 'photos' ? 'chosen' : ''} onClick={() => setPhotoMode('photos')}><ImagePlus size={14}/>Photo ad</button>
                  <button type="button" role="radio" aria-checked={photoMode === 'none'} className={photoMode === 'none' ? 'chosen' : ''} onClick={() => setPhotoMode('none')}><Palette size={14}/>Motion graphics</button>
                </div>
                {photoMode === 'photos' && <div className="photo-strip">
                  {photoUrls.map((url, index) => <div key={url} className="photo-thumb"><img src={url} alt={`Photo ${index + 1}`}/><button type="button" aria-label={`Remove photo ${index + 1}`} onClick={() => setPhotos(current => current.filter((_, i) => i !== index))}><X size={12}/></button></div>)}
                  {photos.length < 4 && <button type="button" className="photo-add" onClick={() => photoInput.current.click()}><ImagePlus size={16}/><small>Your photos<br/>{photos.length}/4</small></button>}
                  <small className="photo-note">{photos.length ? (photos.length < 4 ? 'AI fills the rest.' : 'Using your 4 photos.') : 'Skip it and AI makes product photos for you.'}</small>
                  <input ref={photoInput} type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" aria-label="Choose photos" onChange={event => {addPhotos(event.target.files);event.target.value = '';}}/>
                </div>}
              </div>
              <div className="extra-group"><label className="extra-label" htmlFor="offer-input">Offer</label>
                <input id="offer-input" value={offer} onChange={event => setOffer(event.target.value)} maxLength={60} placeholder="Only if you have one, e.g. Buy 1 Take 1 on Fridays"/>
              </div>
            </div>}
          </div>
          <div className="create-submit">
            <button className="primary generate-button" disabled={busy === 'generate' || working || !setup?.voice} aria-describedby="generate-status"><Sparkles size={15}/>{busy === 'generate' ? 'Planning your video…' : working ? 'Generating…' : 'Generate video'}</button>
            <small id="generate-status" className={`report-caption ${nudge && missing.length ? 'generate-nudge' : ''}`} role="status">{missing.length ? `${nudge ? 'Almost there! ' : ''}Still needed: ${missing.join(', ')}${nudge ? '. We highlighted it above.' : ''}` : 'Ready! Takes 1–2 minutes.'}</small>
          </div>
          {setup && !setup.voice && <p className="notice error"><AlertCircle size={14}/>Add ELEVENLABS_API_KEY to server/.env and restart the backend.</p>}
          {error && <p className="notice error" role="alert"><AlertCircle size={14}/>{error}</p>}
        </form>
      </section>
      <section className="panel create-preview"><div className="panel-title"><div><h2>Your video</h2><p>{active?.status === 'completed' ? `${active.durationSeconds || ''}s · 9:16 · ready to post` : working ? 'Being made…' : 'Appears here once it’s ready'}</p></div></div>
        <div className="preview-frame">{active?.status === 'completed' ? <video key={active.id} src={active.fileUrl} controls autoPlay playsInline/> : <div className={`video-placeholder ${working ? 'working' : ''}`}><Sparkles size={34}/><strong>{working ? 'Creating your video…' : 'Your video will appear here'}</strong><span>{working ? active.stage : 'Fill in the steps, then press Generate.'}</span></div>}</div>
        {(working || busy === 'generate') && <ol className="make-steps">{['Planning script & design', 'Photos & voiceover', 'Animating'].map((label, index) => {const current = Math.max(0, ['queued', 'voicing', 'rendering'].indexOf(active?.status));return <li key={label} className={current > index ? 'done' : current === index ? 'now' : ''}>{current > index ? <Check size={12} strokeWidth={3}/> : <i/>}{label}{active?.status === 'rendering' && index === 2 ? ` · ${active.progress}%` : ''}</li>;})}</ol>}
        {working && <div className="create-status"><div className="prediction-progress"><i style={{width: `${active.status === 'rendering' ? 20 + active.progress * .8 : active.status === 'voicing' ? 12 : 4}%`}}/></div></div>}
        {!active && busy !== 'generate' && <ul className="get-list"><li><Film size={14}/>15–30s vertical MP4 (9:16), ready for Reels and TikTok</li><li><Mic size={14}/>Natural AI voiceover that matches your business</li><li><ImagePlus size={14}/>Real photo scenes in an ad format picked for your business</li><li><Music2 size={14}/>Background music and sound effects on every cut</li></ul>}
        {active?.visualNote && <p className="notice"><AlertCircle size={14}/>{active.visualNote}</p>}
        {active?.status === 'failed' && <div className="create-status"><p className="notice error"><AlertCircle size={14}/>{active.error?.message}</p></div>}
        {active?.status === 'completed' && <div className="create-status"><div className="manual-actions"><a className="primary" href={`${active.fileUrl}?download=1`}><Download size={14}/>Download MP4</a><button className="secondary-button" onClick={() => addToLibrary(active)}>{active.libraryVideoId ? 'Open in PULSE' : 'Score it in PULSE'}<ArrowUpRight size={13}/></button></div></div>}
        {active?.aiPlan && <div className="ai-plan"><span className="eyebrow">WHAT THE AI CHOSE</span>
          <div className="ai-plan-grid">
            <div><small>Voice</small><span>{active.aiPlan.voiceName} · {active.aiPlan.voiceCharacter}</span></div>
            <div><small>Colors</small><span>{['primary', 'accent', 'background'].map(key => <span key={key} className="swatch" style={{background: active.aiPlan.colors[key]}} title={active.aiPlan.colors[key]}/>)}</span></div>
            {active.aiPlan.motion?.design && <div><small>Design</small><span>{active.aiPlan.motion.design.font} font · {active.aiPlan.motion.design.background} · {active.aiPlan.motion.design.energy}{active.aiPlan.motion.design.textCase === 'upper' ? ' · caps' : ''}</span></div>}
            {active.aiPlan.motion?.format && <div><small>Ad format</small><span>{FORMAT_NAMES[active.aiPlan.motion.format] || active.aiPlan.motion.format}</span></div>}
            {active.aiPlan.motion?.music && <div><small>Music</small><span>{active.aiPlan.motion.music}{active.visualSources?.length ? ` · ${active.visualSources.filter(item => item === 'upload').length ? `${active.visualSources.filter(item => item === 'upload').length} your photos, ` : ''}${active.visualSources.filter(item => item !== 'upload').length} AI photos` : ''}</span></div>}
            <div><small>Tagline</small><span>{active.aiPlan.tagline}</span></div>
          </div>
          <p className="ai-plan-script">“{[active.script.hook, ...active.script.lines, active.script.cta].join(' ')}”</p>
          <button className="text-button" onClick={customize}><Wand2 size={13}/>Customize details and regenerate</button></div>}
      </section>
    </div>
    {jobs.length > 0 && <section className="panel create-history"><div className="panel-title"><div><h2>Your generated videos</h2><p>Saved on this computer · click one to watch it again</p></div></div>
      <div className="video-grid">{jobs.map(job => <button key={job.id} className={`video-card ${active?.id === job.id ? 'chosen' : ''}`} onClick={() => setActive(job)}><span className="video-card-thumb">{job.status === 'completed' ? <video src={`${job.fileUrl}#t=1`} preload="metadata" muted/> : null}</span><span className="video-card-body"><strong>{job.brand.name}</strong><small>{new Date(job.uploadedAt).toLocaleString()}{job.durationSeconds ? ` · ${job.durationSeconds}s` : ''}</small><span className="video-card-meta"><span className={`badge ${job.status === 'completed' ? 'badge-analyzed' : job.status === 'failed' ? 'badge-attention' : 'badge-working'}`}>{job.status === 'completed' ? 'Ready' : job.status === 'failed' ? 'Failed' : job.stage}</span></span></span></button>)}</div>
    </section>}
  </div>;
  return <div className="create-page">
    {inspiration && <section className="inspiration-banner"><Sparkles size={16}/><div><span className="eyebrow">STYLE BASED ON A TRENDING AD</span><p><b>{inspiration.advertiser}</b>{inspiration.daysRunning ? ` · ran ${inspiration.daysRunning} days` : ''} · <a href={inspiration.transparencyUrl} target="_blank" rel="noreferrer">source on Google Ads Transparency Center<ArrowUpRight size={11}/></a></p><p className="report-caption">Measured: {inspiration.style.reasons.join(' · ')}. Applied: {inspiration.style.pace} pace on the {templates.find(item => item.id === inspiration.style.templateId)?.name || 'matching'} template. The twist: PULSE’s own layout and motion, your colors, words, logo and AI voice. None of the ad’s footage, text or music is used.</p></div><button className="text-button" onClick={onClearInspiration}>Remove</button></section>}
    {templateId === 'matched' && inspiration ? <section className="panel matched-card"><div className="panel-title"><div><h2>1 · Style matched to {inspiration.advertiser}</h2><p>Built from what PULSE measured in that ad, not a preset template.</p></div><button className="text-button" onClick={() => setTemplateId(inspiration.style.templateId || 'bold-hook')}>Use a standard template instead</button></div>
      <div className="blueprint">{(() => {const plan = inspiration.style.blueprint;const scenes = plan.cuts.length + 1;return [[`${scenes} ${scenes === 1 ? 'scene' : 'scenes'}`, `cut rhythm copied from the ad${inspiration.style.cutInterval ? ` (about every ${inspiration.style.cutInterval}s), scaled to your voiceover` : ''}`], [`${plan.pace} pace`, plan.pace === 'fast' ? 'hard cuts with a zoom punch' : plan.pace === 'slow' ? 'slow crossfades with a gentle push-in' : 'slide transitions'], [plan.brandEarly ? 'Brand first' : 'Text first', plan.brandEarly ? 'your logo opens the video, as the ad shows its product early' : 'the hook opens on words, as the ad does'], [plan.textHeavy ? 'Text-led' : 'Caption bar', plan.textHeavy ? 'big kinetic words in every scene' : 'lower-third captions'], [plan.ctaFound ? 'CTA ending' : 'Soft ending', plan.ctaFound ? 'ends on a call-to-action card' : 'ends on your logo']].map(([title, detail]) => <div key={title}><strong>{title}</strong><span>{detail}</span></div>);})()}</div>
      <p className="report-caption matched-note">Your version: your brand colors, logo, words and AI voice with PULSE’s own motion graphics. None of the ad’s footage, text or music is used.</p>
    </section> : <section className="panel create-templates"><div className="panel-title"><div><h2>1 · Pick a style</h2><p>Each style follows common short-form ad patterns. Previews are free: no AI or voice is used.</p></div></div>
      <div className="template-cards">{templates.map(item => <button key={item.id} className={`template-card ${templateId === item.id ? 'chosen' : ''}`} aria-pressed={templateId === item.id} onClick={() => setTemplateId(item.id)}>
        <span className="template-thumb"><Player component={TEMPLATES[item.id].component} inputProps={{...previewProps}} durationInFrames={FPS * 15} compositionWidth={WIDTH} compositionHeight={HEIGHT} fps={FPS} style={{width: '100%', aspectRatio: '9 / 16'}} autoPlay loop muted initiallyMuted acknowledgeRemotionLicense/></span>
        <strong>{item.name}</strong><small>{item.style}</small></button>)}</div>
    </section>}
    <div className="create-grid">
      <section className="panel create-form"><div className="panel-title"><div><h2>2 · Your brand</h2><p>Only your own logo and words are used.</p></div></div>
        <div className="manual-form create-fields">
          <div className="manual-row"><label className="grow">Brand name<input value={brand.brandName} onChange={set('brandName')} maxLength={60} placeholder="e.g. Kape Kanto"/></label></div>
          <label>Tagline <small>(optional)</small><input value={brand.tagline} onChange={set('tagline')} maxLength={90} placeholder="e.g. Your neighborhood coffee, done right"/></label>
          <label>What should the ad say? <small>(the script uses only these facts)</small><textarea value={brand.description} onChange={set('description')} maxLength={600} rows={3} placeholder="Products, benefits, offer, where to buy. Example: Freshly roasted local beans, iced Spanish latte, open 7am–10pm in Las Piñas, order on GrabFood."/></label>
          <button type="button" className="text-button pol-help" onClick={() => window.dispatchEvent(new CustomEvent('pulse:pol-brief'))}><Sparkles size={13}/>Help me write this with POL AI</button>
          {templateId === 'motion' && <label>Style &amp; design prompt <small>(optional: e.g. “luxurious, serif, slow and calm” — AI turns it into fonts, background and motion)</small><input value={style} onChange={event => setStyle(event.target.value)} maxLength={200} placeholder="Describe the look you want"/></label>}
          <div className="manual-row colors">{[['primary', 'Main color'], ['accent', 'Accent'], ['background', 'Background']].map(([key, label]) => <label key={key}>{label}<span className="color-field"><input type="color" value={brand[key]} onChange={set(key)}/><code>{brand[key]}</code></span></label>)}</div>
          <div className="logo-field"><input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Choose logo" onChange={event => {const file = event.target.files[0];event.target.value = '';if (!file) return;if (file.size > 3 * 1024 * 1024) return setError('Logos must be 3 MiB or smaller.');setLogo(file);}}/>
            <button className="secondary-button" type="button" onClick={() => logoInput.current.click()}><Upload size={14}/>{logo ? 'Change logo' : 'Add logo'}</button>{logoUrl && <img src={logoUrl} alt="Logo preview"/>}{logo && <button className="text-button" type="button" onClick={() => setLogo(null)}>Remove</button>}<small className="report-caption">PNG with a transparent background looks best.</small></div>
        </div>
        <div className="panel-title script-title"><div><h2>3 · Script</h2><p>AI drafts it from your description; edit anything before generating.</p></div><button className="secondary-button" disabled={busy === 'script' || !brand.brandName.trim() || !brand.description.trim() || !setup?.script} onClick={writeScript}><Wand2 size={14}/>{busy === 'script' ? 'Writing…' : hasScript ? 'Rewrite' : 'Write script'}</button></div>
        <div className="manual-form create-fields">
          <label>Hook <small>{words(script.hook)}/7 words</small><input value={script.hook} onChange={event => setScript(current => ({...current, hook: event.target.value}))} placeholder="Stops the scroll in the first second"/></label>
          {script.lines.map((line, index) => <label key={index}>Line {index + 1} <small>{words(line)}/9 words</small><input value={line} onChange={event => setScript(current => ({...current, lines: current.lines.map((value, position) => position === index ? event.target.value : value)}))}/></label>)}
          <label>Call to action <small>{words(script.cta)}/4 words</small><input value={script.cta} onChange={event => setScript(current => ({...current, cta: event.target.value}))} placeholder="e.g. Order today"/></label>
          <label><span><Mic size={12}/> Voice</span>{voiceError ? <span className="inline-error">{voiceError}</span> : <select value={voiceId} onChange={event => setVoiceId(event.target.value)}>{voices.map(voice => <option key={voice.id} value={voice.id}>{voice.name}{voice.gender ? ` · ${voice.gender}` : ''}{voice.accent ? ` · ${voice.accent}` : ''}</option>)}</select>}</label>
          <button className="primary generate-button" disabled={!hasScript || !voiceId || !brand.brandName.trim() || busy === 'generate' || working || !setup?.voice} onClick={generate}><Sparkles size={15}/>{busy === 'generate' ? 'Starting…' : working ? 'Generating…' : `Generate ${chosen ? (templateId === 'matched' && inspiration ? `Matched to ${inspiration.advertiser}` : TEMPLATES[templateId]?.name) || '' : ''} video`}</button>
          <p className="report-caption">Generating records the voiceover with ElevenLabs (uses your ElevenLabs credits) and renders a 9:16 MP4 on this computer. Previews above are free. The same script and voice are reused from cache.</p>
          {setup && !setup.voice && <p className="notice error"><AlertCircle size={14}/>Add ELEVENLABS_API_KEY to server/.env and restart the backend to generate videos.</p>}
          {error && <p className="notice error" role="alert"><AlertCircle size={14}/>{error}</p>}
        </div>
      </section>
      <section className="panel create-preview"><div className="panel-title"><div><h2>Live preview</h2><p>{(templateId === 'matched' && inspiration ? `Matched to ${inspiration.advertiser}` : TEMPLATES[templateId]?.name)} · silent preview with your brand</p></div></div>
        <div className="preview-frame">{active?.status === 'completed' ? <video key={active.id} src={active.fileUrl} controls autoPlay playsInline/> : <Player component={chosen.component} inputProps={previewProps} durationInFrames={FPS * 15} compositionWidth={WIDTH} compositionHeight={HEIGHT} fps={FPS} style={{width: '100%', aspectRatio: '9 / 16'}} controls autoPlay loop acknowledgeRemotionLicense/>}</div>
        {active && <div className="create-status">
          {working && <><p>{active.stage}{active.status === 'rendering' ? ` · ${active.progress}%` : ''}</p><div className="prediction-progress"><i style={{width: `${active.status === 'rendering' ? 20 + active.progress * .8 : active.status === 'voicing' ? 12 : 4}%`}}/></div></>}
          {active.status === 'failed' && <p className="notice error"><AlertCircle size={14}/>{active.error?.message}</p>}
          {active.status === 'completed' && <div className="manual-actions"><a className="primary" href={`${active.fileUrl}?download=1`}><Download size={14}/>Download MP4</a><button className="secondary-button" onClick={() => addToLibrary(active)}>{active.libraryVideoId ? 'Open in PULSE' : 'Score it in PULSE'}<ArrowUpRight size={13}/></button><button className="text-button" onClick={() => setActive(null)}>Back to preview</button></div>}
        </div>}
      </section>
    </div>
    {jobs.length > 0 && <section className="panel create-history"><div className="panel-title"><div><h2>Generated videos</h2><p>Saved on this computer</p></div></div>
      <div className="video-grid">{jobs.map(job => <button key={job.id} className="video-card" onClick={() => setActive(job)}><span className="video-card-thumb">{job.status === 'completed' ? <video src={`${job.fileUrl}#t=1`} preload="metadata" muted/> : null}</span><span className="video-card-body"><strong>{job.brand.name} · {job.templateName}</strong>{job.inspiration && <small>Style inspired by {job.inspiration.advertiser}</small>}<small>{new Date(job.uploadedAt).toLocaleString()}{job.durationSeconds ? ` · ${job.durationSeconds}s` : ''}</small><span className="video-card-meta"><span className={`badge ${job.status === 'completed' ? 'badge-analyzed' : job.status === 'failed' ? 'badge-attention' : 'badge-working'}`}>{job.status === 'completed' ? 'Ready' : job.status === 'failed' ? 'Failed' : job.stage}</span></span></span></button>)}</div>
    </section>}
  </div>;
}
