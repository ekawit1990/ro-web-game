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

## ที่ใช้ในเกมแล้ว

- `build_guitar.py` → `public/models/weapons/guitar.glb.gz` กีตาร์ตั้งต้นของมือกีตาร์ (5,574 tri, ซันเบิร์สต์ทาสีด้วย vertex color ไม่ใช้ texture)
  โหลดใน `src/three/bass.ts` (`BLENDER`): ระหว่างรอไฟล์จะวาดกีตาร์จากโค้ดแบบเดิมก่อน แล้วสลับเป็นโมเดล Blender ตำแหน่งมือ/สายสะพายไม่เปลี่ยน
  โมเดลต้องอยู่ในกรอบเดียวกับ `buildStringed()`: เมตร, คอชี้ +X, จุด 0 ตรงรอยต่อคอกับตัว, หน้ากีตาร์หัน +Z
