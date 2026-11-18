#!/usr/bin/env python3
"""Builds the tiger costumes dropped by ราชาเสือโคร่ง (2026-11-18):
    public/models/tiger_outfit_m.vrm.gz   ชุดคอสตูมพยัคฆ์ (ชาย): striped jacket, black trousers with gold, striped shoes
    public/models/tiger_outfit_f.vrm.gz   ชุดคอสตูมพยัคฆ์ (หญิง): striped cropped jacket, striped pleated skirt, black socks

Same base models and texel recolouring as tools/make_class_outfits.py (the game grafts the clothes onto the player's
own body, keeping their face and hair). On top of the orange, black tiger stripes are painted where each texel sits
on the body (vrm_paint.texels: its rest-pose position, and how far along the arm it is), so the stripes run round the
body and down the arms across the texture's UV islands instead of following its layout. Stripes are fattest at the
sides and thin out towards the front and back, like a real tiger's.

Usage: python3 tools/make_tiger_outfits.py   (run from the repo root)
"""
import os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from vrm_paint import Vrm  # noqa: E402
from make_class_outfits import MODELS, hexrgb, recolour, ss  # noqa: E402

# dark cloth, orange fur (light), gold trims (vivid), cream (pale)
SCH = dict(dark='#17120f', light='#f08a1c', vivid='#e8b84a', pale='#fff1dc')
STRIPE = hexrgb('#120c08') / 255


def stripes(t):
    """0..1 stripe strength per texel of a texels() result."""
    P, S = t['P'], t['S']
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    theta = np.arctan2(x, z)  # 0 = front, ±pi = back
    arm = S > 0.15
    # bands round the body (by height) and round the arms (by how far along), wobbling like brush strokes
    phase = np.where(arm, S * 2.6 + 0.12 * np.sin(theta * 2 + S * 3),
                     y * 8.5 + 0.18 * np.sin(theta * 3 + y * 5) + 0.1 * np.sin(theta * 7))
    s = 0.5 + 0.5 * np.sin(2 * np.pi * phase)
    # wide at the sides, thin (and broken) at the front and back
    side = np.abs(np.sin(theta))
    width = np.where(arm, 0.32 + 0.1 * np.sin(theta * 2), 0.12 + 0.3 * side)
    w = ss(1 - width, 1 - width + 0.07, s)
    return np.where(t['mask'], w, 0.0)


def tigerize(v, pat, roles, where=None, skin=False, other=None):
    """Recolours the texture of material `pat` (roles as in make_class_outfits) and paints stripes on the orange.
    `where(t)` limits the tiger to some texels (the rest get the `other` roles)."""
    prims = v.prims(pat)
    ii = v.image_of(prims[0][2])
    t = v.texels(pat)
    img = v.load_image(ii)
    a = np.array(recolour(img, roles, SCH, skin)).astype(float) / 255
    if other is not None:
        b = np.array(recolour(img, other, SCH, skin)).astype(float) / 255
        keep = where(t) if where else np.ones(a.shape[:2], bool)
        a = np.where(keep[..., None], a, b)
    rgb = a[..., :3]
    # stripes only on the orange fur (warm, saturated), keeping its folds' shading
    r, g, bl = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    orange = ss(0.25, 0.4, r - bl) * ss(0.05, 0.15, r - g)
    w = stripes(t) * orange
    if where:
        w = w * where(t)
    shade = np.clip(rgb.max(-1) / 0.94, 0.5, 1.1)[..., None]
    rgb = rgb * (1 - w[..., None]) + (STRIPE[None, None, :] * shade) * w[..., None]
    a[..., :3] = rgb
    v.set_image(ii, Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8), 'RGBA'))


def build_boy(out):
    v = Vrm(f'{MODELS}/hub_3425491812101364740.vrm.gz')
    tigerize(v, 'Tops_01_CLOTH_01', {})  # the jacket: orange fur, its black parts stay black, gold details
    tigerize(v, 'N00_007_01_Tops', {})
    tigerize(v, 'Tops_01_CLOTH_02', {'light': 'dark'})
    tigerize(v, 'Tops_01_CLOTH_03', {'light': 'vivid'})
    tigerize(v, 'Onepiece', {'light': 'vivid'})
    tigerize(v, 'N00_001_02_Bottoms', {'light': 'dark', 'vivid': 'light'})  # black trousers, orange piping
    tigerize(v, 'N00_003_01_Bottoms', {'light': 'vivid'})
    tigerize(v, 'Shoes', {})
    tigerize(v, 'Body_00_SKIN', {'light': 'pale'}, skin=True)
    n = v.save(out, drawn='CLOTH|Body_00_SKIN')
    print(out, f'{n / 1e6:.1f} MB')


def build_girl(out):
    v = Vrm(f'{MODELS}/avatar_b.vrm.gz')
    # cropped jacket in tiger fur with gold trims; the crop top under it cream
    tigerize(v, 'Tops', {'dark': 'light', 'vivid': 'vivid', 'light': 'pale'})
    # the pleated skirt (above the knees) in tiger fur, the socks below black
    tigerize(v, 'Bottoms', {'dark': 'light', 'light': 'light', 'vivid': 'vivid'},
             where=lambda t: t['P'][..., 1] > 0.6, other={'light': 'dark', 'vivid': 'vivid'})
    tigerize(v, 'Shoes', {'light': 'pale'})
    tigerize(v, 'Body_00_SKIN', {'light': 'pale'}, skin=True)
    n = v.save(out, drawn='CLOTH|Body_00_SKIN')
    print(out, f'{n / 1e6:.1f} MB')


if __name__ == '__main__':
    build_boy(f'{MODELS}/tiger_outfit_m.vrm.gz')
    build_girl(f'{MODELS}/tiger_outfit_f.vrm.gz')
