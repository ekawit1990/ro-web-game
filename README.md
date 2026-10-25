# Aster Online (ro-web-game)

เกมผจญภัยแนว Ragnarok Online เล่นบนเว็บ: เดินคลิก ตีมอนสเตอร์ เก็บเลเวล อัปสเตตัส เก็บไอเท็ม ซื้อของ และเห็นผู้เล่นคนอื่นพร้อมแชท

- **หน้าเว็บ:** Phaser 3 + TypeScript + Vite วางบน **Cloudflare Pages**
- **ฐานข้อมูล:** **Supabase** (Auth, Postgres, Realtime)
- **ภาพทั้งหมดวาดด้วยโค้ด** ไม่มีไฟล์ลิขสิทธิ์ของ RO หรือของใคร (ดู `src/game/textures.ts`)

## มีอะไรในเกมตอนนี้

- 3 อาชีพ: นักดาบ (ประชิด HP สูง), นักธนู (ยิงไกล), นักเวทย์ (เวทย์แรง ใช้ SP)
- เมืองปลอดภัย มีร้านค้าและแม่ชีฟื้นพลัง
- มอนสเตอร์ 4 ชนิด + บอสราชาเจลลี่ (เกิดใหม่ทุก 5 นาที)
- เลเวลสูงสุด 50, ได้ 5 แต้มสเตตัสต่อเลเวล, ตายเสีย EXP 5%
- กระเป๋า สวมอาวุธ/เสื้อ ซื้อ/ขายของ ยาด่วนปุ่ม Q
- เห็นผู้เล่นอื่นในแผนที่เดียวกัน + แชทพร้อมบอลลูนเหนือหัว

ปุ่มลัด: `I` กระเป๋า, `S` สเตตัส, `Q` ใช้ยา, `Enter` แชท, `Esc` ปิดหน้าต่าง

## รันในเครื่อง

```bash
npm install
npm run dev
```

ถ้ายังไม่ตั้งค่า Supabase เกมจะรัน **โหมดออฟไลน์** (เซฟใน browser, เปิดอีกแท็บจะเห็นกันเหมือนผู้เล่นอื่น) เหมาะไว้ทดสอบ

## ตั้งค่า Supabase

1. สร้างโปรเจกต์ที่ https://supabase.com
2. เปิด **SQL Editor** แล้วรันไฟล์ตามลำดับ:
   - `supabase/migrations/0001_init.sql` (ตาราง + กฎเกม)
   - `supabase/migrations/0002_seed.sql` (ข้อมูลไอเท็ม/มอนสเตอร์)
3. **Authentication → Sign In / Providers → Email**: ถ้าอยากให้สมัครแล้วเล่นได้ทันที ให้ปิด *Confirm email*
4. คัดลอก `.env.example` เป็น `.env.local` แล้วใส่ `VITE_SUPABASE_URL` กับ `VITE_SUPABASE_ANON_KEY` จาก **Project Settings → API**

> แก้ค่าเกม (ราคา, EXP, ดรอป) ที่ `src/data/gamedata.json` แล้วรัน `npm run gen:seed` เพื่อสร้าง `0002_seed.sql` ใหม่ จากนั้นรันไฟล์นั้นใน SQL Editor อีกครั้ง

### กันโกงทำอะไรไว้บ้าง

ฝั่ง browser **อ่าน** ข้อมูลตัวเองได้อย่างเดียว ทุกอย่างที่เปลี่ยนความคืบหน้า (EXP, เงิน, ดรอป, ซื้อขาย, อัปสเตตัส) ทำผ่านฟังก์ชันในฐานข้อมูล ซึ่งเป็นคนสุ่มดรอปและคิด EXP เอง และจำกัดความถี่การฆ่ามอนสเตอร์ไว้
ข้อจำกัดที่ต้องรู้: การต่อสู้ยังคำนวณใน browser คนที่แก้โค้ดเองอาจฆ่ามอนสเตอร์ได้เร็วกว่าปกติ (แต่ไม่เกินเพดานความถี่) ถ้าเกมโตขึ้นค่อยย้ายการต่อสู้ไปฝั่งเซิร์ฟเวอร์

## Deploy บน Cloudflare Pages

1. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git** แล้วเลือก repo นี้
2. ตั้งค่า build:
   - Framework preset: `Vite` (หรือ None)
   - Build command: `npm run build`
   - Build output directory: `dist`
3. **Environment variables**: ใส่ `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY`
4. กด Deploy ทุกครั้งที่ push เข้า `main` จะ deploy ใหม่ให้อัตโนมัติ

## โครงสร้าง

```
src/
  data/gamedata.json    ค่าเกมทั้งหมด (อาชีพ ไอเท็ม มอนสเตอร์ จุดเกิด)
  data/index.ts         สูตรคำนวณสเตตัส/EXP
  game/WorldScene.ts    แผนที่ การเดิน การต่อสู้ AI มอนสเตอร์
  game/map.ts           สร้างแผนที่ + หาเส้นทาง (A*)
  game/textures.ts      วาดภาพตัวละคร/มอนสเตอร์ด้วยโค้ด
  game/session.ts       สถานะตัวละครที่กำลังเล่น
  services/             เชื่อม Supabase / โหมดออฟไลน์ / ผู้เล่นออนไลน์
  ui/                   หน้าล็อกอิน เลือกตัวละคร HUD
supabase/migrations/    SQL สำหรับ Supabase
```

## ไอเดียต่อยอด

สกิลอาชีพ, เปลี่ยนอาชีพขั้น 2, แผนที่เพิ่ม/ดันเจี้ยน, ปาร์ตี้แชร์ EXP, เพลงประกอบ, เปลี่ยนภาพเป็น sprite จริง (เช่นชุดฟรีจาก Kenney.nl หรือ OpenGameArt ที่เป็น CC0)
