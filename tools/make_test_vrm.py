"""Builds a tiny blocky VRM 1.0 humanoid (test asset only) to exercise the game's VRM loader."""
import json, struct, sys

# unit cube centred at origin
faces = [((1,0,0),[(1,-1,-1),(1,1,-1),(1,1,1),(1,-1,1)]), ((-1,0,0),[(-1,-1,1),(-1,1,1),(-1,1,-1),(-1,-1,-1)]),
         ((0,1,0),[(-1,1,-1),(-1,1,1),(1,1,1),(1,1,-1)]), ((0,-1,0),[(-1,-1,1),(-1,-1,-1),(1,-1,-1),(1,-1,1)]),
         ((0,0,1),[(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]), ((0,0,-1),[(1,-1,-1),(-1,-1,-1),(-1,1,-1),(1,1,-1)])]
pos, nor, idx = [], [], []
for n, quad in faces:
    b = len(pos)
    for v in quad:
        pos.append(tuple(c * 0.5 for c in v)); nor.append(n)
    idx += [b, b+1, b+2, b, b+2, b+3]
bin_ = b''.join(struct.pack('<3f', *p) for p in pos) + b''.join(struct.pack('<3f', *n) for n in nor)
off_idx = len(bin_)
bin_ += b''.join(struct.pack('<H', i) for i in idx)
while len(bin_) % 4: bin_ += b'\0'

mats = [('Skin', [1.0, 0.86, 0.76, 1]), ('Cloth', [0.9, 0.3, 0.5, 1]), ('Hair_mat', [0.95, 0.95, 0.95, 1]), ('Shoe', [0.3, 0.2, 0.15, 1])]
meshes = [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1}, 'indices': 2, 'material': i}]} for i in range(len(mats))]
nodes = []
def node(name, t=(0,0,0), children=None, mesh=None, s=None):
    nodes.append({'name': name, 'translation': list(t), 'children': children or []})
    if mesh is not None: nodes[-1]['mesh'] = mesh
    if s: nodes[-1]['scale'] = list(s)
    if not nodes[-1]['children']: del nodes[-1]['children']
    return len(nodes) - 1
def shape(name, mesh, t, s): return node(name + '_shape', t, mesh=mesh, s=s)
# build bottom-up: returns bone index
bones = {}
def bone(name, t, shapes, kids=()):
    ch = [shape(name, m, st, ss) for m, st, ss in shapes] + list(kids)
    i = node(name, t, ch); bones[name] = i; return i
SK, CL, HA, SH = 0, 1, 2, 3
lf = bone('leftFoot', (0, -0.36, 0), [(SH, (0, -0.03, 0.04), (0.1, 0.06, 0.18))])
ll = bone('leftLowerLeg', (0, -0.36, 0), [(SK, (0, -0.18, 0), (0.08, 0.36, 0.08))], [lf])
lu = bone('leftUpperLeg', (0.09, -0.05, 0), [(CL, (0, -0.18, 0), (0.1, 0.36, 0.1))], [ll])
rf = bone('rightFoot', (0, -0.36, 0), [(SH, (0, -0.03, 0.04), (0.1, 0.06, 0.18))])
rl = bone('rightLowerLeg', (0, -0.36, 0), [(SK, (0, -0.18, 0), (0.08, 0.36, 0.08))], [rf])
ru = bone('rightUpperLeg', (-0.09, -0.05, 0), [(CL, (0, -0.18, 0), (0.1, 0.36, 0.1))], [rl])
lh = bone('leftHand', (0.22, 0, 0), [(SK, (0.04, 0, 0), (0.08, 0.06, 0.06))])
la = bone('leftLowerArm', (0.22, 0, 0), [(SK, (0.11, 0, 0), (0.22, 0.06, 0.06))], [lh])
lua = bone('leftUpperArm', (0.12, 0.02, 0), [(CL, (0.11, 0, 0), (0.22, 0.08, 0.08))], [la])
rh = bone('rightHand', (-0.22, 0, 0), [(SK, (-0.04, 0, 0), (0.08, 0.06, 0.06))])
ra = bone('rightLowerArm', (-0.22, 0, 0), [(SK, (-0.11, 0, 0), (0.22, 0.06, 0.06))], [rh])
rua = bone('rightUpperArm', (-0.12, 0.02, 0), [(CL, (-0.11, 0, 0), (0.22, 0.08, 0.08))], [ra])
head = bone('head', (0, 0.08, 0), [(SK, (0, 0.12, 0), (0.24, 0.24, 0.22)), (HA, (0, 0.24, -0.02), (0.27, 0.06, 0.26)), (HA, (0, 0.12, -0.12), (0.27, 0.26, 0.05))])
neck = bone('neck', (0, 0.18, 0), [(SK, (0, 0.04, 0), (0.06, 0.08, 0.06))], [head])
chest = bone('chest', (0, 0.15, 0), [(CL, (0, 0.07, 0), (0.26, 0.2, 0.16))], [neck, lua, rua])
spine = bone('spine', (0, 0.1, 0), [(CL, (0, 0.07, 0), (0.24, 0.16, 0.15))], [chest])
hips = bone('hips', (0, 0.82, 0), [(CL, (0, 0, 0), (0.26, 0.14, 0.16))], [spine, lu, ru])
root = node('Root', (0, 0, 0), [hips])

gltf = {
    'asset': {'version': '2.0', 'generator': 'music-land test'},
    'extensionsUsed': ['VRMC_vrm'],
    'scene': 0, 'scenes': [{'nodes': [root]}], 'nodes': nodes, 'meshes': meshes,
    'materials': [{'name': n, 'pbrMetallicRoughness': {'baseColorFactor': c, 'metallicFactor': 0, 'roughnessFactor': 1}} for n, c in mats],
    'buffers': [{'byteLength': len(bin_)}],
    'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': 288}, {'buffer': 0, 'byteOffset': 288, 'byteLength': 288},
                    {'buffer': 0, 'byteOffset': off_idx, 'byteLength': 72}],
    'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': 24, 'type': 'VEC3', 'min': [-0.5]*3, 'max': [0.5]*3},
                  {'bufferView': 1, 'componentType': 5126, 'count': 24, 'type': 'VEC3'},
                  {'bufferView': 2, 'componentType': 5123, 'count': 36, 'type': 'SCALAR'}],
    'extensions': {'VRMC_vrm': {'specVersion': '1.0', 'meta': {'name': 'Blocky test', 'authors': ['test'], 'licenseUrl': 'https://vrm.dev/licenses/1.0/'},
                                'humanoid': {'humanBones': {k: {'node': v} for k, v in bones.items()}}}},
}
js = json.dumps(gltf).encode()
while len(js) % 4: js += b' '
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_))
glb += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bin_
open(sys.argv[1], 'wb').write(glb)
print('wrote', sys.argv[1], len(glb))
