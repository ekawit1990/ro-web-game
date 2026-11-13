import type { Client } from 'colyseus';

/**
 * Parties live in the game server's memory and span every map room (all rooms run in this one process).
 * Members are characters (by id), so a party survives warps and map changes. A server restart clears them.
 */
export const PARTY_MAX = 10;
/** A party with nobody online for this long is disbanded. */
const IDLE_MS = 30 * 60 * 1000;
const INVITE_MS = 30 * 1000;

/** A character that is in a map room right now. */
export interface Presence {
  charId: string;
  sessionId: string;
  roomId: string;
  map: string;
  client: Client;
  info(): { name: string; cls: string; level: number; hp: number; maxHp: number; sp: number; maxSp: number; dead: boolean };
}

interface Member {
  id: string; // character id
  name: string;
  cls: string;
  level: number;
}

export interface Party {
  id: string;
  name: string;
  leader: string; // character id
  members: Member[];
  /** Round-robin pointer for item drops and leftover zeny. */
  next: number;
  emptySince: number;
  /** Last state sent to each member, so the ticker only sends changes. */
  sent: Map<string, string>;
}

/** What the browser gets (one per member: `sid` is only set for members in the same room as them). */
export interface PartyView {
  id: string;
  name: string;
  leader: string;
  me: string;
  max: number;
  members: { id: string; name: string; cls: string; level: number; online: boolean; map: string; sid: string; hp: number; maxHp: number; dead: boolean }[];
}

const online = new Map<string, Presence>(); // character id -> where they are
const partyOf = new Map<string, Party>(); // character id -> party
const parties = new Set<Party>();
const invites = new Map<string, { party: Party; from: string; until: number }>(); // invited character id -> invite
let seq = 0;

const cleanName = (s: unknown, max: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function send(charId: string, type: string, msg: unknown) {
  online.get(charId)?.client.send(type, msg);
}

function tell(party: Party, text: string, except?: string) {
  for (const m of party.members) if (m.id !== except) send(m.id, 'system', { text: `[ปาร์ตี้] ${text}` });
}

function viewFor(party: Party, me: string): PartyView {
  const mine = online.get(me);
  return {
    id: party.id, name: party.name, leader: party.leader, me, max: PARTY_MAX,
    members: party.members.map((m) => {
      const p = online.get(m.id);
      const i = p?.info();
      return {
        id: m.id, name: i?.name ?? m.name, cls: i?.cls ?? m.cls, level: i?.level ?? m.level, online: !!p, map: p?.map ?? '',
        sid: p && mine && p.roomId === mine.roomId ? p.sessionId : '',
        hp: i?.hp ?? 0, maxHp: i?.maxHp ?? 1, dead: i?.dead ?? false,
      };
    }),
  };
}

/** Send the party window to every online member (only what changed, unless `force`). */
function push(party: Party, force = false) {
  for (const m of party.members) {
    const p = online.get(m.id);
    if (!p) {
      party.sent.delete(m.id);
      continue;
    }
    const json = JSON.stringify(viewFor(party, m.id));
    if (!force && party.sent.get(m.id) === json) continue;
    party.sent.set(m.id, json);
    p.client.send('party', JSON.parse(json));
  }
}

function addMember(party: Party, charId: string) {
  const p = online.get(charId);
  const i = p?.info();
  party.members.push({ id: charId, name: i?.name ?? '?', cls: i?.cls ?? '', level: i?.level ?? 1 });
  partyOf.set(charId, party);
}

function removeMember(party: Party, charId: string) {
  party.members = party.members.filter((m) => m.id !== charId);
  partyOf.delete(charId);
  party.sent.delete(charId);
  send(charId, 'party', null);
  if (!party.members.length) {
    parties.delete(party);
    for (const [k, inv] of invites) if (inv.party === party) invites.delete(k);
    return;
  }
  if (party.leader === charId) {
    // the longest-serving member who is online takes over (or simply the next one)
    party.leader = (party.members.find((m) => online.has(m.id)) ?? party.members[0]).id;
    tell(party, `${party.members.find((m) => m.id === party.leader)!.name} เป็นหัวหน้าปาร์ตี้คนใหม่`);
  }
  push(party, true);
}

function nameOf(charId: string) {
  return online.get(charId)?.info().name ?? partyOf.get(charId)?.members.find((m) => m.id === charId)?.name ?? '?';
}

function newParty(leader: string, name: string): Party {
  const party: Party = {
    id: `p${++seq}`, name: cleanName(name, 24) || `ปาร์ตี้ของ ${nameOf(leader)}`, leader, members: [], next: 0,
    emptySince: 0, sent: new Map(),
  };
  parties.add(party);
  addMember(party, leader);
  return party;
}

/** Thrown messages go back to the player as an error toast. */
class PartyError extends Error {}
const fail = (text: string): never => {
  throw new PartyError(text);
};

export const Parties = {
  isPartyError: (e: unknown): e is Error => e instanceof PartyError,

  of(charId: string): Party | undefined {
    return partyOf.get(charId);
  },

  /** How many characters are in a map room right now, across every map (the minimap's "ออนไลน์"). */
  onlineCount(): number {
    return online.size;
  },

  isOnline(charId: string): boolean {
    return online.has(charId);
  },

  /** A character entered a map room. */
  online(p: Presence) {
    online.set(p.charId, p);
    const party = partyOf.get(p.charId);
    if (party) {
      const m = party.members.find((x) => x.id === p.charId)!;
      Object.assign(m, { name: p.info().name, cls: p.info().cls, level: p.info().level });
      party.emptySince = 0;
      push(party, true);
    }
    const inv = invites.get(p.charId);
    if (inv && inv.until > Date.now()) p.client.send('partyInvite', { party: inv.party.name, from: nameOf(inv.from) });
  },

  /** A character left a map room (a warp, or they logged off). */
  offline(charId: string, sessionId: string) {
    const p = online.get(charId);
    if (!p || p.sessionId !== sessionId) return; // they're already in another room
    online.delete(charId);
    const party = partyOf.get(charId);
    if (party) push(party);
  },

  /** The browser asks for its party window again (after a map change). */
  refresh(charId: string) {
    const party = partyOf.get(charId);
    if (!party) return send(charId, 'party', null);
    party.sent.delete(charId);
    push(party);
  },

  create(charId: string, name: unknown) {
    if (partyOf.has(charId)) fail('คุณอยู่ในปาร์ตี้แล้ว');
    const party = newParty(charId, String(name ?? ''));
    push(party, true);
    send(charId, 'system', { text: `สร้างปาร์ตี้ "${party.name}" แล้ว` });
  },

  /** Invite by character id (clicked on them) or by name (typed in the party window). */
  invite(from: string, target: { charId?: string; name?: unknown }) {
    let to = target.charId;
    if (!to) {
      const want = cleanName(target.name, 30).toLowerCase();
      if (!want) fail('พิมพ์ชื่อตัวละครที่จะชวน');
      to = [...online.values()].find((p) => p.info().name.toLowerCase() === want)?.charId;
      if (!to) fail('ไม่พบผู้เล่นชื่อนี้ที่ออนไลน์อยู่');
    }
    if (to === from) fail('ชวนตัวเองไม่ได้');
    if (!online.has(to!)) fail('ผู้เล่นคนนี้ไม่ได้ออนไลน์');
    let party = partyOf.get(from);
    if (party && party.leader !== from) fail('หัวหน้าปาร์ตี้เท่านั้นที่ชวนคนเข้าได้');
    if (partyOf.has(to!)) fail(`${nameOf(to!)} อยู่ในปาร์ตี้อื่นแล้ว`);
    if (party && party.members.length >= PARTY_MAX) fail(`ปาร์ตี้เต็มแล้ว (${PARTY_MAX} คน)`);
    const pending = invites.get(to!);
    if (pending && pending.until > Date.now() && pending.party !== party) fail(`${nameOf(to!)} กำลังมีคำชวนจากปาร์ตี้อื่นอยู่`);
    // inviting while not in a party makes one, with you as the leader
    if (!party) {
      party = newParty(from, '');
      push(party, true);
    }
    invites.set(to!, { party, from, until: Date.now() + INVITE_MS });
    send(to!, 'partyInvite', { party: party.name, from: nameOf(from) });
    send(from, 'system', { text: `ส่งคำชวนเข้าปาร์ตี้ไปที่ ${nameOf(to!)} แล้ว` });
  },

  respond(charId: string, accept: unknown) {
    const inv = invites.get(charId);
    invites.delete(charId);
    if (!inv || inv.until < Date.now() || !parties.has(inv.party)) fail('คำชวนหมดเวลาแล้ว');
    const party = inv!.party;
    if (!accept) {
      send(inv!.from, 'system', { text: `${nameOf(charId)} ปฏิเสธคำชวนเข้าปาร์ตี้` });
      return;
    }
    if (partyOf.has(charId)) fail('คุณอยู่ในปาร์ตี้แล้ว');
    if (party.members.length >= PARTY_MAX) fail(`ปาร์ตี้เต็มแล้ว (${PARTY_MAX} คน)`);
    addMember(party, charId);
    tell(party, `${nameOf(charId)} เข้าร่วมปาร์ตี้`);
    push(party, true);
  },

  leave(charId: string) {
    const party = partyOf.get(charId) ?? fail('คุณไม่ได้อยู่ในปาร์ตี้');
    const name = nameOf(charId);
    removeMember(party, charId);
    send(charId, 'system', { text: 'ออกจากปาร์ตี้แล้ว' });
    tell(party, `${name} ออกจากปาร์ตี้`);
  },

  kick(leader: string, target: unknown) {
    const party = partyOf.get(leader) ?? fail('คุณไม่ได้อยู่ในปาร์ตี้');
    if (party.leader !== leader) fail('หัวหน้าปาร์ตี้เท่านั้นที่เตะสมาชิกได้');
    const m = party.members.find((x) => x.id === target);
    if (!m || m.id === leader) fail('เตะคนนี้ไม่ได้');
    removeMember(party, m!.id);
    send(m!.id, 'system', { text: `คุณถูกเชิญออกจากปาร์ตี้ "${party.name}"` });
    tell(party, `${m!.name} ถูกเชิญออกจากปาร์ตี้`);
  },

  setLeader(leader: string, target: unknown) {
    const party = partyOf.get(leader) ?? fail('คุณไม่ได้อยู่ในปาร์ตี้');
    if (party.leader !== leader) fail('หัวหน้าปาร์ตี้เท่านั้นที่มอบตำแหน่งได้');
    const m = party.members.find((x) => x.id === target);
    if (!m || m.id === leader) fail('มอบให้คนนี้ไม่ได้');
    party.leader = m!.id;
    tell(party, `${m!.name} เป็นหัวหน้าปาร์ตี้คนใหม่`);
    push(party, true);
  },

  /** Party chat (`/p ข้อความ`): reaches members on every map. */
  chat(charId: string, text: string) {
    const party = partyOf.get(charId) ?? fail('คุณไม่ได้อยู่ในปาร์ตี้ (สร้างหรือเข้าปาร์ตี้ก่อน)');
    for (const m of party.members) send(m.id, 'partyChat', { name: nameOf(charId), text });
  },

  /** Next member in the round-robin (items, leftover zeny). */
  rotate(party: Party, n: number) {
    const i = party.next % n;
    party.next = (party.next + 1) % 1_000_000;
    return i;
  },
};

// HP bars and maps in the party window, and cleanup of parties nobody is using
setInterval(() => {
  const now = Date.now();
  for (const [k, inv] of invites) if (inv.until < now) invites.delete(k);
  for (const party of parties) {
    if (party.members.some((m) => online.has(m.id))) {
      party.emptySince = 0;
      push(party);
    } else if (!party.emptySince) party.emptySince = now;
    else if (now - party.emptySince > IDLE_MS) {
      for (const m of party.members) partyOf.delete(m.id);
      parties.delete(party);
    }
  }
}, 1500).unref?.();
