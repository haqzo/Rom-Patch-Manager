#!/usr/bin/env python3
"""xy2dae.py: X/Y ColladaMax model -> clean static .dae for CTRMap (one node, triangles, Y-up, facing +Z).

usage: xy2dae.py in.DAE outdir name --width W --sink S [--front -y|+y] [--tex 512] [--eye 128]
  width: target total width (game units, Lapras is ~60)
  sink : how far the model is pushed under the water (game units)
"""
import argparse, os, shutil, math, xml.etree.ElementTree as ET
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('out'); ap.add_argument('name')
ap.add_argument('--width', type=float, required=True)
ap.add_argument('--sink', type=float, default=0.0)
ap.add_argument('--front', default='-y')
ap.add_argument('--maxtex', type=int, default=512)
a = ap.parse_args()

NS = '{http://www.collada.org/2005/11/COLLADASchema}'
t = ET.parse(a.src).getroot()
up = (t.find('.//' + NS + 'up_axis').text if t.find('.//' + NS + 'up_axis') is not None else 'Y_UP')

def floats(src_id):
    s = t.find('.//' + NS + f'source[@id="{src_id}"]')
    acc = s.find('.//' + NS + 'accessor')
    return [float(x) for x in s.find(NS + 'float_array').text.split()], int(acc.get('stride'))

# material -> image file
img_file = {im.get('id'): im.find(NS + 'init_from').text for im in t.iter(NS + 'image')}
def material_image(mat_id):
    m = t.find('.//' + NS + f'material[@id="{mat_id}"]')
    fx = t.find('.//' + NS + f'effect[@id="{m.find(NS + "instance_effect").get("url")[1:]}"]')
    tex = fx.find('.//' + NS + 'texture').get('texture')  # sampler sid
    samp = fx.find('.//' + NS + f'newparam[@sid="{tex}"]')
    if samp is not None:
        surf_sid = samp.find('.//' + NS + 'source').text
        surf = fx.find('.//' + NS + f'newparam[@sid="{surf_sid}"]')
        img_id = surf.find('.//' + NS + 'init_from').text
    else:
        img_id = tex
    return img_file.get(img_id, img_id)

def to_yup(x, y, z):
    if up == 'Z_UP':
        fy = -y if a.front == '-y' else y   # forward axis -> +Z
        sx = 1 if a.front == '-y' else -1   # keep it a rotation, not a mirror
        return (sx * x, z, fy)
    return (x, y, z)

groups = []  # (material, image, tris[[(p,n,uv)*3]])
allp = []
for g in t.iter(NS + 'geometry'):
    m = g.find(NS + 'mesh')
    vsrc = m.find(NS + 'vertices').find(NS + 'input').get('source')[1:]
    P, ps = floats(vsrc)
    for prim in m:
        if prim.tag not in (NS + 'triangles', NS + 'polylist'):
            continue
        ins = prim.findall(NS + 'input'); stride = max(int(i.get('offset')) for i in ins) + 1
        off = {i.get('semantic'): (int(i.get('offset')), i.get('source')[1:]) for i in ins}
        Nn, ns_ = floats(off['NORMAL'][1]) if 'NORMAL' in off else (None, 3)
        T, ts = floats(off['TEXCOORD'][1]) if 'TEXCOORD' in off else (None, 2)
        idx = [int(x) for x in prim.find(NS + 'p').text.split()]
        if prim.tag == NS + 'polylist':
            vc = [int(x) for x in prim.find(NS + 'vcount').text.split()]
        else:
            vc = [3] * int(prim.get('count'))
        tris = []; k = 0
        for n in vc:
            poly = []
            for j in range(n):
                base = (k + j) * stride
                vi = idx[base + off['VERTEX'][0]]
                p = to_yup(*P[ps * vi: ps * vi + 3])
                nn = to_yup(*Nn[ns_ * idx[base + off['NORMAL'][0]]: ns_ * idx[base + off['NORMAL'][0]] + 3]) if Nn else (0, 1, 0)
                uv = T[ts * idx[base + off['TEXCOORD'][0]]: ts * idx[base + off['TEXCOORD'][0]] + 2] if T else (0, 0)
                poly.append([p, nn, list(uv)])
            for j in range(1, n - 1):
                tri = [poly[0], poly[j], poly[j + 1]]
                # move each triangle's UVs into the 0..1 tile it sits in (X/Y eyes use tiles 1..2)
                for c in (0, 1):
                    f = math.floor(min(v[2][c] for v in tri))
                    if f:
                        for v in tri: v[2][c] -= f
                tris.append(tri)
            k += n
        mat = prim.get('material')
        groups.append((mat, material_image(mat), tris))
        allp += [v[0] for tr in tris for v in tr]

mn = [min(p[i] for p in allp) for i in range(3)]; mx = [max(p[i] for p in allp) for i in range(3)]
s = a.width / (mx[0] - mn[0])
cx, cz = (mn[0] + mx[0]) / 2, (mn[2] + mx[2]) / 2
def place(p): return ((p[0] - cx) * s, (p[1] - mn[1]) * s - a.sink, (p[2] - cz) * s)

os.makedirs(a.out, exist_ok=True)
srcdir = os.path.dirname(a.src)
images, effects, mats, geoms_p = {}, [], [], []
P, Nn, U, prims = [], [], [], []
for gi, (mat, img, tris) in enumerate(groups):
    name = os.path.basename(img)
    if name not in images:
        im = Image.open(os.path.join(srcdir, img)).convert('RGBA')
        w, h = im.size; f = min(1, a.maxtex / max(w, h))
        if f < 1: im = im.resize((int(w * f), int(h * f)), Image.LANCZOS)
        im.save(os.path.join(a.out, name)); images[name] = im.size
    idx = []
    for tr in tris:
        for p, n, uv in tr:
            P.append(place(p)); Nn.append(n); U.append(uv); idx.append(len(P) - 1)
    prims.append((f'm{gi}', name, idx))

def fl(v): return ' '.join(f'{x:.5f}' for t3 in v for x in t3)
lib_img = ''.join(f'<image id="img{i}" name="{os.path.splitext(n)[0]}"><init_from>{n}</init_from></image>' for i, n in enumerate(images))
img_id = {n: f'img{i}' for i, n in enumerate(images)}
lib_fx = ''.join(f'<effect id="{m}-fx"><profile_COMMON><newparam sid="{m}-surf"><surface type="2D"><init_from>{img_id[n]}</init_from></surface></newparam><newparam sid="{m}-samp"><sampler2D><source>{m}-surf</source></sampler2D></newparam><technique sid="common"><lambert><diffuse><texture texture="{m}-samp" texcoord="UVMap"/></diffuse></lambert></technique></profile_COMMON></effect>' for m, n, _ in prims)
lib_mat = ''.join(f'<material id="{m}" name="{a.name}_{m}"><instance_effect url="#{m}-fx"/></material>' for m, _, _ in prims)
tri_xml = ''.join(f'<triangles material="{m}" count="{len(ix)//3}"><input semantic="VERTEX" source="#g-v" offset="0"/><input semantic="NORMAL" source="#g-n" offset="0"/><input semantic="TEXCOORD" source="#g-t" offset="0" set="0"/><p>{" ".join(map(str, ix))}</p></triangles>' for m, _, ix in prims)
bind = ''.join(f'<instance_material symbol="{m}" target="#{m}"><bind_vertex_input semantic="UVMap" input_semantic="TEXCOORD" input_set="0"/></instance_material>' for m, _, _ in prims)
dae = f'''<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><unit name="meter" meter="1"/><up_axis>Y_UP</up_axis></asset>
<library_images>{lib_img}</library_images><library_effects>{lib_fx}</library_effects><library_materials>{lib_mat}</library_materials>
<library_geometries><geometry id="g" name="{a.name}"><mesh>
<source id="g-p"><float_array id="g-pa" count="{3*len(P)}">{fl(P)}</float_array><technique_common><accessor source="#g-pa" count="{len(P)}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
<source id="g-n"><float_array id="g-na" count="{3*len(Nn)}">{fl(Nn)}</float_array><technique_common><accessor source="#g-na" count="{len(Nn)}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
<source id="g-t"><float_array id="g-ta" count="{2*len(U)}">{fl(U)}</float_array><technique_common><accessor source="#g-ta" count="{len(U)}" stride="2"><param name="S" type="float"/><param name="T" type="float"/></accessor></technique_common></source>
<vertices id="g-v"><input semantic="POSITION" source="#g-p"/></vertices>
{tri_xml}
</mesh></geometry></library_geometries>
<library_visual_scenes><visual_scene id="Scene" name="Scene"><node id="{a.name}" name="{a.name}" type="NODE"><instance_geometry url="#g"><bind_material><technique_common>{bind}</technique_common></bind_material></instance_geometry></node></visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#Scene"/></scene>
</COLLADA>'''
open(os.path.join(a.out, a.name + '.dae'), 'w').write(dae)
fm = [min(place(p)[i] for p in allp) for i in range(3)]; fM = [max(place(p)[i] for p in allp) for i in range(3)]
print(a.name, 'tris', sum(len(g[2]) for g in groups), 'groups', [(g[0], os.path.basename(g[1]), len(g[2])) for g in groups])
print(' scale', round(s, 4), 'bounds x', round(fm[0], 1), round(fM[0], 1), 'y', round(fm[1], 1), round(fM[1], 1), 'z', round(fm[2], 1), round(fM[2], 1), 'textures', images)
