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

## ML001.glb.gz .. ML077.glb.gz (the 77 normal monsters)

"Monster Music Land", made by the game's author with Meshy AI (https://www.meshy.ai) from the game's monster sheet,
licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Credit: Meshy AI.
Changes for the game: the one 1.9-million-triangle sculpt holding all 77 monsters was cut into one model per monster
(`tools/meshy/split_sheet.py`, `split_glb.mjs`), the display stands removed, each made a little deeper front to back,
simplified to 4,000 triangles and its colours baked onto its own 512 px texture (`tools/meshy/bake_monster.py`,
Blender), the normal and metal/roughness maps dropped, and the file gzipped. They have no skeleton: they move by code
(PropAnim in `src/three/monsters.ts`).
