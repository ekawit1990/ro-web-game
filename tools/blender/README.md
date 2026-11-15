# Blender pipeline ของ Music Land

ใช้ Blender ทำโมเดล 3D ของเกมด้วยสคริปต์ Python แล้ว export เป็น `.glb.gz` ที่เกมโหลดได้เลย (แบบเดียวกับ `public/models/village/` และ `public/models/monsters/`)

## ติดตั้ง (เลือกอย่างใดอย่างหนึ่ง)

- **ไม่ต้องเปิดโปรแกรม:** `pip install bpy` (Python 3.13, ได้ Blender 5.x เป็นโมดูล) แล้วรัน `python tools/blender/<สคริปต์>.py`
- **โปรแกรม Blender บนเครื่อง:** `blender -b -P tools/blender/<สคริปต์>.py -- <ตัวเลือก>`
- บน Linux ที่ไม่มีจอ ถ้าจะ render รูปตัวอย่างต้องมี `libegl1` (`apt-get install libegl1 libgl1-mesa-dri`)

## สคริปต์

| ไฟล์ | ทำอะไร |
| --- | --- |
| `ml_blender.py` | ตัวช่วยกลาง: สร้างรูปทรง/ตัวอักษร 3D, วัสดุสีพื้น, นับ triangle, ลด polygon, export GLB + gzip, render รูปตัวอย่าง |
| `build_dj_scooter.py` | ตัวอย่างโมเดลที่สร้างจากโค้ดทั้งคัน: สกู๊ตเตอร์ส่งของ Music Land (2,992 tri, 35 KB) → `public/models/props/dj_scooter.glb.gz` |
| `optimize_glb.py` | ย่อโมเดลหนัก ๆ (เช่นจาก Meshy AI): ลด triangle, ย่อ texture, ตัด normal/metal map → `.glb.gz` |

```bash
# สร้างสกู๊ตเตอร์ + รูปตัวอย่าง + ไฟล์ .blend ไว้เปิดแก้ในโปรแกรม Blender
python tools/blender/build_dj_scooter.py --preview /tmp/scooter.png --blend /tmp/dj_scooter.blend

# ย่อโมเดล Meshy 2.7 ล้าน tri เหลือ 30,000 (ราว 1 นาที)
python tools/blender/optimize_glb.py Meshy.glb public/models/monsters/NewBoss.glb --tris 30000 --tex 1024
```

## กติกาของโมเดลในเกม

- 1 หน่วย Blender = 1 ช่องแผนที่ (ประมาณ 1 เมตร)
- **หน้าโมเดลหันไปทาง -Y ใน Blender** (กลายเป็น +Z ในเกมหลัง export)
- จุดกำเนิดอยู่กลางฐาน ยืนบน Z = 0 (`ground_origin()` จัดให้)
- ใช้วัสดุสีพื้น (Base Color) เกมวาดใหม่เป็น cel-shade เอง ไม่ต้องมี normal/roughness map
- งบสำหรับมือถือ (iOS หน่วยความจำ GPU น้อย): ของประกอบฉาก ≤ 3,000 tri, ฉากชิ้นใหญ่ ≤ 15,000, มอนสเตอร์ ≤ 30,000, texture ≤ 1024 px
  `export_glb(..., budget=3000)` จะหยุดถ้าเกินงบ
- อย่าใส่โลโก้แบรนด์จริงบนโมเดล และโมเดลจากที่อื่นต้องมีสิทธิ์แจกต่อ (ใส่เครดิตใน `CREDITS.md` ของโฟลเดอร์นั้น)

## ทำโมเดลใหม่

คัดลอก `build_dj_scooter.py` เป็น `build_<ชื่อ>.py` แก้ส่วนสร้างรูปทรง แล้วรัน ถ้าปั้นด้วยมือในโปรแกรม Blender ก็ได้: ทำตามกติกาด้านบน แล้ว File → Export → glTF 2.0 (.glb) จากนั้น `gzip -9` ลงใน `public/models/...`

## ที่ใช้ในเกมแล้ว (อาวุธตั้งต้นทุกอาชีพที่ไม่ใช่ MVP)

| สคริปต์ | ไฟล์ | tri | แทนของเดิมใน |
| --- | --- | --- | --- |
| `build_guitar.py --kind guitar` | `weapons/guitar.glb.gz` | 5,574 | `buildStringed('guitar')` (bass.ts) |
| `build_guitar.py --kind bass` | `weapons/bass.glb.gz` | 5,148 | `buildStringed('bass')` |
| `build_sticks_mic.py` | `weapons/stick.glb.gz`, `weapons/mic.glb.gz` | 704 / 2,758 | ไม้กลองกับไมค์ธรรมดาใน vrm.ts |
| `build_keyboard.py` | `weapons/keyboard.glb.gz` | 4,696 | `buildKeyboard()` (keyboard.ts) |

`src/three/blenderProps.ts` `useBlenderModel(group, name)`: เกมวาดของจากโค้ดก่อน แล้วสลับ mesh เป็นโมเดล Blender เมื่อไฟล์โหลดเสร็จ
จุดยึดมือ/สายสะพาย (Object3D เปล่า) และ mesh ที่ติด `userData.keep` (จอ LCD, ไฟ LED, ตะแกรงลำโพงที่เป็น canvas texture) ไม่ถูกเปลี่ยน
โมเดลต้องสร้างในกรอบและขนาดเดียวกับโค้ดเดิมเสมอ (ดู docstring ของแต่ละสคริปต์)

## หมวก 65 ชิ้น (55 ทรง)

`build_hats.py` → `public/models/hats/<kind>[_<v>].glb.gz` (รวมราว 1.9 MB, ทรงละ 0.8k–7k tri)
- เขียนด้วย `three_like.py` ซึ่งเลียนแบบ primitive ของ three.js (แกน Y ขึ้น, หน้า +Z) จึงพอร์ตจาก `src/three/hats.ts` ได้ตรงพิกัด
- วัสดุไม่มีสีจริง ใช้ชื่อแทน: `c1`–`c3` = สีของไอเท็ม, `glow_c2` = เรืองแสง, `trans_c2` = โปร่ง, `#rrggbb` = สีตายตัว, ต่อท้าย `|no` = ไม่มีเส้นขอบ
- `src/three/blenderHats.ts` ทาสีตาม `hat.c` ของไอเท็มแล้วใส่แทนหมวกที่วาดจากโค้ด เส้นขอบใช้ `outlineByNormals` (ดันตาม normal) เพราะ mesh รวมชิ้นแล้ว
- ไอคอนหมวกในช่องเก็บของยังวาดจากโค้ดเดิม
