# Monsters

Ultimate Monsters pack by Quaternius (https://quaternius.com), licensed CC0 1.0.
Converted from glTF to gzipped GLB, keeping only the idle, walk, attack, hit and death clips.

## Crimson_Reaper.glb.gz (ยมทูตเคียวโลหิต, the abyss MVP)

"Crimson Reaper Twins", made by the game's author with Meshy AI (https://www.meshy.ai) on the free plan,
licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Credit: Meshy AI.
Changes for the game: 2.71 million triangles simplified to about 30,000 (meshoptimizer), the colour texture
downscaled from 2048 to 1024 px, the normal and metal/roughness maps dropped (the game uses toon shading),
a skeleton of 7 bones with skin weights and five clips (idle, walk, scythe attack, hit, death) added by
`tools/rig_reaper.mjs`, positions quantized (KHR_mesh_quantization) and the file gzipped.

## Tiger_Warlord.glb.gz (ราชาเสือโคร่ง, the MVP of ทุ่งเมโลดี้)

"Tiger Warlord", made by the game's author with Meshy AI (https://www.meshy.ai) on the free plan,
licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Credit: Meshy AI.
Changes for the game: 2.73 million triangles simplified to about 30,000 (meshoptimizer), the colour texture
downscaled from 2048 to 1024 px, the normal and metal/roughness maps dropped, a skeleton of 13 bones with skin
weights and five clips (idle, walk, overhead axe chop, hit, death) added by `tools/rig_tiger.mjs`, positions
quantized (KHR_mesh_quantization) and the file gzipped.

## ML001.glb.gz .. ML077.glb.gz (the 77 normal monsters)

"Monster Music Land", made by the game's author with Meshy AI (https://www.meshy.ai) from the game's monster sheet,
licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Credit: Meshy AI.
Changes for the game: the one 1.9-million-triangle sculpt holding all 77 monsters was cut into one model per monster
(`tools/meshy/split_sheet.py`, `split_glb.mjs`), the display stands removed, each made a little deeper front to back,
given a rounder back built from its front (thickness pushed toward a round profile, the back painted with the body colours of the front with its eyes and mouth filtered out), simplified to 4,000 triangles and its colours baked onto its own 512 px texture (`tools/meshy/bake_monster.py`,
Blender), the normal and metal/roughness maps dropped, and the file gzipped. They have no skeleton: they move by code
(PropAnim in `src/three/monsters.ts`).

## MB_<boss>.glb.gz (the 11 mini-bosses)

"Crowned Monsters", made by the game's author with Meshy AI (https://www.meshy.ai), licensed CC BY 4.0
(https://creativecommons.org/licenses/by/4.0/). Credit: Meshy AI. Cut into one model per boss and baked the same way
as the normal monsters (6,000 triangles each); `tools/meshy_bosses.py` says which piece is which boss.
