"""Construction stage: polystyrene concrete walls going up on a slab, pallets
of blocks, tools — morning light in the pines."""
import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import bpy  # noqa: E402
import lib  # noqa: E402
import kit  # noqa: E402

A = lib.args({"out": "3d/out/construction.png", "w": 1800, "h": 1200, "samples": 96,
              "hdri": "citrus_orchard_puresky", "sun": 330.0, "elev": 22.0, "sunlamp": 4.0,
              "strength": 0.7, "exposure": 0.0, "trees": True, "grass": True, "gdens": 200,
              "lod": "LOD1", "view": "wide"})

lib.reset()
lib.render_settings(A["w"], A["h"], A["samples"], exposure=A["exposure"])
kit.golden_hour(A)
M = kit.materials()
psb = lib.mat_psb("PSB", cement=(0.19, 0.185, 0.175), bead=(0.80, 0.80, 0.78), bead_scale=120,
                  coverage=0.6, bump=0.4, dirt=0.15, per_object=0.08)
membrane = lib.mat_basic("Membrane", (0.02, 0.02, 0.02), 0.5)
slab_m = lib.mat_pbr("Slab", "concrete_floor_02", scale=0.5, albedo=(0.42, 0.40, 0.37), contrast=0.9,
                     edge=0.01)
pallet_wood = lib.mat_pbr("PalletWood", "white_oak_veneer", scale=1.0, gain=0.22, coords="OBJECT",
                          hue_sat=(0.5, 0.6, 1.0), rough_mult=1.2)
strap = lib.mat_basic("Strap", (0.015, 0.015, 0.015), 0.4)
soil = lib.mat_pbr("SiteSoil", "farm_soil", scale=0.35, gain=0.08, normal=1.0)
sand = lib.mat_pbr("Sand", "farm_soil", scale=0.6, albedo=(0.30, 0.23, 0.15), contrast=0.8, normal=1.0)

B = lib.collection("Blocks")
BL, BH, BW = 0.6, 0.3, 0.3
J = 0.007  # thin glue joint (reads as a fine line at this distance)
meshes = {}


def block_mesh(length):
    key = round(length, 3)
    if key not in meshes:
        ob = lib.box(f"blk{key}", 0, 0, 0, length - J, 1, 1, psb)
        md = ob.modifiers.new("Bevel", "BEVEL")
        md.width = 0.006
        md.segments = 2
        md.limit_method = "ANGLE"
        bpy.context.view_layer.update()
        meshes[key] = ob
        ob.hide_render = True
        ob.hide_viewport = True
    return meshes[key]


rnd = random.Random(4)


def put(x0, y0, z0, length, along="x"):
    src = block_mesh(length)
    ob = src.copy()
    ob.hide_render = False
    ob.hide_viewport = False
    B.objects.link(ob)
    if along == "x":
        ob.location = (x0, y0, z0)
        ob.scale = (1, BW, BH - J)
    else:
        ob.location = (x0 + BW, y0, z0)
        ob.rotation_euler = (0, 0, math.pi / 2)
        ob.scale = (1, BW, BH - J)
    return ob


Z0 = 0.42
X1, Y1 = 12.0, 9.0
# wall lines: (start, end, fixed coord, along, openings[(u0, u1, from_course)])
walls = [
    ((0.0, X1), 0.0, "x", [(1.5, 3.3, 3), (5.4, 6.6, 0), (8.4, 10.2, 3)]),
    ((0.0, X1), Y1 - BW, "x", [(3.0, 4.8, 3), (7.8, 9.0, 3)]),
    ((BW, Y1 - BW), 0.0, "y", [(3.0, 5.4, 3)]),
    ((BW, Y1 - BW), X1 - BW, "y", [(2.4, 4.2, 3)]),
]
# number of courses laid per wall (stepped "racking back" at the free ends)
courses = {0: 7, 1: 8, 2: 8, 3: 6}


def lay(wi, start, end, fixed, along, ops, n_courses):
    for c in range(n_courses):
        z = Z0 + c * BH
        off = 0.0 if c % 2 == 0 else BL / 2
        # racking back on the front wall: the right part is lower
        hi = end
        if wi == 0 and c >= 5:
            hi = end - (c - 4) * 1.8
        if wi == 3 and c >= 4:
            hi = start + (end - start) * (0.75 - 0.18 * (c - 4))
        u = start
        first = True
        while u < hi - 0.02:
            ln = BL - off if first and off else BL
            first = False
            ln = min(ln, hi - u)
            seg = (u, u + ln)
            # skip blocks inside openings (above their sill course)
            blocked = False
            for a, b, fc in ops:
                if c >= fc and seg[0] < b - 0.01 and seg[1] > a + 0.01:
                    # trim to the opening edges
                    if seg[0] < a:
                        put(*((seg[0], fixed) if along == "x" else (fixed, seg[0])), z, a - seg[0], along)
                    if seg[1] > b:
                        put(*((b, fixed) if along == "x" else (fixed, b)), z, seg[1] - b, along)
                    blocked = True
                    break
            if not blocked and ln > 0.05:
                put(*((u, fixed) if along == "x" else (fixed, u)), z, ln, along)
            u += ln


for wi, ((s, e), fixed, along, ops) in enumerate(walls):
    lay(wi, s, e, fixed, along, ops, courses[wi])

# slab + membrane under the first course
S = lib.collection("Site")
lib.box("Slab", -0.25, -0.25, 0.0, X1 + 0.25, Y1 + 0.25, Z0 - 0.006, slab_m, coll=S)
for (a, b, c, d) in [(0, 0, X1, BW), (0, Y1 - BW, X1, Y1), (0, 0, BW, Y1), (X1 - BW, 0, X1, Y1)]:
    lib.box("Memb", a - 0.02, b - 0.02, Z0 - 0.006, c + 0.02, d + 0.02, Z0, membrane, coll=S)

# reinforcement bars sticking out of the slab at the openings (U-block lintels to come)
rebar = lib.mat_basic("Rebar", (0.12, 0.07, 0.05), 0.6, 0.6)


def pallet(x, y, rot, rows=4, cols=(3, 2), wrapped=False):
    P = lib.collection(f"Pallet{x}")
    parts = []
    w, d = 1.2, 0.9
    for i in range(3):
        parts.append(lib.box("pb", 0, i * (d - 0.1) / 2, 0.0, w, i * (d - 0.1) / 2 + 0.1, 0.1, pallet_wood, coll=P))
    for i in range(7):
        parts.append(lib.box("pt", i * (w - 0.1) / 6, 0, 0.1, i * (w - 0.1) / 6 + 0.1, d, 0.122, pallet_wood, coll=P))
    objs = []
    # 600x300x300 blocks: 2 along the pallet, 3 across, `rows` layers
    for r in range(rows):
        for i in range(2):
            for k in range(3):
                ob = block_mesh(BL).copy()
                ob.hide_render = False
                ob.hide_viewport = False
                P.objects.link(ob)
                ob.location = (i * 0.6 + 0.004, k * 0.3 + 0.004, 0.122 + r * 0.3)
                ob.scale = (1, BW - 0.008, BH - 0.006)
                objs.append(ob)
    for pz in (0.35, 0.95):
        parts.append(lib.box("strap", -0.005, -0.005, 0.122, 0.025, d + 0.005, 0.122 + rows * 0.3 + 0.004, strap, coll=P))
        parts[-1].location.x = pz
    for o in parts + objs:
        o.location.x += x
        o.location.y += y
    return P


pallet(14.3, 1.0, 0, rows=5)
pallet(14.4, 2.3, 0, rows=4)
pallet(13.0, -1.7, 0, rows=5)
# cement bags, tools
bags = lib.load_lod("cement_bag", "LOD0", group=True)
trowel = lib.load_lod("trowel_01", "LOD0", group=True)
lib.instance_of(bags[0], "Bag1", (12.9, 4.4, 0.0), 0.3, 1.0)
lib.instance_of(bags[0], "Bag2", (13.4, 4.6, 0.0), -0.2, 1.0)
lib.instance_of(trowel[0], "Trowel", (6.2, 0.15, Z0 + 7 * BH), 0.8, 1.0)
lib.cylinder("Bucket", 11.2, -0.8, 0.0, 0.32, 0.17, lib.mat_basic("Bucket", (0.02, 0.02, 0.02), 0.5), 32)
lib.box("Level", 2.0, 0.05, Z0 + 3 * BH, 3.2, 0.11, Z0 + 3 * BH + 0.05, lib.mat_basic("Alu", (0.6, 0.6, 0.62), 0.3, 0.9))
sp = lib.sphere("Pile", (16.6, -2.2, -0.45), 0.9, sand)
sp.scale = (1.3, 1.0, 0.75)

kit.landscape(A, M, footprint=[(-6, -6, 20, 14)], cam=(22, -15), lawn_rect=(-40, -30, 60, 45),
              keep_clear=lambda x, y: y < -4 and -8 < x < 34, firs=10)
# bare soil around the slab
lib.plane("SiteSoil", -6, -6, 20, 14, 0.004, soil)

if A["view"] == "wide":
    lib.camera((18.5, -9.0, 1.7), (6.5, 4.0, 1.4), lens=28, shift_y=0.06)
else:  # close: pallets + wall corner
    lib.camera((17.0, -5.0, 1.5), (11.0, 1.0, 1.0), lens=40, shift_y=0.02)
lib.composite(glare=0.25, vignette=0.14, warm=0.05, mist=(25, 160, (0.85, 0.75, 0.66), 0.2))
lib.render(A["out"])
