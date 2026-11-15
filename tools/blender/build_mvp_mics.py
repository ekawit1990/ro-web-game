"""
The 7 MVP microphones (src/three/mics.ts MIC_STYLES), modelled in Blender with real geometry where the code
version paints a texture: slots cut through the barrel, a wire mesh over dark foam, stacked ribs, a silver
wire cage over red mesh, a grooved vintage capsule on a yoke.

    python tools/blender/build_mvp_mics.py [--only mic_red] [--preview DIR]

Same frame as buildMic(): grip round game y = 0 (Blender z = 0), handle down to about -0.065, grille on top.
Game +Z (the front) is Blender -Y. Writes public/models/weapons/mics/<style>.glb.gz.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ml_blender import box, cyl, export_glb, flag, join, lathe, mat, reset, sphere, torus, render_preview  # noqa: E402
import bpy  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'models', 'weapons', 'mics')
os.makedirs(OUT, exist_ok=True)
only = flag('--only')
preview_dir = flag('--preview')

# a copy of MIC_STYLES (radius, y) profiles and colours
STYLES = {
    'mic_inst': dict(handle=[(0.019, -0.065), (0.021, -0.055), (0.022, 0.1), (0.023, 0.115)], body='#1b1b1e',
                     head='flat', headR=0.0235, headH=0.1, grille='#17171a', pattern='slots'),
    'mic_stick': dict(handle=[(0.013, -0.065), (0.0155, -0.055), (0.022, 0.11), (0.0235, 0.125)], body='#4b5057', metal=True,
                      head='flat', headR=0.026, headH=0.065, grille='#1c1e21', pattern='ribs', band='#33363b'),
    'mic_taper': dict(handle=[(0.0155, -0.065), (0.018, -0.055), (0.026, 0.105), (0.0285, 0.118)], body='#757b82', metal=True,
                      head='dome', headR=0.031, headH=0.045, grille='#1a1a1d', pattern='mesh', band='#111114'),
    'mic_red': dict(handle=[(0.014, -0.065), (0.0165, -0.055), (0.023, 0.105), (0.0265, 0.118)], body='#17171a',
                    head='dome', headR=0.03, headH=0.048, grille='#d5d9de', pattern='cage', inner='#c4141f', band='#d5d9de'),
    'mic_silverband': dict(handle=[(0.0155, -0.065), (0.018, -0.055), (0.026, 0.1), (0.028, 0.112)], body='#3c4047', metal=True,
                           head='dome', headR=0.0305, headH=0.052, grille='#1b1c1f', pattern='mesh', band='#d3d7dc'),
    'mic_ball': dict(handle=[(0.0155, -0.065), (0.018, -0.055), (0.025, 0.1), (0.028, 0.114)], body='#1f2023',
                     head='ball', headR=0.045, headH=0, grille='#c8ccd1', pattern='mesh', band='#9ca1a7'),
    'mic_vintage': dict(body='#d4d9de', head='vintage', headR=0.046, headH=0.06),
}
SEG = 24


def lum(hexc):
    h = hexc.lstrip('#')
    return sum(int(h[i:i + 2], 16) for i in (0, 2, 4)) / (3 * 255)


def metal_mat(name, hexc, rough=0.28):
    # no environment map in the game: keep metalness moderate or chrome turns black
    return mat(name, hexc, rough=rough, metal=0.45)


def wire(obj, thick):
    md = obj.modifiers.new('wire', 'WIREFRAME')
    md.thickness = thick
    md.use_even_offset = True
    md.use_replace = True
    return obj


def dome_profile(r, y0, h, rings=7, close=True):
    """barrel from y0 up h, then (close) a flattened quarter circle to the top."""
    pts = [(r * 0.88, y0), (r, y0 + 0.004), (r, y0 + h)]
    if close:
        for i in range(1, rings + 1):
            a = i / rings * math.pi / 2
            rr = r * math.cos(a)
            pts.append((rr if i < rings else 0, y0 + h + r * 0.8 * math.sin(a)))
    return pts


def handle_parts(s, BODY):
    hp = s['handle']
    prof = [(0, hp[0][1])] + hp
    parts = [lathe('handle', prof, BODY, segs=SEG)]
    # cable socket: a dark cap with a little chrome ring
    r0, y = hp[0]
    parts.append(lathe('socket', [(0, y - 0.008), (r0 * 0.85, y - 0.008), (r0 * 0.92, y - 0.004), (r0 * 0.92, y + 0.001)], mat('mic_socket', '#0f0f11', rough=0.7), segs=SEG))
    parts.append(torus('socket_ring', r0 * 0.9, 0.0012, (0, 0, y - 0.0075), metal_mat('mic_chrome', '#d4d9de'), seg=SEG, minor_seg=4))
    # a slim on/off switch on the front of the handle
    yy = 0.035
    rr = next(r for r, h in reversed(hp) if h <= yy + 1e-9) if any(h <= yy for _, h in hp) else hp[0][0]
    parts.append(box('switch_plate', (0.009, 0.004, 0.024), (0, -(rr + 0.0015), yy), mat('mic_plate', '#26282c', rough=0.5), bevel=0.0012))
    parts.append(box('switch', (0.005, 0.003, 0.009), (0, -(rr + 0.0035), yy + 0.004), metal_mat('mic_chrome', '#d4d9de'), bevel=0.0008))
    return parts


def build_stick(name, s):
    BODY = metal_mat(f'{name}_body', s['body'], 0.35) if s.get('metal') else mat(f'{name}_body', s['body'], rough=0.55, metal=0.1)
    parts = handle_parts(s, BODY)
    top = s['handle'][-1][1]
    y0 = top
    R = s['headR']
    if s.get('band') and s['head'] != 'ball':
        bm = metal_mat(f'band{s["band"]}', s['band'], 0.25) if lum(s['band']) > 0.5 else mat(f'band{s["band"]}', s['band'], rough=0.35, metal=0.3)
        parts.append(lathe('band', [(R * 0.9, top), (R * 0.99, top + 0.001), (R * 0.99, top + 0.011), (R * 0.95, top + 0.012)], bm, segs=SEG))
        y0 = top + 0.012
    GR = mat(f'{name}_grille', s['grille'], rough=0.45, metal=0.3)
    FOAM = mat('mic_foam_dark', '#0b0b0d', rough=0.95)
    pat = s['pattern']

    if s['head'] == 'ball':
        cy = y0 + R * 0.78
        # the ball itself stays the game's (fine woven-mesh texture); the seam and collar come from here
        parts.append(torus('seam', R * 1.0, 0.0028, (0, 0, cy - R * 0.12), metal_mat('mic_bandc', s['band']), seg=32, minor_seg=6))
        parts.append(lathe('collar', [(R * 0.5, y0 - 0.002), (R * 0.62, y0), (R * 0.64, y0 + 0.008), (R * 0.55, y0 + 0.014)], metal_mat('mic_bandc', s['band']), segs=SEG))
        return parts

    if pat == 'slots':
        # outer barrel with two rows of long slots cut through, the grey mesh behind them
        bpy.ops.mesh.primitive_cylinder_add(radius=R, depth=s['headH'], location=(0, 0, y0 + s['headH'] / 2), vertices=36, end_fill_type='NOTHING')
        shell = bpy.context.active_object
        shell.name = 'shell'
        shell.data.materials.append(GR)
        for p in shell.data.polygons:
            p.use_smooth = True
        sol = shell.modifiers.new('solid', 'SOLIDIFY')
        sol.thickness = 0.0016
        sol.offset = -1
        bpy.context.view_layer.objects.active = shell
        bpy.ops.object.modifier_apply(modifier='solid')
        cutters = []
        for row in range(2):
            zc = y0 + 0.008 + row * 0.047 + 0.0185
            for i in range(12):
                a = (i + 0.5) / 12 * 2 * math.pi
                c = box(f'cut{row}_{i}', (0.0045, 0.02, 0.036), (math.cos(a) * R, math.sin(a) * R, zc), None, rot=(0, 0, a + math.pi / 2))
                cutters.append(c)
        cut = join(cutters, 'cutters')
        b = shell.modifiers.new('slots', 'BOOLEAN')
        b.operation = 'DIFFERENCE'
        b.object = cut
        b.solver = 'EXACT'
        bpy.context.view_layer.objects.active = shell
        bpy.ops.object.modifier_apply(modifier='slots')
        bpy.data.objects.remove(cut)
        parts.append(shell)
        inner = mat('mic_mesh_grey', '#9aa1a9', rough=0.5, metal=0.2, emission=0.15)
        parts.append(lathe('inner', [(0, y0 + 0.002), (R * 0.9, y0 + 0.002), (R * 0.9, y0 + s['headH'] - 0.001), (0, y0 + s['headH'] - 0.001)], inner, segs=SEG))
        top_y = y0 + s['headH']
        parts.append(wire(cyl('topmesh', R * 0.86, 0.001, (0, 0, top_y - 0.0005), inner, verts=12), 0.0012))
        parts.append(cyl('topfoam', R * 0.85, 0.001, (0, 0, top_y - 0.002), FOAM, verts=SEG))
        parts.append(torus('rim', R * 0.98, 0.0022, (0, 0, top_y), mat('mic_rim', '#2c2e33', rough=0.4, metal=0.4), seg=SEG, minor_seg=6))
        return parts

    if pat == 'ribs':
        H = s['headH']
        parts.append(lathe('core', [(0, y0), (R * 0.93, y0), (R * 0.93, y0 + H), (0, y0 + H)], FOAM, segs=SEG))
        n = 11
        for i in range(n):
            parts.append(torus(f'rib{i}', R * 0.95, 0.0017, (0, 0, y0 + 0.003 + i * (H - 0.006) / (n - 1)), GR, seg=SEG, minor_seg=4))
        for i in range(12):  # thin vertical struts holding the ribs
            a = i / 12 * 2 * math.pi
            parts.append(box(f'strut{i}', (0.0014, 0.0014, H), (math.cos(a) * R * 0.95, math.sin(a) * R * 0.95, y0 + H / 2), GR, rot=(0, 0, a)))
        top_y = y0 + H
        parts.append(wire(cyl('topmesh', R * 0.93, 0.001, (0, 0, top_y), GR, verts=12), 0.0013))
        parts.append(torus('rim', R * 0.97, 0.0024, (0, 0, top_y), mat('mic_rim', '#2c2e33', rough=0.4, metal=0.4), seg=SEG, minor_seg=6))
        return parts

    # domes: fine mesh (dark) or silver cage over red
    H = s['headH']
    if pat == 'cage':
        inner = mat('mic_red_mesh', s['inner'], rough=0.7, emission=0.25)
        parts.append(lathe('inner', dome_profile(R - 0.003, y0, H), inner, segs=SEG))
        cage = lathe('cage', dome_profile(R, y0 + 0.002, H - 0.002, rings=5), metal_mat('mic_cage', s['grille'], 0.22), segs=14)
        parts.append(wire(cage, 0.0019))
        parts.append(torus('cage_ring', R * 1.0, 0.0022, (0, 0, y0 + 0.004), metal_mat('mic_cage', s['grille'], 0.22), seg=SEG, minor_seg=6))
        parts.append(torus('cage_ring2', R * 1.0, 0.0018, (0, 0, y0 + H), metal_mat('mic_cage', s['grille'], 0.22), seg=SEG, minor_seg=6))
        return parts
    # fine mesh dome: the game keeps its own head (a woven-mesh texture reads better than wire at this size)
    return parts


def build_vintage(name, s):
    CH = metal_mat('vint_chrome', s['body'], 0.22)
    DARK = mat('vint_dark', '#202226', rough=0.5)
    GROOVE = mat('vint_groove', '#0e1014', rough=0.6)
    parts = [
        box('stem', (0.03, 0.026, 0.12), (0, 0, -0.005), CH, bevel=0.003),
        box('plate', (0.02, 0.004, 0.05), (0, -0.0145, -0.01), DARK, bevel=0.001),
        box('switch', (0.008, 0.004, 0.012), (0, -0.017, -0.022), CH, bevel=0.0012),
        box('foot', (0.034, 0.03, 0.01), (0, 0, -0.068), CH, bevel=0.003),
        box('bar', (0.116, 0.018, 0.008), (0, 0, 0.056), CH, bevel=0.002),
    ]
    for side in (-1, 1):
        parts.append(box(f'arm{side}', (0.006, 0.016, 0.07), (side * 0.055, 0, 0.09), CH, bevel=0.0015))
        parts.append(cyl(f'knob{side}', 0.011, 0.008, (side * 0.061, 0, 0.12), CH, rot=(0, math.radians(90), 0), verts=16, bevel=0.0015))
        parts.append(cyl(f'knobcap{side}', 0.006, 0.003, (side * 0.0665, 0, 0.12), DARK, rot=(0, math.radians(90), 0), verts=12))
    # the grooved capsule stays the game's (its painted chrome grooves read better); badge on its front
    R = s['headR']
    parts.append(cyl('badge', 0.009, 0.004, (0, -(R * 0.72 + 0.003), 0.155), CH, rot=(math.radians(90), 0, 0), verts=20, bevel=0.001))
    parts.append(cyl('badge_in', 0.006, 0.002, (0, -(R * 0.72 + 0.0052), 0.155), mat('vint_badge', '#b8902f', rough=0.35, metal=0.4), rot=(math.radians(90), 0, 0), verts=16))
    return parts


for name, s in STYLES.items():
    if only and name not in only.split(','):
        continue
    reset()
    parts = build_vintage(name, s) if s['head'] == 'vintage' else build_stick(name, s)
    join(parts, name)
    if preview_dir:
        os.makedirs(preview_dir, exist_ok=True)
        render_preview(os.path.join(preview_dir, f'{name}.png'), size=(500, 700), angle_deg=-25, elev_deg=15)
    export_glb(os.path.join(OUT, f'{name}.glb'), budget=6000)
