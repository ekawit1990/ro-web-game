import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { ClassKey } from '../data';

export interface PeerInfo {
  id: string;
  name: string;
  cls: ClassKey;
  level: number;
  x: number;
  y: number;
}

export interface NetHandlers {
  onPeerJoin(p: PeerInfo): void;
  onPeerLeave(id: string): void;
  onPeerMove(id: string, x: number, y: number): void;
  onChat(name: string, text: string): void;
}

export interface Net {
  sendMove(x: number, y: number): void;
  sendChat(text: string): void;
  updateInfo(p: Partial<PeerInfo>): void;
  leave(): void;
}

const MAP = 'meadow';
export const MAX_CHAT = 120;

/** Online multiplayer: Supabase Realtime presence (who is here) + broadcast (moves, chat). */
export function joinSupabase(sb: SupabaseClient, me: PeerInfo, h: NetHandlers): Net {
  const known = new Set<string>();
  const channel: RealtimeChannel = sb.channel(`map:${MAP}`, {
    config: { presence: { key: me.id }, broadcast: { self: false } },
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<PeerInfo>();
      const present = new Set(Object.keys(state).filter((k) => k !== me.id));
      for (const id of present) {
        if (!known.has(id)) {
          known.add(id);
          h.onPeerJoin(state[id][0]);
        }
      }
      for (const id of [...known]) {
        if (!present.has(id)) {
          known.delete(id);
          h.onPeerLeave(id);
        }
      }
    })
    .on('broadcast', { event: 'move' }, ({ payload }) => h.onPeerMove(payload.id, payload.x, payload.y))
    .on('broadcast', { event: 'chat' }, ({ payload }) =>
      h.onChat(String(payload.name).slice(0, 16), String(payload.text).slice(0, MAX_CHAT)),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') channel.track(me);
    });

  return {
    sendMove(x, y) {
      me.x = x;
      me.y = y;
      channel.send({ type: 'broadcast', event: 'move', payload: { id: me.id, x, y } });
    },
    sendChat(text) {
      channel.send({ type: 'broadcast', event: 'chat', payload: { name: me.name, text: text.slice(0, MAX_CHAT) } });
    },
    updateInfo(p) {
      Object.assign(me, p);
      channel.track(me);
    },
    leave() {
      channel.unsubscribe();
    },
  };
}

/** Offline mode: other browser tabs on the same computer act as other players (handy for testing). */
export function joinLocal(me: PeerInfo, h: NetHandlers): Net {
  const bc = new BroadcastChannel(`ro-web-game:${MAP}`);
  const seen = new Map<string, number>();
  const hello = () => bc.postMessage({ t: 'hello', p: me });

  bc.onmessage = ({ data }) => {
    if (data.t === 'hello') {
      if (!seen.has(data.p.id)) {
        h.onPeerJoin(data.p);
        hello();
      }
      seen.set(data.p.id, Date.now());
    } else if (data.t === 'move') {
      seen.set(data.id, Date.now());
      h.onPeerMove(data.id, data.x, data.y);
    } else if (data.t === 'chat') {
      h.onChat(data.name, data.text);
    } else if (data.t === 'bye' && seen.delete(data.id)) {
      h.onPeerLeave(data.id);
    }
  };

  const timer = window.setInterval(() => {
    hello();
    for (const [id, t] of seen) {
      if (Date.now() - t > 8000) {
        seen.delete(id);
        h.onPeerLeave(id);
      }
    }
  }, 3000);
  const bye = () => bc.postMessage({ t: 'bye', id: me.id });
  window.addEventListener('beforeunload', bye);
  hello();

  return {
    sendMove(x, y) {
      me.x = x;
      me.y = y;
      bc.postMessage({ t: 'move', id: me.id, x, y });
    },
    sendChat(text) {
      bc.postMessage({ t: 'chat', name: me.name, text: text.slice(0, MAX_CHAT) });
    },
    updateInfo(p) {
      Object.assign(me, p);
    },
    leave() {
      bye();
      window.clearInterval(timer);
      window.removeEventListener('beforeunload', bye);
      bc.close();
    },
  };
}
