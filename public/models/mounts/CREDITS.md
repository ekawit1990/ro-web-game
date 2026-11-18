# Mounts (พาหนะ)

The three scooters were made by the game's author with Meshy AI (https://www.meshy.ai) on the free plan,
licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Credit: Meshy AI.
The author removed the brand logos and changed the colours before handing them over.

- scooter_silver.glb.gz: "Silver Sprint Scooter" (สกู๊ตเตอร์ซิลเวอร์สปรินต์)
- scooter_red.glb.gz: "Red Scooter" (สกู๊ตเตอร์แดงเพลิง)
- scooter_retro.glb.gz: "Blue and Yellow Retro" (สกู๊ตเตอร์เรโทรฟ้าเหลือง)

Changes for the game (`tools/blender/build_mounts.py`): the front and rear wheels cut out of the single
mesh so they can spin, 1.5-2.7 million triangles simplified to about 19,000, the colours baked onto one new
1024 px texture (the normal and metal/roughness maps dropped: the game uses toon shading), anchor points for
the rider (Seat, GripL, GripR, Foot) added, scaled to 1.5 tiles long and gzipped.
