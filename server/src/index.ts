import { defineRoom, defineServer, listen } from 'colyseus';
import { DevDb, SupabaseDb } from './db.ts';
import { FieldRoom } from './FieldRoom.ts';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (url && serviceKey) {
  FieldRoom.db = new SupabaseDb(url, serviceKey);
} else if (process.env.ALLOW_DEV_DB === 'true' || process.env.NODE_ENV !== 'production') {
  FieldRoom.db = new DevDb();
} else {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ALLOW_DEV_DB=true for testing).');
}
console.log(`Music Land server: database = ${FieldRoom.db.name}`);

const server = defineServer({
  rooms: { field: defineRoom(FieldRoom) },
});

listen(server, Number(process.env.PORT ?? 2567));
