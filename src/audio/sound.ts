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
/** Call once at startup: resumes audio on the first user gesture. */
export function unlockAudio() {
  const go = () => {
    const c = init();
    if (!c) return;
    void c.resume().then(() => {
      unlocked = true;
      if (pendingSong !== undefined) playMusic(pendingSong);
    });
    window.removeEventListener('pointerdown', go, true);
    window.removeEventListener('keydown', go, true);
  };
  window.addEventListener('pointerdown', go, true);
  window.addEventListener('keydown', go, true);
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

/** A skill: a quick flourish on the class instrument, plus a whoosh/boom for area skills. */
export function sfxSkill(cls: ClassKey, type: string, vol = 1) {
  if (!ready() || vol <= 0) return;
  const t = now();
  const inst = INSTRUMENTS[cls] ?? INSTRUMENTS.singer;
  const run = type === 'buff' || type === 'heal' ? [60, 64, 67, 72, 76] : [72, 67, 64, 69, 76];
  run.forEach((n, i) => inst(cls === 'drummer' ? i % 2 : n, t + i * 0.06, 0.3, vol * 0.9));
  if (type === 'aoe' || type === 'aoe_self') {
    noise(t + 0.2, 0.5, { gain: 0.25 * vol, type: 'bandpass', freq: 400, freqTo: 3000, q: 0.8, wet: 0.4 });
    tone(110, t + 0.25, 0.4, { type: 'sine', to: 40, gain: 0.45 * vol, release: 0.15 });
  } else if (type === 'heal' || type === 'buff') {
    for (let i = 0; i < 5; i++) tone(midi(84 + PENTA[i]), t + 0.3 + i * 0.05, 0.25, { type: 'sine', gain: 0.07 * vol, wet: 0.6 });
  }
}

export function sfx(name: Sfx, vol = 1) {
  if (!ready() || vol <= 0) return;
  const t = now();
  switch (name) {
    case 'hit':
      noise(t, 0.06, { gain: 0.35 * vol, type: 'lowpass', freq: 1200, release: 0.03 });
      tone(180, t, 0.08, { type: 'sine', to: 90, gain: 0.3 * vol, release: 0.04 });
      break;
    case 'crit':
      noise(t, 0.09, { gain: 0.45 * vol, type: 'lowpass', freq: 2500, release: 0.05 });
      tone(240, t, 0.12, { type: 'square', to: 80, gain: 0.2 * vol, filter: 1500, release: 0.06 });
      tone(midi(88), t + 0.02, 0.2, { type: 'triangle', gain: 0.12 * vol, wet: 0.4 });
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
