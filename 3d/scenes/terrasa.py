"""House «Терраса» — single storey L-plan in warm sand plaster around a
terrace with a timber pergola."""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import lib  # noqa: E402
import kit  # noqa: E402

A = lib.args({"out": "3d/out/terrasa.png", "w": 1600, "h": 1200, "samples": 96,
              "sun": 235.0, "elev": 12.0, "sunlamp": 4.5, "strength": 0.6, "hdri": "",
              "grass": True, "trees": True, "gdens": 260, "lod": "LOD1", "exposure": 0.0})

lib.reset()
lib.render_settings(A["w"], A["h"], A["samples"], exposure=A["exposure"])
kit.golden_hour(A)
M = kit.materials()
H = lib.collection("House")
I = lib.collection("Interior")
FM = (M["frame"], M["glass"])
P = M["plaster_sand"]

Z0, Z1 = 0.30, 3.50
T = 0.40
# wing A along X (living), wing B along Y towards the camera (bedrooms)
lib.box("PlinthA", -0.02, -0.02, 0.0, 20.02, 8.02, Z0, M["plinth"], 0.006, H)
lib.box("PlinthB", 13.98, -9.02, 0.0, 20.02, 0.02, Z0, M["plinth"], 0.006, H)
wa, _ = lib.shell("WA", 0, 0, Z0, 20, 8, Z1, T, P,
                  [("S", 1.0, 13.0, Z0, Z1 - 0.02, 5), ("W", 2.0, 6.0, 1.0, 2.8, 1)], H, frame_mats=FM)
wb, _ = lib.shell("WB", 14, -9, Z0, 20, 0.2, Z1, T, P,
                  [("W", -8.0, -1.0, Z0, Z1 - 0.02, 3), ("S", 15.5, 18.5, 1.0, 2.6, 1)], H, frame_mats=FM)
# roofs: thin slabs with a slim dark coping
lib.box("RoofA", -0.3, -0.3, Z1, 20.3, 8.3, Z1 + 0.42, P, 0.008, H)
lib.box("RoofB", 13.7, -9.3, Z1, 20.3, 0.0, Z1 + 0.42, P, 0.008, H)
lib.box("CapA", -0.32, -0.32, Z1 + 0.42, 20.32, 8.32, Z1 + 0.45, M["coping"], coll=H)
lib.box("CapB", 13.68, -9.32, Z1 + 0.42, 20.32, 0.0, Z1 + 0.45, M["coping"], coll=H)
# chimney volume in plaster
lib.box("Chimney", 4.0, 5.6, Z1, 5.2, 6.8, Z1 + 1.6, P, 0.01, H)

# pergola over the terrace in the corner of the L
for i in range(14):
    x = 1.2 + i * 0.9
    lib.box(f"Beam{i}", x, -5.6, Z1 - 0.32, x + 0.08, 0.0, Z1 - 0.06, M["wood"], 0.003, H)
lib.box("PergBeam", 1.0, -5.75, Z1 - 0.4, 13.8, -5.55, Z1 - 0.06, M["wood"], 0.004, H)
for x in (1.05, 7.3, 13.6):
    lib.box(f"Post{x}", x, -5.75, 0.0, x + 0.16, -5.55, Z1 - 0.4, M["wood"], 0.004, H)

# interiors
kit.interior_room(M, 0.4, 0.4, 13.6, 7.6, Z0, Z1, I, power=320)
lib.box("Back", 0.4, 5.5, Z0, 13.6, 5.7, Z1, M["wall_in"], coll=I)
kit.lounge(M, 3.0, 3.6, Z0, I)
lib.box("Dining", 8.6, 2.6, Z0 + 0.72, 11.4, 3.6, Z0 + 0.76, M["stone"], 0.005, I)
for i, x in enumerate((9.3, 10.7)):
    lib.sphere(f"PendD{i}", (x, 3.1, 2.3), 0.15, M["lamp"], I)
kit.interior_room(M, 14.4, -8.6, 19.6, -0.2, Z0, Z1, I, power=200)
for i, y in enumerate((-6.5, -3.0)):
    lib.box(f"Cur{i}", 14.55, y - 0.8, Z0 + 0.05, 14.57, y + 0.8, Z1 - 0.1, M["curtain"], coll=I)

# terrace: large format stone paving, outdoor lounge, planters
Tc = lib.collection("Terrace")
lib.box("Terrace", -0.6, -6.4, 0.0, 14.0, 0.0, Z0 - 0.02, M["stone"], 0.004, Tc)
lib.box("Step", 3.0, -7.1, 0.0, 10.0, -6.4, 0.14, M["stone"], 0.004, Tc)
out_fab = lib.mat_fabric("OutFabric", (0.70, 0.66, 0.60), scale=400, bump=0.3)
lib.rounded("OSofa", 2.0, -4.8, Z0 - 0.02, 5.4, -3.9, Z0 + 0.38, out_fab, 0.1, coll=Tc)
lib.rounded("OSofaB", 2.0, -4.1, Z0 + 0.2, 5.4, -3.75, Z0 + 0.72, out_fab, 0.12, coll=Tc)
lib.cylinder("OTable", 3.7, -2.8, Z0 - 0.02, Z0 + 0.32, 0.5, M["concrete"], 64, Tc, 0.008)
lib.rounded("OChair", 6.4, -3.4, Z0 - 0.02, 7.3, -2.5, Z0 + 0.42, out_fab, 0.12, coll=Tc)
pot = lib.load_lod("planter_pot_clay", "LOD0", group=True)
olive = lib.load_lod("island_tree_02", "LOD1")
for i, (x, y) in enumerate([(0.2, -5.6), (12.6, -5.6)]):
    lib.instance_of(pot[0], f"Pot{i}", (x, y, Z0 - 0.02), 0.0, 3.0, Tc)
    lib.instance_of(olive[0], f"Olive{i}", (x, y, Z0 + 0.6), 0.4 + i, 0.52, Tc)
for i in range(8):
    y = -7.6 - i * 1.25
    lib.box(f"Paver{i}", 6.0, y - 0.45, -0.02, 7.6, y + 0.45, 0.04, M["pavers"], 0.008, Tc)

cam = (-6.5, -17.5)
kit.landscape(
    A, M,
    footprint=[(-0.8, -7.3, 20.4, 8.4), (13.6, -9.4, 20.4, 0.0), (5.6, -18.0, 8.0, -7.0)],
    cam=cam,
    keep_clear=lambda x, y: y < -8 and -30 < x < 30,
    decid=[(23.0, -4.0, 0, 0), (-6.0, 6.0, 0, 1)],
    shrubs=[(x, -7.6, 0) for x in (-0.3, 0.8, 1.9, 10.6, 11.8, 13.0)] +
           [(13.4, y, 0) for y in (-9.2, -8.0)],
)
lib.camera((cam[0], cam[1], 1.55), (9.5, -1.5, 1.55), lens=30, shift_y=0.09)
lib.composite(glare=0.3, vignette=0.14, warm=0.07, mist=(25, 160, (0.85, 0.72, 0.62), 0.22))
lib.render(A["out"])
