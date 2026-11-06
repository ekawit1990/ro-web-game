"""Read a VRoid .vrm(.gz), find where every texel of a material lies on the body, repaint it, and write the model back.

VRoid clothes are fixed template meshes whose look comes from the texture (short sleeves, hems and collars are
painted, the rest is transparent), so a new garment can be painted onto an existing model's clothing layers.
`texels()` rasterises a material's triangles in UV space and returns, per texel, the rest-pose (T-pose) position
on the body, facing +Z, plus how far along the arm it is (0 = shoulder joint, 1 = elbow, 2 = wrist).
"""
import copy, gzip, io, json, struct
import numpy as np
from PIL import Image

COMP = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


class Vrm:
    def __init__(self, path):
        data = open(path, 'rb').read()
        if data[:2] == b'\x1f\x8b':
            data = gzip.decompress(data)
        jl = struct.unpack_from('<I', data, 12)[0]
        self.js = json.loads(data[20:20 + jl])
        bl = struct.unpack_from('<I', data, 20 + jl)[0]
        self.bin = data[28 + jl:28 + jl + bl]
        ext = self.js.get('extensions', {})
        self.v0 = 'VRM' in ext
        if self.v0:
            self.human = {b['bone']: b['node'] for b in ext['VRM']['humanoid']['humanBones']}
        else:
            self.human = {k: v['node'] for k, v in ext['VRMC_vrm']['humanoid']['humanBones'].items()}
        self._world()
        self.images = {}  # image index -> new PIL image
        self.newviews = {}  # bufferView index -> bytes appended by add_view

    # ---------------------------------------------------------------- glTF access
    def accessor(self, i):
        a = self.js['accessors'][i]
        bv = self.js['bufferViews'][a['bufferView']]
        dt = np.dtype(COMP[a['componentType']])
        n = NCOMP[a['type']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = bv.get('byteStride', 0)
        if stride and stride != dt.itemsize * n:
            raw = np.frombuffer(self.bin, np.uint8, count=stride * a['count'], offset=off).reshape(a['count'], stride)
            arr = raw[:, :dt.itemsize * n].copy().view(dt).reshape(a['count'], n)
        else:
            arr = np.frombuffer(self.bin, dt, count=a['count'] * n, offset=off).reshape(a['count'], n)
        if a.get('normalized'):
            arr = arr.astype(np.float32) / np.iinfo(dt).max
        return arr

    def _world(self):
        nodes = self.js['nodes']
        self.parent = {}
        for i, n in enumerate(nodes):
            for c in n.get('children', []):
                self.parent[c] = i
        self.mat = {}

        def local(n):
            if 'matrix' in n:
                return np.array(n['matrix'], np.float64).reshape(4, 4).T
            t = np.array(n.get('translation', [0, 0, 0]))
            x, y, z, w = n.get('rotation', [0, 0, 0, 1])
            s = np.array(n.get('scale', [1, 1, 1]))
            r = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                          [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                          [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
            m = np.eye(4)
            m[:3, :3] = r * s
            m[:3, 3] = t
            return m

        def world(i):
            if i not in self.mat:
                m = local(nodes[i])
                self.mat[i] = world(self.parent[i]) @ m if i in self.parent else m
            return self.mat[i]

        for i in range(len(nodes)):
            world(i)
        self.byNode = {v: k for k, v in self.human.items()}

    def pos(self, node):
        """Bone position, facing +Z (VRM 0.x models face -Z: x and z are mirrored)."""
        p = self.mat[node][:3, 3].copy()
        if self.v0:
            p[0], p[2] = -p[0], -p[2]
        return p

    def bone(self, name):
        return self.pos(self.human[name])

    def human_of(self, node):
        while node is not None:
            if node in self.byNode:
                return self.byNode[node]
            node = self.parent.get(node)
        return None

    # ---------------------------------------------------------------- materials
    def prims(self, pat):
        """(mesh node, primitive, material index) for every primitive whose material name contains `pat`."""
        out = []
        for ni, n in enumerate(self.js['nodes']):
            if 'mesh' not in n:
                continue
            for pr in self.js['meshes'][n['mesh']]['primitives']:
                mi = pr.get('material')
                if mi is not None and pat in self.js['materials'][mi]['name']:
                    out.append((ni, pr, mi))
        return out

    def image_of(self, mi):
        tex = self.js['materials'][mi].get('pbrMetallicRoughness', {}).get('baseColorTexture', {}).get('index')
        return None if tex is None else self.js['textures'][tex]['source']

    def load_image(self, ii):
        if ii in self.images:
            return self.images[ii]
        im = self.js['images'][ii]
        bv = self.js['bufferViews'][im['bufferView']]
        b = self.bin[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        return Image.open(io.BytesIO(b)).convert('RGBA')

    def texels(self, pat, size=None):
        """Per-texel body coordinates for the material(s) matching `pat` (all share one texture)."""
        prims = self.prims(pat)
        if not prims:
            raise KeyError(pat)
        ii = self.image_of(prims[0][2])
        img = self.load_image(ii)
        W, H = size or img.size
        P = np.zeros((H, W, 3), np.float32)
        N = np.zeros((H, W, 3), np.float32)
        S = np.full((H, W), -9, np.float32)
        BONE = np.full((H, W), '', object)
        mask = np.zeros((H, W), bool)
        sh = {k: self.bone(f'{k}UpperArm') for k in ('left', 'right')}
        wr = {k: self.bone(f'{k}Hand') for k in ('left', 'right')}
        for ni, pr, mi in prims:
            at = pr['attributes']
            pos = self.accessor(at['POSITION']).astype(np.float64)
            m = self.mat[ni]
            pos = (np.c_[pos, np.ones(len(pos))] @ m.T)[:, :3]
            nor = self.accessor(at['NORMAL']).astype(np.float64) @ m[:3, :3].T if 'NORMAL' in at else np.zeros_like(pos)
            if self.v0:
                pos[:, [0, 2]] *= -1
                nor[:, [0, 2]] *= -1
            uv = self.accessor(at['TEXCOORD_0']).astype(np.float64)
            joints = self.accessor(at['JOINTS_0'])
            weights = self.accessor(at['WEIGHTS_0']).astype(np.float64)
            skin = self.js['skins'][self.js['nodes'][ni]['skin']]['joints']
            best = joints[np.arange(len(joints)), weights.argmax(1)]
            bones = np.array([self.human_of(skin[j]) or '' for j in best], object)
            # arm parameter: 0 at the shoulder joint, 1 at the elbow, 2 at the wrist (T-pose arms lie along x)
            s = np.full(len(pos), -9.0)
            for side, sgn in (('left', 1), ('right', -1)):
                a, w = sh[side], wr[side]
                d = w - a
                t = ((pos - a) @ d) / (d @ d) * 2
                pick = np.sign(pos[:, 0]) == np.sign(a[0])
                s[pick] = t[pick]
            idx = self.accessor(pr['indices']).reshape(-1, 3).astype(np.int64)
            px = np.c_[uv[:, 0] * W - 0.5, uv[:, 1] * H - 0.5]
            for tri in idx:
                a, b, c = px[tri]
                x0, x1 = int(np.floor(min(a[0], b[0], c[0]))), int(np.ceil(max(a[0], b[0], c[0])))
                y0, y1 = int(np.floor(min(a[1], b[1], c[1]))), int(np.ceil(max(a[1], b[1], c[1])))
                x0, y0 = max(x0, 0), max(y0, 0)
                x1, y1 = min(x1, W - 1), min(y1, H - 1)
                if x1 < x0 or y1 < y0:
                    continue
                gx, gy = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
                den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
                if abs(den) < 1e-12:
                    continue
                l1 = ((b[1] - c[1]) * (gx - c[0]) + (c[0] - b[0]) * (gy - c[1])) / den
                l2 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / den
                l3 = 1 - l1 - l2
                eps = -0.02
                ins = (l1 >= eps) & (l2 >= eps) & (l3 >= eps)
                if not ins.any():
                    continue
                ys, xs = gy[ins], gx[ins]
                L = np.stack([l1[ins], l2[ins], l3[ins]], 1)
                P[ys, xs] = L @ pos[tri]
                N[ys, xs] = L @ nor[tri]
                S[ys, xs] = L @ s[tri]
                BONE[ys, xs] = bones[tri][L.argmax(1)]
                mask[ys, xs] = True
        return dict(img=img, image=ii, P=P, N=N, S=S, BONE=BONE, mask=mask, W=W, H=H)

    def set_image(self, ii, im):
        self.images[ii] = im

    # ---------------------------------------------------------------- writing new data
    def add_view(self, data, target=None):
        bv = {'buffer': 0, 'byteOffset': 0, 'byteLength': len(data)}
        if target:
            bv['target'] = target
        self.js['bufferViews'].append(bv)
        i = len(self.js['bufferViews']) - 1
        self.newviews[i] = bytes(data)
        return i

    def add_accessor(self, arr, typ, comp, target=None, minmax=False):
        arr = np.ascontiguousarray(np.asarray(arr).astype(COMP[comp]))
        bv = self.add_view(arr.tobytes(), target)
        a = {'bufferView': bv, 'componentType': comp, 'count': int(len(arr)), 'type': typ}
        if minmax:
            a['min'] = arr.reshape(len(arr), -1).min(0).tolist()
            a['max'] = arr.reshape(len(arr), -1).max(0).tolist()
        self.js['accessors'].append(a)
        return len(self.js['accessors']) - 1

    def add_texture(self, pic, name, like_texture=0):
        """A new texture (PNG) with the sampler of an existing one; returns the texture index."""
        buf = io.BytesIO()
        pic.save(buf, 'PNG', optimize=True)
        bv = self.add_view(buf.getvalue())
        self.js['images'].append({'name': name, 'mimeType': 'image/png', 'bufferView': bv})
        ii = len(self.js['images']) - 1
        self.images[ii] = pic
        tex = {'source': ii}
        if 'sampler' in self.js['textures'][like_texture]:
            tex['sampler'] = self.js['textures'][like_texture]['sampler']
        self.js['textures'].append(tex)
        return len(self.js['textures']) - 1

    def clone_material(self, mi, name, tex):
        """A copy of material `mi` (MToon, VRM 0.x) drawing texture `tex` and no normal map."""
        assert self.v0, 'only VRM 0.x materials are cloned'
        m = copy.deepcopy(self.js['materials'][mi])
        m['name'] = name
        m.setdefault('pbrMetallicRoughness', {})['baseColorTexture'] = {'index': tex, 'texCoord': 0}
        m.pop('normalTexture', None)
        self.js['materials'].append(m)
        mp = copy.deepcopy(self.js['extensions']['VRM']['materialProperties'][mi])
        mp['name'] = name
        mp['textureProperties']['_MainTex'] = tex
        mp['textureProperties']['_ShadeTexture'] = tex
        mp['textureProperties'].pop('_BumpMap', None)
        mp['keywordMap'].pop('_NORMALMAP', None)
        self.js['extensions']['VRM']['materialProperties'].append(mp)
        return len(self.js['materials']) - 1

    def raw_prim(self, pr):
        """A primitive's own vertex data (mesh space, as stored) and triangles."""
        at = pr['attributes']
        d = {k: self.accessor(at[k]) for k in ('POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0')}
        d['joint_comp'] = self.js['accessors'][at['JOINTS_0']]['componentType']
        d['tris'] = self.accessor(pr['indices']).reshape(-1, 3).astype(np.int64)
        return d

    def body_coords(self, ni, pos, nor, joints, weights):
        """Facing-+Z positions/normals, arm parameter (0 shoulder, 1 elbow, 2 wrist) and main bone per vertex."""
        m = self.mat[ni]
        p = (np.c_[pos, np.ones(len(pos))] @ m.T)[:, :3]
        n = nor @ m[:3, :3].T
        if self.v0:
            p[:, [0, 2]] *= -1
            n[:, [0, 2]] *= -1
        s = np.full(len(p), -9.0)
        for side in ('left', 'right'):
            a, w = self.bone(f'{side}UpperArm'), self.bone(f'{side}Hand')
            d = w - a
            t = ((p - a) @ d) / (d @ d) * 2
            pick = np.sign(p[:, 0]) == np.sign(a[0])
            s[pick] = t[pick]
        skin = self.js['skins'][self.js['nodes'][ni]['skin']]['joints']
        best = joints[np.arange(len(joints)), weights.argmax(1)]
        bones = np.array([self.human_of(skin[j]) or '' for j in best], object)
        return p, n, s, bones

    def add_prim(self, ni, data, tris, material, offset=None):
        """Adds triangles over `data`'s vertices (compacted) to the mesh of node `ni`, optionally pushed out along
        the normals by `offset` (per vertex, metres): a cloth shell over the body."""
        used, inv = np.unique(tris.ravel(), return_inverse=True)
        pos = data['POSITION'][used].astype(np.float64)
        nor = data['NORMAL'][used].astype(np.float64)
        if offset is not None:
            # copies of a vertex along UV seams must move together, or the shell tears open there:
            # push every copy along their averaged normal
            key = np.round(pos * 1e5).astype(np.int64)
            _, grp = np.unique(key, axis=0, return_inverse=True)
            grp = grp.reshape(-1)
            acc = np.zeros((grp.max() + 1, 3))
            np.add.at(acc, grp, nor / np.maximum(1e-9, np.linalg.norm(nor, axis=1))[:, None])
            nn = acc[grp] / np.maximum(1e-9, np.linalg.norm(acc[grp], axis=1))[:, None]
            off = np.asarray(offset)[used]
            oacc = np.zeros(grp.max() + 1)
            cnt = np.zeros(grp.max() + 1)
            np.add.at(oacc, grp, off)
            np.add.at(cnt, grp, 1)
            pos = pos + nn * (oacc[grp] / cnt[grp])[:, None]
        attrs = {
            'POSITION': self.add_accessor(pos.astype(np.float32), 'VEC3', 5126, 34962, minmax=True),
            'NORMAL': self.add_accessor(nor.astype(np.float32), 'VEC3', 5126, 34962),
            'TEXCOORD_0': self.add_accessor(data['TEXCOORD_0'][used].astype(np.float32), 'VEC2', 5126, 34962),
            'JOINTS_0': self.add_accessor(data['JOINTS_0'][used], 'VEC4', data.get('joint_comp', 5123), 34962),
            'WEIGHTS_0': self.add_accessor(data['WEIGHTS_0'][used].astype(np.float32), 'VEC4', 5126, 34962),
        }
        idx = inv.reshape(-1).astype(np.uint32)
        ia = self.add_accessor(idx, 'SCALAR', 5125, 34963)
        mesh = self.js['meshes'][self.js['nodes'][ni]['mesh']]
        mesh['primitives'].append({'attributes': attrs, 'indices': ia, 'material': material, 'mode': 4})
        return len(mesh['primitives']) - 1

    def drop(self, pat):
        """Remove the primitives whose material name contains `pat` (their data stays, unused)."""
        for m in self.js['meshes']:
            m['primitives'] = [p for p in m['primitives'] if pat not in self.js['materials'][p.get('material', 0)]['name']]

    def save(self, path, shrink_others=True, keep=(), drawn=None):
        """Write the model, with replaced images; images of no primitive (or, with `drawn`, of no primitive whose
        material name matches that regex) are squashed to 4x4."""
        import re
        mats = {p['material'] for m in self.js['meshes'] for p in m['primitives']
                if p.get('material') is not None and (drawn is None or re.search(drawn, self.js['materials'][p['material']]['name']))}
        texs = set()
        for mi in mats:
            m = self.js['materials'][mi]
            for k in ('normalTexture', 'emissiveTexture', 'occlusionTexture'):
                if k in m:
                    texs.add(m[k]['index'])
            if 'baseColorTexture' in m.get('pbrMetallicRoughness', {}):
                texs.add(m['pbrMetallicRoughness']['baseColorTexture']['index'])
            if self.v0:
                texs.update(self.js['extensions']['VRM']['materialProperties'][mi].get('textureProperties', {}).values())
            for e in m.get('extensions', {}).values():
                for val in e.values() if isinstance(e, dict) else ():
                    if isinstance(val, dict) and 'index' in val:
                        texs.add(val['index'])
        used = {self.js['textures'][t]['source'] for t in texs if t < len(self.js['textures'])}
        js = self.js
        views = {im['bufferView']: (i, im) for i, im in enumerate(js.get('images', [])) if 'bufferView' in im}
        out = bytearray()
        for i, bv in enumerate(js['bufferViews']):
            data = self.newviews[i] if i in self.newviews else self.bin[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
            if i in views:
                ii, im = views[i]
                pic = self.images.get(ii)
                if pic is None and shrink_others and ii not in used and ii not in keep:
                    pic = Image.new('RGBA', (4, 4), (0, 0, 0, 255))
                if pic is not None:
                    buf = io.BytesIO()
                    pic.save(buf, 'PNG', optimize=True)
                    data = buf.getvalue()
                    im['mimeType'] = 'image/png'
            while len(out) % 4:
                out += b'\0'
            bv['byteOffset'] = len(out)
            bv['byteLength'] = len(data)
            out += data
        while len(out) % 4:
            out += b'\0'
        js['buffers'] = [{'byteLength': len(out)}]
        j = json.dumps(js, ensure_ascii=False, separators=(',', ':')).encode()
        while len(j) % 4:
            j += b' '
        glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(j) + 8 + len(out))
        glb += struct.pack('<II', len(j), 0x4E4F534A) + j + struct.pack('<II', len(out), 0x004E4942) + bytes(out)
        with open(path, 'wb') as f:
            f.write(gzip.compress(glb, 9) if path.endswith('.gz') else glb)
        return len(glb)


def debug_map(t):
    """Colour-codes a material's texels by body part, to see the template's UV layout."""
    P, S, N, mask = t['P'], t['S'], t['N'], t['mask']
    H, W = mask.shape
    out = np.zeros((H, W, 4), np.uint8)
    y = P[..., 1]
    front = N[..., 2] > 0
    arm = S > 0.0
    col = np.zeros((H, W, 3))
    col[...] = (200, 60, 60)
    col[~front] = (60, 160, 60)
    sv = np.clip(S / 2, 0, 1)[..., None]
    col[arm] = (np.array([60, 90, 255]) * (1 - sv) + np.array([255, 255, 60]) * sv)[arm]
    band = (np.floor(y * 20) % 2 == 0)
    col[band & ~arm] *= 0.75
    out[..., :3] = col.clip(0, 255)
    out[..., 3] = mask * 255
    return Image.fromarray(out, 'RGBA')
