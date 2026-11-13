import {createContext, useContext} from 'react';
import {AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, spring} from 'remotion';
import * as Icons from 'lucide-react';
import {FONT, Logo, readableOn, segmentTimings, useTime, wordsOrFallback} from './shared.jsx';

// Curated icons the AI may choose from (kept in sync with server/src/create/motion.js).
export const ICONS = ['Coffee', 'CupSoda', 'Utensils', 'Pizza', 'Cake', 'IceCream', 'Sandwich', 'Wine', 'Leaf', 'Sprout', 'Flower2', 'Sun', 'Moon', 'Clock', 'Calendar', 'MapPin', 'Store', 'ShoppingBag', 'ShoppingCart', 'Truck', 'Bike', 'Car', 'Plane', 'Home', 'Building2', 'Phone', 'Smartphone', 'Laptop', 'Wifi', 'Camera', 'Music', 'Headphones', 'Dumbbell', 'HeartPulse', 'Heart', 'Smile', 'Star', 'Award', 'Sparkles', 'Gift', 'Tag', 'Percent', 'Wallet', 'CreditCard', 'Shirt', 'Scissors', 'Paintbrush', 'Palette', 'BookOpen', 'GraduationCap', 'Baby', 'PawPrint', 'Shield', 'Zap', 'Users', 'MessageCircle', 'ThumbsUp', 'Check', 'Rocket', 'Globe'];
const IconOf = name => Icons[ICONS.includes(name) ? name : 'Sparkles'] || Icons.Sparkles;
export const motionSample = {icons: ['Sparkles', 'Coffee', 'Clock', 'MapPin']};
const ease = Easing.bezier(.16, 1, .3, 1);
// Prompt-based design settings (chosen by AI from the user's style words). Defaults = original look.
const FONTS = {clean: '"Helvetica Neue", Helvetica, Arial, sans-serif', bold: '"Arial Black", "Helvetica Neue", Impact, sans-serif', elegant: 'Didot, "Bodoni 72", Georgia, "Times New Roman", serif', playful: '"Arial Rounded MT Bold", "Trebuchet MS", "Helvetica Neue", sans-serif', tech: 'Menlo, "SF Mono", Consolas, monospace'};
const WEIGHTS = {clean: 900, bold: 900, elegant: 700, playful: 800, tech: 700};
const ENERGY = {calm: 1.6, balanced: 1, energetic: .6};
const Design = createContext(null);
function makeDesign(input, brand) {
  const design = {font: 'clean', background: 'gradient', energy: 'balanced', corners: 'rounded', textCase: 'normal', ...input};
  const fg = readableOn(brand.background);
  const dark = fg === '#ffffff';
  return {...design, family: FONTS[design.font] || FONTS.clean, weight: WEIGHTS[design.font] || 900, speed: ENERGY[design.energy] || 1, radius: design.corners === 'sharp' ? 6 : null, upper: design.textCase === 'upper', fg, glass: dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.05)', glassLine: dark ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.12)', faint: dark ? 'rgba(255,255,255,.3)' : 'rgba(0,0,0,.2)'};
}
const useDesign = () => useContext(Design) || makeDesign({}, {background: '#000000'});
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'};

function Background({brand, t, frame}) {
  const design = useDesign();
  const a = 30 + Math.sin(t * .45 / design.speed) * 22, b = 70 + Math.cos(t * .38 / design.speed) * 20;
  const line = design.fg === '#ffffff' ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)';
  if (design.background === 'solid') return <AbsoluteFill style={{background: brand.background}}/>;
  if (design.background === 'dots') return <AbsoluteFill style={{background: brand.background, backgroundImage: `radial-gradient(${line} 3px, transparent 3.5px)`, backgroundSize: '56px 56px', backgroundPosition: `0 ${-(t * 18 / design.speed) % 56}px`}}/>;
  if (design.background === 'stripes') return <AbsoluteFill style={{background: `repeating-linear-gradient(135deg, ${brand.background} 0 70px, ${brand.primary}22 70px 140px)`, backgroundPosition: `${(t * 30 / design.speed) % 198}px 0`}}/>;
  if (design.background === 'spotlight') return <AbsoluteFill style={{background: `radial-gradient(55% 40% at 50% ${42 + Math.sin(t * .5 / design.speed) * 6}%, ${brand.primary}88 0%, ${brand.background} 70%)`}}/>;
  if (design.background === 'grid') return <AbsoluteFill style={{background: brand.background, backgroundImage: `linear-gradient(${line} 2px, transparent 2px), linear-gradient(90deg, ${line} 2px, transparent 2px)`, backgroundSize: '120px 120px', backgroundPosition: `0 ${-(t * 24 / design.speed) % 120}px`}}/>;
  return <AbsoluteFill>
    <AbsoluteFill style={{background: `radial-gradient(60% 45% at ${a}% 28%, ${brand.primary}cc 0%, transparent 70%), radial-gradient(55% 40% at ${b}% 78%, ${brand.accent}55 0%, transparent 70%), linear-gradient(170deg, ${brand.background} 0%, ${brand.background} 100%)`}}/>
    <AbsoluteFill style={{backgroundImage: 'linear-gradient(rgba(255,255,255,.045) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,.045) 2px, transparent 2px)', backgroundSize: '120px 120px', backgroundPosition: `0 ${-(t * 24) % 120}px`, maskImage: 'radial-gradient(80% 60% at 50% 50%, #000 30%, transparent 80%)', WebkitMaskImage: 'radial-gradient(80% 60% at 50% 50%, #000 30%, transparent 80%)'}}/>
    <svg width="100%" height="100%" style={{position: 'absolute', inset: 0, opacity: .09, mixBlendMode: 'overlay'}}><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed={frame % 8}/></filter><rect width="100%" height="100%" filter="url(#grain)"/></svg>
  </AbsoluteFill>;
}
// Words slide up from behind a mask; the word being spoken is highlighted.
function KineticLine({words, t, size, color, accent, align = 'left', emphasis}) {
  const design = useDesign();
  return <div style={{fontFamily: design.family, fontWeight: design.weight, fontSize: design.upper ? size * .9 : size, lineHeight: 1.06, letterSpacing: design.font === 'tech' ? 0 : design.upper ? 1 : -2.5, color, textAlign: align, textTransform: design.upper ? 'uppercase' : 'none'}}>
    {words.map((word, index) => {const enter = interpolate(t, [word.start - .12 * design.speed, word.start + .22 * design.speed], [0, 1], {...clamp, easing: ease});const speaking = t >= word.start && t < word.end + .08;const strong = emphasis && word.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') === emphasis;
      return <span key={index} style={{display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom', marginRight: size * .24, paddingBottom: 6}}>
        <span style={{display: 'inline-block', transform: `translateY(${(1 - enter) * 110}%)`, color: strong ? accent : color, textShadow: speaking ? `0 0 28px ${accent}66` : undefined}}>{word.text}</span></span>;})}
  </div>;
}
function Underline({t, start, color, width = 420}) {
  const design = useDesign();
  const draw = interpolate(t, [start + .25 * design.speed, start + .9 * design.speed], [0, 1], {...clamp, easing: ease});
  return <div style={{height: 14, width: width * draw, background: color, borderRadius: 7, marginTop: 26}}/>;
}
function IconBadge({name, t, start, color, ring, size = 300, variant = 0, fps, frame}) {
  const Icon = IconOf(name);
  const enter = spring({frame: frame - Math.round(start * fps), fps, config: {damping: 13, stiffness: 120}});
  const dash = interpolate(t, [start, start + 1.1], [0, 1], {...clamp, easing: ease});
  const circumference = Math.PI * (size - 20);
  return <div style={{position: 'relative', width: size, height: size, transform: `scale(${enter}) rotate(${(1 - enter) * -25}deg)`}}>
    <svg width={size} height={size} style={{position: 'absolute', inset: 0, transform: `rotate(${t * 30}deg)`}}><circle cx={size / 2} cy={size / 2} r={(size - 20) / 2} fill="none" stroke={ring} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${circumference * dash * .8} ${circumference}`}/></svg>
    <div style={{position: 'absolute', inset: size * .14, borderRadius: '50%', background: `${color}22`, border: `2px solid ${color}55`, display: 'grid', placeItems: 'center', backdropFilter: 'blur(6px)'}}><Icon size={size * .38} color={color} strokeWidth={1.8}/></div>
    {variant === 1 && [0, 1, 2].map(dot => {const angle = t * 1.4 + dot * 2.09;return <div key={dot} style={{position: 'absolute', width: 22, height: 22, borderRadius: 11, background: ring, left: size / 2 - 11 + Math.cos(angle) * size * .58, top: size / 2 - 11 + Math.sin(angle) * size * .58, opacity: enter}}/>;})}
  </div>;
}
// Scene wipe: a brand-colored panel sweeps across at each scene change.
function Wipe({t, start, color, direction}) {
  const design = useDesign();
  const p = interpolate(t, [start - .28 * design.speed, start + .22 * design.speed], [0, 1], clamp);
  if (p <= 0 || p >= 1) return null;
  const x = direction ? (1 - p * 2) * 100 : (p * 2 - 1) * 100;
  return <AbsoluteFill style={{background: color, transform: `translateX(${x}%) skewX(-12deg)`, zIndex: 5}}/>;
}

// ---------- Photo ads: real-looking scenes built from the user's photos or AI photos ----------
// Each ad format has its own scene layouts, so a promo, a showcase and a story look different.
const FORMAT_LAYOUTS = {
  'problem-solution': {hook: 'full', lines: ['split', 'full', 'card'], cut: 'flash'},
  promo: {hook: 'stamp', lines: ['full', 'stamp', 'frame'], cut: 'flash'},
  showcase: {hook: 'full', lines: ['frame', 'full', 'split'], cut: 'wipe'},
  reasons: {hook: 'full', lines: ['number', 'number', 'number'], cut: 'flash'},
  story: {hook: 'caption', lines: ['caption', 'full', 'caption'], cut: 'wipe'},
};
const SCRIM = 'linear-gradient(0deg, rgba(0,0,0,.82) 0%, rgba(0,0,0,.42) 38%, rgba(0,0,0,0) 62%), linear-gradient(180deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,0) 22%)';
function Photo({src, t, start, end, variant = 0, filter}) {
  const design = useDesign();
  const p = Math.min(1, Math.max(0, (t - start) / Math.max(1.5, end - start + .4)));
  const moves = [[1.2, 1.05, 0], [1.04, 1.18, 0], [1.14, 1.14, 1]];
  const [from, to, pan] = moves[variant % 3];
  const scale = from + (to - from) * p, x = pan ? (p - .5) * -90 : 0;
  return <AbsoluteFill style={{overflow: 'hidden', background: '#000'}}>
    <Img src={src} style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale * (design.speed < 1 ? 1.02 : 1)}) translateX(${x}px)`, filter}}/>
  </AbsoluteFill>;
}
function Kicker({text, t, start, brand, light}) {
  const design = useDesign();
  if (!text) return null;
  const enter = interpolate(t, [start + .05, start + .45 * design.speed], [0, 1], {...clamp, easing: ease});
  return <div style={{alignSelf: 'flex-start', display: 'inline-block', marginBottom: 30, padding: '14px 26px', borderRadius: design.radius ?? 999, background: light ? brand.accent : `${brand.accent}`, color: readableOn(brand.accent), fontFamily: design.family, fontWeight: 800, fontSize: 36, letterSpacing: 3, textTransform: 'uppercase', transform: `translateX(${(1 - enter) * -120}px)`, opacity: enter, boxShadow: '0 12px 40px rgba(0,0,0,.3)'}}>{text}</div>;
}
function OfferSticker({offer, t, start, brand, fps, frame, top = 300, right = 70, size = 300}) {
  const design = useDesign();
  if (!offer) return null;
  const enter = spring({frame: frame - Math.round((start + .3) * fps), fps, config: {damping: 10, stiffness: 140}});
  const points = Array.from({length: 32}, (_, index) => {const r = index % 2 ? 44 : 50, a = index / 32 * Math.PI * 2;return `${50 + Math.cos(a) * r},${50 + Math.sin(a) * r}`;}).join(' ');
  return <div style={{position: 'absolute', top, right, width: size, height: size, transform: `scale(${enter}) rotate(${-14 + Math.sin(t * 2) * 4}deg)`, zIndex: 3}}>
    <svg viewBox="0 0 100 100" style={{position: 'absolute', inset: 0, filter: 'drop-shadow(0 12px 30px rgba(0,0,0,.4))'}}><polygon points={points} fill={brand.accent}/></svg>
    <div style={{position: 'absolute', inset: '17%', display: 'grid', placeItems: 'center', textAlign: 'center', fontFamily: design.family, fontWeight: 900, fontSize: offer.length > 18 ? 30 : offer.length > 10 ? 38 : 48, lineHeight: 1.05, color: readableOn(brand.accent), textTransform: 'uppercase'}}>{offer}</div>
  </div>;
}
function CaptionLine({words, t, brand}) {
  const design = useDesign();
  return <div style={{textAlign: 'center', fontFamily: design.family, fontWeight: design.weight, fontSize: 92, lineHeight: 1.25, color: '#fff', textTransform: design.upper ? 'uppercase' : 'none'}}>
    {words.map((word, index) => {const shown = t >= word.start - .05;const speaking = t >= word.start && t < word.end + .08;
      return <span key={index} style={{display: 'inline-block', margin: '0 10px', padding: '2px 18px', borderRadius: design.radius ?? 18, background: speaking ? brand.accent : 'transparent', color: speaking ? readableOn(brand.accent) : '#fff', opacity: shown ? 1 : .35, transform: `scale(${speaking ? 1.06 : 1})`, textShadow: speaking ? 'none' : '0 4px 22px rgba(0,0,0,.6)'}}>{word.text}</span>;})}
  </div>;
}
function PhotoScene({layout, src, scene, words, kicker, emphasis, offer, format, brand, t, start, end, fps, frame}) {
  const design = useDesign();
  const local = t - start;
  const line = (size, color = '#fff', align) => <div style={{textShadow: color === '#fff' ? '0 6px 30px rgba(0,0,0,.55)' : undefined}}><KineticLine words={words} t={t} size={size} color={color} accent={brand.accent} emphasis={emphasis} align={align}/></div>;
  const gray = format === 'problem-solution' && scene === 0 ? 'grayscale(1) contrast(1.15) brightness(.78)' : undefined;
  if (layout === 'split') {
    const reveal = interpolate(local, [0, .55 * design.speed], [100, 0], {...clamp, easing: ease});
    return <AbsoluteFill style={{background: brand.background}}>
      <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: 1150, clipPath: `inset(0 0 ${reveal}% 0)`}}><Photo src={src} t={t} start={start} end={end} variant={scene + 1}/></div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 1150, height: 12, background: brand.accent, transform: `scaleX(${1 - reveal / 100})`, transformOrigin: 'left'}}/>
      <AbsoluteFill style={{top: 1200, padding: '40px 84px 0', display: 'flex', flexDirection: 'column'}}><Kicker text={kicker} t={t} start={start} brand={brand}/>{line(88, design.fg)}</AbsoluteFill>
    </AbsoluteFill>;
  }
  if (layout === 'frame') {
    const enter = spring({frame: frame - Math.round(start * fps), fps, config: {damping: 14, stiffness: 110}});
    return <AbsoluteFill>
      <Background brand={brand} t={t} frame={frame}/>
      <div style={{position: 'absolute', left: 150, top: 250, width: 780, height: 980, borderRadius: design.radius ?? 40, overflow: 'hidden', border: '12px solid #fff', boxShadow: '0 50px 120px rgba(0,0,0,.45)', transform: `translateY(${(1 - enter) * 700}px) rotate(${(1 - enter) * 12 - 3}deg)`}}><Photo src={src} t={t} start={start} end={end} variant={scene}/></div>
      {format === 'promo' && <OfferSticker offer={offer} t={t} start={start} brand={brand} fps={fps} frame={frame} top={170} right={60} size={260}/>}
      <AbsoluteFill style={{top: 1300, padding: '0 84px', display: 'flex', flexDirection: 'column'}}><Kicker text={kicker} t={t} start={start} brand={brand}/>{line(84, design.fg)}</AbsoluteFill>
    </AbsoluteFill>;
  }
  if (layout === 'card') return <AbsoluteFill>
    <Photo src={src} t={t} start={start} end={end} variant={scene}/>
    <AbsoluteFill style={{background: 'rgba(0,0,0,.42)'}}/>
    <AbsoluteFill style={{justifyContent: 'center', padding: '0 70px'}}>
      <div style={{padding: '64px 60px', borderRadius: design.radius ?? 44, background: 'rgba(255,255,255,.12)', border: '2px solid rgba(255,255,255,.25)', backdropFilter: 'blur(18px)', display: 'flex', flexDirection: 'column', transform: `translateY(${interpolate(local, [0, .5 * design.speed], [240, 0], {...clamp, easing: ease})}px)`}}><Kicker text={kicker} t={t} start={start} brand={brand}/>{line(86)}</div>
    </AbsoluteFill>
  </AbsoluteFill>;
  if (layout === 'stamp') {
    const slam = spring({frame: frame - Math.round((start + .1) * fps), fps, config: {damping: 11, stiffness: 160}});
    return <AbsoluteFill>
      <Photo src={src} t={t} start={start} end={end} variant={scene + 2}/>
      <AbsoluteFill style={{background: SCRIM}}/>
      <OfferSticker offer={offer} t={t} start={start} brand={brand} fps={fps} frame={frame}/>
      <AbsoluteFill style={{justifyContent: 'flex-end', paddingBottom: 330}}>
        <div style={{alignSelf: 'flex-start', marginLeft: 84}}><Kicker text={kicker} t={t} start={start} brand={brand}/></div>
        <div style={{background: brand.accent, padding: '40px 84px', transform: `rotate(-4deg) scale(${.6 + slam * .4})`, opacity: Math.min(1, slam * 1.5), margin: '0 -40px', boxShadow: '0 30px 80px rgba(0,0,0,.4)'}}>
          <KineticLine words={words} t={t} size={words.length > 6 ? 82 : 96} color={readableOn(brand.accent)} accent={brand.primary === brand.accent ? '#000' : readableOn(brand.accent)} emphasis={emphasis}/>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>;
  }
  if (layout === 'number') {
    const enter = interpolate(local, [0, .5 * design.speed], [0, 1], {...clamp, easing: ease});
    return <AbsoluteFill>
      <Photo src={src} t={t} start={start} end={end} variant={scene}/>
      <AbsoluteFill style={{background: SCRIM}}/>
      <div style={{position: 'absolute', left: 60, top: 230, fontFamily: design.family, fontWeight: 900, fontSize: 420, lineHeight: 1, color: 'transparent', WebkitTextStroke: `10px ${brand.accent}`, opacity: enter, transform: `translateY(${(1 - enter) * 80}px)`, textShadow: '0 20px 60px rgba(0,0,0,.35)'}}>{scene}</div>
      <AbsoluteFill style={{justifyContent: 'flex-end', padding: '0 84px 320px', display: 'flex', flexDirection: 'column'}}><Kicker text={kicker} t={t} start={start} brand={brand}/>{line(96)}</AbsoluteFill>
    </AbsoluteFill>;
  }
  if (layout === 'caption') return <AbsoluteFill>
    <Photo src={src} t={t} start={start} end={end} variant={scene}/>
    <AbsoluteFill style={{background: 'linear-gradient(0deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.15) 50%, rgba(0,0,0,.35) 100%)'}}/>
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', padding: '0 70px', gap: 30, top: 380}}>
      {kicker && <div style={{fontFamily: design.family, fontWeight: 700, fontSize: 38, letterSpacing: 4, color: brand.accent, textTransform: 'uppercase', textShadow: '0 4px 20px rgba(0,0,0,.6)', opacity: interpolate(local, [0, .3], [0, 1], clamp)}}>{kicker}</div>}
      <CaptionLine words={words} t={t} brand={brand}/>
    </AbsoluteFill>
  </AbsoluteFill>;
  // full
  return <AbsoluteFill>
    <Photo src={src} t={t} start={start} end={end} variant={scene} filter={gray}/>
    <AbsoluteFill style={{background: SCRIM}}/>
    <AbsoluteFill style={{justifyContent: 'flex-end', padding: '0 84px 320px', display: 'flex', flexDirection: 'column'}}>
      <Kicker text={kicker} t={t} start={start} brand={brand}/>
      {line(scene === 0 ? (words.length > 5 ? 112 : 128) : 100)}
      {scene === 0 && <Underline t={t} start={start} color={brand.accent}/>}
    </AbsoluteFill>
  </AbsoluteFill>;
}
function Flash({t, start}) {
  const p = interpolate(t, [start - .04, start, start + .2], [0, .85, 0], clamp);
  return p > 0 ? <AbsoluteFill style={{background: '#fff', opacity: p, zIndex: 5}}/> : null;
}
// Music bed ducks under the voice; whoosh on every cut, riser into the CTA, pop when the button lands.
function Soundtrack({music, sfx, words, windows, cta, fps, duration}) {
  const speechAt = time => words.some(word => time >= word.start - .15 && time <= word.end + .3);
  const volume = frame => {const time = frame / fps;const fade = Math.min(1, time / .5, Math.max(0, (duration - time) / 1.2));return (speechAt(time) ? .14 : .3) * fade;};
  const at = (seconds, length, src, gain, key) => src && <Sequence key={key} from={Math.max(0, Math.round(seconds * fps))} durationInFrames={Math.round(length * fps)} layout="none"><Audio src={src} volume={gain}/></Sequence>;
  return <>
    {music && <Audio src={music} loop volume={volume}/>}
    {windows.slice(1).map(([start], index) => at(start - .28, .6, sfx?.whoosh, .45, `w${index}`))}
    {at(cta - 1.15, 1.2, sfx?.riser, .3, 'riser')}
    {at(cta, .6, sfx?.whoosh, .4, 'ctaw')}
    {at(cta + .5, .3, sfx?.pop, .5, 'pop')}
  </>;
}

export function MotionPro(props) {
  const {brand, script, audio} = props;
  const {frame, fps, t, duration} = useTime();
  const timings = segmentTimings(props, duration);
  const words = wordsOrFallback(props, timings);
  const icons = props.motion?.icons?.length ? props.motion.icons : motionSample.icons;
  const emphasis = (props.motion?.emphasis || []).map(word => String(word || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''));
  const windows = [timings.hook, ...timings.lines];
  const scene = Math.max(0, windows.findLastIndex(([start]) => t >= start));
  const inCta = t >= timings.cta[0];
  const design = makeDesign(props.motion?.design, brand);
  const fg = design.fg;
  const sceneWords = index => words.filter(word => word.segment === index);
  const [start] = windows[scene];
  const local = t - start;
  const layout = scene === 0 ? 'hook' : ['badge', 'hero', 'card'][(scene - 1) % 3];
  const push = interpolate(local, [0, 4], [1.04, 1], {...clamp, easing: ease});
  const photos = props.visuals?.length ? props.visuals : null;
  const format = FORMAT_LAYOUTS[props.motion?.format] ? props.motion.format : 'showcase';
  const plan = FORMAT_LAYOUTS[format];
  const kickers = props.motion?.kickers || [];
  const offer = props.motion?.offer || null;
  const audioLayer = <>{audio && <Audio src={audio}/>}<Soundtrack music={props.music} sfx={props.sfx} words={words} windows={windows} cta={timings.cta[0]} fps={fps} duration={duration}/></>;
  if (photos) {
    const [, end] = windows[scene];
    return <Design.Provider value={design}><AbsoluteFill style={{background: brand.background, overflow: 'hidden'}}>
      {audioLayer}
      {!inCta && <PhotoScene key={scene} layout={scene === 0 ? plan.hook : plan.lines[(scene - 1) % plan.lines.length]} src={photos[scene % photos.length]} scene={scene} words={sceneWords(scene)} kicker={kickers[scene]} emphasis={emphasis[scene]} offer={offer} format={format} brand={brand} t={t} start={start} end={end} fps={fps} frame={frame}/>}
      {!inCta && <div style={{position: 'absolute', top: 96, left: 84, right: 84, display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 4}}>
        <div style={{padding: '14px 22px', borderRadius: design.radius ?? 26, background: 'rgba(255,255,255,.9)', boxShadow: '0 10px 30px rgba(0,0,0,.25)'}}><Logo src={brand.logo} name={brand.name} size={64} color="#111"/></div>
        <div style={{display: 'flex', gap: 10}}>{windows.map((_, index) => <div key={index} style={{width: index === scene ? 44 : 14, height: 14, borderRadius: 7, background: index <= scene ? brand.accent : 'rgba(255,255,255,.45)'}}/>)}</div>
      </div>}
      {windows.slice(1).map(([at], index) => plan.cut === 'flash' ? <Flash key={index} t={t} start={at}/> : <Wipe key={index} t={t} start={at} color={index % 2 ? brand.primary : brand.accent} direction={index % 2}/>)}
      <Wipe t={t} start={timings.cta[0]} color={brand.primary} direction={1}/>
      {inCta && <AbsoluteFill>
        <Photo src={photos[0]} t={t} start={timings.cta[0]} end={duration} variant={1}/>
        <AbsoluteFill style={{background: `${brand.background}d9`}}/>
        <MotionCta brand={brand} cta={script.cta} t={t} start={timings.cta[0]} fps={fps} frame={frame}/>
        <OfferSticker offer={offer} t={t} start={timings.cta[0] + .4} brand={brand} fps={fps} frame={frame} top={150} right={60} size={250}/>
      </AbsoluteFill>}
    </AbsoluteFill></Design.Provider>;
  }
  return <Design.Provider value={design}><AbsoluteFill style={{background: brand.background, overflow: 'hidden'}}>
    {audioLayer}
    <Background brand={brand} t={t} frame={frame}/>
    {!inCta && <AbsoluteFill style={{transform: `scale(${push})`}}>
      {layout === 'hook' && <AbsoluteFill style={{justifyContent: 'center', padding: '0 96px', gap: 50}}>
        <IconBadge name={icons[0]} t={t} start={start} color={fg} ring={brand.accent} size={230} fps={fps} frame={frame}/>
        <div><KineticLine words={sceneWords(0)} t={t} size={sceneWords(0).length > 5 ? 118 : 138} color={fg} accent={brand.accent} emphasis={emphasis[0]}/><Underline t={t} start={start} color={brand.accent}/></div>
      </AbsoluteFill>}
      {layout === 'badge' && <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', padding: '0 90px', gap: 70}}>
        <IconBadge name={icons[scene]} t={t} start={start} color={fg} ring={brand.accent} size={380} fps={fps} frame={frame}/>
        <KineticLine words={sceneWords(scene)} t={t} size={92} color={fg} accent={brand.accent} align="center" emphasis={emphasis[scene]}/>
      </AbsoluteFill>}
      {layout === 'hero' && <AbsoluteFill style={{justifyContent: 'flex-end', padding: '0 96px 420px'}}>
        <div style={{position: 'absolute', top: 300, right: 60, opacity: .95}}><IconBadge name={icons[scene]} t={t} start={start} color={fg} ring={brand.accent} size={460} variant={1} fps={fps} frame={frame}/></div>
        <div style={{fontFamily: design.family, fontWeight: 700, fontSize: 34, letterSpacing: 6, color: brand.accent, marginBottom: 24, opacity: interpolate(local, [0, .3], [0, 1], clamp)}}>{String(scene).padStart(2, '0')} / 0{windows.length - 1}</div>
        <KineticLine words={sceneWords(scene)} t={t} size={104} color={fg} accent={brand.accent} emphasis={emphasis[scene]}/>
      </AbsoluteFill>}
      {layout === 'card' && <AbsoluteFill style={{justifyContent: 'center', padding: '0 70px'}}>
        <div style={{padding: '70px 64px', borderRadius: design.radius ?? 48, background: design.glass, border: `2px solid ${design.glassLine}`, boxShadow: '0 40px 120px rgba(0,0,0,.35)', backdropFilter: 'blur(14px)', transform: `translateY(${interpolate(local, [0, .5], [260, 0], {...clamp, easing: ease})}px)`, display: 'grid', gap: 48}}>
          <IconBadge name={icons[scene]} t={t} start={start} color={fg} ring={brand.accent} size={200} fps={fps} frame={frame}/>
          <KineticLine words={sceneWords(scene)} t={t} size={88} color={fg} accent={brand.accent} emphasis={emphasis[scene]}/>
        </div>
      </AbsoluteFill>}
    </AbsoluteFill>}
    {!inCta && <div style={{position: 'absolute', top: 104, left: 96, right: 96, display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
      <Logo src={brand.logo} name={brand.name} size={84} color={fg}/>
      <div style={{display: 'flex', gap: 10}}>{windows.map((_, index) => <div key={index} style={{width: index === scene ? 44 : 14, height: 14, borderRadius: 7, background: index <= scene ? brand.accent : design.faint}}/>)}</div>
    </div>}
    {windows.slice(1).map(([at], index) => <Wipe key={index} t={t} start={at} color={index % 2 ? brand.primary : brand.accent} direction={index % 2}/>)}
    <Wipe t={t} start={timings.cta[0]} color={brand.primary} direction={1}/>
    {inCta && <MotionCta brand={brand} cta={script.cta} t={t} start={timings.cta[0]} fps={fps} frame={frame}/>}
  </AbsoluteFill></Design.Provider>;
}
function MotionCta({brand, cta, t, start, fps, frame}) {
  const design = useDesign();
  const local = t - start;
  const enter = spring({frame: frame - Math.round(start * fps), fps, config: {damping: 12, stiffness: 110}});
  const burst = interpolate(local, [0, 1.1], [0, 1], {...clamp, easing: ease});
  const pulse = 1 + Math.sin(local * 6) * .03;
  return <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', gap: 56}}>
    {[0, 1, 2].map(ring => <div key={ring} style={{position: 'absolute', width: 520 + ring * 220, height: 520 + ring * 220, borderRadius: '50%', border: `3px solid ${brand.accent}`, opacity: (1 - burst) * (.7 - ring * .2), transform: `scale(${.6 + burst * .6})`, top: 560 - ring * 110}}/>)}
    <div style={{transform: `scale(${enter})`, padding: 40, borderRadius: design.radius ?? 40, background: design.glass, border: `2px solid ${design.glassLine}`}}><Logo src={brand.logo} name={brand.name} size={250} color={design.fg}/></div>
    {brand.tagline && <div style={{fontFamily: design.family, fontSize: 56, fontWeight: 600, color: design.fg, textTransform: design.upper ? 'uppercase' : 'none', textAlign: 'center', padding: '0 110px', opacity: interpolate(local, [.25, .7], [0, 1], clamp), transform: `translateY(${interpolate(local, [.25, .7], [30, 0], clamp)}px)`}}>{brand.tagline}</div>}
    <div style={{transform: `scale(${interpolate(local, [.45, .9], [0, 1], {...clamp, easing: ease}) * pulse})`, background: brand.accent, color: readableOn(brand.accent), fontFamily: design.family, fontWeight: design.weight, fontSize: 66, padding: '36px 88px', borderRadius: design.radius ?? 999, textTransform: design.upper ? 'uppercase' : 'none', boxShadow: `0 24px 70px ${brand.accent}66`}}>{cta}</div>
  </AbsoluteFill>;
}
