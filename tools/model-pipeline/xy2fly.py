#!/usr/bin/env python3
"""xy2fly.py: X/Y ColladaMax rigged model -> Fly-scene .dae (Mato's 8-bone fly skeleton) for CTRMap.

Wings follow the source rig: <side>Shoulder/<side>Arm -> inner wing joint, <side>ForeArm/Hand/Finger* -> outer wing joint,
everything else -> joint1 (body). Player sprite + flash effects are copied from Mato's working fly model (aux.json).
usage: xy2fly.py src.DAE auxdir outdir name --span 88 [--front -y] [--lift 0]
"""
import argparse, os, json, math, re, xml.etree.ElementTree as ET
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('aux'); ap.add_argument('out'); ap.add_argument('name')
ap.add_argument('--span', type=float, default=88.0, help='wingspan (Mato Charizard: 88)')
ap.add_argument('--front', default='auto')
ap.add_argument('--lift', type=float, default=0.0, help='extra height of the body')
ap.add_argument('--maxtex', type=int, default=512)
ap.add_argument('--pitch', type=float, default=0.0, help='tilt nose-down (degrees) so an upright model flies horizontally')
a = ap.parse_args()
NS = '{http://www.collada.org/2005/11/COLLADASchema}'
t = ET.parse(a.src).getroot()
up = t.find('.//' + NS + 'up_axis').text

def fsrc(i):
    s = t.find('.//' + NS + f'source[@id="{i}"]'); acc = s.find('.//' + NS + 'accessor')
    arr = s.find(NS + 'float_array'); arr = arr if arr is not None else s.find(NS + 'Name_array')
    return arr.text.split(), int(acc.get('stride', 1))

# --- skin weights: vertex index -> {source joint: w}
ctrl = t.find('.//' + NS + 'controller'); skin = ctrl.find(NS + 'skin')
geo_id = skin.get('source')[1:]
jin = {i.get('semantic'): i.get('source')[1:] for i in skin.find(NS + 'joints').findall(NS + 'input')}
vw = skin.find(NS + 'vertex_weights')
vwin = {i.get('semantic'): (int(i.get('offset')), i.get('source')[1:]) for i in vw.findall(NS + 'input')}
jnames = t.find('.//' + NS + f'source[@id="{vwin["JOINT"][1]}"]').find(NS + 'Name_array').text.split()
sid2name = {n.get('sid'): n.get('name') for n in t.iter(NS + 'node') if n.get('sid')}
jnames = [sid2name.get(j, j) for j in jnames]
wvals = [float(x) for x in fsrc(vwin['WEIGHT'][1])[0]]
vcount = [int(x) for x in vw.find(NS + 'vcount').text.split()]; vv = [int(x) for x in vw.find(NS + 'v').text.split()]
nin = len(vwin); k = 0; weights = []
for c in vcount:
    d = {}
    for j in range(c):
        ji, wi = vv[k + vwin['JOINT'][0]], vv[k + vwin['WEIGHT'][0]]; k += nin
        d[jnames[ji]] = d.get(jnames[ji], 0) + wvals[wi]
    weights.append(d)
bsm = [float(x) for x in skin.find(NS + 'bind_shape_matrix').text.split()]

def group_of(j):
    m = re.match(r'^(?:End)?([LR])(Shoulder|Arm|ForeArm|Hand|Finger)', j)
    if not m: return ('body', None)
    return ('inner' if m.group(2) in ('Shoulder', 'Arm') else 'outer', m.group(1))

# --- geometry (bind pose)
geo = t.find('.//' + NS + f'geometry[@id="{geo_id}"]'); mesh = geo.find(NS + 'mesh')
P = [float(x) for x in fsrc(mesh.find(NS + 'vertices').find(NS + 'input').get('source')[1:])[0]]
def xf(m, p): return [m[0]*p[0]+m[1]*p[1]+m[2]*p[2]+m[3], m[4]*p[0]+m[5]*p[1]+m[6]*p[2]+m[7], m[8]*p[0]+m[9]*p[1]+m[10]*p[2]+m[11]]
def yup(p):
    return [p[0], p[2], -p[1]] if up == 'Z_UP' else list(p)
pos = [yup(xf(bsm, P[3*i:3*i+3])) for i in range(len(P)//3)]

img_file = {im.get('id'): im.find(NS + 'init_from').text for im in t.iter(NS + 'image')}
def material_image(mat_id):
    m = t.find('.//' + NS + f'material[@id="{mat_id}"]')
    fx = t.find('.//' + NS + f'effect[@id="{m.find(NS + "instance_effect").get("url")[1:]}"]')
    tex = fx.find('.//' + NS + 'texture').get('texture'); samp = fx.find('.//' + NS + f'newparam[@sid="{tex}"]')
    if samp is not None:
        surf = fx.find('.//' + NS + f'newparam[@sid="{samp.find(".//" + NS + "source").text}"]'); return img_file[surf.find('.//' + NS + 'init_from').text]
    return img_file.get(tex, tex)

prims = []
for prim in mesh:
    if prim.tag != NS + 'triangles': continue
    ins = prim.findall(NS + 'input'); stride = max(int(i.get('offset')) for i in ins) + 1
    off = {i.get('semantic'): (int(i.get('offset')), i.get('source')[1:]) for i in ins}
    T, ts = fsrc(off['TEXCOORD'][1]); T = [float(x) for x in T]
    Nn, nst = fsrc(off['NORMAL'][1]); Nn = [float(x) for x in Nn]
    idx = [int(x) for x in prim.find(NS + 'p').text.split()]
    corners = []
    for c in range(len(idx) // stride):
        b = c * stride; vi = idx[b + off['VERTEX'][0]]
        uv = T[ts * idx[b + off['TEXCOORD'][0]]: ts * idx[b + off['TEXCOORD'][0]] + 2]
        n = yup(Nn[nst * idx[b + off['NORMAL'][0]]: nst * idx[b + off['NORMAL'][0]] + 3])
        corners.append([vi, n, list(uv)])
    for i in range(0, len(corners), 3):  # move each triangle's UVs into tile 0..1
        tri = corners[i:i + 3]
        for ci in (0, 1):
            f = math.floor(min(v[2][ci] for v in tri))
            if f:
                for v in tri: v[2][ci] -= f
    prims.append((prim.get('material'), material_image(prim.get('material')), corners))

# --- orientation: eyes at +Z
eye = [p for p in prims if 'eye' in os.path.basename(p[1]).lower()]
if eye:
    cz = sum(pos[c[0]][2] for c in eye[0][2]) / len(eye[0][2])
    if cz < 0:
        pos = [[-p[0], p[1], -p[2]] for p in pos]
        prims = [(m, im, [[c[0], [-c[1][0], c[1][1], -c[1][2]], c[2]] for c in cs]) for m, im, cs in prims]
# tilt: upright X/Y pose -> horizontal flight (rotate about X; +y goes towards +z)
if a.pitch:
    th = math.radians(a.pitch); c_, s_ = math.cos(th), math.sin(th)
    rx = lambda p: [p[0], p[1] * c_ - p[2] * s_, p[1] * s_ + p[2] * c_]
    pos = [rx(p) for p in pos]
    prims = [(m, im, [[c[0], rx(c[1]), c[2]] for c in cs]) for m, im, cs in prims]
# which side is +X: the side whose wing bones sit at +x becomes joint2/joint3
side_x = {'L': 0.0, 'R': 0.0}; cnt = {'L': 0, 'R': 0}
for vi, d in enumerate(weights):
    j = max(d, key=d.get); g, s = group_of(j)
    if s: side_x[s] += pos[vi][0]; cnt[s] += 1
plus = 'R' if side_x['R'] / max(1, cnt['R']) > 0 else 'L'
JOINT = {('body', None): 'joint1', ('inner', plus): 'joint2', ('outer', plus): 'joint3'}
minus = 'L' if plus == 'R' else 'R'
JOINT[('inner', minus)] = 'joint5'; JOINT[('outer', minus)] = 'joint6'

# --- scale + place: wingspan = span, body (joint1 verts) centred at x=0,z=0, body centre a bit below the rider
xs = [p[0] for p in pos]; s = a.span / (max(xs) - min(xs))
body = [pos[vi] for vi, d in enumerate(weights) if group_of(max(d, key=d.get))[0] == 'body']
bc = [sum(p[i] for p in body) / len(body) for i in range(3)]
pos = [[(p[0] - bc[0]) * s, (p[1] - bc[1]) * s + a.lift, (p[2] - bc[2]) * s] for p in pos]

# per-vertex fly-joint weights (top 2, normalised)
vjw = []
for d in weights:
    acc = {}
    for j, w in d.items(): acc[JOINT[group_of(j)]] = acc.get(JOINT[group_of(j)], 0) + w
    top = sorted(acc.items(), key=lambda x: -x[1])[:2]; tot = sum(w for _, w in top)
    vjw.append([(j, w / tot) for j, w in top])

# --- skeleton (Mato's Charizard rest pose)
sk = json.load(open(os.path.join(a.aux, 'skeleton.json')))
aux = json.load(open(os.path.join(a.aux, 'aux.json')))
names = [o['name'] for o in sk]
def local(o):
    R, tt, sc = o['R'], o['t'], o['s']
    return [R[0]*sc[0], R[1]*sc[1], R[2]*sc[2], tt[0], R[3]*sc[0], R[4]*sc[1], R[5]*sc[2], tt[1], R[6]*sc[0], R[7]*sc[1], R[8]*sc[2], tt[2], 0, 0, 0, 1]
def mm(a_, b_):
    return [sum(a_[4*r+k]*b_[4*k+c] for k in range(4)) for r in range(4) for c in range(4)]
world = {}
for i, o in enumerate(sk):
    world[i] = local(o) if o['parent'] < 0 else mm(world[o['parent']], local(o))
def inv(m):  # rigid/scale 4x4 inverse via numpy-free Gauss-Jordan
    A = [m[4*r:4*r+4] + [1.0 if r == c else 0.0 for c in range(4)] for r in range(4)]
    for c in range(4):
        piv = max(range(c, 4), key=lambda r: abs(A[r][c])); A[c], A[piv] = A[piv], A[c]
        pv = A[c][c]; A[c] = [x / pv for x in A[c]]
        for r in range(4):
            if r != c: f = A[r][c]; A[r] = [x - f * y for x, y in zip(A[r], A[c])]
    return [A[r][4 + c] for r in range(4) for c in range(4)]

os.makedirs(a.out, exist_ok=True); srcdir = os.path.dirname(a.src)
# geometry list: (mesh name, material id, material name, image file, positions, normals, uvs, per-vertex weights)
G = []
for mi, (mat, img, cs) in enumerate(prims):
    nm = os.path.splitext(os.path.basename(img))[0]
    im = Image.open(os.path.join(srcdir, img)).convert('RGBA'); w, h = im.size; f = min(1, a.maxtex / max(w, h))
    if f < 1: im = im.resize((int(w*f), int(h*f)), Image.LANCZOS)
    im.save(os.path.join(a.out, nm + '.png'))
    G.append((f'{a.name}_{mi}', f'{a.name}_mat{mi}', f'{a.name}_mat{mi}', nm + '.png', [pos[c[0]] for c in cs], [c[1] for c in cs], [c[2] for c in cs], [vjw[c[0]] for c in cs]))
for x in aux:
    nm = x['png'][:-len('_png.png')] + '.png'  # CTRMap appends _png to the image name
    Image.open(os.path.join(a.aux, x['png'])).save(os.path.join(a.out, nm))
    G.append((x['polygon'], x['material'], x['material'], nm, x['P'], [[0, 0, 1]] * len(x['P']), x['U'], [[(x['joint'], 1.0)]] * len(x['P'])))

def fl(v): return ' '.join(f'{c:.5f}' for t3 in v for c in t3)
imgs = sorted({g[3] for g in G}); img_id = {n: f'img{i}' for i, n in enumerate(imgs)}
X = ['<?xml version="1.0" encoding="utf-8"?>\n<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1"><asset><unit name="meter" meter="1"/><up_axis>Y_UP</up_axis></asset>']
X.append('<library_images>' + ''.join(f'<image id="{img_id[n]}" name="{n[:-4]}"><init_from>{n}</init_from></image>' for n in imgs) + '</library_images>')
mats = {}
for g in G: mats.setdefault(g[1], (g[2], g[3]))
X.append('<library_effects>' + ''.join(f'<effect id="{m}-fx"><profile_COMMON><newparam sid="{m}-surf"><surface type="2D"><init_from>{img_id[im]}</init_from></surface></newparam><newparam sid="{m}-samp"><sampler2D><source>{m}-surf</source></sampler2D></newparam><technique sid="common"><lambert><diffuse><texture texture="{m}-samp" texcoord="UVMap"/></diffuse></lambert></technique></profile_COMMON></effect>' for m, (_, im) in mats.items()) + '</library_effects>')
X.append('<library_materials>' + ''.join(f'<material id="{m}" name="{nm}"><instance_effect url="#{m}-fx"/></material>' for m, (nm, _) in mats.items()) + '</library_materials>')
geos, ctrls, insts = [], [], []
inv_bind = ' '.join(' '.join(f'{v:.6f}' for v in inv(world[i])) for i in range(len(names)))
for gi, (gname, mid, _, _, Ps, Ns, Us, Ws) in enumerate(G):
    g = f'geo{gi}'; n = len(Ps)
    geos.append(f'<geometry id="{g}" name="{gname}"><mesh>'
        f'<source id="{g}-p"><float_array id="{g}-pa" count="{3*n}">{fl(Ps)}</float_array><technique_common><accessor source="#{g}-pa" count="{n}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>'
        f'<source id="{g}-n"><float_array id="{g}-na" count="{3*n}">{fl(Ns)}</float_array><technique_common><accessor source="#{g}-na" count="{n}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>'
        f'<source id="{g}-t"><float_array id="{g}-ta" count="{2*n}">{fl(Us)}</float_array><technique_common><accessor source="#{g}-ta" count="{n}" stride="2"><param name="S" type="float"/><param name="T" type="float"/></accessor></technique_common></source>'
        f'<vertices id="{g}-v"><input semantic="POSITION" source="#{g}-p"/></vertices>'
        f'<triangles material="{mid}" count="{n//3}"><input semantic="VERTEX" source="#{g}-v" offset="0"/><input semantic="NORMAL" source="#{g}-n" offset="0"/><input semantic="TEXCOORD" source="#{g}-t" offset="0" set="0"/><p>{" ".join(map(str, range(n)))}</p></triangles></mesh></geometry>')
    wl, vc, v = [], [], []
    for ws in Ws:
        vc.append(str(len(ws)))
        for j, w in ws: v += [str(names.index(j)), str(len(wl))]; wl.append(f'{w:.5f}')
    ctrls.append(f'<controller id="{g}-skin"><skin source="#{g}"><bind_shape_matrix>1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1</bind_shape_matrix>'
        f'<source id="{g}-j"><Name_array id="{g}-ja" count="{len(names)}">{" ".join(names)}</Name_array><technique_common><accessor source="#{g}-ja" count="{len(names)}" stride="1"><param name="JOINT" type="name"/></accessor></technique_common></source>'
        f'<source id="{g}-ib"><float_array id="{g}-iba" count="{16*len(names)}">{inv_bind}</float_array><technique_common><accessor source="#{g}-iba" count="{len(names)}" stride="16"><param name="TRANSFORM" type="float4x4"/></accessor></technique_common></source>'
        f'<source id="{g}-w"><float_array id="{g}-wa" count="{len(wl)}">{" ".join(wl)}</float_array><technique_common><accessor source="#{g}-wa" count="{len(wl)}" stride="1"><param name="WEIGHT" type="float"/></accessor></technique_common></source>'
        f'<joints><input semantic="JOINT" source="#{g}-j"/><input semantic="INV_BIND_MATRIX" source="#{g}-ib"/></joints>'
        f'<vertex_weights count="{len(Ws)}"><input semantic="JOINT" source="#{g}-j" offset="0"/><input semantic="WEIGHT" source="#{g}-w" offset="1"/><vcount>{" ".join(vc)}</vcount><v>{" ".join(v)}</v></vertex_weights></skin></controller>')
    insts.append(f'<node id="mesh{gi}" name="{gname}" type="NODE"><instance_controller url="#{g}-skin"><skeleton>#j_world_root</skeleton><bind_material><technique_common><instance_material symbol="{mid}" target="#{mid}"><bind_vertex_input semantic="UVMap" input_semantic="TEXCOORD" input_set="0"/></instance_material></technique_common></bind_material></instance_controller></node>')
def joint_xml(i):
    o = sk[i]; m = local(o)
    kids = ''.join(joint_xml(c) for c in range(len(sk)) if sk[c]['parent'] == i)
    return f'<node id="j_{o["name"]}" name="{o["name"]}" sid="{o["name"]}" type="JOINT"><matrix sid="transform">{" ".join(f"{v:.6f}" for v in m)}</matrix>{kids}</node>'
X.append('<library_geometries>' + ''.join(geos) + '</library_geometries>')
X.append('<library_controllers>' + ''.join(ctrls) + '</library_controllers>')
X.append('<library_visual_scenes><visual_scene id="Scene" name="Scene">' + joint_xml(0) + ''.join(insts) + '</visual_scene></library_visual_scenes><scene><instance_visual_scene url="#Scene"/></scene></COLLADA>')
open(os.path.join(a.out, a.name + '.dae'), 'w').write(''.join(X))
allp = [p for g in G[:len(prims)] for p in g[4]]
mn = [min(p[i] for p in allp) for i in range(3)]; mx = [max(p[i] for p in allp) for i in range(3)]
from collections import Counter
cnt = Counter(max(w, key=lambda x: x[1])[0] for g in G[:len(prims)] for w in g[7])
print(a.name, 'tris', sum(len(g[4]) for g in G) // 3, '| +X wing side =', plus, '| scale', round(s, 4))
print(' bounds x', round(mn[0]), round(mx[0]), 'y', round(mn[1]), round(mx[1]), 'z', round(mn[2]), round(mx[2]))
print(' vertices per fly joint:', dict(cnt))
