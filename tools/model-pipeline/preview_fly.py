#!/usr/bin/env python3
"""preview_fly.py fly.dae out.png: textured views + a view coloured by fly joint (body/inner/outer wings)."""
import sys, os, math, xml.etree.ElementTree as ET
from PIL import Image, ImageDraw
NS = '{http://www.collada.org/2005/11/COLLADASchema}'
src, out = sys.argv[1], sys.argv[2]; d = os.path.dirname(src)
t = ET.parse(src).getroot()
imgs = {im.get('id'): Image.open(os.path.join(d, im.find(NS + 'init_from').text)).convert('RGB') for im in t.iter(NS + 'image')}
fx_img = {fx.get('id')[:-3]: imgs[fx.find('.//' + NS + 'surface/' + NS + 'init_from').text] for fx in t.iter(NS + 'effect')}
JC = {'joint1': (200, 200, 200), 'joint2': (230, 80, 80), 'joint3': (250, 170, 60), 'joint5': (80, 120, 230), 'joint6': (80, 210, 230), 'Hero_body': (60, 220, 60), 'flash_line': (255, 255, 0)}
tris = []
for g in t.iter(NS + 'geometry'):
    gid = g.get('id'); name = g.get('name')
    if name.startswith('f_effect'): continue
    P = [float(x) for x in g.find('.//' + NS + f'float_array[@id="{gid}-pa"]').text.split()]
    U = [float(x) for x in g.find('.//' + NS + f'float_array[@id="{gid}-ta"]').text.split()]
    tr = g.find('.//' + NS + 'triangles'); im = fx_img[tr.get('material')]; W, H = im.size; px = im.load()
    sk = t.find('.//' + NS + f'controller[@id="{gid}-skin"]')
    names = sk.find('.//' + NS + 'Name_array').text.split(); wv = [float(x) for x in sk.find('.//' + NS + f'float_array[@id="{gid}-wa"]').text.split()]
    vc = [int(x) for x in sk.find('.//' + NS + 'vcount').text.split()]; vv = [int(x) for x in sk.find('.//' + NS + 'v').text.split()]
    dom = []; k = 0
    for c in vc:
        best = max(range(c), key=lambda j: wv[vv[2 * (k + j) + 1]]); dom.append(names[vv[2 * (k + best)]]); k += c
    n = len(P) // 3
    for i in range(0, n, 3):
        vs = [P[3 * j:3 * j + 3] for j in range(i, i + 3)]
        u = sum(U[2 * j] for j in range(i, i + 3)) / 3; v = sum(U[2 * j + 1] for j in range(i, i + 3)) / 3
        col = px[min(W - 1, int((u % 1) * W)), min(H - 1, int((1 - v % 1) * H))]
        tris.append((vs, col, JC.get(dom[i], (255, 0, 255))))
def view(yaw, pitch, by_joint=False, size=440):
    cy, sy, cp, sp = math.cos(yaw), math.sin(yaw), math.cos(pitch), math.sin(pitch)
    def rot(p):
        x, y, z = p; x, z = x * cy + z * sy, -x * sy + z * cy; y, z = y * cp - z * sp, y * sp + z * cp; return x, y, z
    img = Image.new('RGB', (size, size), (40, 50, 70)); dr = ImageDraw.Draw(img); sc = size / 120; ctr = size / 2
    L = (0.3, 0.8, 0.5); items = []
    for vs, col, jc in tris:
        r = [rot(v) for v in vs]
        a = [r[1][i] - r[0][i] for i in range(3)]; b = [r[2][i] - r[0][i] for i in range(3)]
        n = (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]); ln = math.sqrt(sum(x * x for x in n)) or 1
        sh = 0.45 + 0.55 * abs(sum(n[i] / ln * L[i] for i in range(3)))
        c = tuple(int(x * sh) for x in (jc if by_joint else col))
        items.append((sum(p[2] for p in r) / 3, [(ctr + p[0] * sc, ctr - p[1] * sc) for p in r], c))
    for _, pts, c in sorted(items, key=lambda x: x[0]): dr.polygon(pts, fill=c)
    return img
vs = [view(math.radians(210), math.radians(25)), view(0, math.radians(85)), view(math.radians(270), 0), view(0, math.radians(85), True)]
s = Image.new('RGB', (440 * 4, 440)); [s.paste(v, (440 * i, 0)) for i, v in enumerate(vs)]
ImageDraw.Draw(s).text((8, 8), 'angle | top | side | top coloured by bone (grey body, red/orange +X wing, blue/cyan -X wing, green player)', fill=(255, 255, 255))
s.save(out)
