#!/usr/bin/env python3
"""Experimental detailed battle grounds, based on Haqzo's existing pixel models.

Run: python3 experiments/battle-platform-detail-v2/build.py [output-folder]
Outputs two importable COLLADA models + 128x128 paletted PNG textures.
DO NOT produce or hand-edit NSBMD files here; export models via CTRMap-CE.
This experiment is NOT tested in PokeMMO.
"""
from __future__ import annotations

import math
import random
import sys
from pathlib import Path
from xml.sax.saxutils import escape
from PIL import Image, ImageDraw

RADIUS = 5.33  # exact nominal radius of the existing generator
TOP = 0.12
SEGMENTS = 48
TEX = 128
C = TEX / 2.0
CORNER = {"dark": (2, 2), "light": (TEX - 12, 2), "warm": (2, TEX - 26), "cool": (TEX - 12, TEX - 26)}
COLORS = {
    "Green_Grass": {
        "center": (114, 178, 75), "edge": (68, 130, 46),
        "ramps": {
            "dark": ((36, 91, 28), (93, 160, 53)),
            "light": ((63, 125, 32), (177, 221, 101)),
            "warm": ((49, 109, 30), (125, 191, 64)),
            "cool": ((29, 88, 36), (111, 170, 62)),
        }
    },
    "Rocks_Brown": {
        "center": (140, 103, 73), "edge": (91, 65, 47),
        "ramps": {
            "dark": ((57, 42, 33), (113, 84, 61)),
            "light": ((87, 62, 44), (183, 143, 104)),
            "warm": ((71, 49, 35), (150, 109, 78)),
            "cool": ((64, 48, 37), (127, 100, 77)),
        }
    },
}

def blend(a, b, t):
    return tuple(round(a[k] * (1 - t) + b[k] * t) for k in range(3))

def clamp(c):
    return tuple(max(0, min(255, int(v))) for v in c)

def polar(x, y):
    return math.hypot(x - C, y - C) / C

def atlas(style):
    cfg = COLORS[style]
    rng = random.Random(181126 if style == "Green_Grass" else 271126)
    blocks = [[rng.uniform(-1, 1) for x in range(20)] for y in range(20)]
    tex = Image.new("RGB", (TEX, TEX))
    px = tex.load()
    for y in range(TEX):
        for x in range(TEX):
            r = polar(x + .5, y + .5)
            t = min(1, max(0, (r - .35) / .65))
            col = blend(cfg["center"], cfg["edge"], t * .82)
            noise = blocks[min(19, y // 7)][min(19, x // 7)] * 9
            grain = ((x * 13 + y * 37 + x * y * 3) % 17 - 8) * .4
            if .84 < r < .95: noise -= (r - .84) * 38
            px[x, y] = clamp(c + noise + grain for c in col)
    d = ImageDraw.Draw(tex)
    if style == "Green_Grass":
        # Top-down painted tufts add complexity without geometry or occlusion.
        for i in range(210):
            ang = rng.random() * math.tau
            rr = math.sqrt(rng.random()) * .88
            if rr < .28:  # keep the pokemon's central foot area quiet
                continue
            x, y = C + rr * C * math.cos(ang), C + rr * C * math.sin(ang)
            width = rng.choice([2, 3, 4, 5])
            shade = rng.choice([(54, 127, 45), (81, 153, 47), (134, 193, 74),
                                (160, 204, 99), (100, 170, 57)])
            d.polygon([(x-width/2, y), (x, y-2), (x+width/2, y),
                       (x+.5, y+1)], fill=shade)
        for i in range(11):
            a = rng.random() * math.tau
            rr = rng.uniform(.62, .82)
            x, y = round(C + rr*C*math.cos(a)), round(C + rr*C*math.sin(a))
            d.point((x,y), fill=(244, 238, 195))
            d.point((x+1,y), fill=(229, 224, 159))
    else:
        # Flat gravel, layered stone-coloured strata and shallow cracks.
        for i in range(125):
            a = rng.random() * math.tau
            rr = math.sqrt(rng.random()) * .88
            if rr < .23 and i % 3: continue
            x, y = C + rr * C * math.cos(a), C + rr * C * math.sin(a)
            radius = rng.choice([1.0, 1.8, 2.4, 3.2])
            shade = rng.choice([(98, 71, 52), (163, 123, 85), (117, 86, 63),
                                (179, 135, 96), (125, 91, 66)])
            d.polygon([(x-radius, y), (x, y-radius*.55),
                       (x+radius, y), (x+radius*.25, y+radius*.55)], fill=shade)
        for i in range(15):
            a = rng.random() * math.tau
            rr = rng.uniform(.28, .8)
            x, y = C + rr*C*math.cos(a), C + rr*C*math.sin(a)
            step = rng.uniform(2, 5)
            d.line([(x-2*step, y-1), (x-step, y+1), (x, y), (x+step, y+2)],
                   fill=(98, 68, 48), width=1)
    # Four shaded ramp swatches outside the UV-mapped circle; raised blades and
    # rock facets sample these. The gradient is part of the SINGLE texture.
    for key, (dark, light) in cfg["ramps"].items():
        sx, sy = CORNER[key]
        for yy in range(24):
            t = yy / 23
            d.line((sx, sy+yy, sx+9, sy+yy), fill=blend(light, dark, t))
    return tex.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)

def rim_uv(corner, t):
    sx, sy = CORNER[corner]
    row = sy + 1 + (1-t) * 21
    return ((sx+5)/TEX, 1-row/TEX)

class Mesh:
    def __init__(self):
        self.positions, self.uvs, self.indices = [], [], []
    def vertex(self, xyz, uv):
        self.positions.append(tuple(xyz))
        self.uvs.append(tuple(uv))
        return len(self.positions)-1
    def triangle(self, a, b, c, both=False):
        self.indices.extend([a,b,c])
        if both: self.indices.extend([a,c,b])
    def base(self):
        uv = lambda x,z: (.5 + x/(2*RADIUS), .5 - z/(2*RADIUS))
        ang = [math.tau * i/SEGMENTS for i in range(SEGMENTS)]
        ring = [(math.cos(a), math.sin(a)) for a in ang]
        center = self.vertex((0,TOP,0), uv(0,0))
        for i in range(SEGMENTS):
            a,b = ring[i],ring[(i+1)%SEGMENTS]
            self.triangle(center,
                self.vertex((b[0]*RADIUS,TOP,b[1]*RADIUS),uv(b[0]*RADIUS,b[1]*RADIUS)),
                self.vertex((a[0]*RADIUS,TOP,a[1]*RADIUS),uv(a[0]*RADIUS,a[1]*RADIUS)))
            # Same 2%-oversized bevel footprint as the existing pixel models.
            topa=self.vertex((a[0]*RADIUS,TOP,a[1]*RADIUS),uv(a[0]*RADIUS*.985,a[1]*RADIUS*.985))
            topb=self.vertex((b[0]*RADIUS,TOP,b[1]*RADIUS),uv(b[0]*RADIUS*.985,b[1]*RADIUS*.985))
            bota=self.vertex((a[0]*RADIUS*1.02,0,a[1]*RADIUS*1.02),uv(a[0]*RADIUS*.985,a[1]*RADIUS*.985))
            botb=self.vertex((b[0]*RADIUS*1.02,0,b[1]*RADIUS*1.02),uv(b[0]*RADIUS*.985,b[1]*RADIUS*.985))
            self.triangle(topa,topb,botb); self.triangle(topa,botb,bota)

def build_grass():
    mesh=Mesh(); mesh.base()
    rng=random.Random(202611181)
    # Distinct tufts, rather than 96 nearly identical upright spikes.
    # Each blade remains a two-sided triangle like the proven original mesh.
    for i in range(68):
        a=math.tau*(i+rng.uniform(-.26,.26))/68
        ca,sa=math.cos(a),math.sin(a)
        radius=RADIUS*rng.uniform(.927,.977)
        x,z=radius*ca,radius*sa
        for j in range(3):
            width=rng.uniform(.105,.21)
            height=rng.uniform(.36,1.30) * (1.0 if j==1 else .7)
            side=rng.uniform(-.32,.32)
            # Match the gradient swatches and vary colour by cluster.
            ramp=("dark","light","warm","cool")[(i+j)%4]
            offset=(j-1)*rng.uniform(.16,.23)
            bx,bz=x-sa*offset,z+ca*offset
            left=mesh.vertex((bx-sa*width,TOP,bz+ca*width),rim_uv(ramp,.04))
            right=mesh.vertex((bx+sa*width,TOP,bz-ca*width),rim_uv(ramp,.04))
            tip=mesh.vertex((bx+ca*side+sa*rng.uniform(-.08,.08),TOP+height,
                              bz+sa*side+ca*rng.uniform(-.08,.08)),rim_uv(ramp,1))
            mesh.triangle(left,right,tip,both=True)
    # Sparse INNER small clumps: subtle depth without concealing the battler.
    for i in range(15):
        a=math.tau*i/15+rng.uniform(-.15,.15)
        radius=RADIUS*rng.uniform(.72,.82)
        ca,sa=math.cos(a),math.sin(a)
        x,z=radius*ca,radius*sa
        for k in range(2):
            w=.095
            y=rng.uniform(.20,.38)
            bx,bz=x+k*.13*sa,z-k*.13*ca
            l=mesh.vertex((bx-w*sa,TOP,bz+w*ca),rim_uv("cool",0))
            r=mesh.vertex((bx+w*sa,TOP,bz-w*ca),rim_uv("cool",0))
            tip=mesh.vertex((bx+sa*.1,TOP+y,bz-ca*.1),rim_uv("cool",1))
            mesh.triangle(l,r,tip,both=True)
    return mesh

def build_rocks():
    mesh=Mesh(); mesh.base()
    rng=random.Random(202611182)
    # Uneven hexahedral rocks with shoulders; geometry, not just texture blobs.
    for i in range(17):
        angle=math.tau*(i+rng.uniform(-.24,.24))/17
        rad=RADIUS*rng.uniform(.925,.974)
        cx,cz=rad*math.cos(angle),rad*math.sin(angle)
        size=rng.uniform(.21,.39)
        high=rng.uniform(.28,.60)
        rot=rng.random()*math.tau
        rr=[rng.uniform(.75,1.1) for _ in range(6)]
        coords=[(cx+size*rr[k]*math.cos(rot+math.tau*k/6),
                 cz+size*rr[k]*math.sin(rot+math.tau*k/6)) for k in range(6)]
        base=[mesh.vertex((x,TOP*.5,z),rim_uv("dark",.02)) for x,z in coords]
        shoulder=[mesh.vertex((cx+(x-cx)*.62,TOP+high*.68,cz+(z-cz)*.62),
                              rim_uv("warm" if i%3 else "light",.65)) for x,z in coords]
        peak=mesh.vertex((cx+rng.uniform(-.07,.07),TOP+high,cz+rng.uniform(-.07,.07)),
                         rim_uv("light",.99))
        for k in range(6):
            nxt=(k+1)%6
            mesh.triangle(base[k],base[nxt],shoulder[nxt])
            mesh.triangle(base[k],shoulder[nxt],shoulder[k])
            mesh.triangle(shoulder[k],shoulder[nxt],peak)
    # Small irregular low polygon stones, distributed just INSIDE the rim.
    for i in range(14):
        a=rng.random()*math.tau; rad=RADIUS*rng.uniform(.78,.9)
        x,z=rad*math.cos(a),rad*math.sin(a)
        width=rng.uniform(.11,.21)
        p=mesh.vertex((x,TOP+.09,z),rim_uv("light",.8))
        ring=[]
        for k in range(4):
            ang=a+math.tau*k/4
            ring.append(mesh.vertex((x+width*math.cos(ang),TOP,
                                     z+width*math.sin(ang)),rim_uv("warm",.1)))
        for k in range(4):
            mesh.triangle(ring[k],ring[(k+1)%4],p)
    return mesh

def save_dae(path, name, tex_name, mesh):
    fmt=lambda vals: " ".join(f"{v:.6f}" for tup in vals for v in tup)
    # Normals match the existing generator's simple up-lit presentation.
    normals=[(0,1,0)]*len(mesh.positions)
    path.write_text(f'''<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><unit name="meter" meter="1"/><up_axis>Y_UP</up_axis></asset>
<library_images><image id="img0" name="{escape(tex_name[:-4])}"><init_from>{escape(tex_name)}</init_from></image></library_images>
<library_effects><effect id="fx0"><profile_COMMON>
<newparam sid="surface0"><surface type="2D"><init_from>img0</init_from></surface></newparam>
<newparam sid="sampler0"><sampler2D><source>surface0</source></sampler2D></newparam>
<technique sid="common"><lambert><diffuse><texture texture="sampler0" texcoord="UVMap"/></diffuse></lambert></technique>
</profile_COMMON></effect></library_effects>
<library_materials><material id="mat0" name="{escape(name)}_mat"><instance_effect url="#fx0"/></material></library_materials>
<library_geometries><geometry id="geo0" name="{escape(name)}"><mesh>
<source id="positions"><float_array id="pa" count="{len(mesh.positions)*3}">{fmt(mesh.positions)}</float_array><technique_common><accessor source="#pa" count="{len(mesh.positions)}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
<source id="normals"><float_array id="na" count="{len(normals)*3}">{fmt(normals)}</float_array><technique_common><accessor source="#na" count="{len(normals)}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
<source id="texcoords"><float_array id="ta" count="{len(mesh.uvs)*2}">{fmt(mesh.uvs)}</float_array><technique_common><accessor source="#ta" count="{len(mesh.uvs)}" stride="2"><param name="S" type="float"/><param name="T" type="float"/></accessor></technique_common></source>
<vertices id="vtx"><input semantic="POSITION" source="#positions"/></vertices>
<triangles material="mat0" count="{len(mesh.indices)//3}"><input semantic="VERTEX" source="#vtx" offset="0"/><input semantic="NORMAL" source="#normals" offset="0"/><input semantic="TEXCOORD" source="#texcoords" offset="0" set="0"/><p>{" ".join(map(str,mesh.indices))}</p></triangles>
</mesh></geometry></library_geometries>
<library_visual_scenes><visual_scene id="Scene" name="Scene"><node id="node0" name="{escape(name)}" type="NODE"><instance_geometry url="#geo0"><bind_material><technique_common><instance_material symbol="mat0" target="#mat0"><bind_vertex_input semantic="UVMap" input_semantic="TEXCOORD" input_set="0"/></instance_material></technique_common></bind_material></instance_geometry></node></visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#Scene"/></scene></COLLADA>
''',encoding="utf-8")

def main():
    out=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).resolve().parent/"generated"
    out.mkdir(parents=True,exist_ok=True)
    for style, maker in (("Green_Grass",build_grass),("Rocks_Brown",build_rocks)):
        name=f"Test_{style}_Detail_v2"
        tex_name=f"{name.lower()}.png"
        tex=atlas(style)
        tex.save(out/tex_name)
        mesh=maker()
        save_dae(out/(name+".dae"),name,tex_name,mesh)
        height=max(p[1] for p in mesh.positions)
        width=max(math.hypot(p[0],p[2]) for p in mesh.positions)
        assert all(0<=u<=1 and 0<=v<=1 for u,v in mesh.uvs)
        assert len(mesh.indices)%3 == 0
        assert tex.getcolors(257) is not None, "PNG exceeds 256 palette entries"
        print(f"{name}: {len(mesh.indices)//3} triangles, "
              f"max Y={height:.2f}, max radius={width:.2f}, "
              "128x128/256-colour PNG")
    print(f"Files ready in {out} (COLLADA + PNG; NOT NSBMD).")

if __name__=="__main__":
    main()
