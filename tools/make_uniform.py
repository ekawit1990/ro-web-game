#!/usr/bin/env python3
"""Builds the Teen school uniforms worn by every new character:
    public/models/uniform_m.vrm.gz  white short-sleeved shirt, navy tie and cuffs, dark trousers
    public/models/uniform_f.vrm.gz  white sailor blouse with short sleeves, navy sailor collar and tie, navy skirt

The game grafts the clothes and the body of these files onto the player's own model (like an outfit), so the
player keeps their own face and hair.

VRoid exports delete the body under long sleeves, so the base models are ones whose arms are complete:
  boy:  AvatarSample_C (pixiv VRoid Project; modification and redistribution allowed), jacket removed, a new shirt
        shell made from its own body and painted here, gloves painted off, trousers recoloured
  girl: VRoid Hub model 4782566278761081075 "26" by siroihakumai (sailor collar, tie, skirt and loafers), with the
        complete body of 4360835510799003378 by the same author (same skeleton, 3 cm lower), a new blouse shell
        painted here; both licences allow modification and redistribution

Usage: python3 tools/make_uniform.py   (run from the repo root)
"""
import os, sys
import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
from vrm_paint import Vrm  # noqa: E402

MODELS = 'public/models'
SIZE = (1024, 1024)  # shirt / blouse texture
WHITE = np.array([248, 249, 252], float)
NAVY = np.array([30, 38, 76], float)
TIE = np.array([26, 30, 58], float)
LINE = np.array([186, 192, 204], float)  # seams and collar edges on the white cloth


def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def to_image(rgb, alpha):
    a = (np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    img = np.dstack([np.clip(rgb, 0, 255).astype(np.uint8), a])
    return Image.fromarray(img, 'RGBA')


def bleed(img, steps=6):
    """Spreads the colour of opaque texels into the transparent ones round them, so filtering at the cut edges
    (and on mip levels) doesn't pull in black."""
    rgba = np.array(img).astype(float)
    a = rgba[..., 3] > 0
    rgb = rgba[..., :3].copy()
    filled = a.copy()
    for _ in range(steps):
        acc = np.zeros_like(rgb)
        cnt = np.zeros(a.shape)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            sh = np.roll(np.roll(filled, dy, 0), dx, 1)
            acc += np.roll(np.roll(rgb, dy, 0), dx, 1) * sh[..., None]
            cnt += sh
        grow = ~filled & (cnt > 0)
        rgb[grow] = acc[grow] / cnt[grow][:, None]
        filled |= grow
    rgba[..., :3] = rgb
    return Image.fromarray(rgba.clip(0, 255).astype(np.uint8), 'RGBA')


def body_vertices(v, pat='Body_00_SKIN'):
    ni, pr, mi = v.prims(pat)[0]
    data = v.raw_prim(pr)
    P, N, S, B = v.body_coords(ni, data['POSITION'].astype(float), data['NORMAL'].astype(float), data['JOINTS_0'], data['WEIGHTS_0'].astype(float))
    return ni, mi, data, P, S, B


def top_of(v, pat):
    ni, pr, mi = v.prims(pat)[0]
    d = v.raw_prim(pr)
    P = v.body_coords(ni, d['POSITION'].astype(float), d['NORMAL'].astype(float), d['JOINTS_0'], d['WEIGHTS_0'].astype(float))[0]
    return P[np.unique(d['tris'].ravel()), 1].max()


# ------------------------------------------------------------------------------------------------ shirt painting

def cloth(t, v, cut, hem, cuff, stripe=False):
    """White top with short sleeves ending at arm parameter `cut`, a navy cuff band `cuff` wide (arm units) and the
    hem at height `hem`. Returns rgb, alpha and the neck geometry for further decoration."""
    P, N, S, mask = t['P'], t['N'], t['S'], t['mask']
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    neck = v.bone('neck')
    ang = np.arctan2(x, z - neck[2])  # 0 = straight ahead of the neck
    front = np.cos(ang)
    # neckline: just under the throat at the front, up the neck a little at the back
    top = neck[1] + 0.004 + 0.03 * (1 - front) / 2
    alpha = mask & (y < top) & (y > hem) & (S < cut)
    rgb = np.empty(P.shape)
    rgb[...] = WHITE
    # soft folds: a little grey under the arms and down the sides of the body
    side = np.abs(x) / np.maximum(0.05, np.abs(x).max())
    rgb *= (1 - 0.05 * ss(0.55, 1.0, side) * (S < 0.1))[..., None]
    # sleeve: a seam where it is sewn on, and the cuff band
    seam = (np.abs(S - 0.06) < 0.01) & (S > 0)
    rgb[seam] = LINE
    band = (S > cut - cuff) & (S <= cut)
    rgb[band] = NAVY
    if stripe:
        mid = band & (np.abs(S - (cut - cuff * 0.5)) < cuff * 0.12)
        rgb[mid] = WHITE
    # a line round the hem and the cut edges reads as a turned-up hem
    rim = (np.abs(S - cut) < 0.006) | (np.abs(y - hem) < 0.0025)
    rgb[rim & ~band] = LINE
    return rgb, alpha.astype(float), dict(top=top, front=front, ang=ang, neck=neck)


def near_segments(px, py, pts, w):
    """Within `w` of the polyline through pts."""
    out = np.zeros(px.shape, bool)
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        dx, dy = x1 - x0, y1 - y0
        L2 = dx * dx + dy * dy
        tt = np.clip(((px - x0) * dx + (py - y0) * dy) / L2, 0, 1)
        d = np.hypot(px - (x0 + tt * dx), py - (y0 + tt * dy))
        out |= d < w
    return out


def paint_boy_shirt(t, v, belt):
    cut, cuff = 0.6, 0.075
    hem = belt - 0.05
    rgb, alpha, g = cloth(t, v, cut, hem, cuff)
    P, N = t['P'], t['N']
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    neck = g['neck']
    facing = (N[..., 2] > 0.15) & (z > neck[2])
    k0 = neck[1] + 0.002  # knot top, at the front of the collar
    # collar points either side of the knot, outlined
    for sgn in (1, -1):
        pts = [(sgn * 0.012, k0 + 0.004), (sgn * 0.058, k0 - 0.058), (sgn * 0.014, k0 - 0.036)]
        edge = near_segments(x, y, pts, 0.0022) & facing
        rgb[edge] = LINE
        # under the collar point a faint shadow
        shadow = facing & near_segments(x, y, [pts[1], pts[2]], 0.006) & ~edge & (y < k0 - 0.03)
        rgb[shadow] *= 0.96
    # collar band round the back and sides: its fold line
    fold = (np.abs(y - (g['top'] - 0.03)) < 0.0022) & (g['front'] < 0.55) & (np.abs(x) < 0.09)
    rgb[fold] = LINE
    # back yoke seam
    yoke = (np.abs(y - (neck[1] - 0.085)) < 0.0018) & (z < neck[2]) & (np.abs(x) < 0.16)
    rgb[yoke] = LINE
    # breast pocket on the left side of the chest
    cy = v.bone('upperChest')[1] - 0.005
    px0, px1, py0, py1 = 0.035, 0.088, cy - 0.06, cy - 0.005
    box = facing & (x > px0) & (x < px1) & (y > py0) & (y < py1)
    edge = box & ((x < px0 + 0.002) | (x > px1 - 0.002) | (y < py0 + 0.002) | (np.abs(y - (py1 - 0.008)) < 0.0015))
    rgb[edge] = LINE
    # tie: knot, then a blade that widens down to a point just above the belt
    k1 = k0 - 0.03
    tip = belt + 0.012
    hw = np.where(y > k1, 0.0135 - (k0 - y) / 0.03 * 0.0045,
                  np.where(y > tip + 0.028, 0.0095 + (k1 - y) / max(1e-3, k1 - tip - 0.028) * 0.0115,
                           0.021 * np.clip((y - tip) / 0.028, 0, 1)))
    tie = facing & (y < k0) & (y > tip) & (np.abs(x) < hw)
    rgb[tie] = TIE
    knot = tie & (y > k1)
    rgb[knot] = TIE * 1.18
    outline = tie & ((np.abs(x) > hw - 0.0018) | (np.abs(y - k1) < 0.0015))
    rgb[outline] = TIE * 0.6
    # a soft stripe down the blade, like a woven tie
    sheen = tie & ~knot & (np.abs(x + (y - k1) * 0.15) < 0.003)
    rgb[sheen] = TIE * 1.25
    alpha[tie] = 1
    return to_image(rgb, alpha)


def paint_girl_blouse(t, v, skirt_top):
    cut, cuff = 0.5, 0.11
    hem = skirt_top - 0.07
    rgb, alpha, g = cloth(t, v, cut, hem, cuff, stripe=True)
    P = t['P']
    y, z = P[..., 1], P[..., 2]
    neck = g['neck']
    yoke = (np.abs(y - (neck[1] - 0.11)) < 0.0018) & (z < neck[2]) & (t['S'] < 0.02)
    rgb[yoke] = LINE
    return to_image(rgb, alpha)


# ------------------------------------------------------------------------------------------------ body edits

def skin_tone(img, t, lo=1.15, hi=1.6):
    a = np.array(img).astype(float)
    sel = t['mask'] & (t['S'] > lo) & (t['S'] < hi) & (a[..., 3] > 200)
    return np.median(a[sel][:, :3], axis=0)


def remove_gloves(img, t):
    """Paints skin over gloves: dark texels on the hands and wrists."""
    a = np.array(img).astype(float)
    skin = skin_tone(img, t)
    L = a[..., :3].mean(-1)
    hand = t['mask'] & (t['S'] > 1.7) & (L < skin.mean() * 0.8)
    a[hand, :3] = skin
    a[hand, 3] = 255
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA')


def knee_socks(img, t, v):
    a = np.array(img).astype(float)
    knee = v.bone('leftLowerLeg')[1]
    y = t['P'][..., 1]
    leg = t['mask'] & (y < knee - 0.035)
    sock = np.array([40, 44, 66], float)
    a[leg, :3] = sock * (0.92 + 0.08 * ((y[leg] - 0.1) / max(0.1, knee)))[:, None]
    band = leg & (y > knee - 0.065)
    a[band, :3] = sock * 0.8
    a[leg, 3] = 255
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA')


def recolour(img, tone, contrast=0.35, keep_bright=False):
    """Recolours a texture to `tone`, keeping a little of its shading (seams, folds)."""
    a = np.array(img).astype(float)
    L = a[..., :3].mean(-1) / 255
    m = np.median(L[a[..., 3] > 128]) if (a[..., 3] > 128).any() else 0.5
    k = 1 + (L - m) * contrast * 2
    out = np.asarray(tone, float)[None, None, :] * k[..., None]
    if keep_bright:
        bright = L > m + 0.35
        out[bright] = a[bright, :3]
    a[..., :3] = out
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA')


def plain_skirt(img):
    """Paints the white hem stripes of the skirt over in the navy round them."""
    a = np.array(img.convert('RGBA')).astype(float)
    L = a[..., :3].mean(-1)
    navy = np.median(a[L < 90][:, :3], axis=0)
    stripe = L > 110
    grown = stripe.copy()
    for dy in (-2, -1, 1, 2):
        grown |= np.roll(stripe, dy, 0)
    a[grown, :3] = navy * (0.95 + 0.1 * np.random.default_rng(1).random((grown.sum(), 1)))
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA')


def body_texture(v, mi):
    tex = v.js['materials'][mi]['pbrMetallicRoughness']['baseColorTexture']['index']
    return tex, v.js['textures'][tex]['source']


# ------------------------------------------------------------------------------------------------ the two uniforms

def shell_offset(P, S, neck, body, sleeve):
    """How far the cloth stands off the skin: a little looser on the sleeves, snug round the neck; smooth, so the
    shell has no steps."""
    off = body + (sleeve - body) * ss(0.0, 0.25, S)
    return off - (off - 0.005) * ss(neck[1] - 0.05, neck[1] - 0.01, P[:, 1])


def rim_graph(pos, tris):
    """Welded vertex ids (copies split along UV seams share one) and the open edges, as sorted id pairs."""
    key = np.round(pos * 1e5).astype(np.int64)
    _, w = np.unique(key, axis=0, return_inverse=True)
    w = w.reshape(-1)
    T = w[tris]
    edges = np.sort(np.r_[T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]], axis=1)
    uniq, cnt = np.unique(edges, axis=0, return_counts=True)
    return w, uniq[cnt == 1]


def boundary_loops(pos, tris):
    """The open rims of a mesh: the vertex indices (one per welded position) of each connected rim, unordered."""
    from collections import defaultdict
    w, bnd = rim_graph(pos, tris)
    rep = np.zeros(w.max() + 1, np.int64)
    rep[w[::-1]] = np.arange(len(w))[::-1]
    adj = defaultdict(list)
    for a, b in bnd:
        adj[a].append(b)
        adj[b].append(a)
    loops, seen = [], set()
    for s0 in adj:
        if s0 in seen:
            continue
        comp, stack = [], [s0]
        while stack:
            x = stack.pop()
            if x in seen:
                continue
            seen.add(x)
            comp.append(x)
            stack.extend(adj[x])
        loops.append(rep[np.array(comp)])
    return loops


def white_spot(img, r=24):
    """UV of a texel deep inside a plain white stretch of the painted cloth (r texels from anything else)."""
    a = np.array(img).astype(float)
    ok = (np.abs(a[..., :3] - WHITE).max(-1) < 12) & (a[..., 3] > 250)
    for _ in range(r):
        ok = ok & np.roll(ok, 1, 0) & np.roll(ok, -1, 0) & np.roll(ok, 1, 1) & np.roll(ok, -1, 1)
    ys, xs = np.nonzero(ok)
    assert len(ys), 'no plain white area on the cloth'
    k = len(ys) // 2
    H, W = ok.shape
    return np.array([(xs[k] + 0.5) / W, (ys[k] + 0.5) / H], np.float32)


def zip_rings(ia, ta, ib, tb):
    """Triangles joining two closed rings of vertices sorted by angle round a common axis."""
    n, m = len(ia), len(ib)
    ta2, tb2 = np.r_[ta, ta[0] + 2 * np.pi], np.r_[tb, tb[0] + 2 * np.pi]
    out, i, j = [], 0, 0
    while i < n or j < m:
        if j >= m or (i < n and ta2[i + 1] <= tb2[j + 1]):
            out.append((ia[i % n], ia[(i + 1) % n], ib[j % m]))
            i += 1
        else:
            out.append((ia[i % n], ib[(j + 1) % m], ib[j % m]))
            j += 1
    return out


def fill_shoulders(v, data, P, tris, off, uv, rings=4, K=28):
    """AvatarSample_C has no skin over the shoulder caps (its jacket hid them, so VRoid cut them away), so the shirt
    shell would have a hole there. Each armhole on the torso is bridged to the open top of the upper arm with a
    tube that leaves both surfaces smoothly, skinned by blending the two rims' weights and coloured plain white."""
    pos = data['POSITION'].astype(float)
    nor = data['NORMAL'].astype(float)
    nor /= np.maximum(1e-9, np.linalg.norm(nor, axis=1))[:, None]
    J = int(data['JOINTS_0'].max()) + 1
    dense = np.zeros((len(pos), J))
    np.add.at(dense, (np.repeat(np.arange(len(pos)), 4), data['JOINTS_0'].astype(np.int64).ravel()),
              data['WEIGHTS_0'].astype(float).ravel())
    loops = boundary_loops(pos, data['tris'])
    new = {k: [] for k in ('POSITION', 'NORMAL', 'W', 'off')}
    new_tris = []
    base = len(pos)

    def add(p, n, w, o):
        new['POSITION'].append(p)
        new['NORMAL'].append(n)
        new['W'].append(w)
        new['off'].append(o)
        return base + len(new['POSITION']) - 1

    for side in ('left', 'right'):
        sh, el = v.bone(f'{side}UpperArm'), v.bone(f'{side}LowerArm')
        axis = (el - sh) / np.linalg.norm(el - sh)
        hole = ring = None
        for lp in loops:
            c = P[lp].mean(0)
            if np.sign(c[0]) != np.sign(sh[0]) or len(lp) < 8:
                continue
            t = (c - sh) @ axis / np.linalg.norm(el - sh)
            radial = np.linalg.norm((c - sh) - axis * ((c - sh) @ axis))
            if np.linalg.norm(c - sh) < 0.1 and t < 0.15:
                hole = lp
            elif 0.15 < t < 0.9 and radial < 0.03:
                ring = lp
        if hole is None or ring is None:
            print(side, 'shoulder: nothing to fill')
            continue
        # the arm's own axis, in the file's coordinates: the open ring's normal
        c1 = pos[ring].mean(0)
        a = np.linalg.svd(pos[ring] - c1)[2][2]
        if a @ (c1 - pos[hole].mean(0)) < 0:
            a = -a
        u = np.array([0.0, 1.0, 0.0]) - a * a[1]
        u /= np.linalg.norm(u)
        w = np.cross(a, u)
        centre = {}

        def ang(ix, c=None):
            d = pos[ix] - (centre[id(ix)] if c is None else c)
            return np.arctan2(d @ w, d @ u)

        def clean(ix, c, t_):
            # every pair of neighbours by angle round the axis is an open edge: the rim is one simple loop that
            # goes round the axis once, so it can be zipped to a ring
            wid, bnd = rim_graph(pos, t_)
            edges = {tuple(e) for e in bnd}
            o = ix[np.argsort(ang(ix, c))]
            return all(tuple(sorted((wid[o[k]], wid[o[(k + 1) % len(o)]]))) in edges for k in range(len(o)))

        # VRoid cut the hole along jagged triangle edges: cut the shirt back a little further round it until the
        # rim is clean
        c0 = pos[hole].mean(0)
        cand = np.unique(tris.ravel())
        dist = np.sqrt(((pos[cand][:, None, :] - pos[hole][None]) ** 2).sum(-1)).min(1)
        for r in (0.0, 0.01, 0.015, 0.02, 0.025, 0.03, 0.035, 0.04, 0.05):
            near = np.zeros(len(pos), bool)
            near[cand[dist < r]] = True
            t2 = tris[~near[tris].any(1)]
            grown = min((lp for lp in boundary_loops(pos, t2) if len(lp) >= 8),
                        key=lambda lp: np.linalg.norm(pos[lp].mean(0) - c0))
            if clean(grown, pos[grown].mean(0), t2):
                break
        else:
            print(side, 'shoulder: no clean rim round the hole')
            continue
        print(side, f'shoulder: shirt cut back {r * 100:.1f} cm round the hole')
        tris, hole = t2, grown
        centre[id(hole)] = pos[hole].mean(0)
        centre[id(ring)] = c1
        assert clean(ring, c1, tris)

        def resample(ix, th):
            t0 = ang(ix)
            o = np.argsort(t0)
            f = lambda vals: np.stack([np.interp(th, t0[o], vals[o][:, k], period=2 * np.pi) for k in range(vals.shape[1])], 1)
            return f(pos[ix]), f(nor[ix]), f(dense[ix]), np.interp(th, t0[o], off[ix][o], period=2 * np.pi)

        # rims: copies of the shell's own rim vertices (same place, so the shell welds to them), plus rings between
        rim = []
        for ix in (hole, ring):
            th = ang(ix)
            o = np.argsort(th)
            rim.append(([add(pos[i], nor[i], dense[i], off[i]) for i in ix[o]], th[o]))
        th = np.linspace(-np.pi, np.pi, K, endpoint=False)
        p0, n0, w0, o0 = resample(hole, th)
        p1, n1, w1, o1 = resample(ring, th)
        d = p1 - p0
        L = np.linalg.norm(d, axis=1)[:, None]
        m0 = d - n0 * (n0 * d).sum(1)[:, None]
        m0 = m0 / np.maximum(1e-9, np.linalg.norm(m0, axis=1))[:, None] * L
        m1 = a[None, :] * L
        ts = np.linspace(0, 1, rings + 2)
        grid = []
        for t in ts:
            h00, h10, h01, h11 = 2 * t**3 - 3 * t**2 + 1, t**3 - 2 * t**2 + t, -2 * t**3 + 3 * t**2, t**3 - t**2
            grid.append(h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1)
        layers = [rim[0]]
        for r in range(1, rings + 1):
            t = ts[r]
            dt = grid[r + 1] - grid[r - 1]
            dth = np.roll(grid[r], -1, 0) - np.roll(grid[r], 1, 0)
            n = np.cross(dth, dt)
            ref = (1 - t) * n0 + t * n1
            n *= np.sign((n * ref).sum(1))[:, None]
            n /= np.maximum(1e-9, np.linalg.norm(n, axis=1))[:, None]
            wt = (1 - t) * w0 + t * w1
            layers.append(([add(grid[r][k], n[k], wt[k], (1 - t) * o0[k] + t * o1[k]) for k in range(K)], th))
        layers.append(rim[1])
        for (ia, ta), (ib, tb) in zip(layers, layers[1:]):
            new_tris += zip_rings(ia, ta, ib, tb)
        print(side, 'shoulder filled:', len(hole), '+', len(ring), 'rim vertices')

    if not new_tris:
        return data, tris, off
    W = np.array(new['W'])
    top = np.argsort(-W, axis=1)[:, :4]
    tw = np.take_along_axis(W, top, 1)
    tw /= tw.sum(1)[:, None]
    allpos = np.r_[pos, np.array(new['POSITION'])]
    T = np.array(new_tris, np.int64)
    # face the new triangles outwards (the side their vertex normals point to)
    alln = np.r_[nor, np.array(new['NORMAL'])]
    fn = np.cross(allpos[T[:, 1]] - allpos[T[:, 0]], allpos[T[:, 2]] - allpos[T[:, 0]])
    flip = (fn * alln[T].sum(1)).sum(1) < 0
    T[flip] = T[flip][:, ::-1]
    out = dict(data)
    out['POSITION'] = allpos.astype(np.float32)
    out['NORMAL'] = alln.astype(np.float32)
    out['TEXCOORD_0'] = np.r_[data['TEXCOORD_0'], np.repeat(uv[None], len(W), 0)].astype(np.float32)
    out['JOINTS_0'] = np.r_[data['JOINTS_0'], top.astype(data['JOINTS_0'].dtype)]
    out['WEIGHTS_0'] = np.r_[data['WEIGHTS_0'].astype(np.float32), tw.astype(np.float32)]
    return out, np.r_[tris, T], np.r_[off, np.array(new['off'])]


def build_boy(out):
    v = Vrm(f'{MODELS}/avatar_c.vrm.gz')
    ni, mi, data, P, S, B = body_vertices(v)
    belt = top_of(v, 'Bottoms')
    neck = v.bone('neck')
    keep = (P[:, 1] > belt - 0.09) & (P[:, 1] < neck[1] + 0.05) & (S < 0.85) & (B != 'head')
    tris = data['tris'][keep[data['tris']].all(1)]
    off = shell_offset(P, S, neck, 0.008, 0.011)
    t = v.texels('Body_00_SKIN', size=SIZE)
    shirt = bleed(paint_boy_shirt(t, v, belt))
    data, tris, off = fill_shoulders(v, data, P, tris, off, white_spot(shirt))
    tex0, img0 = body_texture(v, mi)
    tex = v.add_texture(shirt, 'uniform_shirt', like_texture=tex0)
    mat = v.clone_material(mi, 'N00_900_00_Shirt_00_CLOTH', tex)
    v.add_prim(ni, data, tris, mat, off)
    v.drop('Tops_01_CLOTH')
    # hands without the fingerless gloves
    tb = v.texels('Body_00_SKIN')
    v.set_image(img0, remove_gloves(v.load_image(img0), tb))
    # school trousers: plain dark navy grey
    _, bimg = body_texture(v, v.prims('Bottoms')[0][2])
    v.set_image(bimg, recolour(v.load_image(bimg), (44, 48, 66), contrast=0.45))
    # loafers rather than boots: dark brown-black
    _, simg = body_texture(v, v.prims('Shoes')[0][2])
    v.set_image(simg, recolour(v.load_image(simg), (40, 30, 26), contrast=0.6))
    n = v.save(out, drawn='CLOTH|Body_00_SKIN')
    print(out, f'{n / 1e6:.1f} MB')


def build_girl(out):
    v = Vrm(f'{MODELS}/hub_4782566278761081075.vrm.gz')
    src = Vrm(f'{MODELS}/hub_4360835510799003378.vrm.gz')
    dni, dpr, dmi = v.prims('Body_00_SKIN')[0]
    sni, spr, smi = src.prims('Body_00_SKIN')[0]
    data = src.raw_prim(spr)
    # the source body's joints -> this model's body skin, by bone name
    sskin = src.js['skins'][src.js['nodes'][sni]['skin']]['joints']
    dskin = v.js['skins'][v.js['nodes'][dni]['skin']]['joints']
    dname = {n.get('name'): i for i, n in enumerate(v.js['nodes'])}

    def to_dst(node):
        # bones this model lacks (the source's hair) carry no body weight: use the nearest bone it has
        while src.js['nodes'][node].get('name') not in dname or dname[src.js['nodes'][node]['name']] not in dskin:
            node = src.parent[node]
        return dskin.index(dname[src.js['nodes'][node]['name']])

    remap = np.array([to_dst(node) for node in sskin])
    data['JOINTS_0'] = remap[data['JOINTS_0']].astype(np.uint16)
    assert np.allclose(src.mat[sni], np.eye(4)) and np.allclose(v.mat[dni], np.eye(4))
    delta = v.bone('hips') - src.bone('hips')  # facing +Z; the file is VRM 0.x (x and z mirrored)
    raw = np.array([-delta[0], delta[1], -delta[2]])
    data['POSITION'] = (data['POSITION'].astype(float) + raw).astype(np.float32)
    P, N, S, B = src.body_coords(sni, data['POSITION'].astype(float) - raw, data['NORMAL'].astype(float), src.accessor(spr['attributes']['JOINTS_0']), data['WEIGHTS_0'].astype(float))

    # body: knee socks
    tb = src.texels('Body_00_SKIN')
    _, simg0 = body_texture(src, smi)
    body = knee_socks(src.load_image(simg0), tb, src)
    dtex0, _ = body_texture(v, dmi)
    btex = v.add_texture(body, 'uniform_body', like_texture=dtex0)
    bmat = v.clone_material(dmi, 'N00_000_00_Body_00_SKIN_U', btex)
    v.drop('N00_000_00_Body_00_SKIN (Instance)')
    v.add_prim(dni, data, data['tris'], bmat)

    # blouse shell over the new body
    skirt_top = top_of(v, 'Bottoms') - delta[1]  # in the source body's heights
    neck = src.bone('neck')
    keep = (P[:, 1] > skirt_top - 0.12) & (P[:, 1] < neck[1] + 0.05) & (S < 0.75) & (B != 'head')
    tris = data['tris'][keep[data['tris']].all(1)]
    off = shell_offset(P, S, neck, 0.009, 0.012)
    t = src.texels('Body_00_SKIN', size=SIZE)
    blouse = bleed(paint_girl_blouse(t, src, skirt_top))
    tex = v.add_texture(blouse, 'uniform_blouse', like_texture=dtex0)
    mat = v.clone_material(dmi, 'N00_900_00_Blouse_00_CLOTH', tex)
    v.add_prim(dni, data, tris, mat, off)

    # the cardigan and its inner layer go; the sailor collar and tie stay
    v.drop('Tops_01_CLOTH_01')
    v.drop('Tops_01_CLOTH_02')
    _, kimg = body_texture(v, v.prims('Bottoms')[0][2])
    v.set_image(kimg, plain_skirt(v.load_image(kimg)))
    n = v.save(out, drawn='CLOTH|Body_00_SKIN')
    print(out, f'{n / 1e6:.1f} MB')


if __name__ == '__main__':
    build_boy(f'{MODELS}/uniform_m.vrm.gz')
    build_girl(f'{MODELS}/uniform_f.vrm.gz')
