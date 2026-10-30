"""Shared material palette and landscape for the exterior scenes, so every
house is rendered in the same art direction (warm plaster, oak, anthracite
frames, pine forest at golden hour)."""
import math
import random

import lib


def materials():
    M = {}
    M["plaster"] = lib.mat_pbr("Plaster", "white_plaster_02", scale=0.45, albedo=(0.72, 0.69, 0.64),
                               contrast=0.5, normal=0.3, rough_mult=1.1, edge=0.012)
    M["plaster_sand"] = lib.mat_pbr("PlasterSand", "white_plaster_02", scale=0.45,
                                    albedo=(0.62, 0.54, 0.45), contrast=0.55, normal=0.35,
                                    rough_mult=1.1, edge=0.012)
    M["plinth"] = lib.mat_pbr("Plinth", "plaster_grey_04", scale=0.5,
                              albedo=(0.10, 0.098, 0.094), contrast=0.6, normal=0.4)
    M["wood"] = lib.mat_pbr("Slats", "white_oak_veneer", scale=0.6, gain=0.20, normal=0.3, rough_mult=0.9)
    M["wood_dark"] = lib.mat_pbr("WoodDark", "smoked_walnut_veneer", scale=0.6, gain=0.06,
                                 normal=0.3, rough_mult=0.9)
    M["soffit"] = lib.mat_pbr("Soffit", "white_oak_veneer", scale=0.5, gain=0.26, normal=0.2)
    M["deck"] = lib.mat_pbr("Deck", "oak_wood_planks", scale=0.35, gain=0.14, hue_sat=(0.5, 0.7, 1.0),
                            normal=0.5)
    M["concrete"] = lib.mat_pbr("Concrete", "smooth_concrete_floor", scale=0.4,
                                albedo=(0.40, 0.385, 0.36), contrast=0.6)
    M["pavers"] = lib.mat_pbr("Pavers", "concrete_floor_02", scale=0.5, albedo=(0.45, 0.43, 0.40),
                              contrast=0.7)
    M["gravel"] = lib.mat_pbr("Gravel", "gravel_floor_02", scale=0.6, albedo=(0.40, 0.38, 0.35),
                              contrast=1.0, normal=1.0)
    M["frame"] = lib.mat_basic("Frame", (0.035, 0.036, 0.038), roughness=0.38, metallic=0.4)
    M["metal_roof"] = lib.mat_basic("MetalRoof", (0.045, 0.046, 0.048), roughness=0.42, metallic=0.6)
    M["coping"] = lib.mat_basic("Coping", (0.05, 0.05, 0.05), 0.4, 0.5)
    M["glass"] = lib.mat_glass("Glass")
    M["floor_in"] = lib.mat_pbr("FloorIn", "plank_flooring_02", scale=0.5, albedo=(0.36, 0.27, 0.19))
    M["wall_in"] = lib.mat_basic("WallIn", (0.72, 0.66, 0.58), roughness=0.9)
    M["fabric"] = lib.mat_fabric("Boucle", (0.78, 0.74, 0.67))
    M["backing"] = lib.mat_basic("Backing", (0.025, 0.022, 0.02), roughness=0.9)
    M["ground"] = lib.mat_pbr("Ground", "forest_ground_04", scale=0.25, gain=0.06, normal=0.8,
                              hue_sat=(0.53, 0.9, 1.0))
    M["soil"] = lib.mat_pbr("Soil", "farm_soil", scale=0.4, gain=0.05, normal=0.6)
    M["stone"] = lib.mat_pbr("Travertine", "sandstone_cracks", scale=1.2, albedo=(0.62, 0.55, 0.46),
                             contrast=0.6)
    M["lamp"] = lib.mat_emission("LampGlow", (1.0, 0.72, 0.45), 18.0)
    M["downlight"] = lib.mat_emission("Downlight", (1.0, 0.78, 0.55), 30.0)
    M["ceiling"] = lib.mat_basic("CeilingGlow", (0.8, 0.75, 0.68), 0.9, emission=(1.0, 0.78, 0.56),
                                 emission_strength=0.7)
    M["art"] = lib.mat_basic("Art", (0.32, 0.26, 0.20), 0.8)

    cur = lib.mat_basic("Curtain", (0.92, 0.88, 0.80), roughness=0.9)
    cn = cur.node_tree
    b = cn.nodes["Principled BSDF"]
    tr = cn.nodes.new("ShaderNodeBsdfTranslucent")
    tr.inputs["Color"].default_value = (1.0, 0.86, 0.68, 1)
    mix = cn.nodes.new("ShaderNodeMixShader")
    mix.inputs[0].default_value = 0.55
    cn.links.new(b.outputs[0], mix.inputs[1])
    cn.links.new(tr.outputs[0], mix.inputs[2])
    cn.links.new(mix.outputs[0], cn.nodes["Material Output"].inputs["Surface"])
    M["curtain"] = cur
    return M


def golden_hour(A, hdri="citrus_orchard_puresky"):
    lib.world_hdri(A.get("hdri") or hdri, A.get("strength", 0.6), sun_azimuth_deg=A["sun"])
    if A.get("sunlamp", 0) > 0:
        lib.sun_light("Sun", A["sun"], A["elev"], A["sunlamp"], (1.0, 0.74, 0.50), 0.8)


def interior_room(M, x0, y0, x1, y1, z0, z1, coll, power=260, ceiling=True):
    """Warm, softly lit room volume behind glass (floor, ceiling glow, fill)."""
    lib.box("Floor", x0, y0, z0 - 0.01, x1, y1, z0, M["floor_in"], coll=coll)
    if ceiling:
        lib.box("Ceil", x0, y0, z1 - 0.02, x1, y1, z1 - 0.01, M["ceiling"], coll=coll)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    lib.area_light("Fill", (cx, cy, z1 - 0.05), min(3.0, (x1 - x0) / 2), power,
                   (1.0, 0.70, 0.46), coll=coll)


def lounge(M, x, y, z, coll, rot=False):
    """Sofa, pouf, coffee table and a pendant, seen through glazing."""
    if not rot:
        lib.rounded("Sofa", x, y, z, x + 3.2, y + 1.0, z + 0.42, M["fabric"], 0.12, coll=coll)
        lib.rounded("SofaBack", x, y + 0.7, z + 0.3, x + 3.2, y + 1.1, z + 0.82, M["fabric"], 0.14,
                    coll=coll)
        lib.cylinder("Table", x + 1.6, y - 1.0, z, z + 0.36, 0.55, M["stone"], 64, coll, 0.01)
        lib.sphere("Pend", (x + 1.6, y - 1.0, z + 2.1), 0.16, M["lamp"], coll)
    else:
        lib.rounded("Sofa", x, y, z, x + 1.0, y + 3.2, z + 0.42, M["fabric"], 0.12, coll=coll)
        lib.rounded("SofaBack", x + 0.7, y, z + 0.3, x + 1.1, y + 3.2, z + 0.82, M["fabric"], 0.14,
                    coll=coll)
        lib.cylinder("Table", x - 1.0, y + 1.6, z, z + 0.36, 0.55, M["stone"], 64, coll, 0.01)
        lib.sphere("Pend", (x - 1.0, y + 1.6, z + 2.1), 0.16, M["lamp"], coll)


def landscape(A, M, footprint, cam, lawn_rect=(-40, -26, 60, 45), keep_clear=None,
              pines=70, side=True, far=True, firs=12, decid=None, shrubs=None,
              grass_tufts=None, winter=False, seed=0):
    """Pine forest setting with a manicured lawn.

    footprint: list of (x0, y0, x1, y1) rectangles with no grass/trees.
    cam: (x, y) camera position, lawn density falls off with distance.
    keep_clear(x, y): extra predicate for areas to keep free of trees."""
    L = lib.collection("Landscape")
    lib.plane("Ground", -250, -250, 250, 350, 0.0, M["ground"], L)
    x0, y0, x1, y1 = lawn_rect
    lawn = lib.plane("Lawn", x0, y0, x1, y1, 0.005, M["ground"], L,
                     subdiv=int(max(x1 - x0, y1 - y0) * 0.7))

    def inside(x, y, pad=0.0):
        return any(a - pad < x < c + pad and b - pad < y < d + pad for a, b, c, d in footprint)

    if A.get("grass", True) and not winter:
        vg = lawn.vertex_groups.new(name="dens")
        for v in lawn.data.vertices:
            x, y = v.co.x, v.co.y
            w = 0.0 if inside(x, y) else 1.0
            d = math.hypot(x - cam[0], y - cam[1])
            w *= max(0.12, min(1.0, 1.25 - d / 40.0))
            vg.add([v.index], w, "REPLACE")
        lib.lawn("Grass", lawn, density=A.get("gdens", 260), length=0.065, vertex_group="dens")

    if not A.get("trees", True):
        return L
    T = lib.collection("Trees")
    kc = keep_clear or (lambda x, y: False)
    pine = lib.load_lod("pine_tree_01", A.get("lod", "LOD1"))
    fir = lib.load_lod("fir_tree_01", "LOD1")
    pts = lib.poisson(pines, -45, max(f[3] for f in footprint) + 1.0, 65, 65, 4.2, seed=11 + seed,
                      avoid=lambda x, y: inside(x, y, 3.5) or kc(x, y))
    lib.place(pine, [(x, y, 0) for x, y in pts], (0.85, 1.2), T, seed=2 + seed)
    if side:
        sp = lib.poisson(24, -40, -14, 70, 14, 4.5, seed=5 + seed,
                         avoid=lambda x, y: inside(x, y, 3.5) or kc(x, y))
        lib.place(pine, [(x, y, 0) for x, y in sp], (0.8, 1.1), T, seed=4 + seed)
    if firs:
        mp = lib.poisson(firs, -35, 6, 50, 30, 6.0, seed=31 + seed,
                         avoid=lambda x, y: inside(x, y, 4) or kc(x, y))
        lib.place(fir, [(x, y, 0) for x, y in mp], (0.7, 1.0), T, seed=14 + seed)
    if far:
        fp = lib.poisson(170, -140, 65, 160, 170, 7.0, seed=9 + seed)
        lib.place(pine + fir, [(x, y, 0) for x, y in fp], (0.9, 1.3), T, seed=8 + seed)
    if decid:
        dv = lib.load_lod("tree_small_02", "LOD1") + lib.load_lod("island_tree_01", "LOD1")
        lib.place(dv, decid, (0.9, 1.1), T, seed=15 + seed)
    if shrubs:
        sv = lib.load_lod("shrub_02", "LOD0") + lib.load_lod("shrub_04", "LOD0")
        lib.place(sv, shrubs, (0.9, 1.3), T, seed=12 + seed)
    if grass_tufts:
        gv = lib.load_lod("grass_medium_01", "LOD0")
        lib.place(gv, grass_tufts, (0.6, 1.0), T, seed=13 + seed)
    return L
