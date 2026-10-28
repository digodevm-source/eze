"""House «Сосны» — flagship two-storey residence among pines (hero image)."""
import os
import sys
import math
import random

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import lib  # noqa: E402

A = lib.args({"out": "3d/out/sosny.png", "w": 1600, "h": 900, "samples": 64,
              "view": "hero", "hdri": "citrus_orchard_puresky", "sun": 215.0,
              "strength": 0.6, "exposure": 0.0, "grass": True, "trees": True,
              "depth": False, "lod": "LOD1", "sunlamp": 4.5, "elev": 11.0, "gdens": 260,
              "fx": -13.5, "fy": -9.0})

lib.reset()
lib.render_settings(A["w"], A["h"], A["samples"], exposure=A["exposure"])
lib.world_hdri(A["hdri"], A["strength"], sun_azimuth_deg=A["sun"])
if A["sunlamp"] > 0:
    lib.sun_light("Sun", A["sun"], A["elev"], A["sunlamp"], (1.0, 0.74, 0.50), 0.8)

# ------------------------------------------------------------------ materials
plaster = lib.mat_pbr("Plaster", "white_plaster_02", scale=0.45, albedo=(0.72, 0.69, 0.64),
                      contrast=0.5, normal=0.3, rough_mult=1.1, edge=0.012)
plaster_dark = lib.mat_pbr("PlinthPlaster", "plaster_grey_04", scale=0.5,
                           albedo=(0.10, 0.098, 0.094), contrast=0.6, normal=0.4)
wood = lib.mat_pbr("Slats", "white_oak_veneer", scale=0.6, gain=0.20,
                   normal=0.3, rough_mult=0.9)
soffit = lib.mat_pbr("Soffit", "white_oak_veneer", scale=0.5, gain=0.26, normal=0.2)
deck = lib.mat_pbr("Deck", "oak_wood_planks", scale=0.35, gain=0.14, hue_sat=(0.5, 0.7, 1.0), normal=0.5)
concrete = lib.mat_pbr("Concrete", "smooth_concrete_floor", scale=0.4, albedo=(0.40, 0.385, 0.36), contrast=0.6)
pavers = lib.mat_pbr("Pavers", "concrete_floor_02", scale=0.5, albedo=(0.45, 0.43, 0.40), contrast=0.7)
frame = lib.mat_basic("Frame", (0.035, 0.036, 0.038), roughness=0.38, metallic=0.4)
glass = lib.mat_glass("Glass")
floor_in = lib.mat_pbr("FloorIn", "plank_flooring_02", scale=0.5, albedo=(0.36, 0.27, 0.19))
wall_in = lib.mat_basic("WallIn", (0.72, 0.66, 0.58), roughness=0.9)
fabric = lib.mat_fabric("Boucle", (0.78, 0.74, 0.67))
dark_backing = lib.mat_basic("Backing", (0.025, 0.022, 0.02), roughness=0.9)
curtain = lib.mat_basic("Curtain", (0.92, 0.88, 0.80), roughness=0.9, subsurface=0.0)
ground_mat = lib.mat_pbr("Ground", "forest_ground_04", scale=0.25, gain=0.06, normal=0.8,
                         hue_sat=(0.53, 0.9, 1.0))
soil = lib.mat_pbr("Soil", "farm_soil", scale=0.4, gain=0.05, normal=0.6)
lamp_glow = lib.mat_emission("LampGlow", (1.0, 0.72, 0.45), 18.0)
downlight = lib.mat_emission("Downlight", (1.0, 0.78, 0.55), 30.0)

# translucent sheer curtain
cn = curtain.node_tree
b = cn.nodes["Principled BSDF"]
tr = cn.nodes.new("ShaderNodeBsdfTranslucent")
tr.inputs["Color"].default_value = (1.0, 0.86, 0.68, 1)
mix = cn.nodes.new("ShaderNodeMixShader")
mix.inputs[0].default_value = 0.55
cn.links.new(b.outputs[0], mix.inputs[1])
cn.links.new(tr.outputs[0], mix.inputs[2])
cn.links.new(mix.outputs[0], cn.nodes["Material Output"].inputs["Surface"])

H = lib.collection("House")
FM = (frame, glass)

# levels
Z0 = 0.30   # finished floor
Z1 = 3.40   # ground floor ceiling / slab bottom
Z2 = 3.75   # upper floor
Z3 = 6.70   # upper ceiling
T = 0.40    # wall: 400 mm polystyrene concrete

# ------------------------------------------------------------------ ground floor
# plinth
lib.box("Plinth", -0.02, -0.02, 0.0, 15.02, 10.02, Z0, plaster_dark, 0.006, H)
g_open = [
    ("S", 0.45, 5.75, Z0, Z1 - 0.02, 2),          # living room glazing
    ("W", 0.45, 6.2, Z0, Z1 - 0.02, 2),           # living room side glazing
    ("S", 10.6, 14.4, 1.25, 2.55, 2),             # kitchen ribbon window (behind slats gap)
    ("E", 1.2, 4.2, 1.0, 2.6, 1),
]
gf, _ = lib.shell("GF", 0, 0, Z0, 15, 10, Z1, T, plaster, g_open, H, frame_mats=FM)

# timber slats over the right part of the front facade (hidden door inside)
lib.box("SlatBacking", 6.0, -0.012, Z0, 10.6, 0.0, Z1, dark_backing, coll=H)
lib.box("SlatBackingR", 14.4, -0.012, Z0, 15.0, 0.0, Z1, dark_backing, coll=H)
lib.box("SlatBackingB", 10.6, -0.012, Z0, 14.4, 0.0, 1.25, dark_backing, coll=H)
lib.box("SlatBackingT", 10.6, -0.012, 2.55, 14.4, 0.0, Z1, dark_backing, coll=H)
lib.slats("SlatsFront", "x", -0.012, 6.05, 14.98, Z0, Z1, wood, coll=H)
# the kitchen window sits behind the slats: cut the backing so its light shows through
lib.box("SlatBackingCut", 10.6, -0.05, 1.25, 14.4, 0.05, 2.55, glass, coll=H)

# ground floor roof slab with thin overhanging edge
lib.box("GRoof", -0.45, -0.45, Z1, 15.25, 10.4, Z2, plaster, 0.008, H)
lib.box("GRoofCap", -0.47, -0.47, Z2 - 0.02, 4.0, 10.42, Z2 + 0.03,
        lib.mat_basic("Coping", (0.05, 0.05, 0.05), 0.4, 0.5), coll=H)

# ------------------------------------------------------------------ upper floor (cantilever)
UX0, UX1, UY0, UY1 = 4.0, 16.6, -2.4, 8.2
u_open = [
    ("S", 6.0, 13.6, Z2 + 0.75, Z3 - 0.35, 3),     # long panoramic window
    ("W", -1.6, 1.2, Z2 + 0.05, Z3 - 0.35, 1),     # corner window looking at pines
    ("E", 0.0, 2.2, Z2 + 0.9, Z3 - 0.4, 0),
]
uf, _ = lib.shell("UF", UX0, UY0, Z2, UX1, UY1, Z3, T, plaster, u_open, H, frame_mats=FM)
lib.box("URoof", UX0 - 0.02, UY0 - 0.02, Z3, UX1 + 0.02, UY1 + 0.02, Z3 + 0.30, plaster, 0.008, H)
lib.box("UCoping", UX0 - 0.03, UY0 - 0.03, Z3 + 0.30, UX1 + 0.03, UY1 + 0.03, Z3 + 0.33,
        lib.mat_basic("Coping2", (0.06, 0.06, 0.06), 0.45, 0.6), coll=H)
# upper floor slab (visible as the cantilever underside) with oak soffit
lib.box("USlab", UX0, UY0, Z1 + 0.05, UX1, 0.0, Z2, plaster, 0.008, H)
lib.box("USoffit", UX0 + 0.12, UY0 + 0.12, Z1 + 0.03, UX1 - 0.12, -0.45, Z1 + 0.05, soffit, coll=H)
for i in range(5):
    x = UX0 + 1.4 + i * 2.4
    lib.cylinder(f"DL{i}", x, -1.4, Z1 + 0.025, Z1 + 0.03, 0.045, downlight, 24, H)
    lib.point_light(f"DLp{i}", (x, -1.4, Z1 - 0.02), 25, (1.0, 0.78, 0.55), 0.04, H)
# slim steel column at the cantilever corner
lib.box("Column", UX1 - 0.55, UY0 + 0.35, Z0, UX1 - 0.45, UY0 + 0.45, Z1 + 0.05, frame, coll=H)

# ------------------------------------------------------------------ interiors (seen through glass)
I = lib.collection("Interior")
lib.box("FloorIn", 0.4, 0.4, Z0 - 0.01, 14.6, 9.6, Z0, floor_in, coll=I)
lib.box("FloorUp", UX0 + 0.4, UY0 + 0.4, Z2, UX1 - 0.4, UY1 - 0.4, Z2 + 0.01, floor_in, coll=I)
lib.box("BackWall", 0.4, 6.8, Z0, 9.0, 7.0, Z1, wall_in, coll=I)
lib.box("Partition", 6.0, 0.4, Z0, 6.2, 6.8, Z1, wall_in, coll=I)
lib.box("UpBack", UX0 + 0.4, 4.8, Z2, UX1 - 0.4, 5.0, Z3, wall_in, coll=I)
# living room furniture
lib.rounded("Sofa", 1.2, 4.6, Z0, 4.6, 5.65, Z0 + 0.42, fabric, 0.12, coll=I)
lib.rounded("SofaBack", 1.2, 5.35, Z0 + 0.3, 4.6, 5.75, Z0 + 0.82, fabric, 0.14, coll=I)
lib.rounded("Pouf", 1.6, 2.6, Z0, 2.4, 3.3, Z0 + 0.38, fabric, 0.15, coll=I)
stone = lib.mat_pbr("Travertine", "sandstone_cracks", scale=1.2, albedo=(0.62, 0.55, 0.46), contrast=0.6)
lib.cylinder("CoffeeT", 3.2, 3.4, Z0, Z0 + 0.36, 0.55, stone, 64, I, 0.01)
art = lib.mat_basic("Art", (0.32, 0.26, 0.20), 0.8)
lib.box("Art", 2.0, 6.78, 1.3, 3.9, 6.8, 2.7, art, coll=I)
lib.box("Console", 1.2, 6.35, Z0, 4.4, 6.8, Z0 + 0.6, lib.mat_pbr("Walnut", "smoked_walnut_veneer", 1.0), 0.01, I)
# pendant lights (glowing spheres)
for i, (x, y) in enumerate([(2.4, 3.3), (3.6, 3.6), (12.0, 4.0)]):
    lib.sphere(f"Pend{i}", (x, y, 2.35 + 0.12 * i), 0.16, lamp_glow, I)
    lib.box(f"Cord{i}", x - 0.004, y - 0.004, 2.5 + 0.12 * i, x + 0.004, y + 0.004, Z1, frame, coll=I)
# softly glowing ceilings (cove lighting) so interiors read warm, never black
ceil = lib.mat_basic("CeilingGlow", (0.8, 0.75, 0.68), 0.9, emission=(1.0, 0.78, 0.56),
                     emission_strength=0.7)
lib.box("CeilG", 0.4, 0.4, Z1 - 0.02, 14.6, 9.6, Z1 - 0.01, ceil, coll=I)
lib.box("CeilU", UX0 + 0.4, UY0 + 0.4, Z3 - 0.02, UX1 - 0.4, UY1 - 0.4, Z3 - 0.01, ceil, coll=I)
# warm interior fill
lib.area_light("LivingFill", (3.0, 4.2, Z1 - 0.05), 2.0, 260, (1.0, 0.70, 0.46), coll=I)
lib.area_light("KitchenFill", (12.5, 2.0, Z1 - 0.05), 3.0, 300, (1.0, 0.70, 0.46), coll=I)
lib.area_light("UpFill", (10.0, 1.5, Z3 - 0.05), 3.0, 280, (1.0, 0.68, 0.44), coll=I)
lib.area_light("UpFill2", (5.5, 0.0, Z3 - 0.05), 1.5, 120, (1.0, 0.68, 0.44), coll=I)
# sheer curtains upstairs, partly drawn
for i, (a, b) in enumerate([(6.1, 7.6), (11.8, 13.5)]):
    lib.box(f"Curtain{i}", a, UY0 + 0.5, Z2 + 0.1, b, UY0 + 0.52, Z3 - 0.4, curtain, coll=I)
lib.rounded("Bed", 8.0, 1.0, Z2, 10.4, 3.2, Z2 + 0.55, fabric, 0.08, coll=I)

# ------------------------------------------------------------------ terrace, steps, path
L = lib.collection("Landscape")
lib.box("Deck", -1.2, -4.6, 0.0, 9.6, 0.0, Z0 - 0.02, deck, 0.004, L)
lib.box("Step1", 1.0, -5.3, 0.0, 6.0, -4.6, 0.15, concrete, 0.006, L)
lib.box("Planter", -1.2, -4.6, 0.0, -0.6, 0.0, 0.62, concrete, 0.01, L)
lib.box("PlanterSoil", -1.15, -4.55, 0.0, -0.65, -0.05, 0.58, soil, coll=L)
# entrance path of large-format pavers
for i in range(9):
    y = -1.0 - i * 1.25
    x = 7.6 + math.sin(i * 0.5) * 0.15
    lib.box(f"Paver{i}", x - 0.8, y - 0.5, -0.02, x + 0.8, y + 0.5, 0.04, pavers, 0.008, L)

# ground: big textured plane + lawn with hair in the foreground
ground = lib.plane("Ground", -150, -150, 150, 250, 0.0, ground_mat, L)
lawn_area = lib.plane("Lawn", -40, -26, 60, 45, 0.005, ground_mat, L, subdiv=70)
if A["grass"]:
    # density mask: no grass under the house, deck and path
    vg = lawn_area.vertex_groups.new(name="dens")
    for v in lawn_area.data.vertices:
        x, y = v.co.x, v.co.y
        w = 1.0
        if -1.4 < x < 17.0 and -5.4 < y < 10.5:
            w = 0.0
        if 6.6 < x < 8.6 and y < -0.5:
            w = 0.0
        # thin out with distance from the camera (far grass is barely resolved)
        d = math.hypot(x + 8.5, y + 19.5)
        w *= max(0.12, min(1.0, 1.25 - d / 40.0))
        vg.add([v.index], w, "REPLACE")
    lib.lawn("Grass", lawn_area, density=A["gdens"], length=0.065, vertex_group="dens")

# ------------------------------------------------------------------ vegetation
if A["trees"]:
    pines = lib.load_lod("pine_tree_01", A["lod"])
    firs = lib.load_lod("fir_tree_01", "LOD1")
    shrubs = lib.load_lod("shrub_02", "LOD0") + lib.load_lod("shrub_04", "LOD0")
    grasses = lib.load_lod("grass_medium_01", "LOD0")
    T_ = lib.collection("Trees")

    def near_house(x, y, pad=3.0):
        return (-1.5 - pad < x < 17.0 + pad and -5.0 - pad < y < 10.5 + pad) or \
               (5.5 < x < 9.5 and y < -4)

    # keep the view open: nothing right in front of the lens
    cam_clear = lambda x, y: (y < -6 and -4 < x < 22) or math.hypot(x + 10.0, y + 17.5) < 13.0
    pts = lib.poisson(70, -40, 11, 60, 60, 4.2, seed=11,
                      avoid=lambda x, y: near_house(x, y))
    lib.place(pines, [(x, y, 0) for x, y in pts], (0.85, 1.2), T_, seed=2)
    side = lib.poisson(14, -32, -12, -6, 12, 4.5, seed=5,
                       avoid=lambda x, y: near_house(x, y) or cam_clear(x, y))
    side += lib.poisson(10, 21, -8, 40, 12, 4.5, seed=6,
                        avoid=lambda x, y: near_house(x, y) or cam_clear(x, y))
    lib.place(pines, [(x, y, 0) for x, y in side], (0.8, 1.1), T_, seed=4)
    far = lib.poisson(160, -120, 60, 140, 160, 7.0, seed=9)
    lib.place(pines + firs, [(x, y, 0) for x, y in far], (0.9, 1.3), T_, seed=8)
    mid = lib.poisson(12, -30, 8, 40, 26, 6.0, seed=31, avoid=lambda x, y: near_house(x, y, 4))
    lib.place(firs, [(x, y, 0) for x, y in mid], (0.7, 1.0), T_, seed=14)
    decid = lib.load_lod("tree_small_02", "LOD1") + lib.load_lod("island_tree_01", "LOD1")
    lib.place(decid, [(19.5, 3.0, 0, 0), (-6.5, 9.5, 0, 1), (22.5, 12.0, 0, 1)], (0.9, 1.1), T_, seed=15)
    # framing pine on the left foreground
    lib.place(pines, [(A["fx"], A["fy"], 0, 0)], (1.05, 1.05), T_, seed=1)
    # shrubs along the plinth and around the terrace
    sh = [(x, -0.9 - random.Random(i).uniform(0, 0.3), 0) for i, x in
          enumerate([9.9, 10.6, 11.4, 12.2, 13.0, 13.8, 14.6, 15.4, 16.2])]
    sh += [(-1.9, y, 0) for y in (-4.0, -2.9, -1.8, -0.6, 0.6, 1.8, 3.0, 4.2, 5.4)]
    lib.place(shrubs, sh, (0.9, 1.3), T_, seed=12)
    gl = lib.poisson(40, -12, -16, 26, 9, 0.9, seed=21,
                     avoid=lambda x, y: near_house(x, y, 0.4) or (5.8 < x < 9.4 and y < 0))
    lib.place(grasses, [(x, y, 0) for x, y in gl], (0.6, 1.0), T_, seed=13)
    # olive-like small tree in the terrace planter
    small = lib.load_lod("island_tree_02", "LOD1")
    lib.place(small, [(-0.9, -2.3, 0.55, 0)], (0.42, 0.42), T_, seed=1)

# ------------------------------------------------------------------ camera
if A["view"] == "hero":
    # the house sits in the right half, leaving calm forest on the left for the headline
    lib.camera((-10.0, -17.5, 1.65), (5.5, 3.0, 1.65), lens=26, shift_y=0.14, shift_x=-0.16)
elif A["view"] == "hero_centered":
    lib.camera((-8.5, -19.5, 1.65), (7.5, 2.0, 1.65), lens=28, shift_y=0.15, shift_x=0.03)
elif A["view"] == "portrait":
    lib.camera((-7.5, -27.0, 1.6), (6.5, 2.0, 1.6), lens=30, shift_y=0.16, shift_x=0.04)
elif A["view"] == "card":
    lib.camera((22.0, -20.0, 1.7), (6.0, 2.0, 1.7), lens=34, shift_y=0.12)
elif A["view"] == "terrace":
    lib.camera((-3.0, -9.5, 1.55), (6.0, 0.0, 2.2), lens=26, shift_y=0.08)

lib.composite(glare=0.3, vignette=0.14, warm=0.06,
              mist=(25, 160, (0.85, 0.72, 0.62), 0.22))
if A["depth"]:
    lib.depth_output(A["out"].replace(".png", "_depth.png"), 6.0, 120.0)
lib.render(A["out"])
