import Phaser from 'phaser';
import { Client, type Room } from '@colyseus/sdk';
import './style.css';
import type { Character } from './data';
import { getMap } from './game/maps';
import { Session } from './game/session';
import { WorldScene } from './game/WorldScene';
import { LocalStore } from './services/localStore';
import type { GameStore } from './services/store';
import { supabase } from './services/supabase';
import { SupabaseStore } from './services/supabaseStore';
import { Hud } from './ui/hud';
import { $, characterScreen, loginScreen, show } from './ui/screens';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#2d3a2a',
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  input: { windowEvents: false }, // clicks on the HTML windows must not reach the map
  scene: [],
});
game.scene.add('world', WorldScene, false);
(window as unknown as { __game: Phaser.Game }).__game = game; // handy for debugging in the console

/** Game server address. Every map is a room on this server. */
const SERVER_URL = (import.meta.env.VITE_COLYSEUS_URL as string | undefined) || 'ws://localhost:2567';
const store: GameStore = supabase ? new SupabaseStore(supabase) : new LocalStore();
const devStore = store instanceof LocalStore ? store : undefined;

function loading(on: boolean, text = 'กำลังโหลด…') {
  $('loading').classList.toggle('hidden', !on);
  $('loading').querySelector('p')!.textContent = text;
}

/** Wait until the server state contains our own player. */
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

async function play(char: Character): Promise<void> {
  show('loading');
  const fresh = await store.getCharacter(char.id);
  const inv = await store.loadInventory(char.id);
  const session = new Session(store, fresh, inv);
  const client = new Client(SERVER_URL);
  const world = () => (game.scene.isActive('world') ? (game.scene.getScene('world') as WorldScene) : undefined);

  let room: Room | undefined;
  let done = false;
  let switching = false;

  return new Promise((resolve, reject) => {
    const exit = () => {
      if (done) return;
      done = true;
      hud.destroy();
      game.scene.stop('world');
      room?.leave();
      resolve();
    };
    const hud = new Hud(session, { scene: world, send: (t, m) => room?.send(t, m), exit });
    show('hud');

    const enter = async (mapId: string) => {
      switching = true;
      loading(true, `กำลังเดินทางไป ${getMap(mapId).name}…`);
      const old = room;
      room = undefined;
      game.scene.stop('world');
      if (old) await old.leave(true).catch(() => {});

      session.char.map = mapId;
      const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
      const dev = devStore ? { char: session.char, inv: session.inv } : undefined;
      const r = await client.joinOrCreate(mapId, { token, charId: session.char.id, dev });
      room = r;
      session.link = { send: (t, m) => r.send(t, m), devStore };
      wire(r);
      const pos = await myPlayer(r);
      const map = getMap(mapId);
      hud.setMap(map);
      game.scene.start('world', { session, room: r, map, hooks: hud, x: pos.x, y: pos.y });
      loading(false);
      switching = false;
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
        game.scene.stop('world');
        room?.leave();
      }
      reject(e);
    };

    hud.system('ยินดีต้อนรับสู่ Music Land! คลิกพื้นเพื่อเดิน คลิกมอนสเตอร์เพื่อโจมตี คุยกับไกด์เพื่อดูวิธีเล่น');
    enter(getMap(fresh.map).id).catch(fail);
  });
}

async function main() {
  for (;;) {
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
