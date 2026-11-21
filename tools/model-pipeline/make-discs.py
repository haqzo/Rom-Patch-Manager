#!/usr/bin/env python3
"""make-discs.py: battle ground (platform) discs for a/0/1/1 #0-33, as .dae + 128x128 PNG for CTRMap.

Same size as Black/White's own discs (radius 5.33, flat, top at y=0.35, small bevel to the ground).
UVs are a top-down projection, so each PNG is simply what the disc looks like from above.

usage: make-discs.py outdir [style ...]      (no styles = all)
CTRMap: import the .dae, set the texture to High Color + Serialize as Lookup Table, export .nsbmd.
"""
import math, os, random, sys
from PIL import Image, ImageDraw, ImageFilter

R, TOP, SEG, TEX = 5.33, 0.35, 48, 128
C = TEX / 2

def disc(fill_fn, seed=1):
    random.seed(seed)
    im = Image.new('RGB', (TEX, TEX))
    px = im.load()
    for y in range(TEX):
        for x in range(TEX):
            dx, dy = (x + 0.5 - C) / C, (y + 0.5 - C) / C
            r = min(1.0, math.hypot(dx, dy)); a = math.atan2(dy, dx)
            px[x, y] = tuple(max(0, min(255, int(v))) for v in fill_fn(r, a, x, y))
    return im

def mix(c1, c2, t): return [c1[i] + (c2[i] - c1[i]) * t for i in range(3)]
def noise(seed):
    random.seed(seed); g = [[random.random() for _ in range(TEX + 1)] for _ in range(TEX + 1)]
    return lambda x, y: g[y % TEX][x % TEX]

def style_stadium():
    n = noise(2)
    def f(r, a, x, y):
        base = mix([236, 240, 246], [205, 214, 228], r)
        if 0.86 < r < 0.95: base = [38, 110, 210]
        elif r >= 0.95: base = [26, 70, 150]
        elif 0.26 < r < 0.31: base = [38, 110, 210]
        elif abs((y + 0.5 - C) / C) < 0.035 and 0.31 <= r <= 0.86: base = [190, 200, 216]
        return [c + (n(x, y) - 0.5) * 6 for c in base]
    return disc(f)

def style_grass():
    n = noise(3)
    def f(r, a, x, y):
        base = mix([112, 184, 82], [78, 150, 60], r ** 2)
        if r > 0.9: base = mix([70, 128, 52], [52, 98, 40], (r - 0.9) / 0.1)
        k = n(x, y)
        if k > 0.86: base = mix(base, [168, 214, 108], 0.6)
        elif k < 0.12: base = mix(base, [60, 112, 44], 0.5)
        return base
    return disc(f)

def style_sand():
    n = noise(4)
    def f(r, a, x, y):
        base = mix([238, 214, 160], [222, 192, 136], r)
        ripple = math.sin(r * 34 + math.sin(a * 3) * 0.6)
        base = mix(base, [205, 172, 116], max(0, ripple) * 0.35)
        if r > 0.92: base = mix([196, 160, 104], [170, 134, 84], (r - 0.92) / 0.08)
        return [c + (n(x, y) - 0.5) * 14 for c in base]
    return disc(f)

def style_stone():
    n = noise(5)
    def f(r, a, x, y):
        ring = int(r * 4.2); seg = int((a + math.pi) / (2 * math.pi) * (6 + ring * 6) + ring * 0.5)
        random.seed(ring * 97 + seg); tone = random.uniform(-14, 14)
        base = [150 + tone, 150 + tone, 156 + tone]
        fr = r * 4.2 - ring; fa = ((a + math.pi) / (2 * math.pi) * (6 + ring * 6) + ring * 0.5) % 1
        if fr < 0.07 or (ring > 0 and fa < 0.035 * (1 + ring * 0.6)): base = [92, 92, 100]
        if r > 0.94: base = [104, 104, 112]
        return [c + (n(x, y) - 0.5) * 16 for c in base]
    return disc(f)

def style_ice():
    n = noise(6)
    im = disc(lambda r, a, x, y: [c + (n(x, y) - 0.5) * 8 for c in (mix([226, 244, 255], [176, 216, 244], r ** 1.5) if r < 0.92 else [130, 182, 226])])
    d = ImageDraw.Draw(im); random.seed(7)
    for _ in range(9):  # cracks
        ang = random.uniform(0, 2 * math.pi); r0 = random.uniform(0.05, 0.35); pts = []
        rr = r0
        while rr < 0.9:
            ang += random.uniform(-0.25, 0.25); pts.append((C + math.cos(ang) * rr * C, C + math.sin(ang) * rr * C)); rr += random.uniform(0.08, 0.16)
        d.line(pts, fill=(255, 255, 255), width=1)
    return im

def style_neon():
    def f(r, a, x, y):
        base = mix([24, 30, 62], [14, 18, 40], r)
        for rc, w, col in ((0.9, 0.05, [80, 230, 255]), (0.45, 0.025, [180, 110, 255])):
            t = max(0, 1 - abs(r - rc) / w); base = mix(base, col, t)
        g = max(0, 1 - abs(r - 0.9) / 0.14) * 0.25; base = mix(base, [80, 230, 255], g)
        return base
    return disc(f)

def style_lava():
    n = noise(8)
    def f(r, a, x, y):
        k = n(x // 3, y // 3) * 0.6 + n(x, y) * 0.4
        base = [58, 44, 44] if k < 0.62 else mix([255, 120, 30], [255, 210, 80], (k - 0.62) / 0.38)
        if r > 0.92: base = [40, 30, 30]
        return base
    return disc(f)

STYLES = {'Stadium': style_stadium, 'Grass': style_grass, 'Sand': style_sand, 'Stone': style_stone,
          'Ice': style_ice, 'Neon': style_neon, 'Lava': style_lava}

def write_dae(path, name, tex):
    P, U, idx = [], [], []
    def v(p, uv): P.append(p); U.append(uv); return len(P) - 1
    ring = [(math.cos(2 * math.pi * i / SEG), math.sin(2 * math.pi * i / SEG)) for i in range(SEG)]
    uv = lambda cx, cz, k=1.0: (0.5 + cx * k * 0.5, 0.5 - cz * k * 0.5)
    c = v((0, TOP, 0), uv(0, 0))
    for i in range(SEG):  # top (counter-clockwise seen from above = front face)
        a, b = ring[i], ring[(i + 1) % SEG]
        idx += [c, v((b[0] * R, TOP, b[1] * R), uv(*b)), v((a[0] * R, TOP, a[1] * R), uv(*a))]
    for i in range(SEG):  # bevel down to the ground, coloured like the rim
        a, b = ring[i], ring[(i + 1) % SEG]
        ta, tb = v((a[0] * R, TOP, a[1] * R), uv(*a, 0.97)), v((b[0] * R, TOP, b[1] * R), uv(*b, 0.97))
        ga, gb = v((a[0] * R * 1.04, 0, a[1] * R * 1.04), uv(*a, 0.99)), v((b[0] * R * 1.04, 0, b[1] * R * 1.04), uv(*b, 0.99))
        idx += [ta, tb, gb, ta, gb, ga]
    # normals: up for the top, outward-ish for the bevel
    N = [(0, 1, 0) if p[1] > 0.0 and math.hypot(p[0], p[2]) < R * 0.999 or p == (0, TOP, 0) else (p[0] / R * 0.6, 0.8, p[2] / R * 0.6) for p in P]
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

if __name__ == '__main__':
    out = sys.argv[1]; want = sys.argv[2:] or list(STYLES)
    for s in want:
        name = f'Disc_{s}'; d = os.path.join(out, name); os.makedirs(d, exist_ok=True)
        im = STYLES[s]().quantize(colors=256, method=Image.MEDIANCUT, dither=Image.NONE)
        im.save(os.path.join(d, f'disc_{s.lower()}.png'))
        write_dae(os.path.join(d, name + '.dae'), name, f'disc_{s.lower()}.png')
        print(name)
