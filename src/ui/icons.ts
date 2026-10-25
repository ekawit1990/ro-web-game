import { ITEMS } from '../data';
import { paintChar, paintHat, type Look } from '../game/art';

const cache = new Map<string, string>();

const EMOJI: Record<string, string> = {
  basic_mic: '🎤', golden_mic: '🎤', acoustic_guitar: '🎸', electric_guitar: '🎸', wood_sticks: '🥢', steel_sticks: '🥢',
  basic_bass: '🎸', five_string_bass: '🎸', mini_keyboard: '🎹', synth: '🎹', band_tshirt: '👕', leather_jacket: '🧥',
  note_ribbon: '🎀', headphones: '🎧', rock_cap: '🧢', pick_necklace: '📿', metronome_charm: '⏱️', banana: '🍌', carrot: '🥕',
  note_shard: '🎵', silent_spore: '🍄', buzz_stinger: '📌', rock_chip: '🪨', golden_clef: '🗝️', drop_crystal: '💎',
  chick_feather: '🪶', rabbit_ear: '🐰', frog_skin: '🐸', bat_wing: '🦇', gear_spring: '⚙️',
};

/** A 32x32 icon for an item, as a data URL (drawn once, then cached). */
export function itemIcon(id: string): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const item = ITEMS[id];
  const cv = document.createElement('canvas');
  cv.width = 32;
  cv.height = 32;
  const c = cv.getContext('2d')!;
  if (item?.type === 'consumable' && !EMOJI[id]) {
    // potion bottle in the item's colour
    c.fillStyle = '#d9d9d9';
    c.fillRect(13, 4, 6, 6);
    c.fillStyle = '#8d6e63';
    c.fillRect(12, 2, 8, 4);
    c.beginPath();
    c.moveTo(12, 10);
    c.lineTo(20, 10);
    c.quadraticCurveTo(28, 16, 26, 24);
    c.quadraticCurveTo(24, 30, 16, 30);
    c.quadraticCurveTo(8, 30, 6, 24);
    c.quadraticCurveTo(4, 16, 12, 10);
    c.fillStyle = 'rgba(255,255,255,0.65)';
    c.fill();
    c.strokeStyle = '#555';
    c.stroke();
    c.beginPath();
    c.moveTo(7, 19);
    c.quadraticCurveTo(16, 16, 25, 19);
    c.quadraticCurveTo(25, 29, 16, 29);
    c.quadraticCurveTo(7, 29, 7, 19);
    c.fillStyle = item.color;
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fillRect(10, 14, 2, 6);
  } else {
    c.font = '22px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(EMOJI[id] ?? '❔', 16, 18);
    if (item && (id.includes('bass') || id === 'golden_mic' || id === 'electric_guitar' || id === 'steel_sticks' || id === 'synth')) {
      // tint upgraded variants so they read differently
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = item.color + '66';
      c.fillRect(0, 0, 32, 32);
    }
  }
  const url = cv.toDataURL();
  cache.set(id, url);
  return url;
}

/** Draws a character (with optional hat) onto a canvas, scaled to fit. */
export function drawLook(cv: HTMLCanvasElement, look: Look, dir: 'f' | 'b' = 'f', hat?: string) {
  const c = cv.getContext('2d')!;
  c.clearRect(0, 0, cv.width, cv.height);
  const s = Math.min(cv.width / 60, cv.height / 84);
  c.save();
  c.translate((cv.width - 60 * s) / 2, (cv.height - 84 * s) / 2);
  c.scale(s, s);
  paintChar(c, look, dir);
  if (hat && (dir === 'f' || hat !== 'note_ribbon')) paintHat(c, hat);
  c.restore();
}
