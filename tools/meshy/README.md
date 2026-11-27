# Meshy monster sheet -> one game model per monster

Used 2026-11-18 for the 77 normal monsters (public/models/monsters/ML001..ML077.glb.gz). The scripts are records of
that run: paths and the grid of the sheet (11 columns x 7 rows, picked from a front render) are in the files.

1. `node tools/meshy/dump_mesh.mjs Meshy.glb` writes pos.f32 / idx.u32 (needs @gltf-transform/core in a scratch dir).
2. `python3 tools/meshy/split_sheet.py` welds the soup, finds connected pieces and gives each piece to the nearest
   grid cell -> tri_assign2.bin (drops flat stands it can spot).
3. `node tools/meshy/split_glb.mjs` writes one glb per monster (split2/mNN.glb), still the full-detail mesh.
4. `python3 tools/meshy/bake_monster.py IN.glb OUT.glb 4000 512` (pip install bpy): feet to 0, cuts the display
   stand (auto, or OVR heights for ones it misses), drops loose bits beside the body, deepens the flat sculpt up to
   x1.8 front to back, decimates, new UVs, bakes the colour onto a 512 px texture, exports. Then gzip -9.
5. `python3 tools/meshy_monsters.py sheet.xlsx` puts the sheet's names/levels/elements into gamedata.json.

## Skeleton and clips (2026-11-27)

`tools/rig_monsters.mjs` gives the Meshy monsters with arms and legs (39) and the four-legged ones (6) a skeleton,
skin weights and Idle / Walk / Punch / HitReact / Death clips, so they step instead of sliding and swing their weapon,
draw a bow or raise a staff. Joint heights and weapon boxes per model are in its RIGS table (units of the model's
height); its input is the model before rigging (git history, commit 7880335).
