import {createContext, useContext} from 'react';
import {AbsoluteFill, Audio, Easing, interpolate, spring} from 'remotion';
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
        <span style={{display: 'inline-block', transform: `translateY(${(1 - enter) * 110}%)`, color: strong ? accent : color, textShadow: speaking ? `0 0 28px ${accent}66` : 'none'}}>{word.text}</span></span>;})}
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
  return <Design.Provider value={design}><AbsoluteFill style={{background: brand.background, overflow: 'hidden'}}>
    {audio && <Audio src={audio}/>}
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
