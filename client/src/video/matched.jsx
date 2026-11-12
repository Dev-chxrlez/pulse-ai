import {AbsoluteFill, Audio, interpolate} from 'remotion';
import {CtaCard, FONT, Logo, pop, readableOn, segmentTimings, useTime, wordsOrFallback} from './shared.jsx';

// Structure measured from a reference ad (style blueprint). Defaults keep the preview working.
export const defaultBlueprint = {pace: 'medium', cuts: [.25, .5, .75], brandEarly: false, textHeavy: true, ctaFound: true};

// Scene boundaries follow the reference's cut rhythm, scaled to this video's spoken length.
export function sceneBounds(blueprint, length) {
  const points = [0, ...(blueprint.cuts || []).filter(value => value > 0 && value < 1), 1].sort((a, b) => a - b);
  const bounds = [];
  for (const point of points) { const time = point * length; if (!bounds.length || time - bounds.at(-1) >= .6 || point === 1) bounds.push(time); }
  if (bounds.length > 1 && bounds.at(-1) - bounds.at(-2) < .6) bounds.splice(-2, 1);
  return bounds.length > 1 ? bounds : [0, length];
}
const shapes = ['circle', 'bar', 'ring', 'corner'];
function Shape({kind, color, progress, index}) {
  const spin = progress * 40 * (index % 2 ? -1 : 1);
  const base = {position: 'absolute', opacity: .9};
  if (kind === 'circle') return <div style={{...base, width: 760, height: 760, borderRadius: '50%', background: color, opacity: .22, right: -260 + progress * 80, top: 120 - progress * 60}}/>;
  if (kind === 'bar') return <div style={{...base, width: 1500, height: 180, background: color, opacity: .35, left: -200, bottom: 520 + progress * 40, transform: `rotate(${-8 + spin / 10}deg)`}}/>;
  if (kind === 'ring') return <div style={{...base, width: 620, height: 620, borderRadius: '50%', border: `40px solid ${color}`, opacity: .35, left: -180, bottom: 260, transform: `rotate(${spin}deg)`}}/>;
  return <div style={{...base, width: 520, height: 520, background: color, opacity: .3, right: -120, bottom: -120, transform: `rotate(${45 + spin}deg)`}}/>;
}

export function MatchedStyle(props) {
  const {brand, audio} = props;
  const blueprint = {...defaultBlueprint, ...props.style?.blueprint, pace: props.style?.pace || props.style?.blueprint?.pace || 'medium'};
  const {frame, fps, t, duration} = useTime();
  const timings = segmentTimings(props, duration);
  const words = wordsOrFallback(props, timings);
  const length = timings.cta[0];
  const bounds = sceneBounds(blueprint, length);
  const scene = Math.max(0, bounds.findLastIndex(start => start <= t));
  const [start, end] = [bounds[scene], bounds[scene + 1] ?? length];
  const progress = Math.min(1, Math.max(0, (t - start) / Math.max(.1, end - start)));
  const palette = [brand.primary, brand.background, brand.accent];
  const bg = palette[scene % 2 ? 1 : 0];
  const fg = readableOn(bg);
  // Transition per measured pace: fast = hard cut with zoom punch, medium = slide, slow = crossfade + slow push-in.
  const since = t - start;
  const motion = blueprint.pace === 'fast' ? {transform: `scale(${interpolate(since, [0, .2], [1.12, 1], {extrapolateRight: 'clamp'})})`}
    : blueprint.pace === 'slow' ? {opacity: interpolate(since, [0, .5], [0, 1], {extrapolateRight: 'clamp'}), transform: `scale(${1 + progress * .06})`}
    : {transform: `translateX(${interpolate(since, [0, .35], [220, 0], {extrapolateRight: 'clamp'})}px)`, opacity: interpolate(since, [0, .2], [0, 1], {extrapolateRight: 'clamp'})};
  // Show only the phrase being spoken: up to 5 words of the current sentence, inside this scene.
  const inScene = words.filter(word => word.start >= start - .05 && word.start < end && word.start < length);
  const currentIndex = Math.max(0, inScene.findLastIndex(word => word.start <= t));
  const current = inScene[currentIndex];
  const sentence = inScene.filter(word => word.segment === current?.segment);
  const position = sentence.indexOf(current);
  const sceneWords = sentence.slice(Math.floor(Math.max(0, position) / 5) * 5, Math.floor(Math.max(0, position) / 5) * 5 + 5);
  const spoken = sceneWords.filter(word => word.start <= t);
  const opening = scene === 0;
  return <AbsoluteFill style={{background: bg, overflow: 'hidden'}}>
    {audio && <Audio src={audio}/>}
    {t < length && <AbsoluteFill style={motion}>
      <Shape kind={shapes[scene % shapes.length]} color={scene % 2 ? brand.primary : brand.accent} progress={progress} index={scene}/>
      {opening && blueprint.brandEarly && <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', top: -260}}><div style={{transform: `scale(${pop(frame, fps, 0)})`}}><Logo src={brand.logo} name={brand.name} size={300} color={fg}/></div></AbsoluteFill>}
      <AbsoluteFill style={{justifyContent: blueprint.textHeavy || opening ? 'center' : 'flex-end', padding: blueprint.textHeavy || opening ? '0 90px' : '0 80px 420px', top: opening && blueprint.brandEarly ? 260 : 0}}>
        <div style={{fontFamily: FONT, fontWeight: 900, color: fg, letterSpacing: -2, lineHeight: 1.05, fontSize: blueprint.textHeavy || opening ? (sceneWords.length > 6 ? 96 : 124) : 72, textAlign: blueprint.textHeavy || opening ? 'left' : 'center', ...(blueprint.textHeavy || opening ? {} : {background: 'rgba(0,0,0,.45)', color: '#fff', padding: '28px 36px', borderRadius: 24})}}>
          {sceneWords.map((word, index) => {const shown = spoken.includes(word);const enter = pop(frame, fps, word.start, {damping: 13, stiffness: blueprint.pace === 'fast' ? 260 : 170});
            return <span key={`${scene}-${index}`} style={{display: 'inline-block', marginRight: 22, opacity: shown ? 1 : .18, transform: `translateY(${shown ? interpolate(enter, [0, 1], [40, 0]) : 0}px)`}}>{word.text}</span>;})}
        </div>
      </AbsoluteFill>
      {!(opening && blueprint.brandEarly) && <div style={{position: 'absolute', top: 110, left: 90}}><Logo src={brand.logo} name={brand.name} size={90} color={fg}/></div>}
      <div style={{position: 'absolute', left: 90, right: 90, bottom: 150, display: 'flex', gap: 10}}>{bounds.slice(0, -1).map((_, index) => <div key={index} style={{flex: 1, height: 8, borderRadius: 4, background: index < scene ? fg : index === scene ? brand.accent : `${fg}33`}}/>)}</div>
    </AbsoluteFill>}
    {t >= length && <AbsoluteFill style={{background: brand.background}}><CtaCard brand={brand} cta={props.script.cta} t={t} window={timings.cta} frame={frame} fps={fps}/></AbsoluteFill>}
  </AbsoluteFill>;
}
