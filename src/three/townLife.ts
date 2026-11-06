import * as THREE from 'three';
import { GameMap, Npc, walkable } from '../game/maps';
import type { CharRig } from './models';
import { animateRig } from './vrm';

/**
 * Town NPCs going about their day: standing at their post (breathing, shifting their weight, looking round),
 * now and then a few unhurried steps round it and back, and when a player comes up they go back to their post and
 * turn to face them. Only how they look: the server still finds them at their own tile (talking, healing, warps).
 */
export interface NpcLife {
  npc: Npc;
  /** The built-in character first, then the VRoid model once it has loaded. */
  rig: CharRig;
  /** Its post (tile centre) and where it stands now, in map units. */
  home: { x: number; y: number };
  x: number;
  y: number;
  /** Facing now, the facing it is turning to, and its facing at rest (0 = towards the camera). */
  yaw: number;
  want: number;
  base: number;
  goal?: { x: number; y: number };
  /** Seconds (world clock): when it picks the next thing to do. */
  until: number;
  /** Its name tag, which follows it. */
  label: THREE.Vector3;
}

const STROLL = 1.5; // tiles from its post at most
const SPEED = 0.8; // tiles a second: an unhurried walk
const NOTICE = 3.2; // tiles: a player this close gets its attention

export function npcLife(npc: Npc, rig: CharRig, label: THREE.Vector3): NpcLife {
  const home = { x: npc.x + 0.5, y: npc.y + 0.5 };
  // everyone starts at a different moment, so the town doesn't move in step
  return { npc, rig, home, x: home.x, y: home.y, yaw: 0, want: 0, base: 0, until: 2 + Math.random() * 6, label };
}

/** A straight walk from here to there that stays on open ground (its own post's tile counts as open). */
function clear(map: GameMap, n: NpcLife, x1: number, y1: number) {
  const hx = Math.floor(n.home.x), hy = Math.floor(n.home.y);
  for (let k = 1; k <= 8; k++) {
    const x = n.x + ((x1 - n.x) * k) / 8, y = n.y + ((y1 - n.y) * k) / 8;
    if ((Math.floor(x) !== hx || Math.floor(y) !== hy) && !walkable(map, x, y)) return false;
  }
  return true;
}

function strollTarget(map: GameMap, n: NpcLife) {
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.6 + Math.random() * (STROLL - 0.6);
    const x = n.home.x + Math.sin(a) * r, y = n.home.y + Math.cos(a) * r;
    if (clear(map, n, x, y)) return { x, y };
  }
  return undefined;
}

/** One frame of an NPC's life. `me`: the local player (map units), whom it notices. */
export function tickNpc(n: NpcLife, map: GameMap, t: number, dt: number, me: { x: number; y: number } | null) {
  const near = !!me && Math.hypot(me.x - n.x, me.y - n.y) < NOTICE;
  const away = Math.hypot(n.x - n.home.x, n.y - n.home.y);
  if (near) {
    // a customer: back to the post, then face them
    n.goal = away > 0.35 ? { ...n.home } : undefined;
    if (!n.goal) n.want = Math.atan2(me!.x - n.x, me!.y - n.y);
    n.until = Math.max(n.until, t + 2 + Math.random() * 2);
  } else if (!n.goal && t > n.until) {
    // what next: a few steps (home again if it has wandered), or a look somewhere else
    const r = Math.random();
    if (away > 0.35 && r < 0.6) n.goal = { ...n.home };
    else if (r < 0.45) n.goal = strollTarget(map, n);
    if (!n.goal) {
      n.want = n.base + (Math.random() < 0.35 ? 0 : (Math.random() - 0.5) * 1.8);
      n.until = t + 3 + Math.random() * 5;
    }
  }
  let moving = false;
  if (n.goal) {
    const dx = n.goal.x - n.x, dy = n.goal.y - n.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.04) {
      n.goal = undefined;
      // back at the post it settles into its usual facing; elsewhere it looks round from where it stands
      if (Math.hypot(n.x - n.home.x, n.y - n.home.y) < 0.35) n.want = n.base;
      n.until = t + 3 + Math.random() * 6;
    } else {
      const step = Math.min(d, SPEED * dt);
      n.x += (dx / d) * step;
      n.y += (dy / d) * step;
      n.want = Math.atan2(dx, dy);
      moving = true;
    }
  }
  // turn smoothly (quicker while walking)
  const turn = Math.atan2(Math.sin(n.want - n.yaw), Math.cos(n.want - n.yaw));
  n.yaw += Math.sign(turn) * Math.min(Math.abs(turn), dt * (moving ? 5 : 2.5));
  n.yaw = Math.atan2(Math.sin(n.yaw), Math.cos(n.yaw)); // keep it in -π..π however often it turns round
  n.rig.root.position.set(n.x, 0, n.y);
  n.rig.root.rotation.y = n.yaw;
  n.label.set(n.x, 0, n.y);
  animateRig(n.rig, t + n.rig.root.id, { moving, sitting: false, dead: false, attack: 0 });
}
