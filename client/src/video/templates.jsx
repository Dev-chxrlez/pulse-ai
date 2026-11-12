import {AbsoluteFill, Audio, interpolate} from 'remotion';
import {MatchedStyle} from './matched.jsx';
import {MotionPro} from './motion.jsx';
import {CtaCard, FONT, Logo, fadeWindow, paceFactor, pop, readableOn, segmentTimings, useTime, wordsOrFallback} from './shared.jsx';

// 1. Bold Hook: full-screen kinetic text cards, alternating brand colors (text-led short-form ad style).
export function BoldHook(props) {
  const {brand, script, audio} = props;
  const {frame, fps, t, duration} = useTime();
  const timings = segmentTimings(props, duration);
  const cards = [[script.hook, timings.hook, true], ...script.lines.map((line, index) => [line, timings.lines[index], false])];
  const active = cards.findIndex(([, [start, end]]) => t >= start && t < end);
  const bg = active < 0 ? brand.background : active % 2 ? brand.accent : brand.primary;
  return <AbsoluteFill style={{background: bg}}>
    {audio && <Audio src={audio}/>}
    {cards.map(([text, window, hook], index) => {
      if (t < window[0] - .05 || t > window[1] + .05) return null;
      const color = readableOn(index % 2 ? brand.accent : brand.primary);
      const words = text.split(/\s+/);
      return <AbsoluteFill key={index} style={{justifyContent: 'center', padding: '0 90px', opacity: fadeWindow(t, window, .1)}}>
        <div style={{fontFamily: FONT, fontWeight: 900, fontSize: hook ? 150 : 118, lineHeight: 1.02, color, letterSpacing: -3, textTransform: hook ? 'uppercase' : 'none'}}>
          {words.map((word, wordIndex) => {const enter = pop(frame, fps, window[0] + wordIndex * .09 * paceFactor(props), {damping: 10, stiffness: 180 / paceFactor(props)});const last = wordIndex === words.length - 1 && !hook;
            return <span key={wordIndex} style={{display: 'inline-block', marginRight: 26, transform: `translateY(${interpolate(enter, [0, 1], [80, 0])}px) scale(${interpolate(enter, [0, 1], [.7, 1])})`, opacity: enter, borderBottom: last ? `14px solid ${color}` : 'none'}}>{word}</span>;})}
        </div>
      </AbsoluteFill>;
    })}
    <div style={{position: 'absolute', top: 120, left: 90, opacity: .9}}><Logo src={brand.logo} name={brand.name} size={90} color={readableOn(bg)}/></div>
    {t >= timings.cta[0] && <AbsoluteFill style={{background: brand.background}}><CtaCard brand={brand} cta={script.cta} t={t} window={timings.cta} frame={frame} fps={fps}/></AbsoluteFill>}
  </AbsoluteFill>;
}

// 2. Product Reveal: dark stage, glowing logo/product reveal, feature chips slide in one by one.
export function ProductReveal(props) {
  const {brand, script, audio} = props;
  const {frame, fps, t, duration} = useTime();
  const timings = segmentTimings(props, duration);
  const reveal = pop(frame, fps, timings.hook[1] - .3, {damping: 14, stiffness: 90 / paceFactor(props)});
  const sweep = interpolate(t, [timings.hook[1] - .3, timings.hook[1] + .9], [-120, 220], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return <AbsoluteFill style={{background: `radial-gradient(circle at 50% 40%, ${brand.primary}55 0%, ${brand.background} 60%), ${brand.background}`}}>
    {audio && <Audio src={audio}/>}
    <AbsoluteFill style={{alignItems: 'center', paddingTop: 230}}>
      <div style={{fontFamily: FONT, fontWeight: 800, fontSize: 92, color: '#fff', textAlign: 'center', padding: '0 100px', lineHeight: 1.08, opacity: interpolate(t, [0, .3], [0, 1], {extrapolateRight: 'clamp'}), transform: `translateY(${interpolate(pop(frame, fps, 0), [0, 1], [40, 0])}px)`}}>{script.hook}</div>
    </AbsoluteFill>
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', top: -120}}>
      <div style={{position: 'relative', transform: `scale(${reveal}) rotate(${interpolate(reveal, [0, 1], [-12, 0])}deg)`, padding: 70, borderRadius: 60, background: 'rgba(255,255,255,.06)', boxShadow: `0 0 160px ${brand.primary}88`, overflow: 'hidden'}}>
        <Logo src={brand.logo} name={brand.name} size={320}/>
        <div style={{position: 'absolute', top: 0, bottom: 0, left: `${sweep}%`, width: '35%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.45), transparent)', transform: 'skewX(-20deg)'}}/>
      </div>
    </AbsoluteFill>
    <AbsoluteFill style={{justifyContent: 'flex-end', padding: '0 90px 520px', gap: 28}}>
      {script.lines.map((line, index) => {const window = timings.lines[index];const enter = pop(frame, fps, window[0]);
        return t >= window[0] && t < timings.cta[0] ? <div key={index} style={{display: 'flex', alignItems: 'center', gap: 28, background: 'rgba(255,255,255,.1)', borderLeft: `12px solid ${brand.accent}`, borderRadius: 22, padding: '30px 38px', transform: `translateX(${interpolate(enter, [0, 1], [-900, 0])}px)`}}>
          <div style={{width: 64, height: 64, borderRadius: 32, background: brand.accent, color: readableOn(brand.accent), display: 'grid', placeItems: 'center', fontFamily: FONT, fontWeight: 900, fontSize: 40, flexShrink: 0}}>✓</div>
          <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 56, color: '#fff', lineHeight: 1.15}}>{line}</div></div> : null;})}
    </AbsoluteFill>
    {t >= timings.cta[0] && <AbsoluteFill style={{background: `radial-gradient(circle at 50% 45%, ${brand.primary}66 0%, ${brand.background} 65%), ${brand.background}`}}><CtaCard brand={brand} cta={script.cta} t={t} window={timings.cta} frame={frame} fps={fps}/></AbsoluteFill>}
  </AbsoluteFill>;
}

// 3. Story Captions: big word-by-word captions synced to the voice, highlighted current word, progress bar.
export function StoryCaptions(props) {
  const {brand, script, audio} = props;
  const {frame, fps, t, duration} = useTime();
  const timings = segmentTimings(props, duration);
  const words = wordsOrFallback(props, timings);
  const current = Math.max(0, words.findLastIndex(word => word.start <= t));
  // Caption chunks of up to 4 words that never cross a sentence boundary.
  const segmentStart = words.findIndex(word => word.segment === words[current]?.segment);
  const groupStart = segmentStart + Math.floor((current - segmentStart) / 4) * 4;
  const group = words.slice(groupStart, groupStart + 4).filter(word => word.segment === words[current]?.segment);
  const drift = Math.sin(t * .6) * 40;
  return <AbsoluteFill style={{background: `linear-gradient(160deg, ${brand.primary} 0%, ${brand.background} 75%)`}}>
    {audio && <Audio src={audio}/>}
    <div style={{position: 'absolute', width: 700, height: 700, borderRadius: '50%', background: brand.accent, opacity: .16, top: 200 + drift, right: -240, filter: 'blur(40px)'}}/>
    <div style={{position: 'absolute', width: 520, height: 520, borderRadius: '50%', background: '#ffffff', opacity: .07, bottom: 360 - drift, left: -200, filter: 'blur(30px)'}}/>
    <div style={{position: 'absolute', top: 110, left: 80, display: 'flex', alignItems: 'center', gap: 24}}><Logo src={brand.logo} name={brand.name} size={80}/></div>
    {t < timings.cta[0] && <AbsoluteFill style={{justifyContent: 'center', padding: '0 80px'}}>
      <div style={{fontFamily: FONT, fontWeight: 900, fontSize: 112, lineHeight: 1.12, color: '#fff', textAlign: 'center', textShadow: '0 8px 30px rgba(0,0,0,.35)'}}>
        {group.map((word, index) => {const isCurrent = groupStart + index === current;const enter = pop(frame, fps, word.start, {damping: 14, stiffness: 220 / paceFactor(props)});
          return <span key={groupStart + index} style={{display: 'inline-block', margin: '0 16px', padding: '0 14px', borderRadius: 18, background: isCurrent ? brand.accent : 'transparent', color: isCurrent ? readableOn(brand.accent) : '#fff', transform: `scale(${t >= word.start ? interpolate(enter, [0, 1], [.85, 1]) : .85})`, opacity: t >= word.start ? 1 : .35}}>{word.text}</span>;})}
      </div>
    </AbsoluteFill>}
    <div style={{position: 'absolute', left: 80, right: 80, bottom: 140, height: 10, borderRadius: 5, background: 'rgba(255,255,255,.2)'}}><div style={{height: '100%', width: `${Math.min(100, t / duration * 100)}%`, borderRadius: 5, background: brand.accent}}/></div>
    {t >= timings.cta[0] && <AbsoluteFill style={{background: `linear-gradient(160deg, ${brand.primary} 0%, ${brand.background} 75%)`}}><CtaCard brand={brand} cta={script.cta} t={t} window={timings.cta} frame={frame} fps={fps}/></AbsoluteFill>}
  </AbsoluteFill>;
}

export const TEMPLATES = {
  motion: {component: MotionPro, name: 'Motion Pro', style: 'Premium motion graphics: animated gradient, icons chosen for your business, masked kinetic type synced to the voice, designed transitions.', voice: 'match'},
  'bold-hook': {component: BoldHook, name: 'Bold Hook', style: 'Full-screen kinetic text, punchy word-by-word entrances, alternating brand colors. Common in text-led TikTok and Reels ads.', voice: 'energetic'},
  'product-reveal': {component: ProductReveal, name: 'Product Reveal', style: 'Dark stage, glowing logo or product reveal with a light sweep, feature chips slide in one by one, CTA end card.', voice: 'confident'},
  matched: {component: MatchedStyle, name: 'Matched style', style: 'Scene count, cut rhythm, transitions, opening and text treatment measured from a reference ad.', voice: 'match', hidden: true},
  'story-captions': {component: StoryCaptions, name: 'Story Captions', style: 'Large word-by-word captions synced to the voice with a highlighted current word. Works with sound off.', voice: 'warm'},
};
