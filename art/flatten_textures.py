"""Snap a GLB's base-colour texture to a flat hand-picked palette (no baked shading).
Keeps meshes, skin, bones and clips byte-identical; only the image bytes change.
Run it on the TRELLIS-textured originals (git show 2a44e59:public/models/kid.glb).
usage: python art/flatten_textures.py in.glb out.glb kid|boss [preview.png]"""
import json, struct, sys, io
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

# (anchor colours seen in the texture) -> flat output colour
PALETTES = {
    'kid': [
        ('skin',  [(181,131,93),(201,171,148),(138,104,90),(220,180,150)], (242,182,140)),
        ('red',   [(179,46,52),(158,38,42),(103,22,25),(130,30,35)],        (222,44,52)),
        ('white', [(208,207,207),(235,235,235),(170,170,175)],              (240,238,232)),
        ('navy',  [(42,50,58),(35,45,70),(50,60,80)],                       (36,52,104)),
        ('dark',  [(30,24,23),(44,43,44),(15,12,12),(78,71,69),(60,55,55),(100,95,95)], (34,30,36)),
    ],
    'boss': [
        ('black', [(40,35,31),(28,24,21),(55,48,43),(14,12,10),(70,62,58)], (36,31,35)),
        ('tan',   [(161,128,67),(121,89,44),(191,163,99),(93,64,29),(210,185,120)], (204,134,58)),
        ('pink',  [(210,100,90),(180,80,70),(225,130,120)],                 (224,108,104)),
        ('cream', [(230,220,210),(245,240,235)],                            (240,228,206)),
    ],
}

# palette names -> {colour: (fallback colour, min region size in texels)}
SPECKS = {
    ('skin', 'red', 'white', 'navy', 'dark'): {'navy': ('dark', 1500)},
}

def srgb_to_lab(rgb):
    c = rgb / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    xyz = c @ np.array([[0.4124, 0.2126, 0.0193], [0.3576, 0.7152, 0.1192], [0.1805, 0.0722, 0.9505]])
    xyz /= np.array([0.9505, 1.0, 1.089])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)

L_WEIGHT = 0.45  # baked light mostly changes lightness: weigh hue/chroma more

def posterize(img, palette):
    rgb = img.convert('RGB')
    alpha = img.getchannel('A') if img.mode == 'RGBA' else None
    blurred = np.asarray(rgb.filter(ImageFilter.GaussianBlur(1.5)), dtype=float)
    lab = srgb_to_lab(blurred)
    lab[..., 0] *= L_WEIGHT
    anchors, owner = [], []
    for i, (_, cols, _) in enumerate(palette):
        for c in cols: anchors.append(c); owner.append(i)
    alab = srgb_to_lab(np.array(anchors, dtype=float)); alab[:, 0] *= L_WEIGHT
    d = ((lab[:, :, None, :] - alab[None, None]) ** 2).sum(-1)
    idx = np.array(owner, dtype=np.uint8)[d.argmin(-1)]
    # mode filter kills speckles left by texture noise
    idx = np.array(Image.fromarray(idx).filter(ImageFilter.ModeFilter(5)))
    # small specks of a 'big region' colour (shoe glints read as navy) go to the fallback colour
    names = [p[0] for p in palette]
    for name, (fallback, min_px) in SPECKS.get(tuple(names), {}).items():
        i, f = names.index(name), names.index(fallback)
        lab_, n = ndimage.label(idx == i)
        sizes = ndimage.sum(np.ones_like(idx), lab_, range(1, n + 1))
        idx[np.isin(lab_, 1 + np.nonzero(sizes < min_px)[0])] = f
    out = np.array([p[2] for p in palette], dtype=np.uint8)[idx]
    res = Image.fromarray(out, 'RGB')
    if alpha is not None: res.putalpha(alpha)
    return res, idx

def read_glb(p):
    b = open(p, 'rb').read()
    _, _, length = struct.unpack_from('<4sII', b, 0)
    off, chunks = 12, []
    while off < length:
        clen, ctype = struct.unpack_from('<I4s', b, off); off += 8
        chunks.append(b[off:off + clen]); off += clen
    return json.loads(chunks[0]), chunks[1]

def write_glb(p, js, views):
    """views: list of bytes per bufferView; rebuilds buffer 0 with 4-byte alignment."""
    blob = bytearray()
    for bv, data in zip(js['bufferViews'], views):
        while len(blob) % 4: blob.append(0)
        bv['byteOffset'] = len(blob); bv['byteLength'] = len(data); blob += data
    while len(blob) % 4: blob.append(0)
    js['buffers'] = [{'byteLength': len(blob)}]
    jb = json.dumps(js, separators=(',', ':')).encode()
    jb += b' ' * (-len(jb) % 4)
    total = 12 + 8 + len(jb) + 8 + len(blob)
    with open(p, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<I4s', len(jb), b'JSON')); f.write(jb)
        f.write(struct.pack('<I4s', len(blob), b'BIN\0')); f.write(blob)

if __name__ == '__main__':
    src, dst, which = sys.argv[1:4]
    js, binc = read_glb(src)
    views = [binc[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']] for bv in js['bufferViews']]
    for im in js['images']:
        img = Image.open(io.BytesIO(views[im['bufferView']]))
        res, idx = posterize(img, PALETTES[which])
        if len(sys.argv) > 4: res.save(sys.argv[4])
        buf = io.BytesIO(); res.save(buf, 'PNG', optimize=True)
        views[im['bufferView']] = buf.getvalue()
        im['mimeType'] = 'image/png'
        counts = np.bincount(idx.ravel(), minlength=len(PALETTES[which]))
        print({p[0]: round(c / idx.size * 100, 1) for p, c in zip(PALETTES[which], counts)})
    write_glb(dst, js, views)
    print('wrote', dst)
