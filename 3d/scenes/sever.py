"""House «Север» — barnhouse with a fully glazed gable, winter blue hour."""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import lib  # noqa: E402
import kit  # noqa: E402

A = lib.args({"out": "3d/out/sever.png", "w": 1600, "h": 1200, "samples": 64,
              "hdri": "qwantani_dusk_2_puresky", "strength": 0.22, "exposure": 0.0,
              "trees": True, "lod": "LOD1"})

lib.reset()
lib.render_settings(A["w"], A["h"], A["samples"], exposure=A["exposure"])
lib.world_hdri(A["hdri"], A["strength"], rot_deg=150, saturation=0.8, tint=(0.80, 0.88, 1.0))
M = kit.materials()
H = lib.collection("House")
I = lib.collection("Interior")
FM = (M["frame"], M["glass"])

# snow
snow = lib.mat_basic("Snow", (0.86, 0.88, 0.92), roughness=0.55, subsurface=0.25, specular=0.4)
sn = snow.node_tree
sb = sn.nodes["Principled BSDF"]
sb.inputs["Subsurface Radius"].default_value = (0.3, 0.4, 0.6)
sb.inputs["Subsurface Scale"].default_value = 0.05
nz = sn.nodes.new("ShaderNodeTexNoise")
nz.inputs["Scale"].default_value = 1.2
nz.inputs["Detail"].default_value = 12
nz.inputs["Roughness"].default_value = 0.65
bp = sn.nodes.new("ShaderNodeBump")
bp.inputs["Strength"].default_value = 0.35
sn.links.new(nz.outputs["Fac"], bp.inputs["Height"])
sn.links.new(bp.outputs["Normal"], sb.inputs["Normal"])

Z0, Z1 = 0.45, 3.4
X1, Y1 = 16.0, 8.4
RIDGE = 7.6
T = 0.40

lib.box("Plinth", -0.02, -0.02, 0.0, X1 + 0.02, Y1 + 0.02, Z0, M["plinth"], 0.006, H)
ops = [
    ("S", 3.0, 4.2, 1.0, 2.9, 0), ("S", 6.4, 7.6, 1.0, 2.9, 0), ("S", 9.8, 13.6, Z0, 2.9, 2),
    ("N", 4.0, 6.0, 1.0, 2.6, 1),
]
gf, _ = lib.shell("GF", 0, 0, Z0, X1, Y1, Z1, T, M["plaster"], ops, H, frame_mats=FM)

# gable walls: east one solid plaster, west one fully glazed (frames + glass)
def gable_pts(x):
    return [(x, 0, Z1), (x, Y1, Z1), (x, Y1 / 2, RIDGE)]

east = lib.mesh_from("GableE", [(X1, 0, Z1), (X1, Y1, Z1), (X1, Y1 / 2, RIDGE),
                                (X1 - T, 0, Z1), (X1 - T, Y1, Z1), (X1 - T, Y1 / 2, RIDGE)],
                     [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], M["plaster"], H)
# west end: remove the GF west wall section by building the end as glazing.
west_cut = lib.box("WestCut", -0.5, 0.4, Z0, 0.9, Y1 - 0.4, Z1 + 0.5)
lib.apply_boolean(gf, [west_cut])
gx = 0.18
mull = [0.4 + (Y1 - 0.8) * i / 4 for i in range(5)]
for i, y in enumerate(mull):
    ztop = Z1 + (RIDGE - Z1) * (1 - abs(y - Y1 / 2) / (Y1 / 2)) - 0.12
    lib.box(f"Mull{i}", gx - 0.04, y - 0.035, Z0, gx + 0.04, y + 0.035, ztop, M["frame"], coll=H)
lib.box("Transom", gx - 0.04, 0.4, 2.95, gx + 0.04, Y1 - 0.4, 3.02, M["frame"], coll=H)
glass_w = lib.mesh_from("GlassW", [(gx, 0.4, Z0), (gx, Y1 - 0.4, Z0), (gx, Y1 - 0.4, Z1 + 0.3),
                                   (gx, Y1 / 2, RIDGE - 0.15), (gx, 0.4, Z1 + 0.3)],
                        [(0, 1, 2, 3, 4)], M["glass"], H)
# west gable frame (thick plaster edge around the glass)
def edge_strip(p0, p1, w, name):
    import mathutils
    a, b = mathutils.Vector(p0), mathutils.Vector(p1)
    d = (b - a).normalized()
    n = mathutils.Vector((0, -d.z, d.y)) * w
    verts = [a, b, b + n, a + n]
    verts = [(v.x, v.y, v.z) for v in verts] + [(v.x + T, v.y, v.z) for v in verts]
    faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    return lib.mesh_from(name, verts, faces, M["plaster"], H)

edge_strip((0, 0, Z0), (0, 0, Z1), -0.4, "EdgeS")
edge_strip((0, Y1, Z1), (0, Y1, Z0), -0.4, "EdgeN")
edge_strip((0, 0, Z1), (0, Y1 / 2, RIDGE), -0.4, "EdgeRS")
edge_strip((0, Y1 / 2, RIDGE), (0, Y1, Z1), -0.4, "EdgeRN")

# roof: two slopes, graphite standing seam with a snow layer on top
slope = math.atan2(RIDGE - Z1, Y1 / 2)
rl = math.hypot(Y1 / 2, RIDGE - Z1)
def roof_side(sign, name, mat, off=0.0, thick=0.12):
    y_eave = 0 if sign < 0 else Y1
    nrm = (0, sign * math.sin(slope), math.cos(slope))
    pts = []
    for x in (-0.05, X1 + 0.05):
        for (y, z) in ((y_eave, Z1), (Y1 / 2, RIDGE)):
            pts.append((x, y + nrm[1] * off, z + nrm[2] * off))
    top = [(p[0], p[1] + nrm[1] * thick, p[2] + nrm[2] * thick) for p in pts]
    verts = pts + top
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 2, 6, 4), (1, 5, 7, 3), (0, 4, 5, 1), (2, 3, 7, 6)]
    return lib.mesh_from(name, verts, faces, mat, H)

roof_side(-1, "RoofS", M["metal_roof"])
roof_side(1, "RoofN", M["metal_roof"])
roof_side(-1, "SnowS", snow, 0.12, 0.14)
roof_side(1, "SnowN", snow, 0.12, 0.14)

# interiors: double height living room behind the glazed gable, warm light
kit.interior_room(M, 0.4, 0.4, 9.0, Y1 - 0.4, Z0, RIDGE - 0.5, I, power=0, ceiling=False)
lib.box("Mezz", 4.6, 0.4, Z1 - 0.1, 9.0, Y1 - 0.4, Z1 + 0.15, M["wood"], coll=I)
lib.box("MezzRail", 4.55, 0.4, Z1 + 0.15, 4.6, Y1 - 0.4, Z1 + 1.1, M["glass"], coll=I)
# gable shaped back wall and a sloped timber ceiling following the roof
zr = RIDGE - 0.35
lib.mesh_from("Back", [(9.0, 0.4, Z0), (9.0, Y1 - 0.4, Z0), (9.0, Y1 - 0.4, Z1 + 0.15),
                       (9.0, Y1 / 2, zr), (9.0, 0.4, Z1 + 0.15)], [(0, 1, 2, 3, 4)], M["wall_in"], I)
for sgn in (-1, 1):
    ye = 0.4 if sgn < 0 else Y1 - 0.4
    lib.mesh_from(f"CeilSlope{sgn}", [(0.4, ye, Z1 + 0.15), (9.0, ye, Z1 + 0.15),
                                      (9.0, Y1 / 2, zr), (0.4, Y1 / 2, zr)],
                  [(0, 1, 2, 3)], M["soffit"], I)
kit.lounge(M, 2.2, 4.0, Z0, I)
fire = lib.mat_emission("Fire", (1.0, 0.45, 0.15), 30)
lib.box("Fireplace", 9.0 - 0.3, 3.2, Z0, 9.0, 5.2, Z0 + 1.6, lib.mat_basic("FPstone", (0.08, 0.075, 0.07), 0.8), coll=I)
lib.box("Flame", 9.0 - 0.32, 3.6, Z0 + 0.35, 9.0 - 0.3, 4.8, Z0 + 0.75, fire, coll=I)
for i, (y, z) in enumerate([(2.0, 4.6), (4.2, 5.4), (6.4, 4.6)]):
    lib.sphere(f"PendW{i}", (3.0, y, z), 0.22, M["lamp"], I)
lib.area_light("Warm1", (4.0, Y1 / 2, Z1 - 0.2), 3.5, 700, (1.0, 0.62, 0.36), coll=I)
lib.area_light("Warm2", (2.0, Y1 / 2, 5.2), 1.0, 300, (1.0, 0.62, 0.36), coll=I)
kit.interior_room(M, 9.4, 0.4, X1 - 0.4, Y1 - 0.4, Z0, Z1, I, power=260)

# terrace with steps, path lights in the snow
lib.box("Terrace", -3.6, -0.6, 0.0, 0.0, Y1 + 0.6, Z0 - 0.02, M["deck"], 0.004, H)
lib.box("TerraceSnow", -3.6, -0.6, Z0 - 0.02, -1.8, Y1 + 0.6, Z0 + 0.04, snow, coll=H)
bollard_glow = lib.mat_emission("Bollard", (1.0, 0.7, 0.4), 25)
for i in range(6):
    x, y = -7.0 - i * 3.2, 2.2 + math.sin(i) * 0.6
    lib.cylinder(f"Bol{i}", x, y, 0.0, 0.6, 0.06, M["frame"], 24, H)
    lib.cylinder(f"BolG{i}", x, y, 0.45, 0.55, 0.061, bollard_glow, 24, H)
    lib.point_light(f"BolL{i}", (x, y - 0.12, 0.5), 8, (1.0, 0.7, 0.4), 0.03, H)

# snowy ground with gentle undulation
L = lib.collection("Landscape")
g = lib.plane("Snow", -260, -260, 260, 360, 0.0, snow, L, subdiv=120)
d = g.modifiers.new("Disp", "DISPLACE")
tex = lib.bpy.data.textures.new("SnowNoise", "CLOUDS")
tex.noise_scale = 6.0
d.texture = tex
d.strength = 0.25
d.mid_level = 0.6

if A["trees"]:
    T_ = lib.collection("Trees")
    fir = lib.load_lod("fir_tree_01", "LOD1")
    pine = lib.load_lod("pine_tree_01", A["lod"])
    house = lambda x, y, p=4.0: -4 - p < x < X1 + p and -1 - p < y < Y1 + 1 + p
    clear = lambda x, y: y < -4 and -30 < x < 30 and abs(y - (-0.6 * x - 6)) < 40
    pts = lib.poisson(90, -60, 10, 70, 70, 3.8, seed=4, avoid=lambda x, y: house(x, y))
    lib.place(fir + pine, [(x, y, 0) for x, y in pts], (0.8, 1.2), T_, seed=2)
    pts = lib.poisson(40, -60, -30, 70, 10, 4.5, seed=6,
                      avoid=lambda x, y: house(x, y) or (y < 5 and -34 < x < 22))
    lib.place(fir + pine, [(x, y, 0) for x, y in pts], (0.8, 1.15), T_, seed=3)
    far = lib.poisson(170, -160, 70, 170, 190, 7.0, seed=9)
    lib.place(fir + pine, [(x, y, 0) for x, y in far], (0.9, 1.3), T_, seed=8)

lib.camera((-17.5, -10.5, 1.6), (6.0, 4.0, 2.4), lens=30, shift_y=0.16)
lib.composite(glare=0.45, vignette=0.16, warm=-0.02, mist=(20, 200, (0.55, 0.62, 0.75), 0.18))
lib.render(A["out"])
