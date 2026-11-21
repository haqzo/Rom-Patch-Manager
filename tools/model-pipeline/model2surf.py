#!/usr/bin/env python3
"""model2surf.py: any COLLADA model (X/Y, Sun/Moon Pokéride, Platinum, Scarlet/Violet) -> clean static Surf .dae for CTRMap.

One node, triangles only, Y-up, facing +Z (like Mato's Lapras), sitting in the water (y=0 is the surface),
textures shrunk to <= --maxtex and reduced to 256 colours (CTRMap: High Color + Serialize as Lookup Table).

usage: model2surf.py src.dae outdir Name --width 48 --sink 8 [--yaw 0] [--maxtex 512] [--skip mat1,mat2]
  --width  total width in game units (Lapras ~60, Wailmer 44)
  --sink   how deep it sits in the water
  --yaw    extra turn in degrees if the automatic "eyes to the front" guess is wrong
"""
import argparse, os, math, re, xml.etree.ElementTree as ET
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('out'); ap.add_argument('name')
ap.add_argument('--width', type=float, required=True); ap.add_argument('--sink', type=float, default=0.0)
ap.add_argument('--yaw', type=float, default=0.0); ap.add_argument('--maxtex', type=int, default=512)
ap.add_argument('--skip', default='', help='material names/ids to leave out (comma separated, substring match)')
ap.add_argument('--keep-alpha', action='store_true')
a = ap.parse_args()
NS = '{http://www.collada.org/2005/11/COLLADASchema}'
t = ET.parse(a.src).getroot(); srcdir = os.path.dirname(os.path.abspath(a.src))
upel = t.find('.//' + NS + 'up_axis'); up = upel.text.strip() if upel is not None else 'Y_UP'

def ident(): return [1.0 if i % 5 == 0 else 0.0 for i in range(16)]
def mm(x, y): return [sum(x[4*r+k]*y[4*k+c] for k in range(4)) for r in range(4) for c in range(4)]
def node_local(n):
    m = ident()
    for c in n:
        tag = c.tag.split('}')[1]; v = [float(x) for x in (c.text or '').split()]
        if tag == 'matrix': m = mm(m, v)
        elif tag == 'translate': m = mm(m, [1,0,0,v[0], 0,1,0,v[1], 0,0,1,v[2], 0,0,0,1])
        elif tag == 'scale': m = mm(m, [v[0],0,0,0, 0,v[1],0,0, 0,0,v[2],0, 0,0,0,1])
        elif tag == 'rotate':
            x, y, z, ang = v; L = math.sqrt(x*x+y*y+z*z) or 1; x, y, z = x/L, y/L, z/L; c_, s_ = math.cos(math.radians(ang)), math.sin(math.radians(ang)); C = 1 - c_
            m = mm(m, [c_+x*x*C, x*y*C-z*s_, x*z*C+y*s_, 0, y*x*C+z*s_, c_+y*y*C, y*z*C-x*s_, 0, z*x*C-y*s_, z*y*C+x*s_, c_+z*z*C, 0, 0, 0, 0, 1])
    return m
def xf(m, p, w=1.0): return [m[0]*p[0]+m[1]*p[1]+m[2]*p[2]+m[3]*w, m[4]*p[0]+m[5]*p[1]+m[6]*p[2]+m[7]*w, m[8]*p[0]+m[9]*p[1]+m[10]*p[2]+m[11]*w]

def src_floats(i):
    s = t.find('.//' + NS + f'source[@id="{i}"]'); acc = s.find('.//' + NS + 'accessor')
    return [float(x) for x in s.find(NS + 'float_array').text.split()], int(acc.get('stride', 3))

images = {}
for im in t.iter(NS + 'image'):
    f = im.find('.//' + NS + 'init_from')
    if f is not None and f.text: images[im.get('id')] = f.text.strip().replace('file://', '')
def material_image(mat_id):
    m = t.find('.//' + NS + f'material[@id="{mat_id}"]')
    if m is None: return None
    fx = t.find('.//' + NS + f'effect[@id="{m.find(NS + "instance_effect").get("url")[1:]}"]')
    tex = fx.find('.//' + NS + 'diffuse/' + NS + 'texture') if fx is not None else None
    if tex is None and fx is not None: tex = fx.find('.//' + NS + 'texture')
    if tex is None: return None
    ref = tex.get('texture')
    for _ in range(3):  # sampler -> surface -> image
        np_ = fx.find('.//' + NS + f'newparam[@sid="{ref}"]')
        if np_ is None: break
        s = np_.find('.//' + NS + 'source'); i = np_.find('.//' + NS + 'init_from')
        ref = (s.text if s is not None else i.text).strip()
    return images.get(ref, images.get(ref.replace('-sampler', ''), None))

skip = [s for s in a.skip.split(',') if s]
parts = []  # (image path, [[pos, nrm, uv] * 3] ...)
def walk(n, parent):
    W = mm(parent, node_local(n))
    for inst in list(n.findall(NS + 'instance_geometry')) + list(n.findall(NS + 'instance_controller')):
        url = inst.get('url')[1:]; M = W
        if inst.tag.endswith('instance_controller'):
            sk = t.find('.//' + NS + f'controller[@id="{url}"]').find(NS + 'skin'); url = sk.get('source')[1:]
            b = sk.find(NS + 'bind_shape_matrix'); M = mm(W, [float(x) for x in b.text.split()] if b is not None else ident())
        bind = {im.get('symbol'): im.get('target')[1:] for im in inst.iter(NS + 'instance_material')}
        g = t.find('.//' + NS + f'geometry[@id="{url}"]'); mesh = g.find(NS + 'mesh')
        P, ps = src_floats(mesh.find(NS + 'vertices').find(NS + 'input').get('source')[1:])
        for prim in mesh:
            tag = prim.tag.split('}')[1]
            if tag not in ('triangles', 'polylist'): continue
            mat = bind.get(prim.get('material'), prim.get('material'))
            mname = (t.find('.//' + NS + f'material[@id="{mat}"]').get('name') if t.find('.//' + NS + f'material[@id="{mat}"]') is not None else mat) or mat
            if any(s in mat or s in mname for s in skip): continue
            img = material_image(mat)
            if not img: continue
            ins = prim.findall(NS + 'input'); stride = max(int(i.get('offset')) for i in ins) + 1
            off = {}
            for i in ins:
                if i.get('semantic') not in off: off[i.get('semantic')] = (int(i.get('offset')), i.get('source')[1:])
            # some exporters (SPICA / Ohana) put NORMAL and TEXCOORD inside <vertices>: same index as VERTEX
            for vi_ in mesh.find(NS + 'vertices').findall(NS + 'input'):
                sem = vi_.get('semantic')
                if sem != 'POSITION' and sem not in off: off[sem] = (off['VERTEX'][0], vi_.get('source')[1:])
            Nn, ns_ = src_floats(off['NORMAL'][1]) if 'NORMAL' in off else (None, 3)
            T, ts = src_floats(off['TEXCOORD'][1]) if 'TEXCOORD' in off else (None, 2)
            idx = [int(x) for x in prim.find(NS + 'p').text.split()]
            vc = [int(x) for x in prim.find(NS + 'vcount').text.split()] if tag == 'polylist' else [3] * int(prim.get('count'))
            tris = []; k = 0
            for cnt in vc:
                poly = []
                for j in range(cnt):
                    b0 = (k + j) * stride; vi = idx[b0 + off['VERTEX'][0]]
                    p = xf(M, P[ps*vi: ps*vi+3])
                    nn = xf(M, Nn[ns_*idx[b0+off['NORMAL'][0]]: ns_*idx[b0+off['NORMAL'][0]]+3], 0.0) if Nn else [0, 1, 0]
                    uv = list(T[ts*idx[b0+off['TEXCOORD'][0]]: ts*idx[b0+off['TEXCOORD'][0]]+2]) if T else [0, 0]
                    poly.append([p, nn, uv])
                for j in range(1, cnt - 1):
                    tri = [[v[0], v[1], list(v[2])] for v in (poly[0], poly[j], poly[j + 1])]
                    for c in (0, 1):
                        f = math.floor(min(v[2][c] for v in tri))
                        if f:
                            for v in tri: v[2][c] -= f
                    tris.append(tri)
                k += cnt
            parts.append((img, tris))
    for c in n.findall(NS + 'node'): walk(c, W)
for vs in t.iter(NS + 'visual_scene'):
    for n in vs.findall(NS + 'node'): walk(n, ident())

# Y-up
if up == 'Z_UP':
    R = lambda p: [p[0], p[2], -p[1]]
elif up == 'X_UP':
    R = lambda p: [-p[1], p[0], p[2]]
else:
    R = lambda p: p
parts = [(img, [[[R(v[0]), R(v[1]), v[2]] for v in tr] for tr in tris]) for img, tris in parts]
allp = [v[0] for _, tris in parts for tr in tris for v in tr]
cx = sum(p[0] for p in allp) / len(allp); cz = sum(p[2] for p in allp) / len(allp)
# face +Z: eyes in front of the centre (guess), plus manual --yaw
eye = [v[0] for img, tris in parts if re.search(r'eye|iris', os.path.basename(img), re.I) for tr in tris for v in tr]
yaw = 0.0
if eye:
    ex = sum(p[0] for p in eye) / len(eye) - cx; ez = sum(p[2] for p in eye) / len(eye) - cz
    yaw = math.atan2(ex, ez)  # rotate so the eye direction becomes +Z
yaw -= math.radians(a.yaw)
cy_, sy_ = math.cos(-yaw), math.sin(-yaw)
Y = lambda p: [p[0] * cy_ + p[2] * sy_, p[1], -p[0] * sy_ + p[2] * cy_]
parts = [(img, [[[Y([v[0][0] - cx, v[0][1], v[0][2] - cz]), Y(v[1]), v[2]] for v in tr] for tr in tris]) for img, tris in parts]
allp = [v[0] for _, tris in parts for tr in tris for v in tr]
mn = [min(p[i] for p in allp) for i in range(3)]; mx = [max(p[i] for p in allp) for i in range(3)]
s = a.width / (mx[0] - mn[0]); ox, oz = (mn[0] + mx[0]) / 2, (mn[2] + mx[2]) / 2
place = lambda p: ((p[0] - ox) * s, (p[1] - mn[1]) * s - a.sink, (p[2] - oz) * s)

os.makedirs(a.out, exist_ok=True)
texfile = {}
for img, _ in parts:
    if img in texfile: continue
    path = img if os.path.isabs(img) else os.path.join(srcdir, img)
    im = Image.open(path); has_alpha = im.mode in ('RGBA', 'LA', 'P') and im.convert('RGBA').getextrema()[3][0] < 255
    im = im.convert('RGBA' if (has_alpha and a.keep_alpha) else 'RGB')
    w, h = im.size; f = min(1.0, a.maxtex / max(w, h))
    if f < 1: im = im.resize((max(8, int(w * f)), max(8, int(h * f))), Image.LANCZOS)
    if im.mode == 'RGB': im = im.quantize(colors=256, method=Image.MEDIANCUT, dither=Image.NONE)
    nm = re.sub(r'(\.tga)?\.png$', '', os.path.basename(img), flags=re.I) + '.png'
    im.save(os.path.join(a.out, nm)); texfile[img] = (nm, im.size, has_alpha)

groups = {}
for img, tris in parts: groups.setdefault(texfile[img][0], []).extend(tris)
P, Nn, U, prims = [], [], [], []
for gi, (tex, tris) in enumerate(groups.items()):
    ix = []
    for tr in tris:
        for p, n, uv in tr:
            L = math.sqrt(sum(c * c for c in n)) or 1
            P.append(place(p)); Nn.append(Y(R([0, 0, 0])) if False else [c / L for c in n]); U.append(uv); ix.append(len(P) - 1)
    prims.append((f'm{gi}', tex, ix))
fl = lambda v: ' '.join(f'{c:.5f}' for t3 in v for c in t3)
img_id = {tex: f'img{i}' for i, (_, tex, _) in enumerate(prims)}
X = [f'<?xml version="1.0" encoding="utf-8"?>\n<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1"><asset><unit name="meter" meter="1"/><up_axis>Y_UP</up_axis></asset>',
     '<library_images>' + ''.join(f'<image id="{img_id[tex]}" name="{tex[:-4]}"><init_from>{tex}</init_from></image>' for _, tex, _ in prims) + '</library_images>',
     '<library_effects>' + ''.join(f'<effect id="{m}-fx"><profile_COMMON><newparam sid="{m}-surf"><surface type="2D"><init_from>{img_id[tex]}</init_from></surface></newparam><newparam sid="{m}-samp"><sampler2D><source>{m}-surf</source></sampler2D></newparam><technique sid="common"><lambert><diffuse><texture texture="{m}-samp" texcoord="UVMap"/></diffuse></lambert></technique></profile_COMMON></effect>' for m, tex, _ in prims) + '</library_effects>',
     '<library_materials>' + ''.join(f'<material id="{m}" name="{a.name}_{m}"><instance_effect url="#{m}-fx"/></material>' for m, _, _ in prims) + '</library_materials>',
     f'<library_geometries><geometry id="g" name="{a.name}"><mesh>'
     f'<source id="g-p"><float_array id="g-pa" count="{3*len(P)}">{fl(P)}</float_array><technique_common><accessor source="#g-pa" count="{len(P)}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>'
     f'<source id="g-n"><float_array id="g-na" count="{3*len(Nn)}">{fl(Nn)}</float_array><technique_common><accessor source="#g-na" count="{len(Nn)}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>'
     f'<source id="g-t"><float_array id="g-ta" count="{2*len(U)}">{fl(U)}</float_array><technique_common><accessor source="#g-ta" count="{len(U)}" stride="2"><param name="S" type="float"/><param name="T" type="float"/></accessor></technique_common></source>'
     '<vertices id="g-v"><input semantic="POSITION" source="#g-p"/></vertices>'
     + ''.join(f'<triangles material="{m}" count="{len(ix)//3}"><input semantic="VERTEX" source="#g-v" offset="0"/><input semantic="NORMAL" source="#g-n" offset="0"/><input semantic="TEXCOORD" source="#g-t" offset="0" set="0"/><p>{" ".join(map(str, ix))}</p></triangles>' for m, _, ix in prims)
     + '</mesh></geometry></library_geometries>',
     f'<library_visual_scenes><visual_scene id="Scene" name="Scene"><node id="{a.name}" name="{a.name}" type="NODE"><instance_geometry url="#g"><bind_material><technique_common>'
     + ''.join(f'<instance_material symbol="{m}" target="#{m}"><bind_vertex_input semantic="UVMap" input_semantic="TEXCOORD" input_set="0"/></instance_material>' for m, _, _ in prims)
     + '</technique_common></bind_material></instance_geometry></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#Scene"/></scene></COLLADA>']
open(os.path.join(a.out, a.name + '.dae'), 'w').write(''.join(X))
fm = [min(place(p)[i] for p in allp) for i in range(3)]; fM = [max(place(p)[i] for p in allp) for i in range(3)]
print(f'{a.name}: {len(P)//3} tris, textures', {v[0]: v[1] for v in texfile.values()}, '| alpha:', [v[0] for v in texfile.values() if v[2]])
print(f'  up={up} eyes={"yes" if eye else "no"} yaw={math.degrees(yaw):.0f}°  bounds x {fm[0]:.0f}..{fM[0]:.0f} y {fm[1]:.0f}..{fM[1]:.0f} z {fm[2]:.0f}..{fM[2]:.0f}')
