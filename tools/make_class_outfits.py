#!/usr/bin/env python3
"""Builds the five class outfits (streetwear idol style, one colour scheme per class) worn after the job change:
    public/models/class_<cls>_<m|f>.vrm.gz   cls = singer, guitarist, drummer, bassist, keyboardist

The game grafts the clothes and the body of these files onto the player's own model (like the school uniform), so the
player keeps their own face and hair. Each file is an existing model whose clothes are recoloured texel by texel:
the dark cloth, the light cloth and the coloured details each get a colour from the class scheme, and the folds and
seams painted in the texture keep their shading.
  boy:  VRoid Hub model 3425491812101364740 by siroihakumai (asymmetric techwear jacket, harness belts, boots)
  girl: AvatarSample_B by pixiv VRoid Project (cropped jacket, crop top, pleated skirt, thigh-high socks, sneakers)
Both licences allow modification and redistribution.

Usage: python3 tools/make_class_outfits.py   (run from the repo root)
"""
import os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from vrm_paint import Vrm  # noqa: E402

MODELS = 'public/models'


def hexrgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float)


# per class: dark cloth, light cloth, coloured details (and the accent the dark cloth gets in its trims)
SCHEMES = {
    'singer':      dict(dark='#1a1a20', light='#ff6fb5', vivid='#ff3d9a', pale='#ffd3ea'),   # pink / black
    'guitarist':   dict(dark='#1a1a1e', light='#d8222e', vivid='#ff2a36', pale='#f2d0d0'),   # red / black
    'drummer':     dict(dark='#181b22', light='#2f7bff', vivid='#29a8ff', pale='#cfe2ff'),   # blue / black
    'bassist':     dict(dark='#1b1822', light='#8e4dff', vivid='#b25bff', pale='#e4d4ff'),   # purple / black
    'keyboardist': dict(dark='#1d2742', light='#f4f6fb', vivid='#2f6bff', pale='#f4f6fb'),   # white / blue
}


def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def recolour(img, roles, sch, skin=False):
    """roles: which scheme colour each tone of this texture becomes: {'dark': key, 'light': key, 'vivid': key}.
    The colour is scaled by how bright the texel was relative to its tone, so painted folds survive."""
    a = np.array(img.convert('RGBA')).astype(float)
    rgb = a[..., :3] / 255
    mx, mn = rgb.max(-1), rgb.min(-1)
    L = 0.3 * rgb[..., 0] + 0.59 * rgb[..., 1] + 0.11 * rgb[..., 2]
    S = (mx - mn) / np.maximum(mx, 1e-3)
    w_viv = ss(0.28, 0.5, S) * ss(0.1, 0.22, mx)
    w_light = (1 - w_viv) * ss(0.32, 0.55, L)
    w_dark = 1 - w_viv - w_light
    out = np.zeros_like(rgb)
    for w, tone, ref in ((w_dark, 'dark', 0.16), (w_light, 'light', 0.8), (w_viv, 'vivid', 0.6)):
        col = hexrgb(sch[roles.get(tone, tone)]) / 255
        if tone == 'vivid':
            k = np.clip(mx / ref, 0.55, 1.2)
        elif tone == 'dark' and col.mean() > 0.5:  # dark cloth turned white: keep it white, folds as light grey
            k = np.clip(1.0 + (L - ref) * 0.8, 0.86, 1.05)
        elif tone == 'dark':
            k = np.clip(0.75 + (L - ref) * 1.6, 0.55, 1.5)
        else:
            k = np.clip(L / ref, 0.6, 1.12)
        out += w[..., None] * np.clip(col[None, None, :] * k[..., None], 0, 1)
    if skin:
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        isskin = (r > 0.32) & (r > g) & (g > b) & (r - b > 0.07) & (S < 0.55)
        out[isskin] = rgb[isskin]
    a[..., :3] = np.clip(out * 255, 0, 255)
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def paint(v, pat, roles, sch, skin=False):
    done = set()
    for _, _, mi in v.prims(pat):
        ii = v.image_of(mi)
        if ii is None or ii in done:
            continue
        done.add(ii)
        v.set_image(ii, recolour(v.load_image(ii), roles, sch, skin))


def build_boy(cls, sch, out):
    v = Vrm(f'{MODELS}/hub_3425491812101364740.vrm.gz')
    # the white jacket takes the class colour (white for the keyboardist), black parts stay black
    paint(v, 'Tops_01_CLOTH_01', {}, sch)
    paint(v, 'N00_007_01_Tops', {}, sch)
    paint(v, 'Tops_01_CLOTH_02', {}, sch)
    paint(v, 'Tops_01_CLOTH_03', {}, sch)
    paint(v, 'Onepiece', {'light': 'vivid'}, sch)
    paint(v, 'N00_001_02_Bottoms', {'light': 'dark'}, sch)  # the white leg panels: black trousers
    paint(v, 'N00_003_01_Bottoms', {'light': 'vivid'}, sch)
    paint(v, 'Shoes', {'light': 'pale'}, sch)
    paint(v, 'Body_00_SKIN', {'light': 'pale'}, sch, skin=True)
    n = v.save(out, drawn='CLOTH|Body_00_SKIN')
    print(out, f'{n / 1e6:.1f} MB')


def build_girl(cls, sch, out):
    v = Vrm(f'{MODELS}/avatar_b.vrm.gz')
    # cropped jacket: black body, class-coloured sleeves (the keyboardist's is white with blue sleeves)
    paint(v, 'Tops', {'dark': 'light', 'vivid': 'light', 'light': 'vivid'} if cls == 'keyboardist' else {}, sch)
    paint(v, 'Bottoms', {'light': 'dark', 'vivid': 'vivid'}, sch)
    paint(v, 'Shoes', {'light': 'pale'}, sch)
    paint(v, 'Body_00_SKIN', {'light': 'pale'}, sch, skin=True)
    n = v.save(out, drawn='CLOTH|Body_00_SKIN')
    print(out, f'{n / 1e6:.1f} MB')


if __name__ == '__main__':
    only = sys.argv[1:]
    for cls, sch in SCHEMES.items():
        if only and cls not in only:
            continue
        build_boy(cls, sch, f'{MODELS}/class_{cls}_m.vrm.gz')
        build_girl(cls, sch, f'{MODELS}/class_{cls}_f.vrm.gz')
