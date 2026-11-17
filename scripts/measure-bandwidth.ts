/**
 * Measures how many bytes the game server sends each connected player per second.
 * Start a dev server first (npx tsx server/src/index.ts), then:
 *   npx tsx scripts/measure-bandwidth.ts [map] [clients] [seconds]
 * One client walks a small circle (like a player hunting), the rest stand still.
 * X=45 Y=45 puts them there instead of the map's spawn; WIRE=1 also reports the compressed bytes on the wire
 * (what Render bills), DEFLATE=1 estimates what compression would save.
 */
import { LocalStore } from '../src/services/localStore.ts';
import { getMap } from '../src/game/maps.ts';

const [map = 'field', nStr = '3', secStr = '30'] = process.argv.slice(2);
const N = Number(nStr);
const SEC = Number(secStr);
const URL = process.env.COLYSEUS_URL ?? 'ws://localhost:2567';

// count every byte that arrives on any websocket
let bytes = 0;
let frames = 0;
// what permessage-deflate (context takeover) would make of the same frames, for DEFLATE=1 runs
import { createDeflateRaw, constants } from 'node:zlib';
let zbytes = 0;
const z = createDeflateRaw();
const deflateLike = (buf: Uint8Array) => {
  let out = 0;
  z.write(buf);
  z.flush(constants.Z_SYNC_FLUSH);
  let c;
  while ((c = z.read()) !== null) out += c.length;
  return out;
};
let byKind: Record<number, number> = {};
// WIRE=1: use the ws package, which negotiates permessage-deflate like a browser and can tell the bytes on the wire
const Native = process.env.WIRE ? ((await import('../server/node_modules/ws/index.js')).default as unknown as typeof WebSocket) : globalThis.WebSocket;
const sockets: { _socket?: { bytesRead: number } }[] = [];
const wire = () => sockets.reduce((a, w) => a + (w._socket?.bytesRead ?? 0), 0);
class Counting extends Native {
  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols);
    sockets.push(this as unknown as { _socket?: { bytesRead: number } });
    this.addEventListener('message', (e: MessageEvent) => {
      const d = e.data as ArrayBuffer | string | Blob;
      const n = typeof d === 'string' ? Buffer.byteLength(d) : d instanceof ArrayBuffer ? d.byteLength : (d as Blob).size;
      bytes += n;
      frames++;
      // Colyseus protocol code: 15 = state patch, 13 = message (broadcast / send)
      const code = d instanceof ArrayBuffer ? new Uint8Array(d)[0] : -1;
      byKind[code] = (byKind[code] ?? 0) + n;
      if (d instanceof ArrayBuffer && process.env.DEFLATE) zbytes += deflateLike(new Uint8Array(d));
    });
  }
}
(globalThis as { WebSocket: unknown }).WebSocket = Counting;
// the SDK picks up WebSocket when it loads: load it after the counter is in place
const { Client } = await import('@colyseus/sdk');

const store = new LocalStore(false);
const rooms = [];
for (let i = 0; i < N; i++) {
  const c = await store.createCharacter(`bw${i}${Math.random().toString(36).slice(2, 6)}`, { gender: 'm', hair: 0, hair_color: 0, face: 0 });
  const m = getMap(map);
  c.map = map;
  c.pos_x = Number(process.env.X ?? m.spawn.x);
  c.pos_y = Number(process.env.Y ?? m.spawn.y);
  const client = new Client(URL);
  rooms.push(await client.joinOrCreate(map, { charId: c.id, dev: { char: c, inv: await store.loadInventory(c.id) } }));
  // a fresh character has 1 store slot per account: a new store each 3
  if (i % 3 === 2) Object.assign(store, new LocalStore(false));
}
// let the full state arrive, then start counting
await new Promise((r) => setTimeout(r, 3000));
const joinBytes = bytes;
bytes = 0;
frames = 0;
byKind = {};
zbytes = 0;
const wire0 = wire();
// the first client walks a loop of 8 tiles round its spawn
const walker = rooms[0];
const sp = { x: Number(process.env.X ?? getMap(map).spawn.x), y: Number(process.env.Y ?? getMap(map).spawn.y) };
let step = 0;
const walk = setInterval(() => {
  step++;
  const a = (step / 40) * Math.PI * 2;
  walker.send('move', { x: sp.x + Math.cos(a) * 4, y: sp.y + Math.sin(a) * 4 });
}, 200);
const t0 = Date.now();
await new Promise((r) => setTimeout(r, SEC * 1000));
clearInterval(walk);
const s = (Date.now() - t0) / 1000;
const seen = rooms.map((r) => (r.state as { monsters?: { size: number } }).monsters?.size ?? -1);
const per = bytes / N / s;
console.log(JSON.stringify({
  map, clients: N, monstersSeen: seen, seconds: Math.round(s), joinBytesPerClient: Math.round(joinBytes / N),
  bytesPerClientPerSec: Math.round(per), framesPerClientPerSec: +(frames / N / s).toFixed(1),
  byProtocolCodePerClientPerSec: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, Math.round(v / N / s)])),
  deflatedPerClientPerSec: process.env.DEFLATE ? Math.round(zbytes / N / s) : undefined,
  wireBytesPerClientPerSec: process.env.WIRE ? Math.round((wire() - wire0) / N / s) : undefined,
  mbPerPlayerHour: +((per * 3600) / 1e6).toFixed(1),
}));
for (const r of rooms) await r.leave(true).catch(() => {});
process.exit(0);
