import type { ClassKey } from '../data';

/**
 * All game audio is synthesized with the Web Audio API: no sound files to download or license.
 * Music is a small step sequencer; effects are short synth recipes (one per class instrument).
 * Browsers only allow audio after a click or key press, so `unlockAudio()` is wired to the first one.
 */

export interface AudioPrefs {
  music: number; // 0..1
  sfx: number; // 0..1
  muted: boolean;
}

const PREFS_KEY = 'ml-audio';
const prefs: AudioPrefs = { music: 0.5, sfx: 0.8, muted: false };
try {
  Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}'));
} catch {
  /* private mode: keep defaults */
}

let ctx: AudioContext | null = null;
let master: GainNode;
let musicBus: GainNode;
let sfxBus: GainNode;
let reverb: GainNode; // send into a short room reverb
let noiseBuf: AudioBuffer;

function init(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.connect(ctx.destination);
  musicBus = ctx.createGain();
  sfxBus = ctx.createGain();
  musicBus.connect(master);
  sfxBus.connect(master);
  // reverb: a convolver fed with decaying noise
  const conv = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 1.6);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  conv.buffer = ir;
  reverb = ctx.createGain();
  reverb.gain.value = 0.25;
  reverb.connect(conv);
  conv.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const n = noiseBuf.getChannelData(0);
  for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
  applyPrefs();
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else if (unlocked) void ctx.resume();
  });
  return ctx;
}

function applyPrefs() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(prefs.muted ? 0 : 1, t, 0.03);
  musicBus.gain.setTargetAtTime(prefs.music * 0.35, t, 0.05);
  sfxBus.gain.setTargetAtTime(prefs.sfx * 0.6, t, 0.03);
}

export function audioPrefs(): AudioPrefs {
  return { ...prefs };
}

export function setAudioPrefs(p: Partial<AudioPrefs>) {
  Object.assign(prefs, p);
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
  applyPrefs();
}

let unlocked = false;
/**
 * Call once at startup: starts (and later restarts) audio on user gestures.
 * iOS Safari only counts touchend/click as a gesture that may start audio (not pointerdown), may leave the
 * context "interrupted" after a call or a trip to the home screen, and mutes Web Audio while the ring/silent
 * switch is on unless the page asks for "playback" audio. So: listen to every kind of gesture, keep listening,
 * and kick the context awake whenever it isn't running.
 */
export function unlockAudio() {
  // iOS 17+: play through the silent switch like a video would
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (session) {
    try {
      session.type = 'playback';
    } catch {
      /* older engines */
    }
  }
  const go = () => {
    const c = init();
    if (!c || document.hidden) return;
    if (c.state === 'running' && unlocked) return;
    // a one-sample silent buffer started inside the gesture is what wakes older iOS versions
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, 22050);
    src.connect(c.destination);
    src.start(0);
    const ok = () => {
      if (c.state !== 'running') return;
      const first = !unlocked;
      unlocked = true;
      if (first && pendingSong !== undefined) playMusic(pendingSong);
    };
    if (c.state === 'running') ok();
    else void c.resume().then(ok, () => {});
  };
  for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(ev, go, { capture: true, passive: true });
}

// ------------------------------------------------------------ synth building blocks

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  release?: number; // time constant of the decay
  to?: number; // glide target frequency
  filter?: number; // lowpass cutoff
  filterTo?: number;
  q?: number;
  vibrato?: number;
  wet?: number; // reverb send
  dest?: AudioNode;
}

function tone(freq: number, at: number, dur: number, o: ToneOpts = {}) {
  const c = ctx!;
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, at);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), at + dur);
  if (o.vibrato) {
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 5.5;
    lg.gain.value = freq * o.vibrato;
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(at);
    lfo.stop(at + dur + 0.6);
  }
  const g = c.createGain();
  const peak = o.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(peak, at + (o.attack ?? 0.005));
  g.gain.setTargetAtTime(0.0001, at + Math.max(o.attack ?? 0.005, dur * 0.3), o.release ?? dur / 3);
  let node: AudioNode = osc;
  if (o.filter) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(o.filter, at);
    if (o.filterTo) f.frequency.exponentialRampToValueAtTime(o.filterTo, at + dur);
    f.Q.value = o.q ?? 1;
    node = node.connect(f);
  }
  node.connect(g);
  g.connect(o.dest ?? sfxBus);
  if (o.wet) {
    const s = c.createGain();
    s.gain.value = o.wet;
    g.connect(s).connect(reverb);
  }
  osc.start(at);
  osc.stop(at + dur + (o.release ?? dur / 3) * 6);
}

interface NoiseOpts {
  gain?: number;
  type?: BiquadFilterType;
  freq?: number;
  freqTo?: number;
  q?: number;
  release?: number;
  wet?: number;
  dest?: AudioNode;
}

function noise(at: number, dur: number, o: NoiseOpts = {}) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.frequency.setValueAtTime(o.freq ?? 2000, at);
  if (o.freqTo) f.frequency.exponentialRampToValueAtTime(o.freqTo, at + dur);
  f.Q.value = o.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(o.gain ?? 0.3, at);
  g.gain.setTargetAtTime(0.0001, at + dur * 0.2, o.release ?? dur / 3);
  src.connect(f).connect(g).connect(o.dest ?? sfxBus);
  if (o.wet) {
    const s = c.createGain();
    s.gain.value = o.wet;
    g.connect(s).connect(reverb);
  }
  src.start(at, Math.random() * 0.5);
  src.stop(at + dur + (o.release ?? dur / 3) * 6);
}

// ------------------------------------------------------------ instruments (shared by effects and music)

const PENTA = [0, 2, 4, 7, 9]; // major pentatonic: every note fits over the music
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const pentaNote = (base: number) => base + pick(PENTA) + 12 * pick([0, 0, 1]);

type Inst = (note: number, at: number, dur: number, vel: number, dest?: AudioNode) => void;

const INSTRUMENTS: Record<ClassKey, Inst> = {
  // a dagger swish: airy noise sweep with a small metallic ring on the note
  teen: (n, at, dur, v, dest) => {
    noise(at, 0.12, { gain: 0.3 * v, type: 'bandpass', freq: 2600, release: 0.06, dest });
    tone(midi(n + 12), at + 0.03, dur * 0.5, { type: 'triangle', gain: 0.07 * v, release: dur / 4, wet: 0.3, dest });
  },
  // a short sung "aah": sawtooth through a vowel-ish filter with vibrato
  singer: (n, at, dur, v, dest) => {
    tone(midi(n), at, dur, { type: 'sawtooth', gain: 0.22 * v, attack: 0.03, filter: 1100, q: 4, vibrato: 0.012, wet: 0.5, dest });
    tone(midi(n), at, dur, { type: 'triangle', gain: 0.12 * v, attack: 0.03, vibrato: 0.012, dest });
  },
  // plucked string: bright attack that closes quickly
  guitarist: (n, at, dur, v, dest) => {
    tone(midi(n), at, dur, { type: 'sawtooth', gain: 0.25 * v, filter: 4000, filterTo: 500, release: dur / 2.5, wet: 0.25, dest });
    tone(midi(n + 7), at + 0.012, dur, { type: 'sawtooth', gain: 0.14 * v, filter: 3500, filterTo: 450, release: dur / 3, dest });
  },
  // the note picks the drum: low = kick, high = snare
  drummer: (n, at, _dur, v, dest) => {
    if (n % 2 === 0) {
      tone(140, at, 0.18, { type: 'sine', to: 45, gain: 0.55 * v, release: 0.08, dest });
      noise(at, 0.02, { gain: 0.15 * v, type: 'lowpass', freq: 1500, dest });
    } else {
      noise(at, 0.14, { gain: 0.35 * v, type: 'highpass', freq: 1800, release: 0.05, wet: 0.2, dest });
      tone(200, at, 0.08, { type: 'triangle', to: 150, gain: 0.25 * v, release: 0.04, dest });
    }
  },
  // round low pluck
  bassist: (n, at, dur, v, dest) => {
    const f = midi(n - 24);
    tone(f, at, dur, { type: 'square', gain: 0.22 * v, filter: 900, filterTo: 180, release: dur / 2, dest });
    tone(f, at, dur, { type: 'sine', gain: 0.3 * v, release: dur / 2, dest });
  },
  // electric-piano: sine + soft bell overtone
  keyboardist: (n, at, dur, v, dest) => {
    tone(midi(n), at, dur, { type: 'triangle', gain: 0.22 * v, release: dur / 2, wet: 0.3, dest });
    tone(midi(n + 12), at, dur * 0.6, { type: 'sine', gain: 0.08 * v, release: dur / 4, dest });
  },
};

// ------------------------------------------------------------ sound effects

export type Sfx =
  | 'hit' | 'crit' | 'miss' | 'hurt' | 'mdie' | 'levelup' | 'joblevel' | 'potion' | 'heal'
  | 'warp' | 'enter' | 'item' | 'coin' | 'death' | 'click';

const now = () => ctx!.currentTime + 0.01;
const ready = () => !!ctx && unlocked && !prefs.muted && ctx.state === 'running';

/** An attack: a random in-key note on the class instrument. */
export function sfxAttack(cls: ClassKey, vol = 1) {
  if (!ready() || vol <= 0) return;
  const inst = INSTRUMENTS[cls] ?? INSTRUMENTS.singer;
  inst(cls === 'drummer' ? Math.floor(Math.random() * 2) : pentaNote(67), now(), cls === 'singer' ? 0.28 : 0.22, vol);
}

/**
 * A sword cut, "ฉับ!": a fast rising swish, the blade's metallic ring and a dull thud as it lands.
 * `big` makes it heavier (พุ่งแทง's impact).
 */
export function sfxSlash(vol = 1, big = false, at = 0) {
  if (!ready() || vol <= 0) return;
  const t = now() + at;
  const k = big ? 1.4 : 1;
  noise(t, 0.09, { gain: 0.42 * vol * k, type: 'bandpass', freq: 1200, freqTo: 7000, q: 1.6, release: 0.03 });
  noise(t + 0.05, 0.05, { gain: 0.5 * vol * k, type: 'highpass', freq: 3500, release: 0.02 });
  // inharmonic partials read as steel rather than a note
  [2637, 3720, 5280].forEach((f, i) => tone(f, t + 0.05, 0.25, { type: 'sine', gain: (0.05 / (i + 1)) * vol * k, release: 0.12, wet: 0.35 }));
  tone(big ? 150 : 210, t + 0.05, 0.12, { type: 'sine', to: 55, gain: 0.4 * vol * k, release: 0.05 });
  if (big) noise(t + 0.05, 0.25, { gain: 0.3 * vol, type: 'lowpass', freq: 900, release: 0.1, wet: 0.3 });
}

/** หมุนตัวแทง: a whirlwind of three swishes with a cut on each turn. */
export function sfxWhirl(vol = 1) {
  if (!ready() || vol <= 0) return;
  const t = now();
  noise(t, 0.6, { gain: 0.3 * vol, type: 'bandpass', freq: 500, freqTo: 4000, q: 0.9, wet: 0.4 });
  for (let i = 0; i < 3; i++) sfxSlash(vol * 0.75, false, 0.05 + i * 0.16);
  tone(110, t + 0.45, 0.35, { type: 'sine', to: 40, gain: 0.4 * vol, release: 0.12 });
}

/**
 * "ป๊าก!": a stick cracking on a snare, a sharp noise snap over a dry body thump. `big` is the final blow
 * (a deeper thump and a ringing tail).
 */
export function sfxPak(vol = 1, big = false, at = 0) {
  if (!ready() || vol <= 0) return;
  const t = now() + at;
  const k = big ? 1.4 : 1;
  noise(t, 0.045, { gain: 0.7 * vol * k, type: 'highpass', freq: 2500, release: 0.02 });
  noise(t, 0.09, { gain: 0.35 * vol * k, type: 'bandpass', freq: 1800, q: 0.9, release: 0.04 });
  tone(big ? 210 : 280, t, 0.1, { type: 'triangle', to: big ? 90 : 160, gain: 0.45 * vol * k, release: 0.05 });
  tone(1500, t, 0.03, { type: 'square', gain: 0.1 * vol * k, release: 0.02 });
  if (big) {
    noise(t + 0.02, 0.3, { gain: 0.25 * vol, type: 'bandpass', freq: 3200, q: 3, release: 0.15, wet: 0.35 });
    tone(110, t, 0.18, { type: 'sine', to: 45, gain: 0.5 * vol, release: 0.08 });
  }
}

/**
 * "ฟาก!": a heavy blade of sound tearing through the air. A breathy rising whoosh (the "ฟ"), then a hard crack
 * with a short vowel-like body (the "าก") and a thump. `big` is the blast at the end: louder, with a deep boom
 * and a ringing tail.
 */
export function sfxFak(vol = 1, big = false, at = 0) {
  if (!ready() || vol <= 0) return;
  const t = now() + at;
  const k = big ? 1.35 : 1;
  noise(t, 0.13, { gain: 0.32 * vol * k, type: 'bandpass', freq: 700, freqTo: 6000, q: 0.8, release: 0.04 });
  const hit = t + 0.11;
  noise(hit, 0.05, { gain: 0.8 * vol * k, type: 'highpass', freq: 2200, release: 0.02 });
  noise(hit, 0.12, { gain: 0.5 * vol * k, type: 'bandpass', freq: 1100, q: 1.3, release: 0.05 });
  tone(260, hit, 0.12, { type: 'sawtooth', to: 120, gain: 0.22 * vol * k, filter: 1400, filterTo: 400, q: 3, release: 0.05 });
  tone(big ? 120 : 170, hit, 0.16, { type: 'sine', to: 45, gain: 0.55 * vol * k, release: 0.07 });
  noise(hit + 0.03, 0.3, { gain: 0.16 * vol * k, type: 'bandpass', freq: 2600, q: 2.5, release: 0.12, wet: 0.45 });
  if (big) {
    tone(75, hit, 0.5, { type: 'sine', to: 28, gain: 0.5 * vol, release: 0.2 });
    noise(hit, 0.45, { gain: 0.25 * vol, type: 'lowpass', freq: 600, freqTo: 120, release: 0.18, wet: 0.35 });
  }
}

/**
 * "ตูม!": a kick drum the size of a cannon. A short click, a deep pitch-dropping body (the "ตู") and a rumbling
 * low noise tail (the "ม"). `big` is the second, heavier stomp.
 */
export function sfxBoom(vol = 1, big = false, at = 0) {
  if (!ready() || vol <= 0) return;
  const t = now() + at;
  const k = big ? 1.3 : 1;
  noise(t, 0.02, { gain: 0.35 * vol * k, type: 'highpass', freq: 3000, release: 0.01 });
  tone(big ? 150 : 170, t, 0.45, { type: 'sine', to: 32, gain: 0.85 * vol * k, release: 0.16 });
  tone(big ? 300 : 340, t, 0.18, { type: 'triangle', to: 70, gain: 0.3 * vol * k, filter: 900, filterTo: 150, release: 0.06 });
  noise(t, 0.6, { gain: 0.4 * vol * k, type: 'lowpass', freq: 900, freqTo: 80, release: 0.22, wet: 0.45 });
  if (big) tone(60, t + 0.02, 0.7, { type: 'sine', to: 25, gain: 0.5 * vol, release: 0.25 });
}

/**
 * "ฟวิ้ง!": a dash. A breathy rush of air (the "ฟ") that sweeps up into a bright ringing zing (the "วิ้ง"),
 * a pitch that glides up and wobbles as it fades.
 */
export function sfxFwing(vol = 1, big = false, at = 0) {
  if (!ready() || vol <= 0) return;
  const t = now() + at;
  const k = big ? 1.3 : 1;
  noise(t, 0.16, { gain: 0.35 * vol * k, type: 'bandpass', freq: 600, freqTo: 7000, q: 0.8, release: 0.05 });
  const z = t + 0.06;
  tone(700, z, 0.32, { type: 'triangle', to: 2300, gain: 0.16 * vol * k, vibrato: 0.03, release: 0.12, wet: 0.45 });
  tone(1400, z, 0.28, { type: 'sine', to: 4600, gain: 0.07 * vol * k, release: 0.1, wet: 0.4 });
  noise(z + 0.05, 0.25, { gain: 0.12 * vol * k, type: 'bandpass', freq: 5000, q: 4, release: 0.12, wet: 0.4 });
}

/**
 * "ฟริ้ง!": a storm of blades. A breathy rush (the "ฟ"), a quick fluttering roll of little stick-like ticks
 * (the rolled "ร"), then a bright metallic ring that shimmers as it fades (the "ิ้ง"). `big` is the last accent:
 * louder, with a low thump under it and a longer ring.
 */
export function sfxFring(vol = 1, big = false, at = 0) {
  if (!ready() || vol <= 0) return;
  const t = now() + at;
  const k = big ? 1.3 : 1;
  noise(t, 0.14, { gain: 0.3 * vol * k, type: 'bandpass', freq: 800, freqTo: 6500, q: 0.8, release: 0.04 });
  for (let i = 0; i < 5; i++) noise(t + 0.05 + i * 0.022, 0.018, { gain: (0.32 - i * 0.03) * vol * k, type: 'bandpass', freq: 2600 + i * 250, q: 1.6, release: 0.01 });
  const z = t + 0.15;
  const ring = big ? 0.75 : 0.5;
  tone(1760, z, ring, { type: 'triangle', to: 2350, gain: 0.15 * vol * k, vibrato: 0.012, release: ring / 2.5, wet: 0.5 });
  tone(3520, z, ring * 0.8, { type: 'sine', to: 4700, gain: 0.08 * vol * k, release: ring / 3, wet: 0.5 });
  tone(5270, z, ring * 0.5, { type: 'sine', gain: 0.04 * vol * k, release: ring / 4, wet: 0.4 });
  noise(z, 0.25, { gain: 0.12 * vol * k, type: 'bandpass', freq: 7000, q: 5, release: 0.12, wet: 0.4 });
  if (big) {
    tone(130, t + 0.12, 0.3, { type: 'sine', to: 45, gain: 0.5 * vol, release: 0.12 });
    noise(t + 0.12, 0.06, { gain: 0.5 * vol, type: 'highpass', freq: 2400, release: 0.02 });
  }
}

/**
 * "วีด": the whistle of a spell being cast. A few thin, high tones sliding up together (like air whistling
 * past), on a soft breathy hiss. `soft` is the quieter repeat while a long cast is still charging.
 */
export function sfxWheet(vol = 1, at = 0, soft = false) {
  if (!ready() || vol <= 0) return;
  const t = now() + at;
  const k = soft ? 0.55 : 1;
  const dur = 0.3;
  [3400, 4500, 5700].forEach((f, i) =>
    tone(f, t + i * 0.025, dur, { type: 'sine', to: f * 1.75, gain: (0.075 - i * 0.015) * vol * k, attack: 0.03, release: 0.08, wet: 0.45 }),
  );
  tone(1500, t, dur, { type: 'triangle', to: 2900, gain: 0.05 * vol * k, attack: 0.04, release: 0.08, wet: 0.3 });
  noise(t, dur, { gain: 0.1 * vol * k, type: 'bandpass', freq: 3000, freqTo: 8000, q: 1.2, release: 0.08 });
}

// ------------------------------------------------------------ monster voices

type Voice = 'squish' | 'wail' | 'growl' | 'chirp' | 'buzz' | 'ribbit' | 'bark' | 'meow' | 'blub' | 'warble' | 'roar' | 'squeak' | 'rattle' | 'crunch';

/** Which kind of voice a monster model has (by the creature in its model name). */
function voiceOf(model: string): Voice {
  const m = model.toLowerCase();
  if (/skull/.test(m)) return 'rattle';
  if (/ghost/.test(m)) return 'wail';
  if (/armabee|hywirl/.test(m)) return 'buzz';
  if (/pigeon|birb|chicken/.test(m)) return 'chirp';
  if (/frog/.test(m)) return 'ribbit';
  if (/dog/.test(m)) return 'bark';
  if (/cat\b|_cat/.test(m)) return 'meow';
  if (/fish|glub|squidle/.test(m)) return 'blub';
  if (/alien|alpaking/.test(m)) return 'warble';
  if (/dragon|goleling|dino/.test(m)) return 'roar';
  if (/bunny|mushnub/.test(m)) return 'squeak';
  if (/cactoro/.test(m)) return 'crunch';
  if (/demon|orc|yeti|tribal|ninja|monkroose|mushroomking/.test(m)) return 'growl';
  return 'squish';
}

/** A steady 0.8..1.25 pitch factor from the monster's key, so two monsters of the same kind still sound different. */
function keyPitch(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return 0.8 + ((h >>> 0) % 1000) / 1000 * 0.45;
}

/**
 * A monster's own voice: `hurt` is a short yelp when it is hit, `die` a longer cry as it bursts apart (with a
 * wet pop under it). The voice kind comes from the model, the pitch from the monster's key and size (bigger is
 * deeper), so every monster sounds like itself.
 */
export function sfxMonster(key: string, model: string, size: number, kind: 'hurt' | 'die', vol = 1, boss = false) {
  if (!ready() || vol <= 0) return;
  const t = now();
  const v = voiceOf(model);
  const die = kind === 'die';
  const f = keyPitch(key) / Math.sqrt(Math.max(0.5, size)) * (boss ? 0.7 : 1);
  const L = (die ? 2.2 : 1) * (boss ? 1.4 : 1); // length
  const g = (die ? 1.15 : 0.8) * vol;
  switch (v) {
    case 'squish':
      tone(520 * f, t, 0.12 * L, { type: 'sine', to: 200 * f, gain: 0.3 * g, vibrato: 0.06, release: 0.05 * L });
      tone(1040 * f, t, 0.08 * L, { type: 'triangle', to: 380 * f, gain: 0.08 * g, release: 0.04 });
      noise(t, 0.06, { gain: 0.12 * g, type: 'lowpass', freq: 900, release: 0.03 });
      break;
    case 'squeak':
      tone(1300 * f, t, 0.09 * L, { type: 'sine', to: 1900 * f, gain: 0.16 * g, release: 0.03 * L });
      tone(1900 * f, t + 0.08 * L, 0.07 * L, { type: 'sine', to: 900 * f, gain: 0.12 * g, release: 0.03 * L });
      break;
    case 'wail':
      tone(700 * f, t, 0.35 * L, { type: 'sine', to: 300 * f, gain: 0.16 * g, vibrato: 0.04, attack: 0.04, release: 0.12 * L, wet: 0.6 });
      tone(1050 * f, t, 0.3 * L, { type: 'triangle', to: 450 * f, gain: 0.05 * g, vibrato: 0.04, attack: 0.05, release: 0.1 * L, wet: 0.6 });
      noise(t, 0.3 * L, { gain: 0.06 * g, type: 'bandpass', freq: 1200, q: 2, release: 0.1, wet: 0.5 });
      break;
    case 'rattle':
      for (let i = 0; i < (die ? 7 : 3); i++) noise(t + i * 0.035, 0.02, { gain: (0.3 - i * 0.02) * g, type: 'bandpass', freq: (1800 + (i % 2) * 700) * f, q: 4, release: 0.01 });
      tone(240 * f, t, 0.2 * L, { type: 'square', to: 120 * f, gain: 0.05 * g, filter: 900, release: 0.06 });
      break;
    case 'growl':
      tone(150 * f, t, 0.22 * L, { type: 'sawtooth', to: 90 * f, gain: 0.25 * g, filter: 700, filterTo: 300, q: 3, vibrato: 0.08, release: 0.08 * L });
      tone(75 * f, t, 0.2 * L, { type: 'square', to: 50 * f, gain: 0.08 * g, filter: 400, release: 0.08 * L });
      noise(t, 0.2 * L, { gain: 0.12 * g, type: 'lowpass', freq: 600, release: 0.08 });
      break;
    case 'roar':
      tone(260 * f, t, 0.3 * L, { type: 'sawtooth', to: 140 * f, gain: 0.22 * g, filter: 1800, filterTo: 500, q: 2, vibrato: 0.05, release: 0.1 * L, wet: 0.35 });
      noise(t, 0.3 * L, { gain: 0.16 * g, type: 'bandpass', freq: 900, freqTo: 400, q: 0.8, release: 0.1 * L });
      break;
    case 'chirp':
      for (let i = 0; i < (die ? 3 : 2); i++) tone(2000 * f, t + i * 0.07, 0.05, { type: 'sine', to: 3200 * f, gain: 0.12 * g, release: 0.02 });
      if (die) tone(2600 * f, t + 0.22, 0.25, { type: 'sine', to: 900 * f, gain: 0.1 * g, release: 0.08 });
      noise(t, 0.04, { gain: 0.1 * g, type: 'highpass', freq: 4000, release: 0.02 });
      break;
    case 'buzz':
      tone(190 * f, t, 0.18 * L, { type: 'sawtooth', to: (die ? 70 : 160) * f, gain: 0.12 * g, filter: 1500, q: 5, vibrato: 0.1, release: 0.06 * L });
      tone(380 * f, t, 0.16 * L, { type: 'square', gain: 0.04 * g, filter: 2000, release: 0.05 });
      break;
    case 'ribbit':
      for (let i = 0; i < 2; i++) tone(300 * f, t + i * 0.09 * L, 0.06 * L, { type: 'square', to: 220 * f, gain: 0.12 * g, filter: 900, q: 6, release: 0.02 });
      break;
    case 'bark':
      tone(520 * f, t, 0.08 * L, { type: 'sawtooth', to: 260 * f, gain: 0.22 * g, filter: 1800, filterTo: 500, q: 3, release: 0.03 * L });
      noise(t, 0.06, { gain: 0.2 * g, type: 'bandpass', freq: 1100, q: 1, release: 0.02 });
      if (die) tone(420 * f, t + 0.12, 0.3, { type: 'sawtooth', to: 200 * f, gain: 0.12 * g, filter: 1000, vibrato: 0.03, release: 0.1 });
      break;
    case 'meow':
      tone(600 * f, t, 0.22 * L, { type: 'sawtooth', to: 420 * f, gain: 0.12 * g, filter: 900, filterTo: 2200, q: 5, vibrato: 0.02, attack: 0.03, release: 0.08 * L });
      break;
    case 'blub':
      for (let i = 0; i < (die ? 4 : 2); i++) tone((300 + i * 120) * f, t + i * 0.06, 0.06, { type: 'sine', to: (700 + i * 200) * f, gain: 0.18 * g, release: 0.02 });
      break;
    case 'warble':
      tone(900 * f, t, 0.25 * L, { type: 'sine', to: 500 * f, gain: 0.14 * g, vibrato: 0.15, release: 0.08 * L, wet: 0.5 });
      tone(1350 * f, t, 0.2 * L, { type: 'triangle', to: 1800 * f, gain: 0.05 * g, vibrato: 0.2, release: 0.06 * L, wet: 0.5 });
      break;
    case 'crunch':
      noise(t, 0.08, { gain: 0.3 * g, type: 'bandpass', freq: 2200 * f, q: 1.5, release: 0.03 });
      tone(380 * f, t, 0.1 * L, { type: 'triangle', to: 180 * f, gain: 0.15 * g, release: 0.04 * L });
      break;
  }
  if (die) {
    // bursting into pieces: a wet pop, a soft boom and the bits clattering down
    const b = t + 0.04;
    noise(b, 0.05, { gain: 0.5 * vol, type: 'bandpass', freq: 1500, q: 0.7, release: 0.02 });
    noise(b, 0.35, { gain: 0.35 * vol, type: 'lowpass', freq: 1200, freqTo: 150, release: 0.12, wet: 0.35 });
    tone(140, b, 0.25, { type: 'sine', to: 40, gain: 0.45 * vol, release: 0.08 });
    for (let i = 0; i < 5; i++) noise(b + 0.18 + i * 0.05 + Math.random() * 0.03, 0.015, { gain: (0.14 - i * 0.02) * vol, type: 'bandpass', freq: 2500 + Math.random() * 2500, q: 3, release: 0.01 });
  }
}

/** A skill: a quick flourish on the class instrument, plus a whoosh/boom for area skills. */
export function sfxSkill(cls: ClassKey, type: string, vol = 1) {
  if (!ready() || vol <= 0) return;
  const t = now();
  const inst = INSTRUMENTS[cls] ?? INSTRUMENTS.singer;
  const support = type === 'buff' || type === 'heal' || type === 'heal_target' || type === 'buff_target' || type === 'buff_party';
  const run = support ? [60, 64, 67, 72, 76] : [72, 67, 64, 69, 76];
  run.forEach((n, i) => inst(cls === 'drummer' ? i % 2 : n, t + i * 0.06, 0.3, vol * 0.9));
  if (type === 'aoe' || type === 'aoe_self') {
    noise(t + 0.2, 0.5, { gain: 0.25 * vol, type: 'bandpass', freq: 400, freqTo: 3000, q: 0.8, wet: 0.4 });
    tone(110, t + 0.25, 0.4, { type: 'sine', to: 40, gain: 0.45 * vol, release: 0.15 });
  } else if (support) {
    for (let i = 0; i < 5; i++) tone(midi(84 + PENTA[i]), t + 0.3 + i * 0.05, 0.25, { type: 'sine', gain: 0.07 * vol, wet: 0.6 });
  }
}

export function sfx(name: Sfx, vol = 1) {
  if (!ready() || vol <= 0) return;
  const t = now();
  switch (name) {
    case 'hit':
      // "ปึก!": a dry crack on top, a crunchy full-range burst that dies fast, and a short body thump
      noise(t, 0.025, { gain: 0.55 * vol, type: 'highpass', freq: 3500, release: 0.012 });
      noise(t, 0.16, { gain: 0.42 * vol, type: 'bandpass', freq: 2600, freqTo: 1200, q: 0.6, release: 0.07 });
      noise(t, 0.1, { gain: 0.32 * vol, type: 'lowpass', freq: 1000, release: 0.05 });
      tone(170, t, 0.11, { type: 'sine', to: 60, gain: 0.42 * vol, release: 0.05 });
      tone(420, t, 0.04, { type: 'square', to: 200, gain: 0.07 * vol, filter: 2200, release: 0.02 });
      break;
    case 'crit':
      // "ป๊าก!": a hard plosive snap (ป), a short bright vowel body (า) cut off dead (ก), a heavy thump and a ring
      noise(t, 0.022, { gain: 0.85 * vol, type: 'highpass', freq: 3000, release: 0.008 });
      noise(t, 0.09, { gain: 0.5 * vol, type: 'bandpass', freq: 1700, q: 0.9, release: 0.03 });
      tone(560, t + 0.005, 0.085, { type: 'sawtooth', to: 380, gain: 0.26 * vol, filter: 2600, filterTo: 900, q: 4, release: 0.018 });
      tone(1120, t + 0.005, 0.07, { type: 'square', to: 760, gain: 0.06 * vol, filter: 3500, release: 0.015 });
      tone(210, t, 0.14, { type: 'sine', to: 55, gain: 0.6 * vol, release: 0.05 });
      noise(t + 0.06, 0.03, { gain: 0.35 * vol, type: 'highpass', freq: 4200, release: 0.01 });
      [2960, 4180].forEach((f, i) => tone(f, t + 0.02, 0.25, { type: 'sine', gain: (0.045 / (i + 1)) * vol, release: 0.1, wet: 0.4 }));
      break;
    case 'miss':
      noise(t, 0.18, { gain: 0.18 * vol, type: 'bandpass', freq: 600, freqTo: 2400, q: 2 });
      break;
    case 'hurt':
      tone(130, t, 0.15, { type: 'triangle', to: 70, gain: 0.35 * vol, release: 0.06 });
      noise(t, 0.05, { gain: 0.2 * vol, type: 'lowpass', freq: 800 });
      break;
    case 'mdie':
      tone(520, t, 0.25, { type: 'sine', to: 140, gain: 0.25 * vol, release: 0.08 });
      [79, 83, 86].forEach((n, i) => tone(midi(n), t + 0.12 + i * 0.05, 0.15, { type: 'triangle', gain: 0.07 * vol, wet: 0.5 }));
      break;
    case 'levelup':
    case 'joblevel': {
      const base = name === 'levelup' ? 72 : 79;
      [0, 4, 7, 12, 7, 12].forEach((s, i) =>
        tone(midi(base + s), t + i * 0.09, i === 5 ? 0.7 : 0.16, { type: 'square', gain: 0.1 * vol, filter: 3000, wet: 0.5 }),
      );
      tone(midi(base - 12), t, 1.0, { type: 'triangle', gain: 0.16 * vol, wet: 0.3 });
      break;
    }
    case 'potion':
    case 'heal':
      [0, 4, 7, 11, 14].forEach((s, i) => tone(midi(76 + s), t + i * 0.05, 0.3, { type: 'sine', gain: 0.1 * vol, wet: 0.7 }));
      break;
    case 'warp':
      noise(t, 0.7, { gain: 0.22 * vol, type: 'bandpass', freq: 300, freqTo: 4000, q: 3, wet: 0.5 });
      tone(220, t, 0.7, { type: 'sine', to: 880, gain: 0.15 * vol, vibrato: 0.02, wet: 0.5 });
      break;
    case 'enter':
      // the Music Land jingle
      [[67, 0], [72, 0.12], [76, 0.24], [79, 0.36], [84, 0.6]].forEach(([n, d], i) =>
        INSTRUMENTS.keyboardist(n, t + d, i === 4 ? 1.0 : 0.25, vol),
      );
      [48, 55, 64].forEach((n) => tone(midi(n), t + 0.6, 1.2, { type: 'triangle', gain: 0.1 * vol, attack: 0.05, wet: 0.5 }));
      break;
    case 'item':
      tone(midi(88), t, 0.08, { type: 'square', gain: 0.07 * vol, filter: 4000 });
      tone(midi(93), t + 0.07, 0.18, { type: 'square', gain: 0.07 * vol, filter: 4000, wet: 0.4 });
      break;
    case 'coin':
      tone(midi(95), t, 0.06, { type: 'square', gain: 0.05 * vol, filter: 5000 });
      tone(midi(100), t + 0.05, 0.25, { type: 'square', gain: 0.05 * vol, filter: 5000, wet: 0.3 });
      break;
    case 'death':
      [64, 60, 57, 52].forEach((n, i) => tone(midi(n), t + i * 0.22, 0.5, { type: 'triangle', gain: 0.18 * vol, wet: 0.6 }));
      break;
    case 'click':
      tone(1400, t, 0.03, { type: 'sine', gain: 0.05 * vol });
      break;
  }
}

// ------------------------------------------------------------ music

/** One song: a chord loop with bass, arpeggio and a melody, all in scale steps. */
interface Song {
  bpm: number;
  key: number; // midi root
  chords: number[][]; // per bar: chord tones as semitones above key
  melody: (number | null)[][]; // per bar: 8 eighth notes, semitones above key + 12 (null = rest)
  lead: ClassKey;
  drums: boolean;
  arp: boolean;
}

const I = [0, 4, 7], ii = [2, 5, 9], iii = [4, 7, 11], IV = [5, 9, 12], V = [7, 11, 14], vi = [9, 12, 16];
const _ = null;

const SONGS: Record<string, Song> = {
  // character select: slow and dreamy
  title: {
    bpm: 76, key: 57, lead: 'keyboardist', drums: false, arp: true,
    chords: [IV, V, iii, vi, ii, V, I, I],
    melody: [
      [12, _, 11, _, 9, _, 7, _], [9, _, _, _, 7, _, 4, _], [7, _, 9, _, 11, _, 12, _], [16, _, _, _, 14, _, 12, _],
      [14, _, 12, _, 9, _, 5, _], [7, _, _, _, 11, _, 14, _], [12, _, _, _, _, _, _, _], [_, _, _, _, _, _, _, _],
    ],
  },
  // town: calm, cosy
  town: {
    bpm: 92, key: 60, lead: 'keyboardist', drums: false, arp: true,
    chords: [I, vi, IV, V, I, iii, IV, V],
    melody: [
      [7, _, 9, 7, 4, _, 2, _], [4, _, _, 0, 4, _, 7, _], [9, _, 7, _, 5, _, 4, _], [2, _, _, _, _, _, _, _],
      [7, _, 9, 7, 12, _, 11, _], [9, _, 7, _, 4, _, 7, _], [9, _, 12, _, 11, 9, 7, _], [7, _, _, _, 2, _, 4, _],
    ],
  },
  // field: upbeat adventure
  field: {
    bpm: 124, key: 62, lead: 'guitarist', drums: true, arp: true,
    chords: [I, V, vi, IV, I, V, IV, V],
    melody: [
      [12, _, 11, 12, 14, _, 12, _], [11, _, 7, _, _, _, 7, 9], [11, _, 12, 14, 16, _, 14, _], [12, _, 9, _, _, _, _, _],
      [12, _, 11, 12, 14, _, 16, _], [19, _, 18, _, 16, _, 14, _], [12, _, 14, _, 16, _, 12, _], [14, _, _, _, _, _, 11, _],
    ],
  },
};

let song: Song | null = null;
let songName: string | null = null;
let pendingSong: string | null | undefined;
let step = 0;
let nextAt = 0;
let timer: number | undefined;
let songBus: GainNode | null = null;

function schedule() {
  if (!ctx || !song || !songBus) return;
  const eighth = 60 / song.bpm / 2;
  while (nextAt < ctx.currentTime + 0.25) {
    const bar = Math.floor(step / 8) % song.chords.length;
    const pos = step % 8;
    const chord = song.chords[bar];
    const k = song.key;
    const d = songBus;
    if (pos === 0) {
      // pad + bass at the start of the bar
      for (const s of chord) tone(midi(k + s), nextAt, eighth * 7, { type: 'triangle', gain: 0.05, attack: 0.15, release: eighth * 3, dest: d });
      tone(midi(k + chord[0] - 12), nextAt, eighth * 3, { type: 'sine', gain: 0.22, release: eighth * 2, dest: d });
    }
    if (pos === 4) tone(midi(k + chord[0] - 12), nextAt, eighth * 2, { type: 'sine', gain: 0.16, release: eighth, dest: d });
    if (song.arp) {
      const s = chord[[0, 1, 2, 1][pos % 4]] + (pos >= 4 ? 12 : 0);
      tone(midi(k + s), nextAt, eighth * 0.9, { type: 'square', gain: 0.025, filter: 1800, release: eighth / 2, dest: d });
    }
    const m = song.melody[bar][pos];
    if (m !== null) {
      let len = 1;
      while (pos + len < 8 && song.melody[bar][pos + len] === null && len < 4) len++;
      INSTRUMENTS[song.lead](k + m, nextAt, eighth * len, 0.45, d);
    }
    if (song.drums) {
      if (pos === 0 || pos === 4) INSTRUMENTS.drummer(0, nextAt, 0.1, 0.5, d);
      if (pos === 2 || pos === 6) INSTRUMENTS.drummer(1, nextAt, 0.1, 0.35, d);
      noise(nextAt, 0.03, { gain: 0.04, type: 'highpass', freq: 7000, release: 0.015, dest: d });
    }
    nextAt += eighth;
    step++;
  }
}

/** Switches the background music ('title', 'town', 'field', or null for silence). */
export function playMusic(name: string | null) {
  pendingSong = name;
  if (!ctx || !unlocked) return;
  if (name === songName) return;
  songName = name;
  // fade out the old song on its own bus, then drop it
  if (songBus) {
    const old = songBus;
    old.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    setTimeout(() => old.disconnect(), 2000);
  }
  songBus = null;
  song = name ? SONGS[name] ?? null : null;
  if (timer) clearInterval(timer);
  timer = undefined;
  if (!song) return;
  songBus = ctx.createGain();
  songBus.gain.setValueAtTime(0, ctx.currentTime);
  songBus.gain.setTargetAtTime(1, ctx.currentTime + 0.3, 0.6);
  songBus.connect(musicBus);
  step = 0;
  nextAt = ctx.currentTime + 0.4;
  timer = window.setInterval(schedule, 80);
  schedule();
}

/**
 * "ตึ้ง!": Hammer-on. A distorted power chord (E5: root, fifth, octave, saw waves through a closing filter)
 * slammed together with a deep boom and a crack of noise, like the guitar smashing the ground.
 */
export function sfxHammer(vol = 1, big = false, at = 0) {
  if (!ready() || vol <= 0) return;
  const t = now() + at;
  const k = big ? 1.25 : 1;
  noise(t, 0.03, { gain: 0.4 * vol * k, type: 'highpass', freq: 2500, release: 0.02 });
  for (const [f, g] of [[82.4, 0.2], [123.5, 0.16], [164.8, 0.13], [247, 0.07]] as const) {
    tone(f, t, 0.9, { type: 'sawtooth', to: f * 0.985, gain: g * vol * k, filter: 2600, filterTo: 300, vibrato: 0.006, release: 0.35, wet: 0.35 });
  }
  tone(140, t, 0.5, { type: 'sine', to: 30, gain: 0.85 * vol * k, release: 0.18 });
  noise(t + 0.01, 0.55, { gain: 0.38 * vol * k, type: 'lowpass', freq: 1200, freqTo: 90, release: 0.22, wet: 0.4 });
}

/**
 * Vibrato: a bright sustained guitar note (A4 + octave, saw through a filter) with a wide vibrato that speeds up,
 * over a soft rising whoosh as the aura flares.
 */
export function sfxVibrato(vol = 1, big = false, at = 0) {
  if (!ready() || vol <= 0) return;
  const t = now() + at;
  const k = big ? 1.15 : 1;
  noise(t, 0.35, { gain: 0.22 * vol * k, type: 'bandpass', freq: 400, freqTo: 3500, q: 0.7, release: 0.12, wet: 0.4 });
  tone(440, t + 0.05, 1.1, { type: 'sawtooth', gain: 0.12 * vol * k, filter: 2400, filterTo: 900, vibrato: 0.03, release: 0.4, wet: 0.5 });
  tone(880, t + 0.05, 1.0, { type: 'triangle', gain: 0.07 * vol * k, vibrato: 0.03, release: 0.35, wet: 0.5 });
  tone(220, t + 0.05, 0.9, { type: 'sawtooth', gain: 0.06 * vol * k, filter: 900, filterTo: 300, release: 0.3, wet: 0.3 });
}

/** Slide: a guitar slide (a saw note gliding up the neck) on a rush of air; `hit` = the landing crash. */
export function sfxSlide(vol = 1, hit = false, big = false, at = 0) {
  if (!ready() || vol <= 0) return;
  const t = now() + at;
  const k = big ? 1.3 : 1;
  if (hit) {
    noise(t, 0.03, { gain: 0.35 * vol * k, type: 'highpass', freq: 2500, release: 0.02 });
    for (const f of [110, 164.8, 220]) tone(f, t, 0.5, { type: 'sawtooth', gain: 0.12 * vol * k, filter: 2200, filterTo: 300, release: 0.2, wet: 0.35 });
    tone(150, t, 0.35, { type: 'sine', to: 40, gain: 0.6 * vol * k, release: 0.12 });
    return;
  }
  noise(t, 0.2, { gain: 0.3 * vol * k, type: 'bandpass', freq: 500, freqTo: 5000, q: 0.8, release: 0.06 });
  tone(165, t, 0.25, { type: 'sawtooth', to: 660, gain: 0.14 * vol * k, filter: 1800, filterTo: 3500, release: 0.08, wet: 0.35 });
  tone(330, t, 0.25, { type: 'triangle', to: 1320, gain: 0.07 * vol * k, release: 0.08, wet: 0.35 });
}

/** Palm muting: fast muted power-chord chugs with a crackle of electricity; `big` = the final pull-in thud. */
export function sfxPalmMute(vol = 1, big = false, at = 0) {
  if (!ready() || vol <= 0) return;
  const t = now() + at;
  if (big) {
    tone(82.4, t, 0.5, { type: 'sawtooth', gain: 0.2 * vol, filter: 900, filterTo: 150, release: 0.2, wet: 0.3 });
    tone(120, t, 0.4, { type: 'sine', to: 35, gain: 0.7 * vol, release: 0.15 });
    return;
  }
  for (let i = 0; i < 4; i++) {
    const s = t + i * 0.09;
    for (const f of [82.4, 123.5]) tone(f, s, 0.08, { type: 'sawtooth', gain: 0.16 * vol, filter: 700, filterTo: 200, release: 0.03 });
    noise(s, 0.03, { gain: 0.12 * vol, type: 'lowpass', freq: 800, release: 0.02 });
  }
  for (let i = 0; i < 6; i++) noise(t + 0.1 + i * 0.05 + Math.random() * 0.03, 0.03, { gain: 0.18 * vol, type: 'bandpass', freq: 3000 + Math.random() * 3000, q: 2, release: 0.02 });
}

/** Bending: a string bent up and screaming (a saw note bending a whole tone with vibrato) over a roaring wind. */
export function sfxBend(vol = 1, big = false, at = 0) {
  if (!ready() || vol <= 0) return;
  const t = now() + at;
  if (big) {
    noise(t, 0.04, { gain: 0.35 * vol, type: 'highpass', freq: 2500, release: 0.02 });
    tone(130, t, 0.45, { type: 'sine', to: 35, gain: 0.7 * vol, release: 0.15 });
    noise(t, 0.5, { gain: 0.3 * vol, type: 'lowpass', freq: 1200, freqTo: 100, release: 0.2, wet: 0.4 });
    return;
  }
  tone(587, t, 1.1, { type: 'sawtooth', to: 659, gain: 0.1 * vol, filter: 2600, filterTo: 1400, vibrato: 0.02, release: 0.35, wet: 0.5 });
  tone(294, t, 1.1, { type: 'sawtooth', to: 330, gain: 0.07 * vol, filter: 1500, release: 0.35, wet: 0.4 });
  noise(t, 1.2, { gain: 0.28 * vol, type: 'bandpass', freq: 300, freqTo: 1600, q: 0.6, release: 0.3, wet: 0.4 });
}

// ------------------------------------------------------------ keyboardist (blue set)

/** A glassy electric-piano note: sine + bell partials, quick decay, lots of reverb. */
function epiano(f: number, at: number, dur: number, g: number) {
  tone(f, at, dur, { type: 'sine', gain: g, release: dur / 2.5, wet: 0.55 });
  tone(f * 2, at, dur * 0.6, { type: 'sine', gain: g * 0.35, release: dur / 4, wet: 0.55 });
  tone(f * 3.01, at, dur * 0.25, { type: 'triangle', gain: g * 0.18, release: dur / 8, wet: 0.6 });
}

/** ตัวโน้ตทำลาย: a falling-note "ติ๊ง!" (big = the last volley: a chord crash with a low boom). */
export function sfxNoteFall(vol = 1, big = false, at = 0) {
  if (!ready() || vol <= 0) return;
  const t = now() + at;
  const root = 72 + Math.floor(Math.random() * 5) * 2;
  epiano(midi(root + 12), t, 0.5, 0.18 * vol);
  noise(t, 0.06, { gain: 0.18 * vol, type: 'highpass', freq: 4000, release: 0.04, wet: 0.3 });
  if (big) {
    for (const n of [60, 64, 67, 71, 74]) epiano(midi(n), t + 0.01, 1.4, 0.11 * vol);
    tone(120, t, 0.45, { type: 'sine', to: 38, gain: 0.55 * vol, release: 0.15 });
    noise(t, 0.6, { gain: 0.2 * vol, type: 'bandpass', freq: 2500, freqTo: 400, q: 0.6, wet: 0.5 });
  }
}

/** The cast of ตัวโน้ตทำลาย: a rising arpeggio that keeps climbing. */
export function sfxNoteCharge(vol = 1, ms = 5000) {
  if (!ready() || vol <= 0) return;
  const t = now();
  const steps = Math.max(4, Math.min(24, Math.round(ms / 220)));
  const scale = [0, 2, 4, 7, 9];
  for (let i = 0; i < steps; i++) {
    const n = 60 + scale[i % 5] + Math.floor(i / 5) * 12;
    epiano(midi(n), t + (i * ms) / 1000 / steps, 0.4, 0.07 * vol);
  }
}

/** The keyboardist's support spells: an e-piano phrase per skill; `big` = the hit/landing sparkle. */
export function sfxKeySpell(kind: 'blast' | 'heal' | 'tempo' | 'control' | 'solo' | 'shield' | 'revive', vol = 1, big = false) {
  if (!ready() || vol <= 0) return;
  const t = now();
  const run = (notes: number[], gap: number, dur: number, g: number) => notes.forEach((n, i) => epiano(midi(n), t + i * gap, dur, g * vol));
  if (kind === 'blast') {
    if (big) {
      for (const n of [76, 79, 83]) epiano(midi(n), t, 0.7, 0.12 * vol);
      tone(140, t, 0.3, { type: 'sine', to: 45, gain: 0.4 * vol, release: 0.1 });
      noise(t, 0.25, { gain: 0.2 * vol, type: 'highpass', freq: 3000, release: 0.1, wet: 0.4 });
    } else run([72, 76, 79], 0.05, 0.35, 0.12);
  } else if (kind === 'heal') run([67, 72, 76, 79, 84], 0.08, 0.9, 0.11);
  else if (kind === 'tempo') {
    run([72, 74, 76, 79, 81, 84, 86, 88], 0.035, 0.3, 0.1);
    noise(t, 0.35, { gain: 0.2 * vol, type: 'bandpass', freq: 800, freqTo: 6000, q: 0.8, release: 0.1, wet: 0.3 });
  } else if (kind === 'control') {
    for (let i = 0; i < 4; i++) noise(t + i * 0.22, 0.02, { gain: 0.25 * vol, type: 'bandpass', freq: 2200, q: 4, release: 0.02 });
    run([60, 67, 72, 76], 0.22, 0.6, 0.1);
  } else if (kind === 'solo') {
    run([79, 83, 86, 91, 95], 0.06, 0.6, 0.1);
    for (let i = 0; i < 6; i++) tone(midi(96 + (i % 3) * 3), t + 0.3 + i * 0.07, 0.15, { type: 'sine', gain: 0.05 * vol, wet: 0.7 });
  } else if (kind === 'shield') {
    for (const n of [55, 62, 67, 71]) epiano(midi(n), t, 1.4, 0.1 * vol);
    tone(midi(79), t + 0.35, 1, { type: 'triangle', gain: 0.06 * vol, vibrato: 0.01, wet: 0.7 });
  } else if (kind === 'revive') {
    if (big) {
      // the choir swells as they stand up
      for (const n of [60, 64, 67, 72, 76]) tone(midi(n), t, 1.8, { type: 'sawtooth', gain: 0.035 * vol, filter: 1800, attack: 0.25, vibrato: 0.006, release: 0.8, wet: 0.8 });
      for (const n of [84, 88, 91]) epiano(midi(n), t, 1.2, 0.08 * vol);
    } else run([60, 67, 72, 76, 79, 84, 88], 0.09, 1.2, 0.09);
  }
}

// ------------------------------------------------------------ bassist (green set)

/**
 * "ดุ๊ม!": the bassist's hits. A fat slapped bass note (saw + sub sine through a closing filter) dropping in
 * pitch, a sub-bass boom and a crack of noise; `big` = the heavy one (โน้ตราก, the last beat of จังหวะ Straight).
 */
export function sfxBassDrop(vol = 1, big = false, at = 0) {
  if (!ready() || vol <= 0) return;
  const t = now() + at;
  const k = big ? 1.25 : 0.8;
  noise(t, 0.03, { gain: 0.35 * vol * k, type: 'highpass', freq: 2200, release: 0.02 });
  tone(55, t, 0.7, { type: 'sawtooth', to: 41, gain: 0.22 * vol * k, filter: 1600, filterTo: 160, release: 0.3, wet: 0.25 });
  tone(110, t, 0.35, { type: 'square', to: 82, gain: 0.08 * vol * k, filter: 1200, filterTo: 200, release: 0.15 });
  tone(160, t, big ? 0.7 : 0.45, { type: 'sine', to: 28, gain: 0.9 * vol * k, release: 0.2 });
  noise(t + 0.01, big ? 0.6 : 0.35, { gain: 0.3 * vol * k, type: 'lowpass', freq: 900, freqTo: 70, release: 0.2, wet: 0.35 });
}

/** The bassist's buffs: a walking bass riff (root, fifth, octave) under a rising shimmer, with a sub thump. */
export function sfxBassBuff(vol = 1) {
  if (!ready() || vol <= 0) return;
  const t = now();
  [41.2, 61.7, 82.4, 98].forEach((f, i) => tone(f, t + i * 0.09, 0.32, { type: 'sawtooth', gain: 0.16 * vol, filter: 900, filterTo: 250, release: 0.14, wet: 0.25 }));
  tone(120, t, 0.4, { type: 'sine', to: 35, gain: 0.6 * vol, release: 0.15 });
  noise(t + 0.05, 0.7, { gain: 0.16 * vol, type: 'bandpass', freq: 600, freqTo: 4500, q: 0.7, release: 0.25, wet: 0.5 });
}
