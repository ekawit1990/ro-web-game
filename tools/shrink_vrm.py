"""Shrink a VRM/GLB: downscale embedded textures (keeps every extension, mesh and bone untouched)."""
import io, json, struct, sys
from PIL import Image

def shrink(src, dst, maxsize):
    d = open(src, 'rb').read()
    jl = struct.unpack('<I', d[12:16])[0]
    g = json.loads(d[20:20 + jl])
    bin_off = 20 + jl + 8
    bl = struct.unpack('<I', d[20 + jl:24 + jl])[0]
    binc = d[bin_off:bin_off + bl]
    img_views = {}
    for im in g.get('images', []):
        if 'bufferView' in im:
            img_views[im['bufferView']] = im
    out = bytearray()
    for i, bv in enumerate(g['bufferViews']):
        data = binc[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        if i in img_views:
            im = Image.open(io.BytesIO(data))
            if max(im.size) > maxsize:
                k = maxsize / max(im.size)
                im = im.resize((max(1, round(im.size[0] * k)), max(1, round(im.size[1] * k))), Image.LANCZOS)
            buf = io.BytesIO()
            has_alpha = im.mode in ('RGBA', 'LA') and im.getchannel('A').getextrema()[0] < 255
            if has_alpha or im.mode == 'P':
                im.save(buf, 'PNG', optimize=True)
                img_views[i]['mimeType'] = 'image/png'
            else:
                im.convert('RGB').save(buf, 'JPEG', quality=88)
                img_views[i]['mimeType'] = 'image/jpeg'
            new = buf.getvalue()
            if len(new) < len(data):
                data = new
            else:
                img_views[i]['mimeType'] = 'image/png' if data[:4] == b'\x89PNG' else 'image/jpeg'
        while len(out) % 4: out += b'\0'
        bv['byteOffset'] = len(out)
        bv['byteLength'] = len(data)
        out += data
    while len(out) % 4: out += b'\0'
    g['buffers'] = [{'byteLength': len(out)}]
    js = json.dumps(g, ensure_ascii=False, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out))
    glb += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(out), 0x004E4942) + bytes(out)
    open(dst, 'wb').write(glb)
    return len(d), len(glb)

if __name__ == '__main__':
    a, b = shrink(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 1024)
    print(f'{sys.argv[2]}: {a/1e6:.1f} MB -> {b/1e6:.1f} MB')
