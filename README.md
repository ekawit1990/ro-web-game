# ♪ Music Land

เกมผจญภัยออนไลน์แนว Ragnarok Online ธีมดนตรี เล่นบนเว็บ ผู้เล่นหลายคนเห็นกัน ตีมอนสเตอร์ตัวเดียวกัน และรุมบอสด้วยกันได้

| ส่วน | ใช้อะไร | วางที่ไหน |
|---|---|---|
| หน้าเว็บ (ภาพ, เมนู) | Phaser 3 + TypeScript + Vite | **Cloudflare Pages** |
| เซิร์ฟเวอร์เกม (มอนสเตอร์, การต่อสู้, ผู้เล่นหลายคน) | **Colyseus** (Node.js) | Render / Fly.io / VPS / Colyseus Cloud |
| บัญชีผู้เล่นและเซฟ | **Supabase** (Auth + Postgres) | Supabase |

ภาพทั้งหมดวาดด้วยโค้ด (`src/game/textures.ts`) ไม่มีไฟล์ลิขสิทธิ์ของใคร

## มีอะไรในเกม

- 5 อาชีพ: **นักร้อง** (ไมค์ ยิงคลื่นเสียง), **มือกีตาร์** (ยิงโน้ตไกล), **มือกลอง** (ไม้กลอง 2 มือ ตีประชิด), **มือเบส** (แทงก์ HP สูง), **มือคีย์บอร์ด** (ยิงคอร์ดเวทย์ไกล)
- เมืองปลอดภัย มีร้านดนตรีและครูเพลงฟื้นพลัง
- มอนสเตอร์ 4 ชนิด + บอส **ราชาเสียงเพี้ยน** (เกิดใหม่ทุก 5 นาที) ใครตีเกิน 10% ของเลือดบอสได้รางวัลเต็มทุกคน
- เลเวลสูงสุด 50, ได้ 5 แต้มสเตตัสต่อเลเวล, ตายเสีย EXP 5%
- กระเป๋า สวมเครื่องดนตรี/เสื้อ ซื้อ/ขายของ ใช้ยาปุ่ม Q
- แชทพร้อมบอลลูนเหนือหัว

ปุ่มลัด: `I` กระเป๋า, `S` สเตตัส, `Q` ใช้ยา, `Enter` แชท, `Esc` ปิดหน้าต่าง

## รันในเครื่อง

```bash
npm install
cd server && npm install && cd ..

npm run server          # เซิร์ฟเวอร์เกมที่ ws://localhost:2567
npm run dev             # หน้าเว็บ (อีกหน้าต่าง terminal)
```

- ไม่ใส่อะไรใน `.env.local` เลย = **โหมดออฟไลน์** มอนสเตอร์จำลองใน browser เซฟใน browser
- ใส่แค่ `VITE_COLYSEUS_URL=ws://localhost:2567` = เล่นผ่านเซิร์ฟเวอร์ แต่ยังเซฟใน browser (เซิร์ฟเวอร์ใช้ฐานข้อมูลในหน่วยความจำ **ห้ามใช้แบบนี้บนเซิร์ฟเวอร์จริง**)
- ใส่ครบ (Supabase + Colyseus) = แบบเดียวกับตอนเปิดจริง

## 1) ตั้งค่า Supabase

1. เปิด **SQL Editor** วางไฟล์ `supabase/setup.sql` ทั้งไฟล์ แล้วกด **Run** (รันซ้ำได้)
2. **Authentication → Sign In / Providers → Email**: ถ้าอยากให้สมัครแล้วเล่นได้ทันที ให้ปิด *Confirm email*
3. จด 2 ค่าจาก **Project Settings → API Keys**:
   - `anon` / publishable key: ใส่ในหน้าเว็บได้ (เปิดเผยได้)
   - `service_role` / secret key: **ใส่เฉพาะที่เซิร์ฟเวอร์เกม ห้ามใส่ในหน้าเว็บ ห้าม commit ห้ามส่งในแชท**

> แก้ค่าเกม (ราคา, EXP, ดรอป, อาชีพ) ที่ `src/data/gamedata.json` แล้วรัน `npm run gen:seed` จากนั้นรัน `supabase/setup.sql` ใหม่

## 2) Deploy เซิร์ฟเวอร์เกม (Colyseus)

ตัวอย่างใช้ **Render** (มีแพ็กเกจฟรี แต่จะหลับถ้าไม่มีคนเล่น 15 นาที ตื่นช้าราว 1 นาที):

1. https://render.com → **New → Blueprint** → เลือก repo นี้ (ใช้ `render.yaml` + `Dockerfile` ให้อัตโนมัติ)
2. ใส่ `SUPABASE_SERVICE_ROLE_KEY` ในหน้า Environment ของ service
3. ได้ URL เช่น `https://music-land-server.onrender.com` ใช้เป็น `wss://music-land-server.onrender.com`

ที่อื่นก็ได้ ขอแค่รัน Docker หรือ Node 22 ได้และเปิด WebSocket ได้ (Cloudflare Pages รัน Colyseus ไม่ได้)

## 3) Deploy หน้าเว็บบน Cloudflare Pages

1. **Workers & Pages → Create → Pages → Connect to Git** เลือก repo นี้
2. Build command: `npm run build` · Build output directory: `dist`
3. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_COLYSEUS_URL` (เช่น `wss://music-land-server.onrender.com`)
4. Deploy (push เข้า `main` ครั้งต่อไปจะ deploy ให้เอง)

## กันโกง

- เซิร์ฟเวอร์ Colyseus เป็นคนคุมมอนสเตอร์ คำนวณดาเมจ เช็กระยะ/ความเร็วตี/ความเร็วเดิน และ HP ของทุกคน
- EXP เงิน ดรอป ยา และการตาย บันทึกผ่านฟังก์ชันในฐานข้อมูลที่ **เรียกได้เฉพาะเซิร์ฟเวอร์เกม** (service role)
- หน้าเว็บเรียกได้แค่เมนู: สร้างตัวละคร อัปสเตตัส ซื้อ/ขาย สวมใส่ (ฐานข้อมูลเช็กเงื่อนไขทุกอย่างเอง)

## โครงสร้าง

```
src/data/gamedata.json   ค่าเกมทั้งหมด (ใช้ร่วมกันทั้งหน้าเว็บและเซิร์ฟเวอร์)
src/data/index.ts        สูตรสเตตัส/EXP
src/game/WorldScene.ts   แผนที่ การเดิน ภาพการต่อสู้ (ออนไลน์ + ออฟไลน์)
src/game/map.ts          แผนที่ + หาเส้นทาง (ใช้ร่วมกับเซิร์ฟเวอร์)
src/game/textures.ts     วาดตัวละคร เครื่องดนตรี มอนสเตอร์
src/services/            Supabase, โหมดออฟไลน์
src/ui/                  หน้าล็อกอิน เลือกตัวละคร HUD
server/src/FieldRoom.ts  ห้องเกม Colyseus: มอนสเตอร์ การต่อสู้ รางวัล
server/src/db.ts         เซิร์ฟเวอร์คุยกับ Supabase
supabase/setup.sql       SQL ทั้งหมดสำหรับวางใน SQL Editor
```

## ไอเดียต่อยอด

สกิลประจำอาชีพ (โซโล่กีตาร์, กลองรัว), ปาร์ตี้/วงดนตรีแชร์ EXP, แผนที่เพิ่ม, เพลงประกอบตามอาชีพ, เปลี่ยนภาพเป็น sprite จริง (เช่นชุดฟรี CC0 จาก Kenney.nl หรือ OpenGameArt)
