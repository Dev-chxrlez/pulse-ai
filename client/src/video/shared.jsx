import {AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

export const FPS = 30, WIDTH = 1080, HEIGHT = 1920;
export const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

// Sample content for the free in-browser preview (no AI or voice calls).
export const sampleProps = {
  brand: {name: 'Your Brand', tagline: 'Made for everyday moments', logo: null, primary: '#1f6feb', accent: '#ffd23f', background: '#0b1020'},
  script: {hook: 'Stop scrolling for this', lines: ['Fresh flavors made daily', 'Delivered in thirty minutes', 'Loved by over ten thousand customers'], cta: 'Order today'},
  audio: null,
  timings: null,
  words: [],
};

// Evenly spaced segment timings when no voiceover exists (preview).
export function segmentTimings(props, duration) {
  if (props.timings) return props.timings;
  const parts = 2 + props.script.lines.length;
  const usable = duration - 1.5;
  const step = usable / parts;
  return {hook: [0, step], lines: props.script.lines.map((_, index) => [step * (index + 1), step * (index + 2)]), cta: [step * (parts - 1), duration]};
}
export function wordsOrFallback(props, timings) {
  if (props.words?.length) return props.words;
  const segments = [[props.script.hook, timings.hook], ...props.script.lines.map((line, index) => [line, timings.lines[index]]), [props.script.cta, timings.cta]];
  return segments.flatMap(([text, [start, end]], segment) => {const words = text.split(/\s+/).filter(Boolean);const span = (Math.min(end, start + words.length * .45) - start) / Math.max(1, words.length);return words.map((word, index) => ({text: word, start: start + index * span, end: start + (index + 1) * span, segment}));});
}
// Measured pace from a reference ad: faster pace = quicker, snappier entrances.
export const paceFactor = props => ({fast: .6, medium: 1, slow: 1.5})[props.style?.pace] || 1;
export function useTime() {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  return {frame, fps, t: frame / fps, duration: durationInFrames / fps};
}
export function pop(frame, fps, startSeconds, config = {damping: 12, stiffness: 140}) {
  return spring({frame: frame - Math.round(startSeconds * fps), fps, config});
}
export function fadeWindow(t, [start, end], edge = .18) {
  return interpolate(t, [start, start + edge, Math.max(start + edge, end - edge), end], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
}
export function Logo({src, name, size = 220, color = '#fff'}) {
  return src ? <Img src={src} style={{maxWidth: size * 1.6, maxHeight: size, objectFit: 'contain'}}/>
    : <div style={{fontFamily: FONT, fontWeight: 900, fontSize: Math.max(44, size * .32), color, letterSpacing: -2, textAlign: 'center'}}>{name}</div>;
}
export function readableOn(hex) {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16) / 255);
  return 0.299 * r + 0.587 * g + 0.114 * b > .6 ? '#111111' : '#ffffff';
}
export function CtaCard({brand, cta, t, window: [start], frame, fps}) {
  const enter = pop(frame, fps, start);
  const pulse = 1 + Math.sin((t - start) * 6) * .035;
  return <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', gap: 60, opacity: interpolate(t, [start, start + .2], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
    <div style={{transform: `scale(${interpolate(enter, [0, 1], [.6, 1])})`}}><Logo src={brand.logo} name={brand.name} size={260}/></div>
    {brand.tagline && <div style={{fontFamily: FONT, fontSize: 54, color: '#fff', opacity: .9, textAlign: 'center', padding: '0 120px', fontWeight: 500}}>{brand.tagline}</div>}
    <div style={{transform: `scale(${enter * pulse})`, background: brand.accent, color: readableOn(brand.accent), fontFamily: FONT, fontWeight: 900, fontSize: 64, padding: '34px 80px', borderRadius: 999, boxShadow: '0 20px 60px rgba(0,0,0,.35)'}}>{cta}</div>
  </AbsoluteFill>;
}
