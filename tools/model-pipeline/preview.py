#!/usr/bin/env python3
"""preview.py model.dae out.png : quick textured preview (painter's algorithm), 3 views + water line."""
import sys, os, math, xml.etree.ElementTree as ET
from PIL import Image, ImageDraw
NS = '{http://www.collada.org/2005/11/COLLADASchema}'
src, out = sys.argv[1], sys.argv[2]
t = ET.parse(src).getroot(); d = os.path.dirname(src)
arr = lambda i: [float(x) for x in t.find('.//' + NS + f'float_array[@id="{i}"]').text.split()]
P, U = arr('g-pa'), arr('g-ta')
imgs = {im.get('id'): Image.open(os.path.join(d, im.find(NS + 'init_from').text)).convert('RGB') for im in t.iter(NS + 'image')}
fx_img = {}
for fx in t.iter(NS + 'effect'):
    fx_img[fx.get('id')[:-3]] = imgs[fx.find('.//' + NS + 'surface/' + NS + 'init_from').text]
tris = []
for tr in t.iter(NS + 'triangles'):
    im = fx_img[tr.get('material')]; W, H = im.size; px = im.load()
    ix = [int(x) for x in tr.find(NS + 'p').text.split()]
    for k in range(0, len(ix), 3):
        vs = [P[3 * i:3 * i + 3] for i in ix[k:k + 3]]
        u = sum(U[2 * i] for i in ix[k:k + 3]) / 3; v = sum(U[2 * i + 1] for i in ix[k:k + 3]) / 3
        col = px[min(W - 1, max(0, int((u % 1) * W))), min(H - 1, max(0, int((1 - v % 1) * H)))]
        tris.append((vs, col))
def view(yaw, pitch, size=420):
    cy, sy, cp, sp = math.cos(yaw), math.sin(yaw), math.cos(pitch), math.sin(pitch)
    def rot(p):
        x, y, z = p; x, z = x * cy + z * sy, -x * sy + z * cy; y, z = y * cp - z * sp, y * sp + z * cp; return x, y, z
    img = Image.new('RGB', (size, size), (40, 60, 90)); dr = ImageDraw.Draw(img)
    sc = size / 75; ctr = size / 2
    # water plane y=0
    wl = [rot(p) for p in [(-37, 0, -37), (37, 0, -37), (37, 0, 37), (-37, 0, 37)]]
    dr.polygon([(ctr + p[0] * sc, ctr - p[1] * sc) for p in wl], fill=(30, 90, 140))
    L = (0.3, 0.8, 0.5)
    items = []
    for vs, col in tris:
        r = [rot(v) for v in vs]
        a = [r[1][i] - r[0][i] for i in range(3)]; b = [r[2][i] - r[0][i] for i in range(3)]
        n = (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
        ln = math.sqrt(sum(x * x for x in n)) or 1
        sh = 0.45 + 0.55 * abs(sum(n[i] / ln * L[i] for i in range(3)))
        under = all(v[1] < 0 for v in vs)
        c = tuple(int(x * sh * (0.55 if under else 1)) for x in col)
        items.append((sum(p[2] for p in r) / 3, [(ctr + p[0] * sc, ctr - p[1] * sc) for p in r], c))
    for _, pts, c in sorted(items, key=lambda x: x[0]):
        dr.polygon(pts, fill=c)
    return img
views = [view(math.radians(200), math.radians(25)), view(math.radians(270), math.radians(5)), view(0, math.radians(80))]
s = Image.new('RGB', (420 * 3, 420)); [s.paste(v, (420 * i, 0)) for i, v in enumerate(views)]
ImageDraw.Draw(s).text((8, 8), 'front-ish | side | top   (darker = under water)', fill=(255, 255, 255))
s.save(out)
