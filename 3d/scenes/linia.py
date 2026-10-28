"""House «Линия» — single storey, long flat roof with a deep timber soffit and a
reflecting pool."""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import lib  # noqa: E402
import kit  # noqa: E402

A = lib.args({"out": "3d/out/linia.png", "w": 1600, "h": 1200, "samples": 64,
              "sun": 222.0, "elev": 10.0, "sunlamp": 4.5, "strength": 0.6, "hdri": "",
              "grass": True, "trees": True, "gdens": 260, "lod": "LOD1", "exposure": 0.0})

lib.reset()
lib.render_settings(A["w"], A["h"], A["samples"], exposure=A["exposure"])
kit.golden_hour(A)
M = kit.materials()
H = lib.collection("House")
I = lib.collection("Interior")
FM = (M["frame"], M["glass"])

Z0, Z1 = 0.30, 3.30
X1, Y1 = 23.0, 8.5
T = 0.40

lib.box("Plinth", -0.02, -0.02, 0.0, X1 + 0.02, Y1 + 0.02, Z0, M["plinth"], 0.006, H)
ops = [
    ("S", 7.2, 17.2, Z0, Z1 - 0.02, 4),     # living/kitchen sliding wall
    ("S", 1.2, 1.9, Z0 + 0.0, Z1 - 0.3, 0),  # bedroom slot windows (behind slats)
    ("S", 4.2, 4.9, Z0 + 0.0, Z1 - 0.3, 0),
    ("S", 19.6, 20.8, Z0, Z1 - 0.4, 0, "door"),
    ("W", 1.5, 6.8, 0.9, 2.6, 1),
    ("E", 2.0, 5.5, 1.0, 2.6, 1),
]
gf, _ = lib.shell("GF", 0, 0, Z0, X1, Y1, Z1, T, M["plaster"], ops, H, frame_mats=FM)

# timber slat screen over the bedroom wing
lib.box("SlatBack", 0.0, -0.012, Z0, 6.6, 0.0, Z1, M["backing"], coll=H)
lib.slats("Slats", "x", -0.012, 0.03, 6.6, Z0, Z1, M["wood"], coll=H)
# entrance door: tall oak pivot door with a slim handle
lib.box("Door", 19.6, 0.10, Z0, 20.8, 0.16, Z1 - 0.4, M["wood"], coll=H)
lib.box("Handle", 20.55, 0.06, 0.95, 20.6, 0.10, 2.25, M["frame"], coll=H)

# roof slab with deep canopy and timber soffit
lib.box("Roof", -0.8, -2.8, Z1, X1 + 0.8, Y1 + 0.6, Z1 + 0.38, M["plaster"], 0.008, H)
lib.box("Cap", -0.82, -2.82, Z1 + 0.38, X1 + 0.82, Y1 + 0.62, Z1 + 0.41, M["coping"], coll=H)
lib.box("Soffit", -0.68, -2.68, Z1 - 0.02, X1 + 0.68, -0.02, Z1, M["soffit"], coll=H)
for i in range(9):
    x = 1.2 + i * 2.6
    lib.cylinder(f"DL{i}", x, -1.5, Z1 - 0.025, Z1 - 0.02, 0.045, M["downlight"], 24, H)
    lib.point_light(f"DLp{i}", (x, -1.5, Z1 - 0.06), 22, (1.0, 0.78, 0.55), 0.04, H)
for x in (6.9, 17.5):
    lib.box(f"Col{x}", x - 0.05, -2.45, 0.0, x + 0.05, -2.35, Z1, M["frame"], coll=H)

# interior
kit.interior_room(M, 6.9, 0.4, 17.5, 8.1, Z0, Z1, I, power=260)
lib.box("BackWall", 6.9, 6.0, Z0, 17.5, 6.2, Z1, M["wall_in"], coll=I)
kit.lounge(M, 8.6, 4.3, Z0, I)
lib.box("Island", 13.2, 2.6, Z0, 16.4, 3.6, Z0 + 0.92, M["stone"], 0.01, I)
for i, x in enumerate((13.8, 15.8)):
    lib.sphere(f"PendK{i}", (x, 3.1, 2.25), 0.13, M["lamp"], I)
lib.box("Art", 9.4, 5.98, 1.3, 11.8, 6.0, 2.6, M["art"], coll=I)
lib.area_light("Bed1", (3.2, 3.5, Z1 - 0.05), 2.0, 140, (1.0, 0.68, 0.44), coll=I)

# terrace, steps, reflecting pool
Lc = lib.collection("Terrace")
lib.box("Deck", 6.4, -2.7, 0.0, 18.2, 0.0, Z0 - 0.02, M["deck"], 0.004, Lc)
lib.box("Step", 9.0, -3.4, 0.0, 15.0, -2.7, 0.14, M["concrete"], 0.006, Lc)
pool_rim = M["concrete"]
lib.box("PoolRimS", 7.0, -9.2, -0.05, 18.0, -8.9, 0.06, pool_rim, 0.004, Lc)
lib.box("PoolRimN", 7.0, -4.6, -0.05, 18.0, -4.3, 0.06, pool_rim, 0.004, Lc)
lib.box("PoolRimW", 7.0, -8.9, -0.05, 7.3, -4.6, 0.06, pool_rim, 0.004, Lc)
lib.box("PoolRimE", 17.7, -8.9, -0.05, 18.0, -4.6, 0.06, pool_rim, 0.004, Lc)
lib.box("PoolBed", 7.3, -8.9, -0.6, 17.7, -4.6, -0.55, lib.mat_basic("Lining", (0.03, 0.035, 0.035), 0.6), coll=Lc)
water = lib.mat_basic("Water", (1, 1, 1), roughness=0.02, specular=0.5)
wb = water.node_tree.nodes["Principled BSDF"]
wb.inputs["Transmission Weight"].default_value = 1.0
wb.inputs["IOR"].default_value = 1.33
wn = water.node_tree.nodes.new("ShaderNodeTexNoise")
wn.inputs["Scale"].default_value = 3.0
wn.inputs["Detail"].default_value = 4
wbp = water.node_tree.nodes.new("ShaderNodeBump")
wbp.inputs["Strength"].default_value = 0.04
water.node_tree.links.new(wn.outputs["Fac"], wbp.inputs["Height"])
water.node_tree.links.new(wbp.outputs["Normal"], wb.inputs["Normal"])
lib.plane("Water", 7.3, -8.9, 17.7, -4.6, 0.02, water, Lc)
for i in range(7):
    y = -4.0 - i * 1.3
    lib.box(f"Paver{i}", 19.4, y - 0.45, -0.02, 21.0, y + 0.45, 0.04, M["pavers"], 0.008, Lc)

cam = (22.5, -15.5)
kit.landscape(
    A, M,
    footprint=[(-1.2, -3.6, 24.0, 9.2), (6.6, -9.6, 18.4, -3.6), (18.9, -14.0, 21.5, -3.4)],
    cam=cam,
    keep_clear=lambda x, y: y < -6 and -10 < x < 40,
    decid=[(-5.5, 4.0, 0, 0), (27.0, 6.0, 0, 1)],
    shrubs=[(x, -3.2, 0) for x in (0.5, 1.6, 2.7, 3.8, 4.9, 5.8)] +
           [(22.5, y, 0) for y in (-3.0, -1.6, -0.2)],
    grass_tufts=[(x, -9.8, 0) for x in (7.5, 9.0, 10.6, 12.1, 13.9, 15.5, 17.2)],
)

lib.camera((cam[0], cam[1], 1.45), (8.0, 2.0, 1.45), lens=27, shift_y=0.10, shift_x=-0.015)
lib.composite(glare=0.3, vignette=0.14, warm=0.06, mist=(25, 160, (0.85, 0.72, 0.62), 0.22))
lib.render(A["out"])
