import { Client, type Room } from '@colyseus/sdk';
import './style.css';
import type { Character } from './data';
import { getMap } from './game/maps';
import { Session } from './game/session';
import { World3D } from './three/World3D';
import { LocalStore } from './services/localStore';
import type { GameStore } from './services/store';
import { supabase } from './services/supabase';
import { SupabaseStore } from './services/supabaseStore';
import { Hud } from './ui/hud';
import { $, characterScreen, loginScreen, show } from './ui/screens';
import { playMusic, sfx, unlockAudio } from './audio/sound';
import { assetShare, assetsIdle, reset as resetAssets } from './ui/loadProgress';

const container = document.getElementById('game')!;
let world: World3D | undefined;
(window as unknown as { __world: () => World3D | undefined }).__world = () => world; // handy for debugging in the console

/** Game server address. Every map is a room on this server. */
const SERVER_URL = (import.meta.env.VITE_COLYSEUS_URL as string | undefined) || 'ws://localhost:2567';
const store: GameStore = supabase ? new SupabaseStore(supabase) : new LocalStore();
const devStore = store instanceof LocalStore ? store : undefined;

const LOADING_ART = ['band1', 'band2', 'band3'].map((n) => `${import.meta.env.BASE_URL ?? '/'}loading/${n}.webp`);
let shown = 0; // percent on the bar
let goal = 0; // percent the current step has earned
let creep = 0; // a slow step may creep up to here while we wait on it
let ticker = 0;

/** Full-screen band art with a percent bar; `progress()` moves the bar between steps. */
function loading(on: boolean, text = 'กำลังโหลด…') {
  const el = $('loading');
  el.querySelector('p')!.textContent = text;
  if (!on) {
    el.classList.add('hidden');
    cancelAnimationFrame(ticker);
    ticker = 0;
    return;
  }
  el.classList.remove('hidden');
  if (ticker) return; // already up: keep the art and the bar where they are
  const art = el.querySelector<HTMLImageElement>('.ld-art')!;
  const src = LOADING_ART[Math.floor(Math.random() * LOADING_ART.length)];
  art.classList.remove('on');
  art.onload = () => art.classList.add('on');
  art.src = src;
  el.querySelector<HTMLElement>('.ld-bg')!.style.backgroundImage = `url(${src})`;
  shown = goal = creep = 0;
  const bar = el.querySelector<HTMLElement>('.ld-bar i')!;
  const label = el.querySelector<HTMLElement>('.ld-bar b')!;
  const tick = () => {
    if (shown < goal) shown += Math.max(0.6, (goal - shown) * 0.15);
    else if (shown < creep) shown += (creep - shown) * 0.008;
    shown = Math.min(shown, 100);
    bar.style.width = `${shown}%`;
    label.textContent = `${Math.floor(shown)}%`;
    ticker = requestAnimationFrame(tick);
  };
  tick();
}

/** The bar has earned `at` percent; while the next step runs it may creep towards `upTo`. */
function progress(at: number, upTo = at) {
  goal = Math.max(goal, at);
  creep = Math.max(goal, upTo);
}

/** Wait until the server state contains our own player. */
/** Rejects with `msg` if `p` takes longer than `ms`, so a stuck step shows an error instead of hanging. */
function within<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

function myPlayer(room: Room): Promise<{ x: number; y: number }> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      const p = (room.state as { players?: { get(id: string): { x: number; y: number } | undefined } })?.players?.get(room.sessionId);
      if (p) return resolve({ x: p.x, y: p.y });
      if (Date.now() - started > 8000) return reject(new Error('เซิร์ฟเวอร์ไม่ตอบสนอง'));
      setTimeout(check, 50);
    };
    check();
  });
}

function stopWorld() {
  world?.destroy();
  world = undefined;
}

async function play(char: Character): Promise<void> {
  show('loading');
  loading(true);
  progress(0, 15);
  const fresh = await store.getCharacter(char.id);
  const inv = await store.loadInventory(char.id);
  const session = new Session(store, fresh, inv);
  const client = new Client(SERVER_URL);

  let room: Room | undefined;
  let done = false;
  let switching = false;

  return new Promise((resolve, reject) => {
    const exit = () => {
      if (done) return;
      done = true;
      hud.destroy();
      stopWorld();
      room?.leave();
      resolve();
    };
    const hud = new Hud(session, { scene: () => world, send: (t, m) => room?.send(t, m), exit });
    show('hud');

    const enter = async (mapId: string) => {
      switching = true;
      const t0 = performance.now();
      hud.death(false); // reviving in town is a map change: the old death dialog is done
      loading(true, `กำลังเดินทางไป ${getMap(mapId).name}…`);
      progress(5, 20);
      const old = room;
      room = undefined;
      stopWorld();
      // don't wait forever for the old map to say goodbye
      if (old) await within(old.leave(true), 3000, 'leave').catch(() => {});

      session.char.map = mapId;
      progress(20, 55); // a sleeping free server can sit here for a while
      const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
      const dev = devStore ? { char: session.char, inv: session.inv } : undefined;
      // a sleeping free server can take ~1 minute to wake up
      const r = await within(client.joinOrCreate(mapId, { token, charId: session.char.id, dev }), 75000,
        `เข้าแผนที่ ${getMap(mapId).name} ไม่สำเร็จ: เซิร์ฟเวอร์ไม่ตอบสนอง`);
      const tJoin = performance.now();
      room = r;
      session.link = { send: (t, m) => r.send(t, m), devStore };
      wire(r);
      const pos = await myPlayer(r);
      const map = getMap(mapId);
      hud.setMap(map);
      progress(60, 70);
      resetAssets();
      world = new World3D(container, { session, room: r, map, hooks: hud, x: pos.x, y: pos.y });
      const assets = setInterval(() => progress(70 + 30 * assetShare()), 100);
      await assetsIdle(15000);
      clearInterval(assets);
      progress(100);
      await new Promise((ok) => setTimeout(ok, 350)); // let the bar reach 100%
      loading(false);
      sfx(old ? 'warp' : 'enter');
      playMusic(mapId);
      switching = false;
      console.info(`enter ${mapId}: server join ${Math.round(tJoin - t0)} ms, world ready ${Math.round(performance.now() - t0)} ms`);
    };

    const wire = (r: Room) => {
      r.onMessage('welcome', () => {});
      r.onMessage('reward', (m) => hud.reward(m));
      r.onMessage('sync', (m) => session.applySync(m.character, m.inventory));
      r.onMessage('derived', (m) => session.applyDerived(m.derived));
      r.onMessage('system', (m) => hud.system(m.text));
      r.onMessage('chat', (m) => hud.chat(m.name, m.text));
      r.onMessage('error', (m) => hud.toast(m.text, 'bad'));
      r.onMessage('buff', (m) => hud.buff(m.skill, m.seconds));
      r.onMessage('skill', (m) => m.by === r.sessionId && hud.skillCast(m.skill));
      r.onMessage('tradeInvite', (m) => hud.tradeInvite(m));
      r.onMessage('tradeState', (m) => hud.tradeState(m));
      r.onMessage('tradeClosed', (m) => hud.tradeClosed(m.text));
      r.onMessage('tradeDone', (m) => hud.tradeDone(m.ok, m.text));
      r.onMessage('warp', (m) => {
        if (room === r) enter(m.map).catch(fail);
      });
      r.onLeave((code) => {
        if (done || switching || room !== r) return;
        if (code > 1001) alert('หลุดการเชื่อมต่อกับเซิร์ฟเวอร์เกม');
        exit();
      });
    };

    const fail = (e: Error) => {
      loading(false);
      if (!done) {
        done = true;
        hud.destroy();
        stopWorld();
        room?.leave();
      }
      reject(e);
    };

    hud.system('ยินดีต้อนรับสู่ Music Land! คลิกพื้นเพื่อเดิน คลิกมอนสเตอร์เพื่อโจมตี คุยกับไกด์เพื่อดูวิธีเล่น');
    enter(getMap(fresh.map).id).catch(fail);
  });
}

async function main() {
  unlockAudio();
  for (;;) {
    playMusic('title');
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      if (!data.session) await loginScreen(supabase);
    }
    const char = await characterScreen(store);
    if (!char) continue; // signed out
    try {
      await play(char);
    } catch (e) {
      const m = (e as Error).message;
      alert(/ECONNREFUSED|WebSocket|connect|ไม่ตอบสนอง|Failed to fetch/i.test(m)
        ? `เชื่อมต่อเซิร์ฟเวอร์เกมไม่ได้ (${SERVER_URL})\nตรวจสอบว่าเซิร์ฟเวอร์เปิดอยู่ และตั้งค่า VITE_COLYSEUS_URL ถูกต้อง`
        : `เกิดข้อผิดพลาด: ${m}`);
    }
  }
}

main();
