import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {apiRequest} from '../api';

// Animated AI-agent mark: floats, scans, blinks and twinkles (pure SVG + CSS).
export function AgentIcon({gaze = null}) {
  const sparkle = 'M0,-9 C1.2,-2 2,-1.2 9,0 C2,1.2 1.2,2 0,9 C-1.2,2 -2,1.2 -9,0 C-2,-1.2 -1.2,-2 0,-9Z';
  return <svg className="agent-icon" viewBox="-20 -14 160 140" role="img" aria-label="POL AI agent">
    <g className="agent-sparkles"><path d={sparkle} transform="translate(118 18)" className="sp sp1"/><path d={sparkle} transform="translate(-6 30) scale(.7)" className="sp sp2"/><path d={sparkle} transform="translate(126 98) scale(.6)" className="sp sp3"/></g>
    <g className="agent-float">
      <circle className="agent-antenna-glow" cx="60" cy="10" r="9"/>
      <rect x="54" y="4" width="12" height="22" rx="6" className="agent-body"/>
      <rect x="6" y="46" width="16" height="34" rx="6" className="agent-body"/>
      <rect x="98" y="46" width="16" height="34" rx="6" className="agent-body"/>
      <rect x="22" y="22" width="76" height="80" rx="22" className="agent-body"/>
      <g className="agent-look" style={gaze ? {transform: `translate(${gaze.x}px, ${gaze.y}px)`, animation: 'none'} : undefined}><g className="agent-eyes"><circle cx="44" cy="62" r="10" className="agent-eye"/><circle cx="76" cy="62" r="10" className="agent-eye"/></g></g>
    </g>
  </svg>;
}

// Invisible placeholder marking where the agent should stand on the current page.
export function AgentSpot({size = 'small'}) { return <div data-agent-spot className={`agent-spot agent-spot-${size}`} aria-hidden="true"/>; }


// Playful commands the agent understands (typed or tapped).
const ACTIONS = {
  jump: {words: ['jump', 'hop', 'leap', 'talon'], reply: 'Wheee! 🚀'},
  dance: {words: ['dance', 'groove', 'boogie', 'sayaw'], reply: 'Dance break! 💃'},
  roll: {words: ['roll', 'tumble', 'gulong'], reply: 'Rolling, rolling… 🌀'},
  spin: {words: ['spin', 'twirl', 'turn', 'ikot'], reply: 'Weee, I’m dizzy! 😵‍💫'},
  wave: {words: ['wave', 'hello', 'hi', 'hey', 'kumusta'], reply: 'Hello there! 👋'},
  sleep: {words: ['sleep', 'nap', 'rest', 'tulog'], reply: 'Zzz… 😴'},
};
// Soft hop sounds, synthesized with Web Audio (no files). Short, cute "boing" tones.
let audio = null;
const SOUND_KEY = 'pulse.agent.sound';
const soundOn = () => { try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; } };
const setSound = on => { try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* optional */ } };
// Safari (and Chrome) only allow audio that was started by a click or key press, so the
// audio engine is created and unlocked on the user's first interaction; later hops can then play.
function unlockAudio() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state !== 'running') audio.resume();
    const silent = audio.createBuffer(1, 1, 22050), source = audio.createBufferSource();
    source.buffer = silent;source.connect(audio.destination);source.start(0);
  } catch { /* audio unavailable */ }
}
if (typeof window !== 'undefined') for (const type of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(type, unlockAudio, {passive: true});
function boop(pitch, volume = .16, length = .16) {
  try {
    if (!audio) return;
    if (audio.state !== 'running') audio.resume();
    const now = audio.currentTime, tone = audio.createOscillator(), body = audio.createOscillator(), level = audio.createGain();
    tone.type = 'sine';body.type = 'triangle';
    // Quick upward "boing" with a soft triangle body so it's audible on laptop speakers.
    for (const [osc, ratio] of [[tone, 1], [body, .5]]) {
      osc.frequency.setValueAtTime(pitch * ratio, now);
      osc.frequency.exponentialRampToValueAtTime(pitch * ratio * 1.9, now + length * .55);
      osc.connect(level);osc.start(now);osc.stop(now + length + .03);
    }
    level.gain.setValueAtTime(.0001, now);
    level.gain.exponentialRampToValueAtTime(volume, now + .01);
    level.gain.exponentialRampToValueAtTime(.0001, now + length);
    level.connect(audio.destination);
  } catch { /* audio unavailable: stay silent */ }
}
// Little-robot chirps: a quick, random burst of warbly beeps with pitch glides (synthesized, original).
function chirp(notes = 5 + Math.floor(Math.random() * 3), start = 0) {
  if (!soundOn() || !audio) return;
  try {
    if (audio.state !== 'running') audio.resume();
    let at = audio.currentTime + .02 + start;
    for (let index = 0; index < notes; index++) {
      const length = .05 + Math.random() * .09, base = 900 + Math.random() * 1500;
      const shape = Math.random();
      const tone = audio.createOscillator(), wobble = audio.createOscillator(), depth = audio.createGain(), level = audio.createGain(), soften = audio.createBiquadFilter();
      tone.type = index % 3 === 2 ? 'triangle' : 'sine';
      // Up-chirp, down-chirp or a bubbly warble.
      tone.frequency.setValueAtTime(base, at);
      if (shape < .4) tone.frequency.exponentialRampToValueAtTime(base * 1.7, at + length);
      else if (shape < .75) tone.frequency.exponentialRampToValueAtTime(base * .6, at + length);
      else {tone.frequency.exponentialRampToValueAtTime(base * 1.25, at + length * .5);tone.frequency.exponentialRampToValueAtTime(base * .9, at + length);}
      wobble.frequency.value = 18 + Math.random() * 22;depth.gain.value = base * (shape >= .75 ? .12 : .04);
      wobble.connect(depth).connect(tone.frequency);
      soften.type = 'lowpass';soften.frequency.value = 3800;
      level.gain.setValueAtTime(.0001, at);
      level.gain.exponentialRampToValueAtTime(.11, at + .008);
      level.gain.exponentialRampToValueAtTime(.0001, at + length);
      tone.connect(soften).connect(level).connect(audio.destination);
      tone.start(at);wobble.start(at);tone.stop(at + length + .02);wobble.stop(at + length + .02);
      at += length + .02 + Math.random() * .06;
    }
  } catch { /* audio unavailable */ }
}
// "pol", "hey pol!", "pol come here", "halika" — calling him by name.
export const isCall = text => /^\s*((hey|hi|yo|oy|uy|psst|hello)[\s,]*)?pol+(\s*ai)?([\s,]*(come( here)?|here|halika|tara|dito))?[\s!?.]*$/i.test(text) || /^\s*(come here|halika( dito)?|here boy|tara dito)[\s!?.]*$/i.test(text);
// "make a sound", "beep boop", "can you talk?", "sing", "mag-ingay ka" — asking for his robot sounds.
export const isChirp = text => !/\b(sound (on|off)|mute|unmute|quiet)\b/i.test(text) && /\b(beep\w*|boop\w*|bleep\w*|chirp\w*|whistle|sing|kanta|kumanta|ingay|speak|talk|voice|sounds?|noises?|hear)\b/i.test(text) && String(text).trim().split(/\s+/).length <= 9;
const CALL_REPLIES = ['Beep boop! 🤖', 'Bwee-doo! 💚', 'Dee-dee? 👀', 'Boop! You called? ✨', 'Bip bip! 😊'];
// Landing times match the hop-walk keyframes (28%, 52%, 80% of 1.4 s), then a tiny arrival chime.
function hopSounds() {
  if (!soundOn()) return [];
  return [[390, 520], [730, 600], [1120, 680]].map(([delay, pitch]) => setTimeout(() => boop(pitch), delay))
    .concat(setTimeout(() => boop(1040, .09, .22), 1320));
}

// Guided tour: he travels to each page and explains it briefly.
export const TOUR = [
  {page: 'Overview', title: 'Your marketing team', text: 'Home base. See your whole AI marketing team at a glance, jump into any task, and find the one thing to fix first.'},
  {page: 'Trending Ads', title: 'Market researcher', text: 'Search an advertiser’s website to find ads that keep running. I analyze their videos and show why they work.'},
  {page: 'Video Analysis', title: 'Creative director', text: 'Upload a video or paste a Facebook link. I review the hook, pacing, captions and call to action, with proof from the frames.'},
  {page: 'Compare Videos', title: 'Side-by-side review', text: 'Pick two or three cuts and compare them criterion by criterion, so you know which choices are stronger.'},
  {page: 'Create', title: 'Video editor', text: 'Describe your business. I write the script, pick colors and a voice, and make a motion-graphics ad.'},
  {page: 'Planner', title: 'Master planner', text: 'Talk strategy and niche with me, and I’ll put posting, filming, brainstorm and promo days on your calendar.'},
  {page: 'Performance', title: 'Social analyst', text: 'Real views, engagement and comment mood across your posts, plus your typical range once you have enough data.'},
  {page: 'Niche Intelligence', title: 'Account tracker', text: 'Add your accounts and paste post links. I read the public numbers and summarize what people say in the comments.'},
];
const TOUR_WORDS = ['tour', 'libot', 'walkthrough'];
// Questions go to the AI even if they contain a command word ("how do I jump to Create?").
export const isQuestion = text => /^\s*(how|what|why|where|when|which|who|whats|what's|is|are|does|do|should|explain|tell me about|paano|ano|saan|bakit|sino|kailan|pano)\b/i.test(text);
// "add a posting day on Friday", "plan my week", "move brainstorm to Monday", "schedule a promo".
export const isPlanning = text => /^\s*(plan|schedule|reschedule)\b/i.test(text) || /\b(add|schedule|plan|put|set|move|remove|delete|cancel|reschedule|mark)\b[\s\S]*\b(calendar|planner|schedule|posting|post|posts|brainstorm\w*|shoot|film\w*|promo|launch|reminder|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|bukas|today)\b/i.test(text);
export function parseCommand(text) {
  const lower = String(text).toLowerCase();
  if (/\b(sound on|unmute|turn on sound)\b/.test(lower)) return 'unmute';
  if (/\b(mute|quiet|silent|sound off|tahimik)\b/.test(lower)) return 'mute';
  if (/\b(light mode|lightmode|light theme|maliwanag)\b/.test(lower)) return 'theme-light';
  if (/\b(dark mode|darkmode|dark theme|madilim)\b/.test(lower)) return 'theme-dark';
  if (/\b(switch|toggle|change)\b.*\btheme\b/.test(lower)) return 'theme-toggle';
  if (/\b(follow|come with me|come along|sama ka|sumama)\b/.test(lower)) return 'follow';
  if (/\b(stay|wait here|dito ka lang|dito lang)\b/.test(lower)) return 'stay';
  if ((lower.match(/[a-z]+/g) || []).some(word => TOUR_WORDS.includes(word)) || /\b(show me around|guide me)\b/.test(lower)) return 'tour';
  const words = String(text).toLowerCase().match(/[a-z]+/g) || [];
  return Object.keys(ACTIONS).find(action => ACTIONS[action].words.some(word => words.includes(word))) || null;
}

// One persistent agent that travels between the spots of each page (curved path, stretch and tilt).
export function AgentTraveler({page, onNavigate = () => {}, theme = 'dark', onTheme = () => {}}) {
  const [place, setPlace] = useState(null);
  const [moving, setMoving] = useState(false);
  const [direction, setDirection] = useState(1);
  const [talking, setTalking] = useState(false);
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState(null);
  const [reply, setReply] = useState('');
  const [command, setCommand] = useState('');
  const root = useRef();const input = useRef();const body = useRef();
  const [gaze, setGaze] = useState(null);
  const [tour, setTour] = useState(null); // index into TOUR while a tour is running
  const [stayPage, setStayPage] = useState(null); // page he stays on after "stay"; null = follow
  const [note, setNote] = useState(''); const noteTimer = useRef();
  // Writing helper for the Create page: notes in, clear business description out.
  const [briefMode, setBriefMode] = useState(false);const [draft, setDraft] = useState(null);
  const [thinking, setThinking] = useState(false);const [suggested, setSuggested] = useState(null);const history = useRef([]);const [changes, setChanges] = useState([]);const keepOpen = useRef(false);
  const notify = text => {setNote(text);clearTimeout(noteTimer.current);noteTimer.current = setTimeout(() => setNote(''), 2600);};
  // Theme mission: vanish here, appear on the Settings theme card, switch theme, vanish, return.
  const mission = useRef(null); // {mode, from, phase: 'out' | 'card' | 'back' | 'return'}
  const [hidden, setHidden] = useState(false);
  const placed = useRef(false);
  // busy = a trip is pending or in progress; the pin-to-spot helper must not snap him meanwhile.
  const busy = useRef(false);
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const measure = useCallback(() => {
    const spot = document.querySelector('[data-agent-spot]');
    if (!spot) return null;
    const box = spot.getBoundingClientRect();
    if (!box.width) return null;
    return {x: box.left + window.scrollX, y: box.top + window.scrollY, w: box.width, h: box.height};
  }, []);
  // Where to appear during a theme mission: on top of the chosen theme card in Settings.
  const missionTarget = useCallback(() => {
    const spot = measure();
    if (mission.current?.phase !== 'card') return spot;
    const card = document.querySelector(`.theme-option.theme-${mission.current.mode}`);
    if (!card) return spot;
    const box = card.getBoundingClientRect(), w = spot?.w || 120, h = spot?.h || 105;
    return {x: box.left + box.width / 2 - w / 2 + window.scrollX, y: box.top - h * .62 + window.scrollY, w, h};
  }, [measure]);
  const appear = useCallback(() => {
    requestAnimationFrame(() => {requestAnimationFrame(() => {
      const next = missionTarget();
      if (!next) {mission.current = null;busy.current = false;setHidden(false);return;}
      placed.current = true;setMoving(false);setPlace(next);setHidden(false);setAction({name: 'appear', id: Date.now()});
    });});
  }, [missionTarget]);
  // Travel to the new page's spot after it renders.
  useLayoutEffect(() => {
    setTalking(false);setOpen(keepOpen.current);keepOpen.current = false;
    if (mission.current) {busy.current = true;appear();return undefined;}
    setAction(null);
    // Staying elsewhere: not on this page (he waits on his own page).
    if (stayPage && page !== stayPage) {busy.current = false;setMoving(false);setPlace(null);return undefined;}
    busy.current = true;
    let frame = requestAnimationFrame(() => {frame = requestAnimationFrame(() => {
      const next = measure();
      if (!next) {busy.current = false;setPlace(null);return;}
      setPlace(previous => {
        if (!previous || !placed.current || reduced || Math.abs(previous.x - next.x) + Math.abs(previous.y - next.y) < 2) {placed.current = true;busy.current = false;setMoving(false);return next;}
        setDirection(next.x >= previous.x ? 1 : -1);setMoving(true);return next;
      });
    });});
    return () => cancelAnimationFrame(frame);
  }, [page, measure, reduced, stayPage]);
  // Keep pinned to the spot when layout shifts (data loading, resize) without travelling.
  useEffect(() => {
    const settle = () => {if (busy.current || mission.current || (stayPage && page !== stayPage)) return;const next = measure();if (next) setPlace(current => current && Math.abs(current.x - next.x) + Math.abs(current.y - next.y) + Math.abs(current.w - next.w) > 1 ? next : current || next);};
    const observer = new ResizeObserver(settle);observer.observe(document.body);window.addEventListener('resize', settle);
    const timers = [300, 1000, 2500].map(delay => setTimeout(settle, delay));
    return () => {observer.disconnect();window.removeEventListener('resize', settle);timers.forEach(clearTimeout);};
  }, [page, measure, stayPage]);
  // Play soft hop sounds while travelling.
  useEffect(() => {if (!moving || reduced) return;const timers = hopSounds();return () => timers.forEach(clearTimeout);}, [moving, reduced]);
  // Safety: always finish a trip even if no transition fires (e.g. identical start and end).
  useEffect(() => {if (!moving) return;const timer = setTimeout(() => {busy.current = false;setMoving(false);}, 1700);return () => clearTimeout(timer);}, [moving, place]);
  // Close the command box on Escape or a click outside the agent.
  useEffect(() => {
    if (!open) return;
    const onKey = event => {if (event.key === 'Escape') setOpen(false);};
    const onDown = event => {if (root.current && !root.current.contains(event.target)) setOpen(false);};
    document.addEventListener('keydown', onKey);document.addEventListener('mousedown', onDown);
    const focus = setTimeout(() => input.current?.focus(), 60);
    return () => {document.removeEventListener('keydown', onKey);document.removeEventListener('mousedown', onDown);clearTimeout(focus);};
  }, [open]);
  // Alert when the mouse is near: eyes follow the cursor and he leans toward it.
  useEffect(() => {
    let frame = 0;
    const onMove = event => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = body.current?.getBoundingClientRect();
        if (!box || moving) {setGaze(null);return;}
        const dx = event.clientX - (box.left + box.width / 2), dy = event.clientY - (box.top + box.height / 2);
        const distance = Math.hypot(dx, dy);
        if (distance > 300) {setGaze(current => current ? null : current);return;}
        const reach = Math.min(1, distance / 120);
        setGaze({x: Math.round(dx / (distance || 1) * 9 * reach * 10) / 10, y: Math.round(dy / (distance || 1) * 7 * reach * 10) / 10, lean: Math.max(-8, Math.min(8, dx / 25))});
      });
    };
    const onLeave = () => setGaze(null);
    window.addEventListener('mousemove', onMove);document.addEventListener('mouseleave', onLeave);
    return () => {cancelAnimationFrame(frame);window.removeEventListener('mousemove', onMove);document.removeEventListener('mouseleave', onLeave);};
  }, [moving]);
  // End the tour if the user navigates somewhere else themselves.
  useEffect(() => {setTour(current => current !== null && TOUR[current]?.page !== page ? null : current);}, [page]);
  useEffect(() => {
    if (tour === null) return;
    const onKey = event => {if (event.key === 'Escape') setTour(null);};
    document.addEventListener('keydown', onKey);return () => document.removeEventListener('keydown', onKey);
  }, [tour]);
  function goTour(index) {
    if (index < 0) return;
    if (index >= TOUR.length) {setTour(TOUR.length);return;}
    setStayPage(null);setTour(index);if (TOUR[index].page !== page) onNavigate(TOUR[index].page);
  }
  // Anything that isn't a command becomes a question for POL AI (one small AI request).
  async function ask(text) {
    const question = text.trim();setCommand('');setSuggested(null);setThinking(true);setReply('');
    try {
      const data = await apiRequest('assistant/ask', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({question, page, history: history.current})}, 45000);
      setReply(data.answer);setSuggested(data.page && data.page !== page ? data.page : null);
      history.current = [...history.current, {q: question, a: data.answer}].slice(-4);
    } catch (failure) {setReply(failure.message || 'I couldn’t answer just now. Please try again.');}
    finally {setThinking(false);setTimeout(() => input.current?.focus(), 30);}
  }
  // Planner mode: POL is the master planner. Replies show in his panel; the calendar updates live.
  async function plan(text) {
    const message = text.trim();setCommand('');setSuggested(null);setChanges([]);setReply('');setThinking(true);setOpen(true);
    if (page !== 'Planner') {keepOpen.current = true;if (stayPage) setStayPage(null);onNavigate('Planner');}
    try {
      const now = new Date();const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const data = await apiRequest('planner/chat', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({message, today})}, 60000);
      setReply(data.reply);setChanges(data.changes || []);
      window.dispatchEvent(new CustomEvent('pulse:planner-updated', {detail: data}));
    } catch (failure) {setReply(failure.message || 'I couldn’t plan that just now. Please try again.');}
    finally {setThinking(false);setTimeout(() => input.current?.focus(), 30);}
  }
  // Suggestion chips on the Planner page ask POL directly.
  useEffect(() => {const onPlan = event => plan(event.detail.text);window.addEventListener('pulse:pol-plan', onPlan);return () => window.removeEventListener('pulse:pol-plan', onPlan);});
  function startTheme(mode) {
    setCommand('');setReply('');setOpen(false);
    if (mode === theme) {notify(`We’re already in ${mode} mode! ${mode === 'light' ? '☀️' : '🌙'}`);return;}
    setTour(null);busy.current = true;
    mission.current = {mode, from: page, phase: 'out'};
    setAction({name: 'vanish', id: Date.now()});
  }
  // Mission steps run when his vanish/appear animations finish.
  function missionStep(finished) {
    const current = mission.current;
    if (!current) return;
    if (finished === 'vanish') {
      setHidden(true);
      current.phase = current.phase === 'out' ? 'card' : 'return';
      const target = current.phase === 'card' ? 'Settings' : current.from;
      if (target === page) appear(); else onNavigate(target);
      return;
    }
    if (finished === 'appear' && current.phase === 'card') {
      onTheme(current.mode);
      notify(current.mode === 'light' ? 'Light mode on! ☀️' : 'Dark mode on! 🌙');
      setTimeout(() => {if (mission.current === current) {current.phase = 'back';setAction({name: 'vanish', id: Date.now()});}}, 1700);
      return;
    }
    if (finished === 'appear' && current.phase === 'return') {mission.current = null;busy.current = false;}
  }
  const BRIEF_PROMPT = 'Tell me about your business in your own words: what you sell, what makes it special, where people can buy, and your hours. Messy notes are fine!';
  function startBrief() {setOpen(true);setBriefMode(true);setDraft(null);setSuggested(null);setReply(BRIEF_PROMPT);setTimeout(() => input.current?.focus(), 60);}
  useEffect(() => {const onBrief = () => startBrief();window.addEventListener('pulse:pol-brief', onBrief);return () => window.removeEventListener('pulse:pol-brief', onBrief);});
  async function brief(notes) {
    setCommand('');setDraft(null);setThinking(true);setReply('');
    try {const data = await apiRequest('assistant/brief', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({notes})}, 45000);setDraft(data);setReply('Here’s a draft for you:');}
    catch (failure) {setReply(failure.message || 'I couldn’t write that just now. Please try again.');}
    finally {setThinking(false);}
  }
  function useDraft() {
    window.dispatchEvent(new CustomEvent('pulse:fill-create', {detail: {brandName: draft.brandName, description: draft.description}}));
    setDraft(null);setBriefMode(false);setOpen(false);setReply('');notify('Filled it in! Press Generate when you’re ready. ✨');
  }
  function perform(text) {
    if (isCall(text) || (isChirp(text) && !/^\s*(how|what|why|where|when|which|who|paano|pano|ano|saan|bakit)\b/i.test(text))) {
      unlockAudio();setStayPage(null);setNote('');setCommand('');setOpen(false);
      setReply(CALL_REPLIES[Math.floor(Math.random() * CALL_REPLIES.length)]);setAction({name: 'chirp', id: Date.now()});chirp();return;
    }
    if (briefMode) {brief(text);return;}
    if (/\b(help me (write|describe)|write my (description|prompt)|describe my business|help (with|me with) (the )?(prompt|description)|gawan mo)\b/i.test(text)) {
      setCommand('');if (page === 'Create') {startBrief();return;}
      setReply('Let’s do that on the Create page.');setSuggested('Create');return;
    }
    // On the Planner page everything except a short built-in command is a planning conversation.
    if (page === 'Planner' && !(parseCommand(text) && (text.match(/\S+/g) || []).length <= 3)) {plan(text);return;}
    if (isQuestion(text)) {ask(text);return;}
    if (isPlanning(text)) {plan(text);return;}
    const themeCommand = parseCommand(text);
    if (themeCommand === 'theme-light' || themeCommand === 'theme-dark' || themeCommand === 'theme-toggle') {startTheme(themeCommand === 'theme-toggle' ? (theme === 'light' ? 'dark' : 'light') : themeCommand.slice(6));return;}
    const name = parseCommand(text);
    if (name === 'tour') {setOpen(false);setCommand('');setReply('');goTour(0);return;}
    if (name === 'stay') {setStayPage(page);setCommand('');setReply('');setOpen(false);notify(`Okay, I’ll stay here on ${page}. 🏠`);return;}
    if (name === 'follow') {setStayPage(null);setCommand('');setReply('');setOpen(false);notify('Right behind you! 🐾');return;}
    if (name === 'mute' || name === 'unmute') {setSound(name === 'unmute');setCommand('');setReply(name === 'mute' ? 'Okay, I’ll hop quietly. 🤫' : 'Sound on! Boing! 🔊');if (name === 'unmute') {unlockAudio();boop(700);}return;}
    if (!name) {ask(text);return;}
    // Valid command: close the box and act; the reply shows in his speech bubble while he moves.
    setNote('');setReply(ACTIONS[name].reply);setAction({name, id: Date.now()});setCommand('');setOpen(false);
  }
  if (!place) return null;
  const bubbleRight = place.x + place.w / 2 < window.innerWidth / 2;
  return createPortal(<div ref={root} className={`agent-traveler ${gaze && !moving ? 'alert' : ''} ${moving ? 'moving' : ''} ${direction < 0 ? 'to-left' : 'to-right'} ${bubbleRight ? 'bubble-right' : ''}`} style={{transform: `translateX(${place.x}px)`, visibility: hidden ? 'hidden' : undefined}}
    onTransitionEnd={event => {if (event.target === event.currentTarget && event.propertyName === 'transform' && moving) {busy.current = false;setMoving(false);}}}>
    <div className="agent-traveler-y" style={{transform: `translateY(${place.y}px)`, width: place.w, height: place.h}}>
      <button ref={body} type="button" className="agent-traveler-body" aria-label="POL AI, open commands" aria-expanded={open} onClick={() => {if (!open) chirp(2);setOpen(value => !value);setReply('');setChanges([]);setSuggested(null);setBriefMode(false);setDraft(null);setTalking(false);}} onMouseEnter={() => setTalking(true)} onMouseLeave={() => setTalking(false)} onFocus={() => setTalking(true)} onBlur={() => setTalking(false)}>
        <span className="agent-lean" style={gaze && !moving ? {transform: `rotate(${gaze.lean}deg)`} : undefined}><span key={action?.id || 'idle'} className={`agent-act ${action ? `act-${action.name}` : ''}`} onAnimationEnd={event => {if (event.target !== event.currentTarget) return;const finished = action?.name;if (finished === 'vanish' || finished === 'appear') {if (finished === 'appear') setAction(null);missionStep(finished);return;}setAction(null);setReply('');}}><AgentIcon gaze={gaze && !moving && action?.name !== 'sleep' ? gaze : null}/>{action?.name === 'sleep' && <span className="agent-zzz" aria-hidden="true">z<b>z</b><i>z</i></span>}</span></span>
      </button>
      <span className={`agent-bubble ${(talking || note || (action && reply)) && !moving && !open && tour === null ? 'show' : ''}`} role="status">{note || (action && reply ? reply : 'Hello, I’m POL AI')}</span>
      {tour !== null && !moving && <div className="agent-panel agent-tour" role="dialog" aria-label="POL AI tour">
        {tour < TOUR.length ? <>
          <span className="agent-tour-step">{tour + 1} / {TOUR.length}</span>
          <strong className="agent-tour-title">{TOUR[tour].title}</strong>
          <p className="agent-tour-text">{TOUR[tour].text}</p>
          <div className="agent-tour-actions"><button type="button" className="agent-tour-end" onClick={() => setTour(null)}>End tour</button><span>{tour > 0 && <button type="button" className="agent-tour-back" onClick={() => goTour(tour - 1)}>Back</button>}<button type="button" className="agent-tour-next" onClick={() => goTour(tour + 1)}>{tour === TOUR.length - 1 ? 'Finish' : 'Next'}</button></span></div>
        </> : <>
          <strong className="agent-tour-title">That’s the tour! 🎉</strong>
          <p className="agent-tour-text">Click me anytime and type what you need, or ask for another tour.</p>
          <div className="agent-tour-actions"><span/><button type="button" className="agent-tour-next" onClick={() => setTour(null)}>Done</button></div>
        </>}
      </div>}
      {open && !moving && <div className={`agent-panel ${page === 'Planner' ? 'agent-panel-planner' : ''}`} role="dialog" aria-label={page === 'Planner' ? 'Plan with POL AI' : 'POL AI commands'}>
        {page === 'Planner' && !reply && !thinking && <p className="agent-panel-hint">I’m your master planner. Talk niche, strategy or ideas, or tell me what to put on your calendar.</p>}
        <p className={`agent-panel-reply ${reply || thinking ? '' : 'empty'}`} aria-live="polite">{thinking ? <span className="agent-thinking">{page === 'Planner' ? 'Planning' : 'Thinking'}<i>.</i><i>.</i><i>.</i></span> : reply}</p>
        {changes.length > 0 && !thinking && <ul className="agent-changes">{changes.map((item, index) => <li key={index} className={`change-${item.type}`}><i className={`cat-dot cat-${item.event.category}`}/>{item.type === 'add' ? 'Added' : item.type === 'update' ? 'Changed' : 'Removed'}: {item.event.title} · {new Date(`${item.event.date}T00:00:00`).toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric'})}</li>)}</ul>}
        {draft && !thinking && <div className="agent-draft">
          {draft.brandName && <p><b>Brand name:</b> {draft.brandName}</p>}
          <p>{draft.description}</p>
          {draft.missing?.length > 0 && <p className="agent-draft-missing">Could add: {draft.missing.join(' · ')}</p>}
          <div className="agent-draft-actions"><button type="button" className="agent-tour-next" onClick={useDraft}>Use this</button><small>or type more details to improve it</small></div>
        </div>}
        {suggested && !thinking && <button type="button" className="agent-goto" onClick={() => {setOpen(false);onNavigate(suggested);}}>Take me to {suggested} →</button>}
        <form className="agent-panel-form" onSubmit={event => {event.preventDefault();if (command.trim()) perform(command);}}>
          <input ref={input} value={command} onChange={event => setCommand(event.target.value)} placeholder={page === 'Planner' ? 'e.g. Plan my next 2 weeks of posts' : 'Ask me anything, or tell me what to do…'} maxLength={page === 'Planner' ? 1000 : 400} aria-label="Ask POL AI or give a command" disabled={thinking}/>
          <button type="submit" disabled={!command.trim() || thinking}>Go</button>
        </form>
      </div>}
    </div>
  </div>, document.body);
}
