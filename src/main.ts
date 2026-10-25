import Phaser from 'phaser';
import { Client, type Room } from '@colyseus/sdk';
import './style.css';
import type { Character } from './data';
import { Session } from './game/session';
import { WorldScene } from './game/WorldScene';
import { LocalStore } from './services/localStore';
import { Net, NetHandlers, PeerInfo, joinLocal, noNet } from './services/net';
import type { GameStore } from './services/store';
import { supabase } from './services/supabase';
import { SupabaseStore } from './services/supabaseStore';
import { Hud } from './ui/hud';
import { characterScreen, loginScreen, show } from './ui/screens';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#2d5a3a',
  pixelArt: false,
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [],
});
game.scene.add('world', WorldScene, false);
(window as unknown as { __game: Phaser.Game }).__game = game; // handy for debugging in the console

/** Game server address. Without it the game runs offline (monsters simulated in the browser). */
const SERVER_URL = import.meta.env.VITE_COLYSEUS_URL as string | undefined;
const store: GameStore = supabase ? new SupabaseStore(supabase) : new LocalStore();

async function joinServer(char: Character, session: Session): Promise<Room> {
  const client = new Client(SERVER_URL!);
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
  const dev = store instanceof LocalStore ? { char: session.char, inv: session.inv } : undefined;
  return client.joinOrCreate('field', { token, charId: char.id, dev });
}

async function play(char: Character): Promise<void> {
  show('loading');
  const fresh = await store.getCharacter(char.id);
  const inv = await store.loadInventory(char.id);
  const session = new Session(store, fresh, inv);
  const world = () => game.scene.getScene('world') as WorldScene;

  let room: Room | undefined;
  if (SERVER_URL) {
    room = await joinServer(fresh, session);
    session.link = { send: (t, m) => room!.send(t, m), devStore: store instanceof LocalStore ? store : undefined };
  }

  return new Promise((resolve) => {
    let net: Net = noNet;
    let done = false;
    const exit = () => {
      if (done) return;
      done = true;
      hud.destroy();
      game.scene.stop('world');
      room?.leave();
      resolve();
    };
    const hud: Hud = new Hud(session, {
      chat: (text) => {
        if (room) return room.send('chat', { text }); // the server echoes it back to everyone
        net.sendChat(text);
        hud.chatLine(session.char.name, text);
        world().bubble(session.char.name, text);
      },
      exit,
      respawn: async () => {
        await session.die();
        if (!room) world().respawn();
      },
    });
    room?.onLeave((code) => {
      if (done) return;
      if (code > 1001) alert('หลุดการเชื่อมต่อกับเซิร์ฟเวอร์เกม');
      exit();
    });

    show('hud');
    game.scene.start('world', {
      session,
      room,
      net: {
        // the scene starts before the offline channel is joined; forward calls once it exists
        sendMove: (x: number, y: number) => net.sendMove(x, y),
        sendChat: (t: string) => net.sendChat(t),
        updateInfo: (p: Partial<PeerInfo>) => net.updateInfo(p),
        leave: () => net.leave(),
      } satisfies Net,
      hooks: {
        toast: (t: string, k?: 'good' | 'bad') => hud.toast(t, k),
        system: (t: string) => hud.system(t),
        chat: (name: string, text: string) => hud.chatLine(name, text),
        openShop: () => hud.openShop(),
        onDeath: () => hud.showDeath(),
      },
    });

    if (!room) {
      const me: PeerInfo = {
        id: fresh.id, name: fresh.name, cls: fresh.cls, level: fresh.level, x: fresh.pos_x, y: fresh.pos_y,
      };
      const handlers: NetHandlers = {
        onPeerJoin: (p) => {
          world().addPeer(p);
          hud.system(`${p.name} เข้ามาในแผนที่`);
        },
        onPeerLeave: (id) => world().removePeer(id),
        onPeerMove: (id, x, y) => world().movePeer(id, x, y),
        onChat: (name, text) => {
          hud.chatLine(name, text);
          world().bubble(name, text);
        },
      };
      net = joinLocal(me, handlers);
    }
    hud.system(
      room
        ? 'ยินดีต้อนรับสู่ Music Land! คลิกพื้นเพื่อเดิน คลิกมอนสเตอร์เพื่อโจมตี'
        : 'โหมดออฟไลน์: เซฟไว้ในเบราว์เซอร์นี้ (เปิดอีกแท็บจะเห็นกันได้) คลิกพื้นเพื่อเดิน คลิกมอนสเตอร์เพื่อโจมตี',
    );
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
      alert(`เกิดข้อผิดพลาด: ${(e as Error).message}`);
    }
  }
}

main();
