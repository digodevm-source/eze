"""Living room in a polystyrene concrete house: limewash plaster, arches,
boucle sofa, travertine table, olive tree — soft afternoon light."""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import bpy  # noqa: E402
import lib  # noqa: E402
import kit  # noqa: E402

A = lib.args({"out": "3d/out/interior.png", "w": 1800, "h": 1200, "samples": 128,
              "hdri": "citrus_orchard_puresky", "sun": 196.0, "elev": 22.0,
              "sunlamp": 5.0, "strength": 1.0, "exposure": 0.4, "view": "main",
              "trees": True})

lib.reset()
lib.render_settings(A["w"], A["h"], A["samples"], exposure=A["exposure"], threshold=0.02)
bpy.context.scene.cycles.diffuse_bounces = 6
lib.world_hdri(A["hdri"], A["strength"], sun_azimuth_deg=A["sun"])
lib.sun_light("Sun", A["sun"], A["elev"], A["sunlamp"], (1.0, 0.82, 0.64), 0.6)
M = kit.materials()

limewash = lib.mat_pbr("Limewash", "clay_plaster", scale=0.35, albedo=(0.66, 0.58, 0.50),
                       contrast=0.55, normal=0.25, rough_mult=1.2, coords="WORLD", edge=0.01)
floor = lib.mat_pbr("Microcement", "smooth_concrete_floor", scale=0.3, albedo=(0.56, 0.50, 0.43),
                    contrast=0.45, normal=0.2, rough_mult=0.75)
travertine = lib.mat_pbr("Trav", "sandstone_cracks", scale=1.6, albedo=(0.66, 0.58, 0.48),
                         contrast=0.7, normal=0.4, coords="OBJECT", edge=0.004)
walnut = lib.mat_pbr("Walnut", "smoked_walnut_veneer", scale=0.8, gain=0.05, coords="OBJECT",
                     normal=0.3, rough_mult=0.7, edge=0.003)
boucle = lib.mat_fabric("BoucleCream", (0.80, 0.76, 0.69), scale=700, bump=0.5)
wool = lib.mat_fabric("Rug", (0.62, 0.55, 0.47), scale=300, bump=0.6, sheen=0.3)
linen = M["curtain"]
paper = lib.mat_basic("Paper", (0.95, 0.9, 0.82), 0.7, emission=(1.0, 0.76, 0.5),
                      emission_strength=2.2, subsurface=0.0)
canvas = lib.mat_pbr("Canvas", "rough_linen", scale=2.0, albedo=(0.58, 0.50, 0.42), contrast=0.6,
                     coords="OBJECT")
ochre = lib.mat_basic("Ochre", (0.36, 0.22, 0.13), 0.8)

R = lib.collection("Room")
W, D, Hh = 9.0, 7.2, 3.4
t = 0.4
# floor, ceiling
lib.box("Floor", 0, 0, -0.05, W, D, 0.0, floor, coll=R)
lib.box("Ceiling", -t, -t, Hh, W + t, D + t, Hh + 0.3, limewash, coll=R)
# left wall with the big window (outside is the forest)
left = lib.box("WallL", -t, -t, 0, 0, D + t, Hh, limewash, coll=R)
lib.apply_boolean(left, [lib.box("cut", -1, 1.2, 0.0 - 0.01, 1, 6.0, 3.05)])
# back wall: arched niche + arched doorway
back = lib.box("WallB", 0, D, 0, W + t, D + t, Hh, limewash, coll=R)
lib.apply_boolean(back, [lib.arch_prism("niche", 2.15, 1.5, 0.45, 1.75, D - 0.1, D + 0.26)])
lib.apply_boolean(back, [lib.arch_prism("door", 6.25, 1.7, -0.1, 2.15, D - 0.5, D + 1.0)])
# niche shelf + vase
lib.box("Shelf", 1.4, D - 0.06, 1.15, 2.9, D + 0.25, 1.19, limewash, coll=R)
# right wall and front wall (behind camera)
lib.box("WallR", W, -t, 0, W + t, D + t, Hh, limewash, coll=R)
lib.box("WallF", -t, -t, 0, W + t, 0, Hh, limewash, coll=R)
# skirting-free plaster meets the floor; a shadow-gap at the ceiling
lib.box("Gap", 0, 0, Hh - 0.02, W, D, Hh, lib.mat_basic("Gapc", (0.1, 0.09, 0.08), 0.9), coll=R)
# next room through the arch: darker, warm lamp
lib.box("NextFloor", 4.3, D, -0.05, 8.0, D + 4.0, 0.0, floor, coll=R)
lib.box("NextBack", 4.5, D + 3.6, 0, 8.0, D + 4.0, Hh, limewash, coll=R)
lib.box("NextSide", 7.9, D + t - 0.01, 0, 8.3, D + 4.0, Hh, limewash, coll=R)
lib.box("NextSide2", 4.3, D + t - 0.01, 0, 4.7, D + 4.0, Hh, limewash, coll=R)
lib.box("NextCeil", 4.3, D + t - 0.01, Hh, 8.3, D + 4.0, Hh + 0.2, limewash, coll=R)
lib.point_light("NextLamp", (6.6, D + 2.4, 1.6), 60, (1.0, 0.7, 0.45), 0.2, R)
lib.box("Console", 5.3, D + 3.15, 0.0, 6.9, D + 3.6, 0.8, walnut, 0.01, R)

# window frame + glass + sheer curtains
F = M["frame"]
for y in (1.2, 3.6, 6.0):
    lib.box(f"Mul{y}", -0.25, y - 0.035, 0.0, -0.17, y + 0.035, 3.05, F, coll=R)
lib.box("Head", -0.25, 1.2, 2.99, -0.17, 6.0, 3.05, F, coll=R)
lib.vplane("Glass", (-0.21, 1.2), (-0.21, 6.0), 0.0, 3.05, M["glass"], R)
for i, (a, b) in enumerate([(0.55, 1.75), (5.55, 6.75)]):
    cur = lib.box(f"Cur{i}", 0.12, a, 0.02, 0.16, b, 3.3, linen, coll=R)
    wv = cur.modifiers.new("Wave", "WAVE")
    lib.set_smooth(cur)
lib.box("Rail", 0.08, 0.4, 3.3, 0.2, 6.9, 3.34, F, coll=R)

# ---------------------------------------------------------------- furniture
Fu = lib.collection("Furniture")
# curved boucle sofa: a rounded seat bent around the coffee table
def curved(name, x, y, z0, z1, depth, length, ang, radius, mat):
    ob = lib.rounded(name, -length / 2, -depth / 2, z0, length / 2, depth / 2, z1, mat, 0.13, 6, Fu)
    me = ob.data
    # pre-subdivide along X so the bend is smooth
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if abs(e.verts[0].co.x - e.verts[1].co.x) > 0.1],
                              cuts=24, use_grid_fill=True)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    # move bevel+subsurf after a simple-deform bend
    sd = ob.modifiers.new("Bend", "SIMPLE_DEFORM")
    sd.deform_method = "BEND"
    sd.deform_axis = "Z"
    sd.angle = ang
    ob.modifiers.move(len(ob.modifiers) - 1, 0)
    ob.location = (x, y, 0)
    return ob

sx, sy = 3.3, 5.35
seat = curved("Seat", sx, sy, 0.0, 0.42, 1.0, 3.8, math.radians(-42), 3, boucle)
back_ = curved("Back", sx, sy + 0.45, 0.25, 0.82, 0.36, 3.9, math.radians(-42), 3, boucle)
lib.rounded("Pouf", 0.9, 2.6, 0.0, 1.6, 3.3, 0.4, boucle, 0.2, coll=Fu)
# coffee table: low travertine drum + walnut side table
lib.cylinder("Coffee", 3.3, 3.75, 0.0, 0.34, 0.62, travertine, 96, Fu, 0.006)
lib.cylinder("Side", 5.55, 5.0, 0.0, 0.48, 0.24, walnut, 64, Fu, 0.004)
# round wool rug
lib.cylinder("Rug", 3.3, 3.9, 0.0, 0.012, 2.2, wool, 128, Fu)
# rice paper pendant
lib.sphere("Paper", (3.3, 3.75, 2.35), 0.27, paper, Fu)
lib.box("Cord", 3.296, 3.746, 2.6, 3.304, 3.754, Hh, F, coll=Fu)
# artwork on the right wall
lib.box("ArtFrame", W - 0.04, 2.6, 0.95, W, 4.8, 2.55, walnut, 0.003, Fu)
lib.box("Art", W - 0.05, 2.66, 1.01, W - 0.035, 4.74, 2.49, canvas, coll=Fu)
lib.cylinder("ArtSun", 0, 0, 0, 0.004, 0.32, ochre, 64, Fu)
art_sun = bpy.data.objects["ArtSun"]
art_sun.rotation_euler = (0, math.pi / 2, 0)
art_sun.location = (W - 0.055, 3.45, 1.95)
# low walnut sideboard under the art
lib.box("Sideboard", W - 0.48, 2.3, 0.0, W, 5.1, 0.55, walnut, 0.008, Fu)
# books on the coffee table
for i, (h, c) in enumerate([(0.04, (0.62, 0.56, 0.48)), (0.035, (0.25, 0.22, 0.19)), (0.03, (0.72, 0.68, 0.6))]):
    z = 0.34 + sum([0.04, 0.035, 0.03][:i])
    lib.box(f"Book{i}", 3.0 - i * 0.02, 3.45, z, 3.37 - i * 0.03, 3.72, z + h,
            lib.mat_basic(f"BookC{i}", c, 0.7), 0.002, Fu)

# props from Poly Haven
vase1 = lib.load_lod("ceramic_vase_01", "LOD0", group=True)
vase3 = lib.load_lod("ceramic_vase_03", "LOD0", group=True)
pot = lib.load_lod("planter_pot_clay", "LOD0", group=True)
olive = lib.load_lod("island_tree_02", "LOD1")
chair = lib.load_lod("mid_century_lounge_chair", "LOD0", group=True)
lib.instance_of(vase1[0], "Vase1", (3.55, 3.85, 0.34), 0.4, 0.7, Fu)
lib.instance_of(vase3[0], "Vase3", (2.15, D - 0.05, 1.19), 0.0, 0.9, Fu)
lib.instance_of(vase1[0], "Vase1b", (W - 0.25, 4.6, 0.55), 1.0, 0.6, Fu)
lib.instance_of(pot[0], "Pot", (0.85, 6.45, 0.0), 0.0, 2.6, Fu)
lib.instance_of(olive[0], "Olive", (0.85, 6.45, 0.5), 0.6, 0.48, Fu)
lib.instance_of(chair[0], "Chair", (8.15, 2.05, 0.0), math.radians(100), 1.0, Fu)

# outside: pines and lawn seen through the window
if A["trees"]:
    O = lib.collection("Outside")
    lawn_m = lib.mat_pbr("LawnTex", "leafy_grass", scale=0.4, gain=0.08, hue_sat=(0.52, 1.0, 1.0))
    lib.plane("Lawn", -60, -30, 0, 40, -0.3, lawn_m, O)
    pine = lib.load_lod("pine_tree_01", "LOD1")
    # keep the sun's path through the window clear so it lands on the floor
    sd = (math.cos(math.radians(A["sun"])), math.sin(math.radians(A["sun"])))
    def in_sun(x, y):
        px, py = x - 0.0, y - 3.6
        along = px * sd[0] + py * sd[1]
        return along > 0 and abs(px * sd[1] - py * sd[0]) < 5.0
    pts = lib.poisson(40, -60, -25, -4, 35, 4.0, seed=3, avoid=in_sun)
    lib.place(pine, [(x, y, -0.3) for x, y in pts], (0.85, 1.15), O, seed=4)

# soft fill from the camera side (bounce from the unseen front windows)
lib.area_light("Bounce", (6.5, 0.4, 1.9), 3.0, 120, (1.0, 0.86, 0.72), rot=(math.radians(-90), 0, 0))
# ceiling bounce (invisible to camera) so the ceiling isn't muddy
cb = lib.area_light("CeilBounce", (4.0, 3.6, 2.4), 6.0, 520, (1.0, 0.85, 0.7), rot=(math.pi, 0, 0))
cb.visible_camera = False

if A["view"] == "main":
    lib.camera((8.4, 0.5, 1.25), (3.0, 6.4, 1.25), lens=24, shift_y=-0.02)
else:  # vertical crop for mobile / journal
    lib.camera((7.2, 0.6, 1.25), (2.6, 5.5, 1.25), lens=26, shift_y=0.06)

lib.composite(glare=0.2, vignette=0.12, warm=0.05)
lib.render(A["out"])
