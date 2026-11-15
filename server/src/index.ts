import { createClient } from '@supabase/supabase-js';
import { defineRoom, defineServer, listen } from 'colyseus';
import { applyOverrides, fetchOverrides } from '../../src/data/overrides.ts';
import { MAP_IDS } from '../../src/game/maps.ts';
import { setupAuthRoutes } from './auth.ts';
import { DevDb, SupabaseDb } from './db.ts';
import { Guilds } from './guild.ts';
import { MapRoom } from './MapRoom.ts';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (url && serviceKey) {
  MapRoom.db = new SupabaseDb(url, serviceKey);
} else if (process.env.ALLOW_DEV_DB === 'true' || process.env.NODE_ENV !== 'production') {
  MapRoom.db = new DevDb();
} else {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ALLOW_DEV_DB=true for testing).');
}
console.log(`Music Land server: database = ${MapRoom.db.name}`);
void Guilds.init(MapRoom.db);

// Admin edits (admin.html -> public.game_overrides): load before the rooms open, then every 30 s so a saved
// change reaches the game without a redeploy. If the table isn't there yet (SQL not run) the game uses gamedata.json.
if (url && serviceKey) {
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  let last = '';
  const reload = async (first = false) => {
    try {
      const rows = await fetchOverrides(sb);
      const sig = JSON.stringify(rows.map((r) => [r.kind, r.id, r.updated_at]).sort());
      if (sig === last) return;
      last = sig;
      console.log(`game_overrides: ${applyOverrides(rows)} admin edit(s) applied`);
    } catch (e) {
      if (first) console.warn(`game_overrides not loaded (${(e as Error).message}); using gamedata.json`);
    }
  };
  await reload(true);
  setInterval(() => void reload(), 30_000);
}

// one room per map: "town", "field"
const server = defineServer({
  rooms: Object.fromEntries(MAP_IDS.map((id) => [id, defineRoom(MapRoom, { map: id })])),
  // username/password accounts and "forgot password" (see auth.ts)
  express: (app) => setupAuthRoutes(app, url, serviceKey),
});

listen(server, Number(process.env.PORT ?? 2567));
