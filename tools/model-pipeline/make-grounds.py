#!/usr/bin/env python3
"""make-grounds.py: pixel-art battle grounds (a/0/1/1 #0-33) with 3D edges: grass blades, rocks, snow lumps.

Same size as Black/White's discs (radius 5.33). One 128x128 texture per ground:
  - the circle in the middle is the top of the ground, seen from above (drawn at 64px, scaled up for the pixel look)
  - the four corners (never covered by the circle) hold colour gradients for the blades / rocks / lumps

usage: make-grounds.py outdir [style ...]       CTRMap: High Color + Serialize as Lookup Table, export .nsbmd
"""
import math, os, random, sys
from PIL import Image, ImageDraw

R, TOP, SEG, T, S = 5.33, 0.12, 48, 128, 64   # radius, top height, segments, texture size, pixel-art size

# ---------- pixel-art tops (drawn at 64x64) ----------
def top(base, rim, spots=(), streaks=None, seed=1, pattern=None):
    random.seed(seed)
    im = Image.new('RGB', (S, S), rim); px = im.load(); c = S / 2
    for y in range(S):
        for x in range(S):
            r = math.hypot(x + 0.5 - c, y + 0.5 - c) / c
            col = base if r < 0.86 else rim
            if r < 0.86 and pattern: col = pattern(x, y, r) or col
            px[x, y] = col
    d = ImageDraw.Draw(im)
    for col, n, size in spots:
        for _ in range(n):
            a = random.uniform(0, 2 * math.pi); rr = math.sqrt(random.random()) * 0.78 * c
            x, y = c + math.cos(a) * rr, c + math.sin(a) * rr
            x, y = int(x), int(y); d.rectangle((x, y, x + size - 1, y + max(1, size // 2) - 1), fill=col)
    if streaks:
        col, n = streaks
        for _ in range(n):
            y = random.uniform(c * 0.35, c * 1.65); x0 = random.uniform(c * 0.3, c * 1.1); L = random.uniform(5, 14)
            if math.hypot(x0 + L / 2 - c, y - c) / c < 0.75: d.line((x0, y, x0 + L, y), fill=col)
    return im

def planks(x, y, r):
    row = y // 7
    col = (156, 104, 64) if row % 2 else (170, 116, 72)
    if y % 7 == 0: return (110, 70, 42)
    if (x + row * 13) % 23 == 0: return (120, 78, 46)
    return col

def tiles(x, y, r):
    if (x + y) % 16 == 0 or (x - y) % 16 == 0: return (104, 104, 108)
    return (148, 148, 152) if ((x + y) // 16 + (x - y) // 16) % 2 else (138, 138, 142)

# ---------- corner gradients for the 3D edge pieces ----------
CORNERS = {'a': (2, 2), 'b': (T - 12, 2), 'c': (2, T - 26), 'd': (T - 12, T - 26)}  # 10 x 24 px each
def gradient(im, corner, dark, light):
    x0, y0 = CORNERS[corner]; d = ImageDraw.Draw(im)
    for i in range(24):
        t = i / 23; d.line((x0, y0 + i, x0 + 9, y0 + i), fill=tuple(int(light[k] + (dark[k] - light[k]) * t) for k in range(3)))
def cuv(corner, t):  # t=0 bottom (dark) .. 1 top (light) -> COLLADA uv (v=0 is the bottom row of the image)
    x0, y0 = CORNERS[corner]; row = y0 + 1 + (1 - t) * 21
    return ((x0 + 5) / T, 1 - row / T)

STYLES = {
    'Cave_Pool':   dict(top=lambda: top((40, 96, 112), (24, 64, 80), streaks=((72, 136, 152), 14), seed=2)),
    'Rocks_Grey':  dict(top=lambda: top((96, 96, 100), (70, 70, 74), spots=(((120, 120, 124), 30, 2), ((80, 80, 84), 30, 2)), seed=3),
                        deco=('rocks', 'a', (56, 56, 60), (150, 150, 156))),
    'Light_Path':  dict(top=lambda: top((228, 208, 160), (200, 176, 124), spots=(((212, 190, 140), 26, 2),), seed=4)),
    'Green_Grass': dict(top=lambda: top((104, 184, 72), (72, 148, 48), spots=(((136, 208, 96), 30, 2), ((84, 160, 56), 20, 2)), seed=5),
                        deco=('grass', 'a', (48, 120, 32), (168, 232, 104))),
    'Rocks_Brown': dict(top=lambda: top((112, 84, 64), (84, 60, 44), spots=(((132, 102, 80), 30, 2), ((92, 68, 50), 30, 2)), seed=6),
                        deco=('rocks', 'a', (64, 44, 32), (150, 116, 90))),
    'Dirt_Path':   dict(top=lambda: top((188, 128, 76), (156, 100, 56), spots=(((204, 146, 92), 26, 2),), seed=7)),
    'River':       dict(top=lambda: top((64, 160, 224), (40, 120, 192), streaks=((168, 220, 248), 16), seed=8)),
    'Snow':        dict(top=lambda: top((240, 244, 252), (208, 220, 240), spots=(((224, 232, 248), 24, 3),), seed=9),
                        deco=('snow', 'a', (184, 200, 228), (255, 255, 255))),
    'Snowy_Grass': dict(top=lambda: top((112, 176, 152), (84, 144, 124), spots=(((236, 244, 248), 40, 2),), seed=10),
                        deco=('grass', 'a', (72, 136, 116), (220, 240, 236))),
    'Ice':         dict(top=lambda: top((196, 236, 244), (156, 212, 228), streaks=((240, 252, 255), 18), seed=11)),
    'Forest':      dict(top=lambda: top((64, 144, 48), (44, 112, 32), spots=(((92, 172, 64), 30, 2),), seed=12),
                        deco=('tallgrass', 'a', (32, 96, 24), (124, 204, 72))),
    'Pale_Grass':  dict(top=lambda: top((176, 208, 112), (148, 180, 88), spots=(((196, 224, 136), 30, 2),), seed=13),
                        deco=('grass', 'a', (120, 160, 64), (212, 236, 156))),
    'Autumn_Grass': dict(top=lambda: top((204, 120, 64), (160, 80, 40), spots=(((228, 152, 80), 30, 2), ((176, 92, 48), 20, 2)), seed=16),
                        deco=('grass', 'a', (128, 56, 24), (244, 168, 72))),
    'Wood':        dict(top=lambda: top((164, 110, 68), (110, 70, 42), pattern=planks, seed=14)),
    'Paved':       dict(top=lambda: top((144, 144, 148), (100, 100, 104), pattern=tiles, seed=15)),
}

def build(style):
    cfg = STYLES[style]; random.seed(hash(style) & 0xffff)
    im = cfg['top']().resize((T, T), Image.NEAREST)
    P, U, idx = [], [], []
    def v(p, uv): P.append(p); U.append(uv); return len(P) - 1
    def tri(a, b, c, both=False):
        idx.extend((a, b, c))
        if both: idx.extend((a, c, b))
    tuv = lambda x, z: (0.5 + x / R * 0.5, 0.5 - z / R * 0.5)
    ring = [(math.cos(2 * math.pi * i / SEG), math.sin(2 * math.pi * i / SEG)) for i in range(SEG)]
    c = v((0, TOP, 0), tuv(0, 0))
    for i in range(SEG):
        a, b = ring[i], ring[(i + 1) % SEG]
        tri(c, v((b[0] * R, TOP, b[1] * R), tuv(b[0] * R, b[1] * R)), v((a[0] * R, TOP, a[1] * R), tuv(a[0] * R, a[1] * R)))
        k = 0.985  # thin edge down to the ground, rim coloured
        ta, tb = v((a[0] * R, TOP, a[1] * R), tuv(a[0] * R * k, a[1] * R * k)), v((b[0] * R, TOP, b[1] * R), tuv(b[0] * R * k, b[1] * R * k))
        ga, gb = v((a[0] * R * 1.02, 0, a[1] * R * 1.02), tuv(a[0] * R * k, a[1] * R * k)), v((b[0] * R * 1.02, 0, b[1] * R * 1.02), tuv(b[0] * R * k, b[1] * R * k))
        tri(ta, tb, gb); tri(ta, gb, ga)
    deco = cfg.get('deco')
    if deco:
        kind, corner, dark, light = deco; gradient(im, corner, dark, light)
        if kind in ('grass', 'tallgrass'):
            rows = [(0.97, 96, 0.6, 1.1)] + ([(0.88, 76, 0.85, 1.5)] if kind == "tallgrass" else [(0.9, 30, 0.4, 0.7)])
            for rr, n, hmin, hmax in rows:
                for i in range(n):
                    a = 2 * math.pi * (i + random.random() * 0.6) / n; ca, sa = math.cos(a), math.sin(a)
                    rad = R * (rr + random.uniform(-0.04, 0.03)); w = random.uniform(0.18, 0.3); h = random.uniform(hmin, hmax)
                    lean = random.uniform(-0.12, 0.12)
                    bx, bz = ca * rad, sa * rad
                    p1 = v((bx - sa * w, TOP, bz + ca * w), cuv(corner, 0.0)); p2 = v((bx + sa * w, TOP, bz - ca * w), cuv(corner, 0.0))
                    p3 = v((bx + ca * lean + sa * lean, TOP + h, bz + sa * lean - ca * lean), cuv(corner, 1.0))
                    tri(p1, p2, p3, both=True)
        else:  # rocks / snow: low domes on the rim
            n, smin, smax, hk = (20, 0.35, 0.75, 0.75) if kind == 'rocks' else (18, 0.45, 0.8, 0.45)
            for i in range(n):
                a = 2 * math.pi * (i + random.uniform(-0.3, 0.3)) / n; rad = R * random.uniform(0.9, 0.99)
                cx, cz = math.cos(a) * rad, math.sin(a) * rad; s = random.uniform(smin, smax); h = s * hk * random.uniform(0.8, 1.2)
                k = 6; rot = random.uniform(0, math.pi)
                base = [(cx + math.cos(rot + 2 * math.pi * j / k) * s * random.uniform(0.85, 1.1), cz + math.sin(rot + 2 * math.pi * j / k) * s * random.uniform(0.85, 1.1)) for j in range(k)]
                mid = [(cx + (bx - cx) * 0.6, cz + (bz - cz) * 0.6) for bx, bz in base]
                tip = v((cx, TOP + h, cz), cuv(corner, 1.0))
                B = [v((x, TOP * 0.5, z), cuv(corner, 0.0)) for x, z in base]
                M = [v((x, TOP + h * 0.7, z), cuv(corner, 0.6)) for x, z in mid]
                for j in range(k):
                    j2 = (j + 1) % k
                    tri(B[j], B[j2], M[j2]); tri(B[j], M[j2], M[j]); tri(M[j], M[j2], tip)
    # normals: mostly up so the edge pieces stay bright under the DS light
    N = [(0, 1, 0)] * len(P)
    return im, P, N, U, idx

def write_dae(path, name, tex, P, N, U, idx):
    fl = lambda a: ' '.join(f'{x:.5f}' for t in a for x in t)
    open(path, 'w').write(f'''<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1"><asset><unit name="meter" meter="1"/><up_axis>Y_UP</up_axis></asset>
<library_images><image id="img0" name="{tex[:-4]}"><init_from>{tex}</init_from></image></library_images>
<library_effects><effect id="m0-fx"><profile_COMMON><newparam sid="m0-surf"><surface type="2D"><init_from>img0</init_from></surface></newparam><newparam sid="m0-samp"><sampler2D><source>m0-surf</source></sampler2D></newparam><technique sid="common"><lambert><diffuse><texture texture="m0-samp" texcoord="UVMap"/></diffuse></lambert></technique></profile_COMMON></effect></library_effects>
<library_materials><material id="m0" name="{name}_mat"><instance_effect url="#m0-fx"/></material></library_materials>
<library_geometries><geometry id="g" name="{name}"><mesh>
<source id="g-p"><float_array id="g-pa" count="{3*len(P)}">{fl(P)}</float_array><technique_common><accessor source="#g-pa" count="{len(P)}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
<source id="g-n"><float_array id="g-na" count="{3*len(N)}">{fl(N)}</float_array><technique_common><accessor source="#g-na" count="{len(N)}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
<source id="g-t"><float_array id="g-ta" count="{2*len(U)}">{fl(U)}</float_array><technique_common><accessor source="#g-ta" count="{len(U)}" stride="2"><param name="S" type="float"/><param name="T" type="float"/></accessor></technique_common></source>
<vertices id="g-v"><input semantic="POSITION" source="#g-p"/></vertices>
<triangles material="m0" count="{len(idx)//3}"><input semantic="VERTEX" source="#g-v" offset="0"/><input semantic="NORMAL" source="#g-n" offset="0"/><input semantic="TEXCOORD" source="#g-t" offset="0" set="0"/><p>{" ".join(map(str, idx))}</p></triangles>
</mesh></geometry></library_geometries>
<library_visual_scenes><visual_scene id="Scene" name="Scene"><node id="{name}" name="{name}" type="NODE"><instance_geometry url="#g"><bind_material><technique_common><instance_material symbol="m0" target="#m0"><bind_vertex_input semantic="UVMap" input_semantic="TEXCOORD" input_set="0"/></instance_material></technique_common></bind_material></instance_geometry></node></visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#Scene"/></scene></COLLADA>''')

# Black/White slot (a/0/1/1 member) -> ground. Worked out from each slot's original texture
# (name batt_stageNN, a/b/c/d = spring/summer/autumn/winter) and its colours. Best guess: check in game.
SLOTS = {0: 'Light_Path', 1: 'Green_Grass', 2: 'Green_Grass', 3: 'Autumn_Grass', 4: 'Snowy_Grass', 5: 'Rocks_Brown',
         6: 'Paved', 7: 'Cave_Pool', 8: 'Pale_Grass', 9: 'Forest', 10: 'Forest', 11: 'Autumn_Grass', 12: 'Snowy_Grass',
         13: 'Dirt_Path', 14: 'River', 15: 'Cave_Pool', 16: 'Light_Path', 17: 'Light_Path', 18: 'River', 19: 'Snow',
         20: 'Paved', 21: 'Rocks_Grey', 22: 'Ice', 23: 'Paved', 24: 'Wood', 25: 'Paved', 26: 'Paved', 27: 'Dirt_Path',
         28: 'Forest', 29: 'Forest', 30: 'Autumn_Grass', 31: 'Snowy_Grass', 32: 'Green_Grass', 33: 'Paved'}

if __name__ == '__main__':
    out = sys.argv[1]
    for s in sys.argv[2:] or list(STYLES):
        name = f'Ground_{s}'; d = os.path.join(out, name); os.makedirs(d, exist_ok=True)
        im, P, N, U, idx = build(s); tex = f'ground_{s.lower()}.png'
        im.quantize(colors=256, method=Image.MEDIANCUT, dither=Image.NONE).save(os.path.join(d, tex))
        write_dae(os.path.join(d, name + '.dae'), name, tex, P, N, U, idx)
        print(name, len(idx) // 3, 'tris')
