// Synthesizes PULSE's own royalty-free music beds and sound effects (no samples, no third-party audio).
// Run: node server/scripts/make-audio.mjs  ->  server/assets/audio/*.mp3 (needs ffmpeg).
import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync, rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const OUT = fileURLToPath(new URL('../assets/audio/', import.meta.url));
const SR = 44100;
let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const midi = note => 440 * 2 ** ((note - 69) / 12);
const buffer = seconds => [new Float32Array(Math.ceil(seconds * SR)), new Float32Array(Math.ceil(seconds * SR))];
const mix = (bus, at, samples, gain = 1, pan = 0) => {
  const start = Math.floor(at * SR), left = gain * Math.min(1, 1 - pan), right = gain * Math.min(1, 1 + pan);
  for (let i = 0; i < samples.length && start + i < bus[0].length; i++) { bus[0][start + i] += samples[i] * left; bus[1][start + i] += samples[i] * right; }
};

// --- instruments ---
function kick(punch = 1) {
  const n = Math.floor(.42 * SR), out = new Float32Array(n);let phase = 0;
  for (let i = 0; i < n; i++) { const t = i / SR;const f = 45 + 110 * punch * Math.exp(-t * 32);phase += 2 * Math.PI * f / SR;out[i] = Math.sin(phase) * Math.exp(-t * 7.5) + (i < 90 ? rand() * .25 * (1 - i / 90) : 0); }
  return out;
}
function noiseHit(decay, tone, length = .3) {
  const n = Math.floor(length * SR), out = new Float32Array(n);let last = 0, low = 0;
  for (let i = 0; i < n; i++) { const t = i / SR, x = rand();const high = x - last;last = x;low += (x - low) * .25;out[i] = (high * tone + low * (1 - tone)) * Math.exp(-t * decay); }
  return out;
}
const hat = (open = false) => noiseHit(open ? 18 : 60, 1, open ? .25 : .08);
function clap() {
  const base = noiseHit(22, .6, .3);
  for (const delay of [.011, .023]) { const d = Math.floor(delay * SR);for (let i = base.length - 1; i >= d; i--) base[i] += base[i - d] * .6; }
  return base;
}
function pluck(note, length = .6, bright = .5) {
  const f = midi(note), period = Math.max(2, Math.round(SR / f)), n = Math.floor(length * SR), out = new Float32Array(n), ring = new Float32Array(period);
  let smooth = 0;for (let i = 0; i < period; i++) { smooth += (rand() - smooth) * (.25 + bright * .75);ring[i] = smooth; }
  const w = .5;
  for (let i = 0; i < n; i++) { const j = i % period, k = (i + 1) % period;const v = ring[j];ring[j] = (v * (1 - w) + ring[k] * w) * .996;out[i] = v * Math.min(1, (n - i) / 800); }
  return out;
}
function pad(notes, length, cutoff = .04, attack = .5) {
  const n = Math.floor(length * SR), out = new Float32Array(n);let low = 0, low2 = 0;
  const voices = notes.flatMap(note => [-.08, 0, .08].map(detune => ({f: midi(note + detune), p: (rand() + 1) / 2})));
  for (let i = 0; i < n; i++) {
    const t = i / SR;let s = 0;
    for (const v of voices) { v.p = (v.p + v.f / SR) % 1;s += v.p * 2 - 1; }
    s /= voices.length;low += (s - low) * cutoff;low2 += (low - low2) * cutoff;
    out[i] = low2 * Math.min(1, t / attack) * Math.min(1, (length - t) / .4) * 2.2;
  }
  return out;
}
function keys(notes, length) {
  const n = Math.floor(length * SR), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR;let s = 0;for (const note of notes) { const f = midi(note);s += Math.sin(2 * Math.PI * f * t + .6 * Math.sin(2 * Math.PI * f * 2 * t) * Math.exp(-t * 3)); }
    out[i] = s / notes.length * Math.exp(-t * 1.6) * Math.min(1, t * 200) * (1 + .15 * Math.sin(2 * Math.PI * 5 * t)); }
  return out;
}
function bass(note, length, drive = 1.5) {
  const n = Math.floor(length * SR), out = new Float32Array(n), f = midi(note);
  for (let i = 0; i < n; i++) { const t = i / SR;out[i] = Math.tanh(Math.sin(2 * Math.PI * f * t) * drive) * Math.min(1, t * 150) * Math.min(1, (length - t) * 40); }
  return out;
}

// --- arrangement ---
function track({bpm, bars, chords, style}) {
  const beat = 60 / bpm, barLength = beat * 4, length = bars * barLength + 2;
  const bus = buffer(length);
  for (let bar = 0; bar < bars; bar++) {
    const at = bar * barLength, chord = chords[bar % chords.length], intro = bar < 1, outro = bar === bars - 1;
    if (style === 'upbeat') {
      mix(bus, at, pad(chord.map(note => note + 12), barLength, .05, .05), .16);
      for (let b = 0; b < 4; b++) { if (!intro) mix(bus, at + b * beat, kick(1), .62); mix(bus, at + b * beat + beat / 2, hat(), .16, .3); if (!intro && b % 2) mix(bus, at + b * beat, clap(), .3, -.1); }
      for (let e = 0; e < 8; e++) if (!intro) mix(bus, at + e * beat / 2, bass(chord[0] - 12, beat / 2 * .9), .28);
      const arp = [0, 1, 2, 1, 0, 2, 1, 2];
      for (let s = 0; s < 8; s++) mix(bus, at + s * beat / 2, pluck(chord[arp[s]] + 24, .4, .6), .2, s % 2 ? .35 : -.35);
      if (outro) mix(bus, at + barLength, hat(true), .2);
    } else if (style === 'chill') {
      mix(bus, at, keys(chord, barLength), .3);mix(bus, at + beat * 2.5, keys(chord.map(note => note + 12), barLength / 2), .12, .3);
      mix(bus, at, bass(chord[0] - 12, beat * 1.8, 1.1), .3);mix(bus, at + beat * 2.5, bass(chord[0] - 12, beat * 1.2, 1.1), .25);
      if (!intro) { mix(bus, at, kick(.6), .5);mix(bus, at + beat * 2.5, kick(.6), .4);mix(bus, at + beat, clap(), .18);mix(bus, at + beat * 3, clap(), .18); }
      for (let e = 0; e < 8; e++) mix(bus, at + e * beat / 2 + (e % 2 ? beat * .08 : 0), hat(), e % 2 ? .07 : .11, .25);
    } else {
      mix(bus, at, pad(chord, barLength + .3, .025, .9), .3);
      mix(bus, at, bass(chord[0] - 24, barLength * .95, 1.2), .3);
      if (!intro) { mix(bus, at, kick(.8), .55);mix(bus, at + beat * 2.75, kick(.6), .35);mix(bus, at + beat * 2, clap(), .22, .1); }
      for (let s = 0; s < 16; s++) mix(bus, at + s * beat / 4, hat(), s % 4 === 2 ? .1 : .045, -.2);
      for (const [step, idx] of [[0, 2], [3, 1], [6, 0], [10, 2]]) mix(bus, at + step * beat / 4, pluck(chord[idx] + 24, .9, .3), .14, .4);
    }
  }
  return bus;
}
function whoosh() {
  const length = .55, bus = buffer(length);let low = 0, band = 0;
  for (let i = 0; i < bus[0].length; i++) { const t = i / SR, p = t / length;const cutoff = .02 + .35 * Math.sin(Math.PI * p) ** 2;const x = rand();low += (x - low) * cutoff;band += (low - band) * cutoff * .5;const v = (low - band) * Math.sin(Math.PI * p) ** 1.5 * 2.2;bus[0][i] = v * (1 - p * .6);bus[1][i] = v * (.4 + p * .6); }
  return bus;
}
function pop() {
  const length = .18, bus = buffer(length);let phase = 0;
  for (let i = 0; i < bus[0].length; i++) { const t = i / SR;phase += 2 * Math.PI * (520 + 900 * Math.min(1, t * 25)) / SR;const v = Math.sin(phase) * Math.exp(-t * 28) * .9;bus[0][i] = v;bus[1][i] = v; }
  return bus;
}
function riser() {
  const length = 1.2, bus = buffer(length);let low = 0;
  for (let i = 0; i < bus[0].length; i++) { const t = i / SR, p = t / length;const x = rand();low += (x - low) * (.01 + .3 * p * p);const tone = Math.sin(2 * Math.PI * (200 + 900 * p * p) * t) * .25;const v = (low * 1.6 + tone) * p ** 2 * Math.min(1, (length - t) * 30);bus[0][i] = v;bus[1][i] = v; }
  return bus;
}

function save(name, [left, right], {fadeIn = 0, fadeOut = 0, peak = .89} = {}) {
  let max = 1e-9;
  for (const ch of [left, right]) for (let i = 0; i < ch.length; i++) { ch[i] = Math.tanh(ch[i] * 1.2);max = Math.max(max, Math.abs(ch[i])); }
  const n = left.length, pcm = Buffer.alloc(44 + n * 4);
  pcm.write('RIFF', 0);pcm.writeUInt32LE(36 + n * 4, 4);pcm.write('WAVEfmt ', 8);pcm.writeUInt32LE(16, 16);pcm.writeUInt16LE(1, 20);pcm.writeUInt16LE(2, 22);pcm.writeUInt32LE(SR, 24);pcm.writeUInt32LE(SR * 4, 28);pcm.writeUInt16LE(4, 32);pcm.writeUInt16LE(16, 34);pcm.write('data', 36);pcm.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { const t = i / SR, env = Math.min(1, fadeIn ? t / fadeIn : 1, fadeOut ? (n / SR - t) / fadeOut : 1);
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i] / max * peak * env)) * 32767), 44 + i * 4);pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i] / max * peak * env)) * 32767), 46 + i * 4); }
  const wav = path.join(OUT, `${name}.wav`);writeFileSync(wav, pcm);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', name.startsWith('music') ? '112k' : '96k', path.join(OUT, `${name}.mp3`)]);
  rmSync(wav);
}

mkdirSync(OUT, {recursive: true});
// Chords as MIDI notes (root position triads / sevenths). 16 bars each, longer than any PULSE ad.
save('music-upbeat', track({bpm: 118, bars: 18, style: 'upbeat', chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]}), {fadeIn: .05, fadeOut: 2});
save('music-chill', track({bpm: 84, bars: 13, style: 'chill', chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]]}), {fadeIn: .3, fadeOut: 2});
save('music-premium', track({bpm: 96, bars: 15, style: 'premium', chords: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]]}), {fadeIn: .6, fadeOut: 2});
save('sfx-whoosh', whoosh(), {peak: .8});
save('sfx-pop', pop(), {peak: .7});
save('sfx-riser', riser(), {peak: .7});
console.log('Audio written to', OUT);
