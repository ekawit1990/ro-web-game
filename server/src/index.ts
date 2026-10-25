import { defineRoom, defineServer, listen } from 'colyseus';
import { MAP_IDS } from '../../src/game/maps.ts';
import { DevDb, SupabaseDb } from './db.ts';
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

// one room per map: "town", "field"
const server = defineServer({
  rooms: Object.fromEntries(MAP_IDS.map((id) => [id, defineRoom(MapRoom, { map: id })])),
});

listen(server, Number(process.env.PORT ?? 2567));
