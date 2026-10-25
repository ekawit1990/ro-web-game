import Phaser from 'phaser';
import './style.css';
import type { Character } from './data';
import { Session } from './game/session';
import { WorldScene } from './game/WorldScene';
import { LocalStore } from './services/localStore';
import { Net, NetHandlers, PeerInfo, joinLocal, joinSupabase } from './services/net';
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

const store: GameStore = supabase ? new SupabaseStore(supabase) : new LocalStore();

async function play(char: Character): Promise<void> {
  show('loading');
  const fresh = await store.getCharacter(char.id);
  const inv = await store.loadInventory(char.id);
  const session = new Session(store, fresh, inv);
  const world = () => game.scene.getScene('world') as WorldScene;

  const me: PeerInfo = {
    id: fresh.id, name: fresh.name, cls: fresh.cls, level: fresh.level, x: fresh.pos_x, y: fresh.pos_y,
  };
  let hud: Hud;
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

  return new Promise((resolve) => {
    let net: Net;
    hud = new Hud(session, {
      chat: (text) => {
        net.sendChat(text);
        hud.chatLine(session.char.name, text);
        world().bubble(session.char.name, text);
      },
      exit: () => {
        hud.destroy();
        game.scene.stop('world');
        resolve();
      },
      respawn: async () => {
        await session.die();
        world().respawn();
      },
    });

    show('hud');
    game.scene.start('world', {
      session,
      net: {
        // the scene starts before the channel is joined; forward calls once it exists
        sendMove: (x: number, y: number) => net?.sendMove(x, y),
        sendChat: (t: string) => net?.sendChat(t),
        updateInfo: (p: Partial<PeerInfo>) => net?.updateInfo(p),
        leave: () => net?.leave(),
      } satisfies Net,
      hooks: {
        toast: (t: string, k?: 'good' | 'bad') => hud.toast(t, k),
        system: (t: string) => hud.system(t),
        openShop: () => hud.openShop(),
        onDeath: () => hud.showDeath(),
      },
    });
    net = supabase ? joinSupabase(supabase, me, handlers) : joinLocal(me, handlers);
    hud.system(
      store.online
        ? 'ยินดีต้อนรับสู่ทุ่งแอสเตอร์! คลิกพื้นเพื่อเดิน คลิกมอนสเตอร์เพื่อโจมตี'
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
