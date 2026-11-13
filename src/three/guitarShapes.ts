import * as THREE from 'three';
import type { StringedProp } from './bass';

/**
 * The 12 MVP guitars: one body shape each (item `shape` in gamedata.json), built from code at real size.
 * Same frame as buildStringed: the neck runs along +X (nut at NUT), +Y is the bass side (up when played),
 * +Z is out of the face, the origin is where the neck meets the body.
 * Outline points are [x, y] (smooth) or [x, y, 1] (a sharp corner).
 */

type P = [number, number] | [number, number, 1];
type Finish =
  | { kind: 'solid'; color: string }
  | { kind: 'metal'; color: string }
  | { kind: 'wood'; color: string; grain: string }
  | { kind: 'burst'; stops: string[] }
  | { kind: 'flame'; color: string; light: string; edge: string }
  | { kind: 'zebra'; a: string; b: string }
  | { kind: 'band'; color: string; band: string };
type Pickup = { x: number; type: 'single' | 'hum' | 'pbass' | 'jbass' | 'soap'; angle?: number; color?: string; frame?: string };

export interface GuitarShape {
  outline: P[];
  finish: Finish;
  /** body edge colour (the sides) */
  side: string;
  thick?: number;
  binding?: string;
  guard?: { outline: P[]; mat: 'pearl' | 'white' | 'black' | 'tort' | 'cream' | 'gold' };
  pickups: Pickup[];
  bridge: 'trem' | 'tele' | 'tom' | 'bigsby' | 'offset' | 'bass';
  head: 'inline' | 'threes' | 'pointy' | 'hockey' | 'bassInline' | 'bassSplit';
  /** basses: 4 or 5 strings (guitars 6) */
  strings?: number;
  /** nut to bridge in metres (guitars 0.73) */
  scale?: number;
  frets?: number;
  headColor?: string;
  board: 'maple' | 'rosewood' | 'ebony';
  gold?: boolean;
  knobs: [number, number][];
  plates?: [number, number, number, number, number][]; // x, y, w, h, rotation (chrome control plates)
  fholes?: [number, number, number][]; // x, y, rotation
  /** block inlays instead of dots */
  blocks?: boolean;
}

const NUT = 0.47;
const SCALE = 0.73; // guitars: the bridge sits at NUT - SCALE = -0.26

export const GUITAR_SHAPES: Record<string, GuitarShape> = {
  stype: {
    outline: [[0, 0.034], [0.06, 0.052], [0.115, 0.088], [0.1, 0.13], [0.03, 0.14], [-0.09, 0.12], [-0.21, 0.155], [-0.33, 0.152],
      [-0.4, 0.06], [-0.4, -0.06], [-0.34, -0.16], [-0.22, -0.162], [-0.11, -0.12], [-0.03, -0.128], [0.035, -0.105], [0.05, -0.07], [0.025, -0.046], [0, -0.034]],
    finish: { kind: 'burst', stops: ['#f4bb4a', '#c8561c', '#5e220c', '#2c0e06'] },
    side: '#2a0e06',
    guard: { mat: 'white', outline: [[0.0, 0.036], [0.06, 0.058], [0.07, 0.09], [0.02, 0.112], [-0.08, 0.1], [-0.16, 0.118], [-0.23, 0.098], [-0.24, 0.04],
      [-0.2, -0.04], [-0.17, -0.1], [-0.08, -0.11], [-0.01, -0.06], [0.0, -0.036]] },
    pickups: [{ x: -0.07, type: 'single', color: '#f4f1e6' }, { x: -0.135, type: 'single', color: '#f4f1e6' }, { x: -0.205, type: 'single', angle: 0.14, color: '#f4f1e6' }],
    bridge: 'trem', head: 'inline', board: 'maple',
    knobs: [[-0.2, -0.075], [-0.235, -0.09], [-0.265, -0.1]],
  },
  singlecut: {
    outline: [[0, 0.034], [-0.03, 0.09], [-0.09, 0.128], [-0.15, 0.13], [-0.21, 0.115], [-0.27, 0.13], [-0.34, 0.158], [-0.41, 0.13],
      [-0.445, 0.05], [-0.445, -0.05], [-0.41, -0.135], [-0.34, -0.162], [-0.26, -0.15], [-0.19, -0.122], [-0.12, -0.122], [-0.04, -0.125],
      [0.025, -0.1], [0.03, -0.07], [0.012, -0.045], [0, -0.034]],
    finish: { kind: 'solid', color: '#0d0d10' },
    side: '#0d0d10', binding: '#efe6c8', thick: 1.25,
    guard: { mat: 'cream', outline: [[-0.03, -0.04], [-0.01, -0.09], [-0.06, -0.115], [-0.13, -0.1], [-0.14, -0.06]] },
    pickups: [{ x: -0.1, type: 'hum', color: '#d6b25a', frame: '#efe6c8' }, { x: -0.205, type: 'hum', color: '#d6b25a', frame: '#efe6c8' }],
    bridge: 'tom', head: 'threes', headColor: '#0d0d10', board: 'rosewood', gold: true,
    knobs: [[-0.3, -0.08], [-0.35, -0.07], [-0.33, -0.12], [-0.38, -0.11]],
  },
  ttype: {
    outline: [[0, 0.034], [-0.02, 0.1], [-0.07, 0.135], [-0.13, 0.14], [-0.2, 0.125], [-0.27, 0.145], [-0.35, 0.158], [-0.405, 0.12],
      [-0.42, 0.04], [-0.42, -0.04], [-0.4, -0.13], [-0.35, -0.163], [-0.27, -0.155], [-0.19, -0.12], [-0.12, -0.115], [-0.05, -0.125],
      [0.03, -0.1], [0.04, -0.07], [0.02, -0.046], [0, -0.034]],
    finish: { kind: 'wood', color: '#e0a13a', grain: '#b8741e' },
    side: '#a8621a',
    guard: { mat: 'black', outline: [[0, 0.036], [-0.03, 0.1], [-0.09, 0.118], [-0.17, 0.105], [-0.22, 0.06], [-0.23, -0.02], [-0.2, -0.09],
      [-0.11, -0.105], [-0.03, -0.08], [0, -0.036]] },
    pickups: [{ x: -0.08, type: 'single', color: '#d4d9e0' }, { x: -0.225, type: 'single', angle: 0.12, color: '#1a1a1a' }],
    bridge: 'tele', head: 'inline', board: 'maple',
    knobs: [[-0.31, -0.11], [-0.35, -0.115]],
    plates: [[-0.33, -0.115, 0.13, 0.034, 0.12]],
  },
  doublehorn: {
    outline: [[0, 0.034], [0.05, 0.05], [0.1, 0.082, 1], [0.07, 0.125], [0.0, 0.13], [-0.08, 0.118], [-0.16, 0.135], [-0.26, 0.16], [-0.36, 0.152],
      [-0.415, 0.09], [-0.43, 0], [-0.415, -0.09], [-0.36, -0.152], [-0.26, -0.16], [-0.16, -0.135], [-0.08, -0.118], [0.0, -0.13], [0.07, -0.125],
      [0.1, -0.082, 1], [0.05, -0.05], [0, -0.034]],
    finish: { kind: 'wood', color: '#7a141c', grain: '#5a0a12' },
    side: '#4a0a10', thick: 0.8,
    guard: { mat: 'black', outline: [[-0.005, 0.04], [-0.06, 0.08], [-0.15, 0.08], [-0.24, 0.04], [-0.25, -0.05], [-0.2, -0.105], [-0.12, -0.11], [-0.05, -0.08], [-0.005, -0.04]] },
    pickups: [{ x: -0.1, type: 'hum', color: '#d4d9e0', frame: '#111' }, { x: -0.205, type: 'hum', color: '#d4d9e0', frame: '#111' }],
    bridge: 'tom', head: 'threes', headColor: '#151515', board: 'rosewood',
    knobs: [[-0.3, -0.09], [-0.34, -0.075], [-0.33, -0.125], [-0.37, -0.11]],
  },
  flametop: {
    outline: [[0, 0.034], [0.05, 0.056], [0.075, 0.09], [0.055, 0.125], [0, 0.135], [-0.08, 0.125], [-0.16, 0.14], [-0.26, 0.162], [-0.37, 0.152],
      [-0.43, 0.09], [-0.445, 0], [-0.43, -0.1], [-0.36, -0.163], [-0.25, -0.163], [-0.15, -0.135], [-0.07, -0.13], [0, -0.12], [0.04, -0.1],
      [0.05, -0.07], [0.025, -0.046], [0, -0.034]],
    finish: { kind: 'flame', color: '#1b4596', light: '#4f86e0', edge: '#0a1a44' },
    side: '#d9a86a', binding: '#e0b67a', thick: 1.1,
    pickups: [{ x: -0.1, type: 'hum', color: '#d9b45a', frame: '#e6d3a8' }, { x: -0.205, type: 'hum', color: '#d9b45a', frame: '#e6d3a8' }],
    bridge: 'tom', head: 'threes', headColor: '#1b4596', board: 'rosewood', gold: true,
    knobs: [[-0.3, -0.1], [-0.34, -0.12], [-0.38, -0.12]],
  },
  vshape: {
    outline: [[0.02, 0.036, 1], [-0.46, 0.215, 1], [-0.5, 0.17, 1], [-0.33, 0.045], [-0.305, 0], [-0.33, -0.045], [-0.5, -0.17, 1], [-0.46, -0.215, 1], [0.02, -0.036, 1]],
    finish: { kind: 'zebra', a: '#f1e8cc', b: '#141414' },
    side: '#141414',
    pickups: [{ x: -0.1, type: 'hum', color: '#1a1a1a', frame: '#1a1a1a' }, { x: -0.205, type: 'hum', color: '#1a1a1a', frame: '#1a1a1a' }],
    bridge: 'tom', head: 'pointy', headColor: '#141414', board: 'ebony',
    knobs: [[-0.33, -0.115], [-0.38, -0.14], [-0.42, -0.165]],
  },
  offset_mini: {
    outline: [[0, 0.034], [0.04, 0.05], [0.07, 0.085], [0.055, 0.115], [0, 0.12], [-0.09, 0.11], [-0.18, 0.135], [-0.29, 0.15], [-0.37, 0.13],
      [-0.4, 0.05], [-0.4, -0.06], [-0.36, -0.14], [-0.28, -0.15], [-0.17, -0.115], [-0.08, -0.115], [-0.01, -0.11], [0.03, -0.085], [0.025, -0.05], [0, -0.034]],
    finish: { kind: 'solid', color: '#9fd8d0' },
    side: '#7fb8b0',
    guard: { mat: 'tort', outline: [[0, 0.036], [0.02, 0.075], [-0.05, 0.095], [-0.15, 0.092], [-0.2, 0.05], [-0.235, -0.01], [-0.26, -0.095],
      [-0.2, -0.105], [-0.1, -0.098], [-0.02, -0.08], [0, -0.036]] },
    pickups: [{ x: -0.09, type: 'single', angle: -0.15, color: '#f4f1e6' }, { x: -0.19, type: 'single', angle: 0.15, color: '#f4f1e6' }],
    bridge: 'offset', head: 'inline', board: 'rosewood',
    knobs: [[-0.3, -0.115], [-0.34, -0.12]],
    plates: [[-0.32, -0.118, 0.1, 0.034, 0.05]],
  },
  offset: {
    outline: [[0, 0.034], [0.05, 0.052], [0.1, 0.088], [0.08, 0.13], [0.01, 0.14], [-0.1, 0.122], [-0.22, 0.15], [-0.35, 0.16],
      [-0.43, 0.08], [-0.44, -0.03], [-0.41, -0.13], [-0.33, -0.165], [-0.22, -0.15], [-0.12, -0.115], [-0.04, -0.125], [0.03, -0.11],
      [0.045, -0.075], [0.02, -0.046], [0, -0.034]],
    finish: { kind: 'burst', stops: ['#f0b040', '#b84a18', '#3a1206', '#120604'] },
    side: '#200a04',
    guard: { mat: 'tort', outline: [[0, 0.036], [0.05, 0.06], [0.06, 0.1], [-0.02, 0.118], [-0.12, 0.1], [-0.2, 0.11], [-0.26, 0.07], [-0.28, -0.03],
      [-0.31, -0.1], [-0.22, -0.125], [-0.12, -0.1], [-0.03, -0.1], [0, -0.036]] },
    pickups: [{ x: -0.085, type: 'single', color: '#f4f1e6', frame: '#d4d9e0' }, { x: -0.2, type: 'single', color: '#f4f1e6', frame: '#d4d9e0' }],
    bridge: 'offset', head: 'inline', board: 'rosewood',
    knobs: [[-0.34, -0.12], [-0.38, -0.115], [-0.02, 0.1], [0.02, 0.095]],
    plates: [[0.0, 0.098, 0.1, 0.03, -0.25], [-0.36, -0.12, 0.12, 0.032, 0.3]],
  },
  arrow: {
    outline: [[0, 0.034, 1], [0.16, 0.09, 1], [0.135, 0.13, 1], [-0.3, 0.155, 1], [-0.33, 0.1, 1], [-0.5, -0.19, 1], [-0.46, -0.225, 1],
      [-0.15, -0.135, 1], [-0.05, -0.1], [0.02, -0.065, 1], [0, -0.034, 1]],
    finish: { kind: 'solid', color: '#f2eee2' },
    side: '#dcd6c6',
    guard: { mat: 'black', outline: [[0, 0.036, 1], [-0.05, 0.08, 1], [-0.24, 0.085, 1], [-0.3, -0.02, 1], [-0.36, -0.13, 1], [-0.16, -0.12, 1], [-0.05, -0.085, 1], [0, -0.036, 1]] },
    pickups: [{ x: -0.1, type: 'hum', color: '#d4d9e0', frame: '#111' }, { x: -0.205, type: 'hum', color: '#d4d9e0', frame: '#111' }],
    bridge: 'tom', head: 'hockey', headColor: '#f2eee2', board: 'rosewood',
    knobs: [[-0.36, -0.165], [-0.4, -0.18], [-0.44, -0.195]],
  },
  spike: {
    outline: [[0, 0.034, 1], [0.17, 0.12, 1], [0.03, 0.12, 1], [-0.05, 0.21, 1], [-0.12, 0.125, 1], [-0.28, 0.14, 1], [-0.38, 0.24, 1], [-0.39, 0.1, 1],
      [-0.52, 0.075, 1], [-0.44, 0, 1], [-0.52, -0.075, 1], [-0.39, -0.1, 1], [-0.38, -0.24, 1], [-0.28, -0.14, 1], [-0.12, -0.125, 1], [-0.05, -0.21, 1],
      [0.03, -0.12, 1], [0.12, -0.1, 1], [0, -0.034, 1]],
    finish: { kind: 'band', color: '#0e0e10', band: '#f2f2f2' },
    side: '#0e0e10',
    pickups: [{ x: -0.1, type: 'hum', color: '#1a1a1a', frame: '#1a1a1a' }, { x: -0.205, type: 'hum', color: '#1a1a1a', frame: '#1a1a1a' }],
    bridge: 'tom', head: 'pointy', headColor: '#0e0e10', board: 'ebony',
    knobs: [[-0.3, -0.09], [-0.34, -0.09]],
  },
  hollow: {
    outline: [[0, 0.04], [-0.03, 0.12], [-0.1, 0.172], [-0.18, 0.17], [-0.25, 0.15], [-0.32, 0.18], [-0.41, 0.2], [-0.48, 0.15],
      [-0.51, 0.05], [-0.51, -0.05], [-0.48, -0.16], [-0.41, -0.205], [-0.31, -0.182], [-0.23, -0.15], [-0.15, -0.15], [-0.07, -0.16],
      [0.0, -0.14], [0.035, -0.1], [0.02, -0.055], [0, -0.04]],
    finish: { kind: 'solid', color: '#f4f1e6' },
    side: '#f4f1e6', binding: '#d6b25a', thick: 1.9,
    guard: { mat: 'gold', outline: [[-0.03, -0.045], [-0.02, -0.12], [-0.12, -0.14], [-0.17, -0.1], [-0.15, -0.05]] },
    pickups: [{ x: -0.1, type: 'hum', color: '#d6b25a', frame: '#d6b25a' }, { x: -0.205, type: 'hum', color: '#d6b25a', frame: '#d6b25a' }],
    bridge: 'bigsby', head: 'threes', headColor: '#111', board: 'ebony', gold: true,
    knobs: [[-0.33, -0.1], [-0.37, -0.12], [-0.34, -0.15], [-0.4, -0.15]],
    fholes: [[-0.15, 0.125, 0.35], [-0.15, -0.115, -0.35]],
  },
  thinline: {
    outline: [[0, 0.034], [-0.02, 0.1], [-0.07, 0.135], [-0.13, 0.14], [-0.2, 0.125], [-0.27, 0.145], [-0.35, 0.158], [-0.405, 0.12],
      [-0.42, 0.04], [-0.42, -0.04], [-0.4, -0.13], [-0.35, -0.163], [-0.27, -0.155], [-0.19, -0.12], [-0.12, -0.115], [-0.05, -0.125],
      [0.03, -0.1], [0.04, -0.07], [0.02, -0.046], [0, -0.034]],
    finish: { kind: 'solid', color: '#f3eedc' },
    side: '#e2dcc4',
    guard: { mat: 'pearl', outline: [[0, 0.036], [-0.02, 0.06], [-0.1, 0.05], [-0.2, 0.06], [-0.27, 0.03], [-0.29, -0.06], [-0.25, -0.13], [-0.15, -0.11],
      [-0.06, -0.115], [0.02, -0.09], [0, -0.036]] },
    pickups: [{ x: -0.08, type: 'single', color: '#d4d9e0' }, { x: -0.225, type: 'single', angle: 0.12, color: '#1a1a1a' }],
    bridge: 'tele', head: 'inline', board: 'maple',
    knobs: [[-0.31, -0.11], [-0.35, -0.115]],
    plates: [[-0.33, -0.115, 0.13, 0.034, 0.12]],
    fholes: [[-0.14, 0.1, 0.35]],
  },
};

/** An outline scaled about the neck joint (bass bodies are guitar shapes made bigger). */
const big = (pts: P[], k: number, ky = k): P[] => pts.map((p) => (p[2] ? [p[0] * k, p[1] * ky, 1] : [p[0] * k, p[1] * ky]));

/** A modern bass body: long pointed upper horn, small treble horn. */
const SR: P[] = [[0, 0.034], [0.06, 0.05], [0.14, 0.085], [0.19, 0.118, 1], [0.14, 0.126], [0.06, 0.12], [-0.06, 0.115], [-0.16, 0.14], [-0.27, 0.16],
  [-0.37, 0.145], [-0.43, 0.08], [-0.445, 0], [-0.425, -0.09], [-0.36, -0.15], [-0.25, -0.16], [-0.14, -0.13], [-0.06, -0.115], [0.02, -0.1],
  [0.065, -0.085, 1], [0.03, -0.055], [0, -0.034]];

/** The 6 MVP basses (item `shape` of bassist weapons). */
export const BASS_SHAPES: Record<string, GuitarShape> = {
  mikro: {
    outline: big(SR, 0.88, 1.02), strings: 4, scale: 0.726, thick: 1.05,
    finish: { kind: 'wood', color: '#5e3c22', grain: '#3a2212' }, side: '#3a2212',
    pickups: [{ x: -0.12, type: 'pbass', color: '#141414' }, { x: -0.205, type: 'jbass', color: '#141414' }],
    bridge: 'bass', head: 'bassSplit', headColor: '#111', board: 'rosewood',
    knobs: [[-0.285, -0.085], [-0.31, -0.1], [-0.335, -0.112]],
  },
  pbass: {
    outline: big(GUITAR_SHAPES.stype.outline, 1.22), strings: 4, scale: 0.864, thick: 1.1,
    finish: { kind: 'burst', stops: ['#f4bb4a', '#c8561c', '#5e220c', '#2c0e06'] }, side: '#2a0e06',
    guard: { mat: 'white', outline: big([[0, 0.036], [0.06, 0.058], [0.07, 0.09], [0.02, 0.112], [-0.08, 0.1], [-0.14, 0.11], [-0.2, 0.09], [-0.22, 0.03],
      [-0.25, -0.05], [-0.3, -0.11], [-0.22, -0.13], [-0.1, -0.11], [-0.01, -0.06], [0, -0.036]], 1.22) },
    pickups: [{ x: -0.24, type: 'pbass', color: '#141414' }],
    bridge: 'bass', head: 'bassInline', board: 'rosewood',
    knobs: [[-0.42, -0.1], [-0.46, -0.115]],
    plates: [[-0.44, -0.11, 0.1, 0.034, 0.25]],
  },
  jag_short: {
    outline: big(GUITAR_SHAPES.offset.outline, 1.02), strings: 4, scale: 0.762, frets: 19,
    finish: { kind: 'metal', color: '#c9cdd3' }, side: '#a8adb4',
    guard: { mat: 'black', outline: big(GUITAR_SHAPES.offset.guard!.outline, 1.02) },
    pickups: [{ x: -0.16, type: 'pbass', color: '#141414' }, { x: -0.245, type: 'jbass', color: '#141414' }],
    bridge: 'bass', head: 'bassInline', headColor: '#111', board: 'rosewood',
    knobs: [[-0.35, -0.12], [-0.385, -0.115], [-0.33, -0.14]],
    plates: [[-0.36, -0.125, 0.12, 0.034, 0.3]],
  },
  sr: {
    outline: big(SR, 1.1, 1.22), strings: 4, scale: 0.864, thick: 0.95,
    finish: { kind: 'burst', stops: ['#f6c464', '#d08a30', '#7a3a10', '#3a1806'] }, side: '#3a1806',
    pickups: [{ x: -0.22, type: 'soap', color: '#141414' }, { x: -0.32, type: 'soap', color: '#141414' }],
    bridge: 'bass', head: 'bassSplit', headColor: '#2a1a0e', board: 'rosewood',
    knobs: [[-0.4, -0.11], [-0.43, -0.125], [-0.38, -0.14], [-0.41, -0.15]],
  },
  jazz5: {
    outline: big(GUITAR_SHAPES.offset.outline, 1.15), strings: 5, scale: 0.864, thick: 1.1,
    finish: { kind: 'wood', color: '#e9d2a2', grain: '#c8a46a' }, side: '#c8a46a',
    guard: { mat: 'black', outline: big(GUITAR_SHAPES.offset.guard!.outline, 1.15) },
    pickups: [{ x: -0.2, type: 'jbass', color: '#141414' }, { x: -0.33, type: 'jbass', color: '#141414' }],
    bridge: 'bass', head: 'bassInline', board: 'maple', blocks: true,
    knobs: [[-0.43, -0.135], [-0.465, -0.125], [-0.5, -0.11]],
    plates: [[-0.465, -0.125, 0.12, 0.034, 0.3]],
  },
  sire5: {
    outline: big(SR, 1.13, 1.25), strings: 5, scale: 0.889, thick: 1.0,
    finish: { kind: 'wood', color: '#1d5f8e', grain: '#0b3658' }, side: '#0b3658',
    pickups: [{ x: -0.24, type: 'soap', color: '#141414' }, { x: -0.34, type: 'soap', color: '#141414' }],
    bridge: 'bass', head: 'bassSplit', headColor: '#1d5f8e', board: 'maple', blocks: true,
    knobs: [[-0.42, -0.11], [-0.45, -0.125], [-0.42, -0.15], [-0.45, -0.165]],
  },
};

// ---------------------------------------------------------------- materials

const mats = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material) {
  if (!mats.has(key)) mats.set(key, make());
  return mats.get(key)!;
}
const std = (color: THREE.ColorRepresentation, metal = 0, rough = 0.45) =>
  mat(`std${color}${metal}${rough}`, () => new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough }));
const chrome = () => std(0xd4d9e0, 0.45, 0.25);
const goldMat = () => std(0xd8b04a, 0.55, 0.28);
const hw = (s: GuitarShape) => (s.gold ? goldMat() : chrome());
const stringMat = () => std(0xe2e5ea, 0.4, 0.3);

/** Texture space: body UVs are the outline's own metres, mapped onto this box. */
const TX0 = -0.56, TY0 = -0.28, TW = 0.78, TH = 0.56;
function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  return mat(key, () => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.repeat.set(1 / TW, 1 / TH);
    t.offset.set(-TX0 / TW, -TY0 / TH);
    t.anisotropy = 4;
    return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
  });
}
/** canvas x/y for a body point (canvas y grows down). */
const cx = (x: number, w: number) => ((x - TX0) / TW) * w;
const cy = (y: number, h: number) => (1 - (y - TY0) / TH) * h;

function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

function finishMat(id: string, s: GuitarShape): THREE.Material {
  const f = s.finish;
  if (f.kind === 'metal') return mat(`metal${f.color}`, () => new THREE.MeshPhysicalMaterial({ color: f.color, metalness: 0.75, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.1 }));
  if (f.kind === 'solid') return mat(`solid${f.color}`, () => new THREE.MeshPhysicalMaterial({ color: f.color, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.06 }));
  return canvasTex(`fin_${id}`, 512, 368, (g, w, h) => {
    const r = rng(7);
    const mx = cx(-0.22, w), my = cy(0, h);
    if (f.kind === 'burst') {
      const gr = g.createRadialGradient(mx, my, 10, mx, my, w * 0.34);
      f.stops.forEach((c, i) => gr.addColorStop([0, 0.45, 0.78, 1][i] ?? 1, c));
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      grain(g, w, h, 'rgba(60,20,0,0.12)', r);
    } else if (f.kind === 'wood') {
      g.fillStyle = f.color;
      g.fillRect(0, 0, w, h);
      grain(g, w, h, f.grain + '55', r);
    } else if (f.kind === 'flame') {
      g.fillStyle = f.color;
      g.fillRect(0, 0, w, h);
      // flame figure: wavy light bands across the grain
      for (let x = -40; x < w + 40; x += 7 + r() * 9) {
        g.strokeStyle = f.light + (r() < 0.5 ? '88' : '44');
        g.lineWidth = 2 + r() * 5;
        g.beginPath();
        for (let y = 0; y <= h; y += 8) g.lineTo(x + Math.sin(y * 0.05 + x) * 10 + (y / h) * 30, y);
        g.stroke();
      }
      const gr = g.createRadialGradient(mx, my, w * 0.12, mx, my, w * 0.34);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, f.edge);
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    } else if (f.kind === 'zebra') {
      g.fillStyle = f.a;
      g.fillRect(0, 0, w, h);
      g.fillStyle = f.b;
      // chevrons pointing up the neck, like the V itself
      for (let i = -12; i < 30; i++) {
        const x = i * 26;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + 13, 0);
        g.lineTo(x + 13 + 110, h / 2);
        g.lineTo(x + 13, h);
        g.lineTo(x, h);
        g.lineTo(x + 110, h / 2);
        g.closePath();
        g.fill();
      }
    } else if (f.kind === 'band') {
      g.fillStyle = f.color;
      g.fillRect(0, 0, w, h);
      // a white band just inside the spiky edge, and a white swoosh along the middle
      g.save();
      trace(g, s.outline, w, h, 0.86);
      g.fillStyle = f.band;
      g.fill();
      trace(g, s.outline, w, h, 0.74);
      g.fillStyle = f.color;
      g.fill();
      g.restore();
    }
  });
}

function grain(g: CanvasRenderingContext2D, w: number, h: number, col: string, r: () => number) {
  g.strokeStyle = col;
  for (let y = 0; y < h; y += 3 + r() * 4) {
    g.lineWidth = 0.6 + r() * 1.4;
    g.beginPath();
    for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.02 + y) * 2.5);
    g.stroke();
  }
}

/** The outline as a canvas path, shrunk towards the body's middle by `k`. */
function trace(g: CanvasRenderingContext2D, pts: P[], w: number, h: number, k: number) {
  const c = centre(pts);
  g.beginPath();
  pts.forEach(([x, y], i) => {
    const px = cx(c.x + (x - c.x) * k, w), py = cy(c.y + (y - c.y) * k, h);
    if (i) g.lineTo(px, py);
    else g.moveTo(px, py);
  });
  g.closePath();
}

function centre(pts: P[]) {
  let x = 0, y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return new THREE.Vector2(x / pts.length, y / pts.length);
}

function guardMat(kind: NonNullable<GuitarShape['guard']>['mat']) {
  if (kind === 'tort') {
    return canvasTex('tort', 256, 184, (g, w, h) => {
      const r = rng(3);
      g.fillStyle = '#5a1e0c';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 160; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(20,6,2,0.55)' : 'rgba(170,80,30,0.45)';
        g.beginPath();
        g.ellipse(r() * w, r() * h, 3 + r() * 12, 1.5 + r() * 5, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    });
  }
  if (kind === 'pearl') {
    return canvasTex('pearlG', 256, 184, (g, w, h) => {
      const r = rng(5);
      g.fillStyle = '#eef3ee';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 220; i++) {
        const v = 220 + Math.floor(r() * 35);
        g.fillStyle = `rgba(${v - 10},${v},${v - 4},0.55)`;
        g.beginPath();
        g.ellipse(r() * w, r() * h, 2 + r() * 6, 1 + r() * 3, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    });
  }
  const col = { white: '#f6f4ee', black: '#121214', cream: '#efe6c8', gold: '#d6b25a' }[kind];
  return mat(`guard${kind}`, () => new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.3, clearcoat: 0.6, metalness: kind === 'gold' ? 0.5 : 0 }));
}

// ---------------------------------------------------------------- geometry helpers

function shapeOf(pts: P[], k = 1, c = new THREE.Vector2()) {
  const v = pts.map((p) => new THREE.Vector2(c.x + (p[0] - c.x) * k, c.y + (p[1] - c.y) * k));
  const corner = pts.map((p) => p[2] === 1);
  const s = new THREE.Shape();
  const first = corner.indexOf(true);
  if (first < 0) {
    s.moveTo(v[0].x, v[0].y);
    s.splineThru([...v.slice(1), v[0]]);
    return s;
  }
  // runs of smooth points between sharp corners
  const n = v.length;
  s.moveTo(v[first].x, v[first].y);
  let run: THREE.Vector2[] = [];
  for (let i = 1; i <= n; i++) {
    const j = (first + i) % n;
    run.push(v[j]);
    if (corner[j]) {
      if (run.length === 1) s.lineTo(run[0].x, run[0].y);
      else s.splineThru(run);
      run = [];
    }
  }
  return s;
}

function slab(shape: THREE.Shape, depth: number, m: THREE.Material | THREE.Material[], z: number, bevel = 0) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 20,
  });
  const o = new THREE.Mesh(g, m);
  o.position.z = z;
  return o;
}

function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, rz = 0) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.rotation.z = rz;
  return o;
}

function cyl(r: number, h: number, m: THREE.Material, x: number, y: number, z: number, axis: 'x' | 'y' | 'z' = 'z', seg = 14, r2 = r) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, h, seg), m);
  o.position.set(x, y, z);
  if (axis === 'z') o.rotation.x = Math.PI / 2;
  if (axis === 'x') o.rotation.z = Math.PI / 2;
  return o;
}

function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material) {
  const len = a.distanceTo(b);
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), m);
  o.position.copy(a).add(b).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return o;
}

/** An f-hole: a thin S-curve with a round eye at each end. */
function fhole(g: THREE.Group, x: number, y: number, rot: number, z: number) {
  const f = new THREE.Group();
  const s = new THREE.Shape();
  const L = 0.05, W = 0.0045;
  s.moveTo(-L, 0.006);
  s.bezierCurveTo(-L * 0.3, 0.016, L * 0.3, -0.016, L, -0.006);
  s.lineTo(L, -0.006 + W);
  s.bezierCurveTo(L * 0.3, -0.016 + W, -L * 0.3, 0.016 + W, -L, 0.006 + W);
  s.closePath();
  const m = std(0x0a0806, 0, 0.9);
  f.add(slab(s, 0.0012, m, 0));
  f.add(cyl(0.0055, 0.0012, m, -L, 0.008, 0.0006, 'z', 12), cyl(0.0055, 0.0012, m, L, -0.004, 0.0006, 'z', 12));
  f.position.set(x, y, z);
  f.rotation.z = rot;
  g.add(f);
}

// ---------------------------------------------------------------- the guitar

export function buildShaped(s: GuitarShape): StringedProp {
  const id = Object.keys(GUITAR_SHAPES).find((k) => GUITAR_SHAPES[k] === s) ?? 'b_' + Object.keys(BASS_SHAPES).find((k) => BASS_SHAPES[k] === s);
  const N = s.strings ?? 6;
  const bass = N < 6;
  const SC = s.scale ?? SCALE;
  const BRIDGE = NUT - SC;
  const fretX = (n: number) => NUT - SC * (1 - Math.pow(2, -n / 12));
  const FRETS = s.frets ?? (bass ? 20 : 22);
  // string spread at the nut and the bridge, and each string's offset across the neck (thickest on +Y)
  const nutHalf = bass ? (N === 5 ? 0.0175 : 0.0145) : 0.018;
  const brHalf = bass ? (N === 5 ? 0.034 : 0.029) : 0.026;
  const across = (i: number, half: number) => -half + (2 * half * i) / (N - 1);
  const g = new THREE.Group();
  const T = 0.036 * (s.thick ?? 1); // body thickness
  const bodyShape = shapeOf(s.outline);
  const sideMat = mat(`side${s.side}`, () => new THREE.MeshPhysicalMaterial({ color: s.side, roughness: 0.3, clearcoat: 1 }));
  g.add(slab(bodyShape, T, [finishMat(id, s), sideMat], 0, 0.005));
  if (s.binding) {
    // a cream/gold edge line around the top
    const bind = mat(`bind${s.binding}`, () => new THREE.MeshStandardMaterial({ color: s.binding, roughness: 0.35 }));
    // the top's own layer sits just inside a slightly bigger edge layer, so a thin line shows all round
    g.add(slab(bodyShape, 0.004, bind, T + 0.003));
    g.add(slab(shapeOf(s.outline, 0.975, centre(s.outline)), 0.0042, finishMat(id, s), T + 0.003));
  }
  const face = T + 0.005 + (s.binding ? 0.0072 : 0);

  if (s.guard) g.add(slab(shapeOf(s.guard.outline), 0.0022, guardMat(s.guard.mat), face));
  for (const [x, y, w, h, r] of s.plates ?? []) g.add(box(w, h, 0.0025, chrome(), x, y, face + 0.0012, r));
  for (const [x, y, r] of s.fholes ?? []) fhole(g, x, y, r, face - 0.0005);

  // neck and fretboard
  const boardEnd = fretX(FRETS + 0.4);
  const wNut = bass ? (N === 5 ? 0.047 : 0.042) : 0.043, wHeel = bass ? (N === 5 ? 0.072 : 0.062) : 0.056;
  const heelX = boardEnd;
  const widthAt = (x: number) => wHeel + (wNut - wHeel) * ((x - heelX) / (NUT - heelX));
  const tapered = (x0: number, x1: number, d: number, m: THREE.Material, z: number) => {
    const geo = new THREE.BoxGeometry(x1 - x0, 1, d, 24, 1, 1);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * widthAt(p.getX(i) + (x0 + x1) / 2));
    geo.computeVertexNormals();
    const o = new THREE.Mesh(geo, m);
    o.position.set((x0 + x1) / 2, 0, z);
    return o;
  };
  const neckWood = std(s.board === 'maple' ? 0xe6ad62 : 0x8a4a22, 0, 0.4);
  const boardMat = std({ maple: 0xe8b46a, rosewood: 0x3b1d14, ebony: 0x141010 }[s.board], 0, s.board === 'maple' ? 0.35 : 0.7);
  const dotMat = std(s.board === 'maple' ? 0x1a1a1a : 0xf4f1ea, 0, 0.3);
  g.add(tapered(heelX, NUT, 0.022, neckWood, face + 0.004));
  g.add(tapered(boardEnd, NUT, 0.006, boardMat, face + 0.018));
  const boardTop = face + 0.021;
  for (let n = 1; n <= FRETS; n++) {
    const x = fretX(n);
    g.add(box(0.0018, widthAt(x) * 0.97, 0.002, chrome(), x, 0, boardTop + 0.0008));
  }
  for (const n of [3, 5, 7, 9, 12, 15, 17, 19, 21].filter((n) => n <= FRETS)) {
    const x = (fretX(n) + fretX(n - 1)) / 2;
    const ys = n === 12 ? [-0.012, 0.012] : [0];
    for (const y of ys) {
      if (s.blocks || s.board === 'ebony' || s.head === 'pointy') g.add(box(0.012, widthAt(x) * 0.8, 0.0006, std(0xf4f1ea, 0, 0.3), x, 0, boardTop + 0.0002)); // block inlays
      else g.add(cyl(0.0035, 0.001, dotMat, x, y, boardTop + 0.0002, 'z', 10));
    }
  }
  g.add(box(0.004, wNut, 0.006, std(0xf2ead8), NUT, 0, boardTop + 0.002));

  // headstock
  const headCol = s.headColor ?? (s.board === 'maple' ? '#e6ad62' : '#e6ad62');
  const headMat = mat(`head${headCol}`, () => new THREE.MeshPhysicalMaterial({ color: headCol, roughness: 0.3, clearcoat: 0.8 }));
  const headZ = face + 0.002;
  const headTop = headZ + 0.014;
  let headPts: P[];
  const posts: THREE.Vector3[] = [];
  const keys: [THREE.Vector3, number][] = []; // tuner button: post position, side (+1 / -1 = which way it sticks out)
  if (s.head === 'threes') {
    headPts = [[NUT - 0.002, -0.022], [NUT + 0.05, -0.036], [NUT + 0.15, -0.046], [NUT + 0.185, -0.03], [NUT + 0.19, 0], [NUT + 0.185, 0.03], [NUT + 0.15, 0.046], [NUT + 0.05, 0.036], [NUT - 0.002, 0.022]];
    for (let i = 0; i < 3; i++) {
      const x = NUT + 0.05 + i * 0.045;
      const w = 0.026 + i * 0.004;
      posts.push(new THREE.Vector3(x, -w, headTop), new THREE.Vector3(x, w, headTop));
      keys.push([new THREE.Vector3(x, -w, headZ), -1], [new THREE.Vector3(x, w, headZ), 1]);
    }
  } else if (s.head === 'bassSplit') {
    // basses: tuners split across both sides (2+2, or 3+2 for five strings)
    const up = Math.ceil(N / 2), down = N - up;
    headPts = [[NUT - 0.002, -0.022], [NUT + 0.06, -0.04], [NUT + 0.17, -0.05], [NUT + 0.2, -0.03], [NUT + 0.205, 0.0], [NUT + 0.2, 0.034], [NUT + 0.17, 0.052], [NUT + 0.06, 0.042], [NUT - 0.002, 0.022]];
    for (let i = 0; i < up; i++) {
      const x = NUT + 0.05 + i * (0.12 / Math.max(1, up - 1));
      posts.push(new THREE.Vector3(x, 0.03, headTop));
      keys.push([new THREE.Vector3(x, 0.03, headZ), 1]);
    }
    for (let i = 0; i < down; i++) {
      const x = NUT + 0.05 + i * (0.12 / Math.max(1, down - 1));
      posts.push(new THREE.Vector3(x, -0.028, headTop));
      keys.push([new THREE.Vector3(x, -0.028, headZ), -1]);
    }
  } else if (s.head === 'bassInline') {
    // the long bass headstock, all tuners on the upper side
    headPts = [[NUT - 0.002, -0.022], [NUT - 0.002, 0.022], [NUT + 0.05, 0.034], [NUT + 0.13, 0.05], [NUT + 0.22, 0.066], [NUT + 0.255, 0.05], [NUT + 0.25, 0.01], [NUT + 0.16, -0.012], [NUT + 0.06, -0.028]];
    for (let i = 0; i < N; i++) {
      const x = NUT + 0.05 + i * (0.19 / (N - 1));
      const y = 0.026 + i * 0.006;
      posts.push(new THREE.Vector3(x, y, headTop));
      keys.push([new THREE.Vector3(x, y, headZ), 1]);
    }
  } else {
    const pointy = s.head === 'pointy' || s.head === 'hockey';
    headPts = s.head === 'pointy'
      ? [[NUT - 0.002, -0.021, 1], [NUT - 0.002, 0.021, 1], [NUT + 0.2, 0.06, 1], [NUT + 0.235, 0.045, 1], [NUT + 0.12, -0.005, 1], [NUT + 0.05, -0.026, 1]]
      : s.head === 'hockey'
        ? [[NUT - 0.002, -0.021, 1], [NUT - 0.002, 0.021, 1], [NUT + 0.17, 0.05, 1], [NUT + 0.22, 0.075, 1], [NUT + 0.215, 0.035, 1], [NUT + 0.05, -0.026, 1]]
        : [[NUT - 0.002, -0.021], [NUT - 0.002, 0.021], [NUT + 0.04, 0.03], [NUT + 0.1, 0.046], [NUT + 0.18, 0.058], [NUT + 0.212, 0.042], [NUT + 0.205, 0.004], [NUT + 0.13, -0.014], [NUT + 0.05, -0.026]];
    for (let i = 0; i < 6; i++) {
      const x = NUT + 0.045 + i * 0.026;
      const y = (pointy ? 0.018 : 0.022) + i * (pointy ? 0.0065 : 0.005);
      posts.push(new THREE.Vector3(x, y, headTop));
      keys.push([new THREE.Vector3(x, y, headZ), 1]);
    }
  }
  g.add(slab(shapeOf(headPts), 0.014, headMat, headZ, 0.002));
  for (const [p, side] of keys) {
    g.add(cyl(0.0045, 0.02, hw(s), p.x, p.y, headTop + 0.008 - 0.0 * side));
    g.add(cyl(0.008, 0.004, hw(s), p.x, p.y, headTop + 0.001));
    const key = new THREE.Mesh(new THREE.SphereGeometry(bass ? 0.018 : 0.011, 12, 8), hw(s));
    key.scale.set(bass ? 0.8 : 1, 0.55, 0.32);
    key.position.set(p.x, p.y + side * (bass ? 0.04 : 0.03), headZ);
    g.add(key, rod(p, new THREE.Vector3(p.x, p.y + side * (bass ? 0.03 : 0.024), headZ), bass ? 0.004 : 0.0028, hw(s)));
  }

  // pickups
  for (const pu of s.pickups) {
    const grp = new THREE.Group();
    grp.position.set(pu.x, 0, face);
    grp.rotation.z = pu.angle ?? 0;
    const col = std(pu.color ?? '#111', pu.color && /^#d[4-9]/.test(pu.color) ? 0.5 : 0, 0.3);
    if (pu.type === 'single') {
      if (pu.frame) grp.add(box(0.03, 0.09, 0.006, std(pu.frame, 0.45, 0.25), 0, 0, 0.003));
      const cover = box(0.017, 0.074, 0.012, col, 0, 0, 0.006);
      grp.add(cover);
      for (let i = 0; i < 6; i++) grp.add(cyl(0.0022, 0.002, chrome(), 0, -0.026 + i * 0.0104, 0.0125, 'z', 8));
    } else if (pu.type === 'pbass') {
      // split pickup: two halves, offset along the neck
      for (const [dx, y] of [[0.006, 0.022], [-0.006, -0.022]]) {
        grp.add(box(0.022, 0.046, 0.014, col, dx, y, 0.007));
        for (const py of [-0.01, 0.01]) grp.add(cyl(0.0028, 0.002, chrome(), dx, y + py, 0.0145, 'z', 8));
      }
    } else if (pu.type === 'jbass') {
      grp.add(box(0.02, 0.098, 0.014, col, 0, 0, 0.007));
      for (let i = 0; i < 2 * N; i++) grp.add(cyl(0.0022, 0.002, chrome(), 0, -0.04 + (i * 0.08) / (2 * N - 1), 0.0145, 'z', 8));
    } else if (pu.type === 'soap') {
      grp.add(box(0.036, 0.094, 0.015, col, 0, 0, 0.0075));
    } else {
      grp.add(box(0.044, 0.084, 0.006, std(pu.frame ?? '#111', 0, 0.4), 0, 0, 0.003));
      grp.add(box(0.036, 0.072, 0.012, col, 0, 0, 0.006));
      for (const dx of [-0.008, 0.008]) for (let i = 0; i < 6; i++) grp.add(cyl(0.0022, 0.002, hw(s), dx, -0.026 + i * 0.0104, 0.0125, 'z', 8));
    }
    g.add(grp);
  }

  // bridge / tailpiece, and where the strings end
  let tail = BRIDGE - 0.004;
  let tailZ = face + 0.013;
  const H = hw(s);
  if (s.bridge === 'trem') {
    g.add(box(0.06, 0.08, 0.004, H, BRIDGE - 0.022, 0, face + 0.002));
    for (let i = 0; i < 6; i++) g.add(box(0.014, 0.011, 0.01, H, BRIDGE - 0.004, -0.026 + i * 0.0104, face + 0.008));
  } else if (s.bridge === 'tele') {
    g.add(box(0.13, 0.09, 0.003, H, BRIDGE + 0.015, 0, face + 0.0015));
    g.add(box(0.13, 0.004, 0.012, H, BRIDGE + 0.015, 0.045, face + 0.006), box(0.13, 0.004, 0.012, H, BRIDGE + 0.015, -0.045, face + 0.006));
    for (let i = 0; i < 3; i++) g.add(cyl(0.004, 0.024, H, BRIDGE - 0.005, -0.018 + i * 0.018, face + 0.009, 'y', 8));
  } else if (s.bridge === 'tom' || s.bridge === 'bigsby') {
    g.add(box(0.012, 0.082, 0.014, H, BRIDGE, 0, face + 0.008));
    for (const y of [-0.045, 0.045]) g.add(cyl(0.004, 0.016, H, BRIDGE, y, face + 0.008, 'z', 8));
    if (s.bridge === 'tom') {
      g.add(box(0.014, 0.088, 0.012, H, BRIDGE - 0.05, 0, face + 0.007));
      tail = BRIDGE - 0.05;
      tailZ = face + 0.012;
    } else {
      // vibrato tailpiece: a long plate, a roller bar and an arm
      const bx = BRIDGE - 0.1;
      g.add(box(0.11, 0.07, 0.004, H, bx - 0.01, 0, face + 0.002));
      g.add(cyl(0.008, 0.07, H, bx + 0.03, 0, face + 0.012, 'y', 12));
      g.add(box(0.02, 0.09, 0.016, H, bx - 0.06, 0, face + 0.008));
      g.add(rod(new THREE.Vector3(bx + 0.03, -0.04, face + 0.014), new THREE.Vector3(bx - 0.06, -0.12, face + 0.03), 0.0035, H));
      tail = bx + 0.03;
      tailZ = face + 0.018;
    }
  } else if (s.bridge === 'bass') {
    // heavy bass bridge plate with one saddle per string
    g.add(box(0.075, 0.036 + 2 * brHalf, 0.004, H, BRIDGE - 0.03, 0, face + 0.002));
    g.add(box(0.008, 0.036 + 2 * brHalf, 0.014, H, BRIDGE - 0.066, 0, face + 0.007));
    for (let i = 0; i < N; i++) g.add(box(0.022, (2 * brHalf) / N * 0.8, 0.011, H, BRIDGE - 0.006, across(i, brHalf), face + 0.008));
    tail = BRIDGE - 0.062;
    tailZ = face + 0.009;
  } else {
    // floating bridge + vibrato plate (offset guitars)
    g.add(box(0.012, 0.075, 0.012, H, BRIDGE, 0, face + 0.008));
    g.add(box(0.05, 0.07, 0.004, H, BRIDGE - 0.07, 0, face + 0.002));
    g.add(rod(new THREE.Vector3(BRIDGE - 0.07, -0.03, face + 0.006), new THREE.Vector3(BRIDGE - 0.12, -0.11, face + 0.02), 0.0028, H));
    tail = BRIDGE - 0.055;
    tailZ = face + 0.007;
  }
  for (const [x, y] of s.knobs) {
    const knob = cyl(0.011, 0.016, s.gold ? goldMat() : s.guard?.mat === 'white' ? std(0xf6f4ee, 0, 0.35) : chrome(), x, y, face + 0.009, 'z', 18, 0.0125);
    g.add(knob);
  }

  // strings: thickest on +Y
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    const a = new THREE.Vector3(NUT, across(i, nutHalf), boardTop + 0.004);
    const b = new THREE.Vector3(tail, across(i, brHalf), tailZ);
    const bridge = new THREE.Vector3(BRIDGE, across(i, brHalf), face + 0.016);
    // threes: treble strings to the posts on the -Y side; inline: string 0 (thin) goes to the far post
    const up = Math.ceil(N / 2);
    const post = s.head === 'threes' ? posts[[0, 2, 4, 5, 3, 1][i]]
      : s.head === 'bassSplit' ? (i >= N - up ? posts[i - (N - up)] : posts[up + (N - up - 1 - i)])
        : posts[N - 1 - i];
    const r = bass ? 0.0009 + 0.0009 * f : 0.0004 + 0.0005 * f;
    g.add(rod(a, bridge, r, stringMat()), rod(a, post, r, stringMat()));
    if (tail !== BRIDGE - 0.004) g.add(rod(bridge, b, r, stringMat()));
  }

  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });

  // strap pins: the horn tip nearest the headstock on the bass side, and the tail end
  let horn = s.outline[0], tailPt = s.outline[0];
  for (const p of s.outline) {
    if (p[1] > 0.02 && p[0] > horn[0]) horn = p;
    if (p[0] < tailPt[0] || (p[0] === tailPt[0] && Math.abs(p[1]) < Math.abs(tailPt[1]))) tailPt = p;
  }
  const grip = new THREE.Object3D();
  grip.position.set(fretX(bass ? 5 : 6), -0.03, face + 0.01);
  const pluck = new THREE.Object3D();
  pluck.position.set(bass ? BRIDGE + 0.17 : -0.16, 0.06, face + 0.045);
  g.add(grip, pluck);
  g.userData.strapPins = [new THREE.Vector3(horn[0] - 0.01, horn[1] - 0.01, T / 2), new THREE.Vector3(tailPt[0] + 0.008, tailPt[1] * 0.5, T / 2)];
  return { group: g, grip, pluck };
}
