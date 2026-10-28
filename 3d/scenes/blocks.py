"""Studio product shots of polystyrene concrete blocks (transparent PNG with a
soft contact shadow), plus a macro of the cut face and a stacked hero shot."""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import bpy  # noqa: E402
import bmesh  # noqa: E402
import lib  # noqa: E402

A = lib.args({"out": "3d/out/block_wall.png", "w": 1400, "h": 1100, "samples": 128,
              "shot": "wall", "exposure": 0.0})

lib.reset()
transparent = A["shot"] not in ("macro", "stack")
lib.render_settings(A["w"], A["h"], A["samples"], transparent=transparent,
                    exposure=A["exposure"], look="AgX - Base Contrast")
sc = bpy.context.scene
lib.world_hdri("brown_photostudio_02", 0.5, rot_deg=40, saturation=0.3)

psb = lib.mat_psb("PSB", cement=(0.17, 0.168, 0.16), bead=(0.82, 0.82, 0.80), bead_scale=120,
                  coverage=0.6, bump=0.4)


def block(name, L, H, W, x=0, y=0, z=0, rot=0.0, u_slot=None, groove=False, mat=psb):
    """Block of L x W x H metres standing on z. u_slot=(width, depth) makes a
    U-block (lintel form) with the channel open at the top."""
    ob = lib.box(name, -L / 2, -W / 2, 0, L / 2, W / 2, H, mat)
    if u_slot:
        cw, cd = u_slot
        lib.apply_boolean(ob, [lib.box("slot", -L / 2 - 0.1, -cw / 2, H - cd, L / 2 + 0.1, cw / 2, H + 0.1)])
    if groove:
        # tongue and groove on the short ends
        lib.apply_boolean(ob, [lib.box("g", L / 2 - 0.02, -0.035, -0.1, L / 2 + 0.1, 0.035, H + 0.1)])
    # chamfered edges via render-time bevel on the material is too soft for a
    # cast block; use a small geometric bevel instead (no booleans after it)
    md = ob.modifiers.new("Bevel", "BEVEL")
    md.width = 0.0025
    md.segments = 2
    md.limit_method = "ANGLE"
    ob.location = (x, y, z)
    ob.rotation_euler = (0, 0, rot)
    return ob


shot = A["shot"]
if transparent:
    # shadow catcher floor
    floor = lib.plane("Floor", -5, -5, 5, 5, 0.0)
    floor.is_shadow_catcher = True
    floor.data.materials.append(lib.mat_basic("F", (0.8, 0.8, 0.8), 0.9))

specs = {
    "wall":      dict(L=0.6, H=0.3, W=0.4),
    "wall300":   dict(L=0.6, H=0.3, W=0.3),
    "partition": dict(L=0.6, H=0.3, W=0.1),
    "ublock":    dict(L=0.6, H=0.25, W=0.3, u_slot=(0.16, 0.17)),
}

if shot in specs:
    p = specs[shot]
    block("B", p["L"], p["H"], p["W"], rot=math.radians(-28), u_slot=p.get("u_slot"))
    # key softbox from upper left, gentle fill, rim
    lib.light_at("Key", (-2.0, -1.4, 2.2), (0, 0, 0.15), 2.4, 260, (1.0, 0.95, 0.88))
    lib.light_at("Top", (0.3, 0.2, 2.4), (0, 0, 0.15), 2.5, 90, (1.0, 0.98, 0.95))
    lib.light_at("Fill", (2.0, -1.6, 0.7), (0, 0, 0.15), 2.0, 45, (0.93, 0.96, 1.0))
    lib.light_at("Rim", (0.6, 1.8, 1.0), (0, 0, 0.15), 1.0, 60, (1.0, 0.95, 0.9))
    cam = lib.camera((1.3, -1.8, 1.15), (0, 0, 0.14), lens=70, two_point=False)
elif shot == "stack":
    # warm seamless backdrop with a small running-bond wall and loose blocks
    bg = lib.mat_basic("Backdrop", (0.42, 0.37, 0.31), 0.92)
    lib.plane("BackFloor", -8, -8, 8, 2.0, 0.0, bg)
    lib.box("BackWall", -8, 2.0, 0, 8, 2.1, 6, bg)
    for row in range(4):
        n = 3 if row % 2 == 0 else 2
        off = 0.0 if row % 2 == 0 else 0.3
        for i in range(n):
            x = -0.9 + off + i * 0.604 + 0.3
            block(f"S{row}_{i}", 0.6, 0.3, 0.3, x=x, y=0.3, z=row * 0.302)
        if row % 2 == 1:  # half blocks at the ends of offset rows
            block(f"H{row}a", 0.296, 0.3, 0.3, x=-0.752, y=0.3, z=row * 0.302)
            block(f"H{row}b", 0.296, 0.3, 0.3, x=0.752 + 0.004, y=0.3, z=row * 0.302)
    block("Loose", 0.6, 0.3, 0.2, x=1.35, y=-0.35, rot=math.radians(-24))
    block("Loose2", 0.6, 0.3, 0.1, x=-1.45, y=-0.25, rot=math.radians(16))
    lib.light_at("Key", (-3.4, -0.6, 2.0), (0.0, 0.3, 0.5), 1.6, 700, (1.0, 0.86, 0.70))
    lib.light_at("Fill", (3.0, -3.2, 1.4), (0.0, 0.3, 0.5), 3.0, 90, (0.92, 0.96, 1.0))
    lib.camera((2.3, -4.1, 1.05), (0.1, 0.2, 0.6), lens=50, two_point=True, shift_y=-0.03)
    bpy.context.scene.view_settings.exposure = -0.9
elif shot == "macro":
    b = block("B", 0.6, 0.3, 0.3, rot=math.radians(-35))
    lib.plane("Ground", -3, -3, 3, 3, 0.0, lib.mat_basic("G", (0.4, 0.37, 0.33), 0.9))
    lib.light_at("Key", (-0.9, -0.8, 0.9), (0.16, -0.3, 0.3), 0.8, 60, (1.0, 0.88, 0.72))
    lib.light_at("Fill", (0.9, -0.6, 0.45), (0.16, -0.3, 0.3), 1.0, 14, (0.9, 0.95, 1.0))
    # 100 mm lens close to the top front corner, shallow depth of field
    corner = (0.0, -0.0, 0.3)
    cam = lib.camera((0.42, -0.62, 0.48), (0.16, -0.295, 0.29), lens=100, two_point=False,
                     dof_distance=0.457, fstop=4.0)

lib.composite(glare=0.0, vignette=0.0 if transparent else 0.12, warm=0.02)
lib.render(A["out"])
