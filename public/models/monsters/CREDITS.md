# Monsters

Ultimate Monsters pack by Quaternius (https://quaternius.com), licensed CC0 1.0.
Converted from glTF to gzipped GLB, keeping only the idle, walk, attack, hit and death clips.

## Crimson_Reaper.glb.gz (ยมทูตเคียวโลหิต, the abyss MVP)

"Crimson Reaper Twins", made by the game's author with Meshy AI (https://www.meshy.ai) on the free plan,
licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Credit: Meshy AI.
Changes for the game: 2.71 million triangles simplified to about 30,000 (meshoptimizer), the colour texture
downscaled from 2048 to 1024 px, the normal and metal/roughness maps dropped (the game uses toon shading),
positions quantized (KHR_mesh_quantization) and the file gzipped. It has no skeleton: the game sways and tilts
it in code (PropAnim in src/three/monsters.ts).
