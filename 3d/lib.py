"""
Shared helpers for the Global Group Development render scenes.

Every scene in ./scenes imports this module and is run headless:

    blender -b --factory-startup -P 3d/scenes/<scene>.py -- --out 3d/out/<name>.png

Assets (HDRIs, textures, vegetation) are CC0 files from Poly Haven,
downloaded by 3d/fetch_assets.py into $GGD_ASSETS (default /opt/assets).
"""
import bpy
import bmesh
import math
import os
import random
import sys
from mathutils import Vector, Matrix

ASSETS = os.environ.get("GGD_ASSETS", "/opt/assets")

# ---------------------------------------------------------------- arguments


def args(defaults):
    """Parse `-- --key value` pairs passed after Blender's own arguments."""
    out = dict(defaults)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    i = 0
    while i < len(argv):
        k = argv[i].lstrip("-")
        v = argv[i + 1] if i + 1 < len(argv) else "1"
        if k in out and isinstance(out[k], bool):
            v = v not in ("0", "false", "no")
        elif k in out and isinstance(out[k], int):
            v = int(v)
        elif k in out and isinstance(out[k], float):
            v = float(v)
        out[k] = v
        i += 2
    return out


# ---------------------------------------------------------------- scene


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    random.seed(7)


def render_settings(w, h, samples=128, transparent=False, exposure=0.0,
                    look="AgX - Base Contrast", threshold=0.015):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    cy = sc.cycles
    cy.device = "CPU"
    cy.samples = samples
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = threshold
    cy.use_denoising = True
    cy.denoiser = "OPENIMAGEDENOISE"
    cy.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    cy.denoising_prefilter = "ACCURATE"
    cy.max_bounces = 10
    cy.diffuse_bounces = 4
    cy.glossy_bounces = 4
    cy.transmission_bounces = 8
    cy.transparent_max_bounces = 24
    cy.caustics_reflective = False
    cy.caustics_refractive = False
    cy.blur_glossy = 1.0
    cy.sample_clamp_indirect = 6.0
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = transparent
    sc.view_settings.view_transform = "AgX"
    try:
        sc.view_settings.look = look
    except TypeError:
        pass
    sc.view_settings.exposure = exposure
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    sc.render.image_settings.color_depth = "16"
    sc.render.use_persistent_data = False


def render(path):
    sc = bpy.context.scene
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------- world


def _hdri_sun_azimuth(img):
    """Azimuth (radians, from +X towards +Y) of the brightest pixel."""
    import numpy as np
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    lum = px[..., 0] * 0.2126 + px[..., 1] * 0.7152 + px[..., 2] * 0.0722
    row, col = np.unravel_index(np.argmax(lum), lum.shape)
    u = (col + 0.5) / w
    v = (row + 0.5) / h
    azimuth = math.pi - 2 * math.pi * u
    elevation = (v - 0.5) * math.pi
    return azimuth, elevation


def world_hdri(name, strength=1.0, sun_azimuth_deg=None, rot_deg=0.0,
               saturation=1.0, tint=None, background=None):
    """Poly Haven sky. If sun_azimuth_deg is given, the HDRI is rotated so the
    sun comes from that world azimuth (0 = +X, 90 = +Y)."""
    sc = bpy.context.scene
    world = bpy.data.worlds.new("World")
    sc.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    img = bpy.data.images.load(f"{ASSETS}/hdri/{name}.hdr")
    rot = math.radians(rot_deg)
    if sun_azimuth_deg is not None:
        az, el = _hdri_sun_azimuth(img)
        rot = az - math.radians(sun_azimuth_deg)
        print(f"[hdri] {name}: sun elevation {math.degrees(el):.1f} deg")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Rotation"].default_value[2] = rot
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = img
    nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], env.inputs["Vector"])
    col = env.outputs["Color"]
    if saturation != 1.0 or tint:
        hsv = nt.nodes.new("ShaderNodeHueSaturation")
        hsv.inputs["Saturation"].default_value = saturation
        nt.links.new(col, hsv.inputs["Color"])
        col = hsv.outputs["Color"]
        if tint:
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = 1.0
            mix.inputs[7].default_value = (*tint, 1)
            nt.links.new(col, mix.inputs[6])
            col = mix.outputs[2]
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = strength
    nt.links.new(col, bg.inputs["Color"])
    out = nt.nodes.new("ShaderNodeOutputWorld")
    if background is None:
        nt.links.new(bg.outputs[0], out.inputs["Surface"])
    else:
        # Different colour for camera rays (e.g. plain studio backdrop)
        lp = nt.nodes.new("ShaderNodeLightPath")
        bg2 = nt.nodes.new("ShaderNodeBackground")
        bg2.inputs["Color"].default_value = (*background[0], 1)
        bg2.inputs["Strength"].default_value = background[1]
        mx = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(lp.outputs["Is Camera Ray"], mx.inputs[0])
        nt.links.new(bg.outputs[0], mx.inputs[1])
        nt.links.new(bg2.outputs[0], mx.inputs[2])
        nt.links.new(mx.outputs[0], out.inputs["Surface"])
    return world


def world_color(color, strength=1.0):
    sc = bpy.context.scene
    world = bpy.data.worlds.new("World")
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*color, 1)
    bg.inputs["Strength"].default_value = strength
    return world


# ---------------------------------------------------------------- camera


def camera(loc, target, lens=35, two_point=True, shift_x=0.0, shift_y=0.0,
           dof_distance=None, fstop=8.0, sensor=36, clip_end=2000):
    cam = bpy.data.cameras.new("Camera")
    cam.lens = lens
    cam.sensor_width = sensor
    cam.clip_end = clip_end
    cam.clip_start = 0.05
    cam.shift_x = shift_x
    cam.shift_y = shift_y
    obj = bpy.data.objects.new("Camera", cam)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = Vector(loc)
    d = Vector(target) - Vector(loc)
    if two_point:
        yaw = math.atan2(d.y, d.x) - math.pi / 2
        obj.rotation_euler = (math.pi / 2, 0, yaw)
    else:
        obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    if dof_distance:
        cam.dof.use_dof = True
        cam.dof.focus_distance = dof_distance
        cam.dof.aperture_fstop = fstop
    bpy.context.scene.camera = obj
    return obj


# ---------------------------------------------------------------- materials


def _img(path, colorspace="sRGB"):
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = colorspace
    return img


def _tex_file(tex, kind):
    for ext in ("jpg", "png"):
        p = f"{ASSETS}/tex/{tex}/{tex}_{kind}.{ext}"
        if os.path.exists(p):
            return p
    return None


_MEANS = {}


def _img_mean(img):
    """Mean linear luminance of an sRGB image (cached)."""
    if img.name in _MEANS:
        return _MEANS[img.name]
    import numpy as np
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(-1, 4)[::7, :3]
    lin = np.where(px <= 0.04045, px / 12.92, ((px + 0.055) / 1.055) ** 2.4)
    m = float((lin * np.array([0.2126, 0.7152, 0.0722])).sum(axis=1).mean())
    _MEANS[img.name] = max(m, 1e-4)
    return _MEANS[img.name]


def mat_pbr(name, tex, scale=1.0, tint=None, tint_mix=1.0, roughness=None,
            rough_mult=1.0, normal=0.6, coords="WORLD", rotate_deg=0.0,
            projection="BOX", blend=0.25, specular=0.5, hue_sat=None,
            brightness=1.0, albedo=None, contrast=1.0, gain=None, edge=0.0):
    """Image based PBR material from a Poly Haven texture folder.

    albedo=(r,g,b): use only the texture's luminance variation around a target
    linear colour. gain=x: keep the texture's colour but rescale it so the mean
    linear luminance becomes x."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    bsdf = N["Principled BSDF"]
    bsdf.inputs["Specular IOR Level"].default_value = specular
    if coords == "WORLD":
        geo = N.new("ShaderNodeNewGeometry")
        vec = geo.outputs["Position"]
    elif coords == "UV":
        tc = N.new("ShaderNodeTexCoord")
        vec = tc.outputs["UV"]
        projection = "FLAT"
    else:
        tc = N.new("ShaderNodeTexCoord")
        vec = tc.outputs["Object"]
    mp = N.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (scale, scale, scale)
    mp.inputs["Rotation"].default_value[2] = math.radians(rotate_deg)
    L.new(vec, mp.inputs["Vector"])

    def image(kind, cs):
        p = _tex_file(tex, kind)
        if not p:
            return None
        t = N.new("ShaderNodeTexImage")
        t.image = _img(p, cs)
        t.projection = projection
        t.projection_blend = blend
        L.new(mp.outputs["Vector"], t.inputs["Vector"])
        return t

    diff = image("Diffuse", "sRGB")
    col = diff.outputs["Color"]
    if albedo or gain:
        mean = _img_mean(diff.image)
        bw = N.new("ShaderNodeRGBToBW")
        L.new(col, bw.inputs["Color"])
        dv = N.new("ShaderNodeMath")
        dv.operation = "DIVIDE"
        dv.inputs[1].default_value = mean
        L.new(bw.outputs[0], dv.inputs[0])
        pw = N.new("ShaderNodeMath")
        pw.operation = "POWER"
        pw.inputs[1].default_value = contrast
        L.new(dv.outputs[0], pw.inputs[0])
        mx = N.new("ShaderNodeMix")
        mx.data_type = "RGBA"
        mx.blend_type = "MULTIPLY"
        mx.inputs["Factor"].default_value = 1.0
        if albedo:
            mx.inputs[6].default_value = (*albedo, 1)
            L.new(pw.outputs[0], mx.inputs[7])
        else:
            sc_ = N.new("ShaderNodeMath")
            sc_.operation = "DIVIDE"
            sc_.inputs[0].default_value = gain
            sc_.inputs[1].default_value = mean
            cmb = N.new("ShaderNodeCombineColor")
            for i in range(3):
                L.new(sc_.outputs[0], cmb.inputs[i])
            L.new(col, mx.inputs[6])
            L.new(cmb.outputs[0], mx.inputs[7])
        col = mx.outputs[2]
    if hue_sat:
        hs = N.new("ShaderNodeHueSaturation")
        hs.inputs["Hue"].default_value = hue_sat[0]
        hs.inputs["Saturation"].default_value = hue_sat[1]
        hs.inputs["Value"].default_value = hue_sat[2]
        L.new(col, hs.inputs["Color"])
        col = hs.outputs["Color"]
    if tint:
        mx = N.new("ShaderNodeMix")
        mx.data_type = "RGBA"
        mx.blend_type = "MULTIPLY"
        mx.inputs["Factor"].default_value = tint_mix
        mx.inputs[7].default_value = (*tint, 1)
        L.new(col, mx.inputs[6])
        col = mx.outputs[2]
    if brightness != 1.0:
        bc = N.new("ShaderNodeBrightContrast")
        bc.inputs["Bright"].default_value = brightness - 1.0
        L.new(col, bc.inputs["Color"])
        col = bc.outputs["Color"]
    L.new(col, bsdf.inputs["Base Color"])

    if roughness is not None:
        bsdf.inputs["Roughness"].default_value = roughness
    else:
        r = image("Rough", "Non-Color")
        if r:
            mul = N.new("ShaderNodeMath")
            mul.operation = "MULTIPLY"
            mul.use_clamp = True
            mul.inputs[1].default_value = rough_mult
            L.new(r.outputs["Color"], mul.inputs[0])
            L.new(mul.outputs[0], bsdf.inputs["Roughness"])
    nrm = image("nor_gl", "Non-Color")
    nout = None
    if nrm and normal > 0:
        nm = N.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = normal
        L.new(nrm.outputs["Color"], nm.inputs["Color"])
        nout = nm.outputs["Normal"]
    if edge > 0:
        bv = N.new("ShaderNodeBevel")
        bv.samples = 6
        bv.inputs["Radius"].default_value = edge
        if nout:
            L.new(nout, bv.inputs["Normal"])
        nout = bv.outputs["Normal"]
    if nout:
        L.new(nout, bsdf.inputs["Normal"])
    return m


def mat_basic(name, color, roughness=0.5, metallic=0.0, specular=0.5,
              coat=0.0, sheen=0.0, emission=None, emission_strength=0.0,
              subsurface=0.0, alpha=1.0, noise_bump=0.0, noise_scale=40.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = roughness
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Specular IOR Level"].default_value = specular
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Sheen Weight"].default_value = sheen
    b.inputs["Subsurface Weight"].default_value = subsurface
    b.inputs["Alpha"].default_value = alpha
    if emission:
        b.inputs["Emission Color"].default_value = (*emission, 1)
        b.inputs["Emission Strength"].default_value = emission_strength
    if noise_bump > 0:
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = noise_scale
        nz.inputs["Detail"].default_value = 8
        bp = nt.nodes.new("ShaderNodeBump")
        bp.inputs["Strength"].default_value = noise_bump
        bp.inputs["Distance"].default_value = 0.002
        nt.links.new(nz.outputs["Fac"], bp.inputs["Height"])
        nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
    return m


def mat_glass(name="Glass", tint=(0.86, 0.92, 0.92), reflect=1.0, ior=1.52):
    """Thin architectural glass: fresnel mix of a mirror and a transparent pass."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    N.clear()
    out = N.new("ShaderNodeOutputMaterial")
    fr = N.new("ShaderNodeFresnel")
    fr.inputs["IOR"].default_value = ior
    gl = N.new("ShaderNodeBsdfGlossy")
    gl.inputs["Roughness"].default_value = 0.0
    gl.inputs["Color"].default_value = (reflect, reflect, reflect, 1)
    tr = N.new("ShaderNodeBsdfTransparent")
    tr.inputs["Color"].default_value = (*tint, 1)
    mx = N.new("ShaderNodeMixShader")
    L.new(fr.outputs[0], mx.inputs[0])
    L.new(tr.outputs[0], mx.inputs[1])
    L.new(gl.outputs[0], mx.inputs[2])
    L.new(mx.outputs[0], out.inputs["Surface"])
    m.blend_method = "HASHED" if hasattr(m, "blend_method") else None
    return m


def mat_emission(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*color, 1)
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return m


def mat_fabric(name, color, scale=900.0, bump=0.35, sheen=0.6, roughness=0.95):
    """Boucle / heavy woven fabric: loop bumps from voronoi + noise."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    b = N["Principled BSDF"]
    b.inputs["Roughness"].default_value = roughness
    b.inputs["Sheen Weight"].default_value = sheen
    b.inputs["Sheen Roughness"].default_value = 0.6
    b.inputs["Specular IOR Level"].default_value = 0.2
    tc = N.new("ShaderNodeTexCoord")
    vor = N.new("ShaderNodeTexVoronoi")
    vor.feature = "F1"
    vor.inputs["Scale"].default_value = scale
    L.new(tc.outputs["Object"], vor.inputs["Vector"])
    nz = N.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = scale * 0.35
    nz.inputs["Detail"].default_value = 6
    L.new(tc.outputs["Object"], nz.inputs["Vector"])
    inv = N.new("ShaderNodeMath")
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    L.new(vor.outputs["Distance"], inv.inputs[1])
    add = N.new("ShaderNodeMath")
    add.operation = "MULTIPLY_ADD"
    add.inputs[1].default_value = 0.5
    L.new(nz.outputs["Fac"], add.inputs[0])
    L.new(inv.outputs[0], add.inputs[2])
    bp = N.new("ShaderNodeBump")
    bp.inputs["Strength"].default_value = bump
    bp.inputs["Distance"].default_value = 0.003
    L.new(add.outputs[0], bp.inputs["Height"])
    L.new(bp.outputs["Normal"], b.inputs["Normal"])
    # subtle tonal variation
    ramp = N.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*[c * 0.86 for c in color], 1)
    ramp.color_ramp.elements[1].color = (*color, 1)
    L.new(add.outputs[0], ramp.inputs["Fac"])
    L.new(ramp.outputs["Color"], b.inputs["Base Color"])
    return m


def mat_psb(name="PSB", cement=(0.50, 0.49, 0.465), bead=(0.88, 0.875, 0.85),
            bead_scale=210.0, coverage=0.36, bump=0.25, dirt=0.0, per_object=0.0):
    """Polystyrene concrete: cement matrix with expanded polystyrene beads.
    Works in object space, so objects should be modelled at real scale (m)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    b = N["Principled BSDF"]
    b.inputs["Specular IOR Level"].default_value = 0.35
    tc = N.new("ShaderNodeTexCoord")
    src = tc.outputs["Object"]

    def beads(scale, rad_lo, rad_hi, seed_offset):
        mp = N.new("ShaderNodeMapping")
        mp.inputs["Location"].default_value = (seed_offset, seed_offset * 1.7, seed_offset * 0.3)
        L.new(src, mp.inputs["Vector"])
        v = N.new("ShaderNodeTexVoronoi")
        v.feature = "F1"
        v.inputs["Scale"].default_value = scale
        v.inputs["Randomness"].default_value = 0.72  # keeps neighbours apart: round beads
        L.new(mp.outputs["Vector"], v.inputs["Vector"])
        # radius per cell from the cell's random colour
        sep = N.new("ShaderNodeSeparateColor")
        L.new(v.outputs["Color"], sep.inputs["Color"])
        rr = N.new("ShaderNodeMapRange")
        rr.inputs["To Min"].default_value = rad_lo
        rr.inputs["To Max"].default_value = rad_hi
        L.new(sep.outputs["Red"], rr.inputs["Value"])
        # mask = smoothstep(radius, radius - 0.05, distance)
        sub = N.new("ShaderNodeMath")
        sub.operation = "SUBTRACT"
        L.new(rr.outputs["Result"], sub.inputs[0])
        L.new(v.outputs["Distance"], sub.inputs[1])
        mask = N.new("ShaderNodeMapRange")
        mask.inputs["From Min"].default_value = 0.0
        mask.inputs["From Max"].default_value = 0.06
        mask.interpolation_type = "SMOOTHSTEP"
        L.new(sub.outputs[0], mask.inputs["Value"])
        # dome profile for the bump
        dome = N.new("ShaderNodeMath")
        dome.operation = "DIVIDE"
        L.new(sub.outputs[0], dome.inputs[0])
        L.new(rr.outputs["Result"], dome.inputs[1])
        dc = N.new("ShaderNodeMath")
        dc.operation = "MAXIMUM"
        dc.inputs[1].default_value = 0.0
        L.new(dome.outputs[0], dc.inputs[0])
        return mask.outputs["Result"], dc.outputs[0]

    k = coverage
    m1, d1 = beads(bead_scale, 0.14 + k * 0.2, 0.22 + k * 0.32, 0.0)
    m2, d2 = beads(bead_scale * 1.7, 0.12 + k * 0.18, 0.2 + k * 0.28, 13.3)
    mask = N.new("ShaderNodeMath")
    mask.operation = "MAXIMUM"
    L.new(m1, mask.inputs[0])
    L.new(m2, mask.inputs[1])
    dome = N.new("ShaderNodeMath")
    dome.operation = "MAXIMUM"
    L.new(d1, dome.inputs[0])
    L.new(d2, dome.inputs[1])

    # cement matrix colour variation
    nz = N.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 9.0
    nz.inputs["Detail"].default_value = 10
    nz.inputs["Roughness"].default_value = 0.6
    L.new(src, nz.inputs["Vector"])
    cr = N.new("ShaderNodeValToRGB")
    cr.color_ramp.elements[0].position = 0.3
    cr.color_ramp.elements[0].color = (*[c * 0.86 for c in cement], 1)
    cr.color_ramp.elements[1].position = 0.75
    cr.color_ramp.elements[1].color = (*[min(1, c * 1.08) for c in cement], 1)
    L.new(nz.outputs["Fac"], cr.inputs["Fac"])
    # fine grit
    grit = N.new("ShaderNodeTexNoise")
    grit.inputs["Scale"].default_value = 900.0
    grit.inputs["Detail"].default_value = 2
    L.new(src, grit.inputs["Vector"])
    gr = N.new("ShaderNodeMix")
    gr.data_type = "RGBA"
    gr.blend_type = "OVERLAY"
    gr.inputs["Factor"].default_value = 0.35
    L.new(cr.outputs["Color"], gr.inputs[6])
    L.new(grit.outputs["Color"], gr.inputs[7])

    # bead colour with slight variation
    bead_mix = N.new("ShaderNodeMix")
    bead_mix.data_type = "RGBA"
    L.new(mask.outputs[0], bead_mix.inputs["Factor"])
    L.new(gr.outputs[2], bead_mix.inputs[6])
    bead_mix.inputs[7].default_value = (*bead, 1)
    col = bead_mix.outputs[2]
    if dirt > 0:
        dn = N.new("ShaderNodeTexNoise")
        dn.inputs["Scale"].default_value = 3.0
        dn.inputs["Detail"].default_value = 6
        L.new(src, dn.inputs["Vector"])
        dm = N.new("ShaderNodeMix")
        dm.data_type = "RGBA"
        dm.blend_type = "MULTIPLY"
        dm.inputs["Factor"].default_value = dirt
        L.new(col, dm.inputs[6])
        L.new(dn.outputs["Color"], dm.inputs[7])
        col = dm.outputs[2]
    if per_object > 0:
        # every block in a wall is a slightly different batch
        oi = N.new("ShaderNodeObjectInfo")
        vr = N.new("ShaderNodeMapRange")
        vr.inputs["To Min"].default_value = 1 - per_object
        vr.inputs["To Max"].default_value = 1 + per_object
        L.new(oi.outputs["Random"], vr.inputs["Value"])
        cm = N.new("ShaderNodeCombineColor")
        for i in range(3):
            L.new(vr.outputs["Result"], cm.inputs[i])
        pm = N.new("ShaderNodeMix")
        pm.data_type = "RGBA"
        pm.blend_type = "MULTIPLY"
        pm.inputs["Factor"].default_value = 1.0
        L.new(col, pm.inputs[6])
        L.new(cm.outputs["Color"], pm.inputs[7])
        col = pm.outputs[2]
    L.new(col, b.inputs["Base Color"])

    rough = N.new("ShaderNodeMapRange")
    rough.inputs["To Min"].default_value = 0.92
    rough.inputs["To Max"].default_value = 0.62
    L.new(mask.outputs[0], rough.inputs["Value"])
    L.new(rough.outputs["Result"], b.inputs["Roughness"])

    # height: beads sit slightly proud with a dome, matrix has grit
    h = N.new("ShaderNodeMath")
    h.operation = "MULTIPLY_ADD"
    h.inputs[1].default_value = 0.7
    L.new(dome.outputs[0], h.inputs[0])
    L.new(grit.outputs["Fac"], h.inputs[2])
    bp = N.new("ShaderNodeBump")
    bp.inputs["Strength"].default_value = bump
    bp.inputs["Distance"].default_value = 0.0015
    L.new(h.outputs[0], bp.inputs["Height"])
    L.new(bp.outputs["Normal"], b.inputs["Normal"])
    return m


# ---------------------------------------------------------------- geometry


def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def collection(name, parent=None, hidden=False):
    c = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(c)
    if hidden:
        c.hide_render = True
        c.hide_viewport = True
    return c


def box(name, x0, y0, z0, x1, y1, z1, mat=None, bevel=0.0, coll=None, segments=2):
    """Axis aligned box between two corners (metres)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = x0 + (v.co.x + 0.5) * (x1 - x0)
        v.co.y = y0 + (v.co.y + 0.5) * (y1 - y0)
        v.co.z = z0 + (v.co.z + 0.5) * (z1 - z0)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    link(ob, coll)
    if mat:
        me.materials.append(mat)
    if bevel > 0:
        md = ob.modifiers.new("Bevel", "BEVEL")
        md.width = bevel
        md.segments = segments
        md.limit_method = "ANGLE"
        md.harden_normals = False
    return ob


def mesh_from(name, verts, faces, mat=None, coll=None, smooth=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    if smooth:
        me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    link(ob, coll)
    if mat:
        me.materials.append(mat)
    return ob


def plane(name, x0, y0, x1, y1, z=0.0, mat=None, coll=None, subdiv=0):
    ob = mesh_from(name, [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)],
                   [(0, 1, 2, 3)], mat, coll)
    if subdiv:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=subdiv, use_grid_fill=True)
        bm.to_mesh(ob.data)
        bm.free()
    return ob


def vplane(name, p0, p1, z0, z1, mat=None, coll=None):
    """Vertical quad from p0 to p1 (xy) between z0 and z1."""
    return mesh_from(name, [(p0[0], p0[1], z0), (p1[0], p1[1], z0),
                            (p1[0], p1[1], z1), (p0[0], p0[1], z1)],
                     [(0, 1, 2, 3)], mat, coll)


def apply_boolean(target, cutters, op="DIFFERENCE"):
    """Join cutters into one mesh and subtract it from target."""
    if not cutters:
        return
    ctx = bpy.context
    for o in ctx.selected_objects:
        o.select_set(False)
    for c in cutters:
        c.select_set(True)
    ctx.view_layer.objects.active = cutters[0]
    if len(cutters) > 1:
        bpy.ops.object.join()
    cutter = ctx.view_layer.objects.active
    md = target.modifiers.new("Cut", "BOOLEAN")
    md.operation = op
    md.solver = "EXACT"
    md.object = cutter
    # apply the boolean first in the stack (a pending bevel would break it)
    target.modifiers.move(len(target.modifiers) - 1, 0)
    ctx.view_layer.objects.active = target
    for o in ctx.selected_objects:
        o.select_set(False)
    target.select_set(True)
    bpy.ops.object.modifier_apply(modifier=md.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def set_smooth(ob):
    for p in ob.data.polygons:
        p.use_smooth = True


# ---------------------------------------------------------------- windows

FRAME = 0.06  # frame profile, metres


def window(name, axis, at, u0, u1, z0, z1, depth, mats, mullions=0,
           transom=None, coll=None, reveal=0.12, outward=-1):
    """Frame + glass inside an opening.

    axis 'x': wall runs along X, its outer face is at y=at; outward = -1 if the
    outside is toward -Y. axis 'y': wall runs along Y, outer face at x=at.
    `depth` is the wall thickness; glass sits `reveal` behind the outer face.
    """
    frame_m, glass_m = mats
    f = FRAME
    s = -outward  # direction going into the wall
    g = at + s * reveal
    t0, t1 = sorted((g - 0.035, g + 0.035))
    parts = []

    def piece(a0, a1, b0, b1):
        if axis == "x":
            parts.append(box(f"{name}_f", a0, t0, b0, a1, t1, b1, frame_m, coll=coll))
        else:
            parts.append(box(f"{name}_f", t0, a0, b0, t1, a1, b1, frame_m, coll=coll))

    piece(u0, u1, z0, z0 + f)
    piece(u0, u1, z1 - f, z1)
    piece(u0, u0 + f, z0, z1)
    piece(u1 - f, u1, z0, z1)
    n = mullions + 1
    for i in range(1, n):
        u = u0 + (u1 - u0) * i / n
        piece(u - f * 0.5, u + f * 0.5, z0, z1)
    if transom:
        piece(u0, u1, transom - f * 0.5, transom + f * 0.5)
    if axis == "x":
        gl = vplane(f"{name}_g", (u0, g), (u1, g), z0, z1, glass_m, coll)
    else:
        gl = vplane(f"{name}_g", (g, u0), (g, u1), z0, z1, glass_m, coll)
    gl.visible_shadow = True
    return parts + [gl]


# ---------------------------------------------------------------- assets


def load_asset(name, coll_name=None, hide=True):
    """Append every object from a Poly Haven .blend into a hidden collection
    and return the list of objects (usable as instancing sources)."""
    path = f"{ASSETS}/models/{name}/{name}.blend"
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.objects = list(src.objects)
    coll = collection(coll_name or f"LIB_{name}", hidden=hide)
    objs = []
    for ob in dst.objects:
        if ob is None:
            continue
        if ob.type not in ("MESH", "CURVES", "EMPTY"):
            continue
        coll.objects.link(ob)
        objs.append(ob)
    # make texture paths absolute
    for img in bpy.data.images:
        if img.filepath.startswith("//"):
            img.filepath = os.path.join(os.path.dirname(path), img.filepath[2:])
    roots = [o for o in objs if o.parent is None]
    for o in roots:
        o.location = (0, 0, 0)
    return roots, coll


def instance_of(src_coll, name, loc, rot_z=0.0, scale=1.0, coll=None):
    e = bpy.data.objects.new(name, None)
    e.instance_type = "COLLECTION"
    e.instance_collection = src_coll
    e.location = loc
    e.rotation_euler = (0, 0, rot_z)
    e.scale = (scale, scale, scale)
    link(e, coll)
    return e


def asset_variants(name):
    """Split a multi-variant asset into one hidden collection per root object."""
    roots, base = load_asset(name)
    out = []
    for i, r in enumerate(roots):
        c = collection(f"LIB_{name}_{i}", hidden=True)
        stack = [r]
        while stack:
            o = stack.pop()
            for uc in list(o.users_collection):
                uc.objects.unlink(o)
            c.objects.link(o)
            stack.extend(o.children)
        out.append(c)
    return out


def bounds(ob):
    pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def coll_height(c):
    hs = []
    for o in c.all_objects:
        if o.type == "MESH":
            lo, hi = bounds(o)
            hs.append(hi.z)
    return max(hs) if hs else 1.0


# ---------------------------------------------------------------- landscape


def lawn(name, obj, density=900, length=0.08, coll=None, colors=None, seed=1,
         vertex_group=None):
    """Short manicured lawn using Cycles hair curves on `obj` (a plane)."""
    ps_mod = obj.modifiers.new(name, "PARTICLE_SYSTEM")
    ps = ps_mod.particle_system
    s = ps.settings
    s.type = "HAIR"
    area = sum(p.area for p in obj.data.polygons)
    if vertex_group:
        # density weights only redistribute particles, so scale the count by
        # the weighted area to keep the requested density where weight = 1
        vg = obj.vertex_groups[vertex_group]
        wts = {}
        for v in obj.data.vertices:
            for g in v.groups:
                if g.group == vg.index:
                    wts[v.index] = g.weight
        area = sum(p.area * sum(wts.get(i, 0.0) for i in p.vertices) / len(p.vertices)
                   for p in obj.data.polygons)
    s.count = int(area * density)
    print(f"[lawn] {name}: {s.count} strands x children")
    s.use_advanced_hair = True
    s.emit_from = "FACE"
    s.distribution = "RAND"
    s.use_rotations = True
    s.normal_factor = length
    s.factor_random = length * 0.35
    s.tangent_factor = 0.0
    s.brownian_factor = 0.0
    s.length_random = 0.6
    s.root_radius = 1.0
    s.tip_radius = 0.0
    s.radius_scale = 0.0035
    s.display_step = 2
    s.render_step = 3
    s.child_type = "SIMPLE"
    s.child_radius = 0.03
    s.child_percent = 1
    s.rendered_child_count = 5
    s.child_length = 1.0
    s.child_length_threshold = 0.1
    s.clump_factor = 0.15
    s.roughness_1 = 0.02
    s.roughness_1_size = 1.0
    s.roughness_endpoint = 0.015
    s.roughness_end_shape = 1.0
    s.kink = "CURL"
    s.kink_amplitude = 0.004
    s.kink_frequency = 2.0
    ps.seed = seed
    if vertex_group:
        ps.vertex_group_density = vertex_group
    # material
    m = bpy.data.materials.new(name + "_mat")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    hi = nt.nodes.new("ShaderNodeHairInfo")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    cols = colors or [(0.0, (0.055, 0.085, 0.022)), (0.45, (0.10, 0.15, 0.035)),
                      (0.8, (0.16, 0.20, 0.05)), (1.0, (0.23, 0.22, 0.09))]
    ramp.color_ramp.elements[0].position = cols[0][0]
    ramp.color_ramp.elements[0].color = (*cols[0][1], 1)
    ramp.color_ramp.elements[1].position = cols[-1][0]
    ramp.color_ramp.elements[1].color = (*cols[-1][1], 1)
    for p, c in cols[1:-1]:
        e = ramp.color_ramp.elements.new(p)
        e.color = (*c, 1)
    nt.links.new(hi.outputs["Random"], ramp.inputs["Fac"])
    # darker roots
    root = nt.nodes.new("ShaderNodeMix")
    root.data_type = "RGBA"
    root.blend_type = "MULTIPLY"
    rr = nt.nodes.new("ShaderNodeMapRange")
    rr.inputs["From Max"].default_value = 0.7
    rr.inputs["To Min"].default_value = 0.35
    rr.inputs["To Max"].default_value = 1.0
    nt.links.new(hi.outputs["Intercept"], rr.inputs["Value"])
    comb = nt.nodes.new("ShaderNodeCombineColor")
    for i in range(3):
        nt.links.new(rr.outputs["Result"], comb.inputs[i])
    root.inputs["Factor"].default_value = 1.0
    nt.links.new(ramp.outputs["Color"], root.inputs[6])
    nt.links.new(comb.outputs["Color"], root.inputs[7])
    nt.links.new(root.outputs[2], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.55
    b.inputs["Specular IOR Level"].default_value = 0.3
    b.inputs["Subsurface Weight"].default_value = 0.0
    b.inputs["Transmission Weight"].default_value = 0.0
    try:
        b.inputs["Diffuse Roughness"].default_value = 0.5
    except KeyError:
        pass
    obj.data.materials.append(m)
    s.material_slot = m.name
    return ps


def scatter(name, surface, variants, count, scale=(0.8, 1.2), seed=1,
            density_vgroup=None, coll_out=None, align=False):
    """Scatter collection instances on a surface using a hair particle system
    rendered as collection instances."""
    src = collection(f"SRC_{name}", hidden=True)
    for v in variants:
        src.children.link(v) if v.name not in src.children else None
    ps_mod = surface.modifiers.new(name, "PARTICLE_SYSTEM")
    ps = ps_mod.particle_system
    s = ps.settings
    s.type = "HAIR"
    s.count = count
    s.hair_length = 1.0
    s.use_advanced_hair = True
    s.emit_from = "FACE"
    s.distribution = "RAND"
    s.render_type = "COLLECTION"
    s.instance_collection = src
    s.use_collection_pick_random = True
    s.particle_size = 1.0
    s.size_random = 1.0 - scale[0] / scale[1]
    s.particle_size = scale[1]
    s.use_rotations = True
    s.rotation_mode = "GLOB_Z" if not align else "NOR"
    s.phase_factor_random = 2.0
    s.use_rotation_instance = True
    ps.seed = seed
    if density_vgroup:
        ps.vertex_group_density = density_vgroup
    return ps


# ---------------------------------------------------------------- compositing


def composite(glare=0.0, vignette=0.12, warm=0.0, mist=None, grain=0.0,
              lift=0.0, saturation=1.0):
    """Gentle photographic finishing: soft bloom, aerial haze, vignette, warmth."""
    sc = bpy.context.scene
    sc.use_nodes = True
    nt = sc.node_tree
    N, L = nt.nodes, nt.links
    N.clear()
    rl = N.new("CompositorNodeRLayers")
    comp = N.new("CompositorNodeComposite")
    cur = rl.outputs["Image"]

    if mist:
        # mist = (start, depth, color(rgb), amount)
        vl = bpy.context.view_layer
        vl.use_pass_mist = True
        sc.world.mist_settings.start = mist[0]
        sc.world.mist_settings.depth = mist[1]
        sc.world.mist_settings.falloff = "QUADRATIC"
        mul = N.new("CompositorNodeMath")
        mul.operation = "MULTIPLY"
        mul.inputs[1].default_value = mist[3]
        L.new(rl.outputs["Mist"], mul.inputs[0])
        mx = N.new("CompositorNodeMixRGB")
        mx.blend_type = "SCREEN"
        L.new(mul.outputs[0], mx.inputs[0])
        L.new(cur, mx.inputs[1])
        mx.inputs[2].default_value = (*mist[2], 1)
        cur = mx.outputs[0]

    if glare > 0:
        g = N.new("CompositorNodeGlare")
        g.glare_type = "FOG_GLOW"
        g.quality = "HIGH"
        g.mix = -1 + glare  # -1 = only image
        g.threshold = 0.85
        g.size = 8
        L.new(cur, g.inputs["Image"])
        cur = g.outputs["Image"]

    if warm or lift or saturation != 1.0:
        cb = N.new("CompositorNodeColorBalance")
        cb.correction_method = "LIFT_GAMMA_GAIN"
        cb.lift = (1 + lift + warm * 0.2, 1 + lift, 1 + lift - warm * 0.4)
        cb.gain = (1 + warm * 0.25, 1 + warm * 0.05, 1 - warm * 0.2)
        L.new(cur, cb.inputs["Image"])
        cur = cb.outputs["Image"]
        if saturation != 1.0:
            hs = N.new("CompositorNodeHueSat")
            hs.inputs["Saturation"].default_value = saturation
            L.new(cur, hs.inputs["Image"])
            cur = hs.outputs["Image"]

    if vignette > 0:
        em = N.new("CompositorNodeEllipseMask")
        em.width = 0.95
        em.height = 0.9
        bl = N.new("CompositorNodeBlur")
        bl.filter_type = "GAUSS"
        bl.use_relative = True
        bl.factor_x = 40
        bl.factor_y = 40
        bl.size_x = 400
        bl.size_y = 400
        L.new(em.outputs["Mask"], bl.inputs["Image"])
        mr = N.new("CompositorNodeMapRange")
        mr.inputs["To Min"].default_value = 1 - vignette
        mr.inputs["To Max"].default_value = 1.0
        L.new(bl.outputs["Image"], mr.inputs["Value"])
        mx = N.new("CompositorNodeMixRGB")
        mx.blend_type = "MULTIPLY"
        mx.inputs[0].default_value = 1.0
        L.new(cur, mx.inputs[1])
        L.new(mr.outputs[0], mx.inputs[2])
        cur = mx.outputs[0]

    L.new(cur, comp.inputs["Image"])
    return nt


def depth_output(path, near, far):
    """Write a normalised depth map (white = near) next to the beauty render."""
    sc = bpy.context.scene
    vl = bpy.context.view_layer
    vl.use_pass_z = True
    nt = sc.node_tree
    N, L = nt.nodes, nt.links
    rl = [n for n in N if n.type == "R_LAYERS"][0]
    mr = N.new("CompositorNodeMapRange")
    mr.inputs["From Min"].default_value = near
    mr.inputs["From Max"].default_value = far
    mr.inputs["To Min"].default_value = 1.0
    mr.inputs["To Max"].default_value = 0.0
    mr.use_clamp = True
    L.new(rl.outputs["Depth"], mr.inputs["Value"])
    fo = N.new("CompositorNodeOutputFile")
    fo.base_path = os.path.dirname(path)
    fo.file_slots[0].path = os.path.basename(path).replace(".png", "_")
    fo.format.file_format = "PNG"
    fo.format.color_mode = "BW"
    fo.format.color_depth = "16"
    L.new(mr.outputs[0], fo.inputs[0])


# ---------------------------------------------------------------- architecture


def shell(name, x0, y0, z0, x1, y1, z1, t, mat, openings=(), coll=None,
          bevel=0.012, frame_mats=None, reveal=0.14):
    """Hollow wall volume (open top/bottom) with rectangular openings.

    openings: (side, u0, u1, zb, zt, mullions) where side is S/N/W/E and u is
    the world X (S/N) or world Y (W/E) range of the opening. Windows (frame +
    glass) are created in each opening when frame_mats=(frame, glass)."""
    outer = box(name, x0, y0, z0, x1, y1, z1, mat, 0.0, coll)
    # openings are cut from the solid first, then the interior is hollowed out
    # (the exact solver mishandles openings cut into an already hollow shell)
    cutters = []
    made = []
    for op in openings:
        side, u0, u1, zb, zt = op[:5]
        mull = op[5] if len(op) > 5 else 0
        kind = op[6] if len(op) > 6 else "window"
        # never leave a cutter face coplanar with the shell's top/bottom
        cb = z0 - 0.5 if zb <= z0 + 1e-3 else zb
        ct = z1 + 0.5 if zt >= z1 - 1e-3 else zt
        if side == "S":
            cutters.append(box("c", u0, y0 - 0.5, cb, u1, y0 + t + 0.5, ct))
            spec = ("x", y0, -1)
        elif side == "N":
            cutters.append(box("c", u0, y1 - t - 0.5, cb, u1, y1 + 0.5, ct))
            spec = ("x", y1, 1)
        elif side == "W":
            cutters.append(box("c", x0 - 0.5, u0, cb, x0 + t + 0.5, u1, ct))
            spec = ("y", x0, -1)
        else:
            cutters.append(box("c", x1 - t - 0.5, u0, cb, x1 + 0.5, u1, ct))
            spec = ("y", x1, 1)
        if frame_mats and kind == "window":
            made += window(f"{name}_w", spec[0], spec[1], u0, u1, zb, zt, t,
                           frame_mats, mullions=mull, coll=coll, reveal=reveal,
                           outward=spec[2])
    for c in cutters:  # one at a time: corner openings overlap each other
        apply_boolean(outer, [c])
    apply_boolean(outer, [box(name + "_in", x0 + t, y0 + t, z0 - 1, x1 - t, y1 - t, z1 + 1)])
    # no geometric bevel here: the bevel modifier tears boolean n-gons.
    # Materials use a render-time Bevel node (mat_pbr edge=) instead.
    return outer, made


def slats(name, axis, at, u0, u1, z0, z1, mat, w=0.045, d=0.04, gap=0.028,
          coll=None, outward=-1):
    """Vertical timber slats in front of a wall face (at = face coordinate)."""
    out = []
    u = u0
    i = 0
    while u + w <= u1 + 1e-6:
        if axis == "x":
            a, b = sorted((at, at + outward * d))
            out.append(box(f"{name}{i}", u, a, z0, u + w, b, z1, mat, coll=coll))
        else:
            a, b = sorted((at, at + outward * d))
            out.append(box(f"{name}{i}", a, u, z0, b, u + w, z1, mat, coll=coll))
        u += w + gap
        i += 1
    return join(out, name)


def join(objs, name=None):
    if not objs:
        return None
    ctx = bpy.context
    for o in ctx.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    ctx.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = ctx.view_layer.objects.active
    if name:
        ob.name = name
    ob.select_set(False)
    return ob


def area_light(name, loc, size, power, color=(1.0, 0.78, 0.55), rot=(0, 0, 0),
               shape="RECTANGLE", size_y=None, spread=180, coll=None):
    ld = bpy.data.lights.new(name, "AREA")
    ld.shape = shape
    ld.size = size
    ld.size_y = size_y or size
    ld.energy = power
    ld.color = color
    ld.spread = math.radians(spread)
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    ob.rotation_euler = rot
    link(ob, coll)
    return ob


def point_light(name, loc, power, color=(1.0, 0.75, 0.5), radius=0.05, coll=None):
    ld = bpy.data.lights.new(name, "POINT")
    ld.energy = power
    ld.color = color
    ld.shadow_soft_size = radius
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    link(ob, coll)
    return ob


def sun_light(name, azimuth_deg, elevation_deg, strength, color=(1, 0.85, 0.7), angle=1.0):
    ld = bpy.data.lights.new(name, "SUN")
    ld.energy = strength
    ld.color = color
    ld.angle = math.radians(angle)
    ob = bpy.data.objects.new(name, ld)
    az, el = math.radians(azimuth_deg), math.radians(elevation_deg)
    d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
    ob.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    link(ob)
    return ob


def rounded(name, x0, y0, z0, x1, y1, z1, mat, radius=0.08, segments=6, coll=None):
    """Soft upholstered block (bevelled box, smooth shaded)."""
    ob = box(name, x0, y0, z0, x1, y1, z1, mat, coll=coll)
    md = ob.modifiers.new("Bevel", "BEVEL")
    md.width = radius
    md.segments = segments
    md.limit_method = "NONE"
    md.profile = 0.5
    set_smooth(ob)
    sd = ob.modifiers.new("Sub", "SUBSURF")
    sd.levels = 1
    sd.render_levels = 2
    return ob


def cylinder(name, x, y, z0, z1, r, mat, verts=48, coll=None, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r,
                          depth=z1 - z0)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = (x, y, (z0 + z1) / 2)
    link(ob, coll)
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = len(p.vertices) == 4
    if bevel:
        md = ob.modifiers.new("Bevel", "BEVEL")
        md.width = bevel
        md.segments = 3
        md.limit_method = "ANGLE"
    return ob


def sphere(name, loc, r, mat, coll=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=r)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    link(ob, coll)
    me.materials.append(mat)
    return ob


def load_lod(name, lod="LOD1", group=False):
    """Append the `<name>_<lod>` collection of a Poly Haven asset and return a
    hidden collection per variant (object) for instancing. group=True keeps
    a multi-part asset (pot + plant + soil) together as a single variant."""
    path = f"{ASSETS}/models/{name}/{name}.blend"
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        names = [c for c in src.collections if c == f"{name}_{lod}"]
        if not names:
            names = [c for c in src.collections if c.endswith(lod)] or \
                    [c for c in src.collections if c == name]
        dst.collections = names[:1]
    src_coll = dst.collections[0]
    holder = collection(f"LIB_{name}_{lod}", hidden=True)
    holder.children.link(src_coll)
    if group:
        return [src_coll]
    out = []
    for o in sorted(list(src_coll.objects), key=lambda o: o.name):
        if o.type != "MESH" or o.parent is not None:
            continue
        o.location = (0, 0, 0)
        c = bpy.data.collections.new(f"V_{o.name}")
        holder.children.link(c)
        for uc in list(o.users_collection):
            uc.objects.unlink(o)
        c.objects.link(o)
        out.append(c)
    for img in bpy.data.images:
        if img.filepath.startswith("//"):
            img.filepath = os.path.join(os.path.dirname(path), img.filepath[2:])
    return out


def place(variants, pts, scale=(0.85, 1.15), coll=None, seed=3, rot=True):
    rnd = random.Random(seed)
    out = []
    for i, p in enumerate(pts):
        v = variants[rnd.randrange(len(variants))] if len(p) < 4 else variants[p[3]]
        s = rnd.uniform(*scale)
        out.append(instance_of(v, f"inst_{v.name}_{i}", (p[0], p[1], p[2] if len(p) > 2 else 0),
                               rnd.uniform(0, math.tau) if rot else 0, s, coll))
    return out


def poisson(n, x0, y0, x1, y1, min_d, seed=1, avoid=None, tries=4000):
    """Blue-noise points in a rectangle. avoid(x, y) -> True to reject."""
    rnd = random.Random(seed)
    pts = []
    t = 0
    while len(pts) < n and t < tries:
        t += 1
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if avoid and avoid(x, y):
            continue
        if all((x - a) ** 2 + (y - b) ** 2 >= min_d ** 2 for a, b in pts):
            pts.append((x, y))
    return pts


def arch_prism(name, cx, w, zb, zs, y0, y1, seg=40, mat=None, coll=None, axis="y"):
    """Closed prism with an arch profile (rectangle up to zs + semicircle),
    extruded between y0 and y1 (or x0..x1 when axis == 'x'). Used as an
    arch cutter or as an arch-shaped solid."""
    r = w / 2
    prof = [(cx - r, zb), (cx + r, zb), (cx + r, zs)]
    for i in range(1, seg):
        a = math.pi * i / seg
        prof.append((cx + r * math.cos(a), zs + r * math.sin(a)))
    prof.append((cx - r, zs))
    n = len(prof)
    if axis == "y":
        verts = [(u, y0, v) for u, v in prof] + [(u, y1, v) for u, v in prof]
    else:
        verts = [(y0, u, v) for u, v in prof] + [(y1, u, v) for u, v in prof]
    faces = [tuple(range(n))[::-1], tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, j + n, i + n))
    ob = mesh_from(name, verts, faces, mat, coll)
    # consistent outward normals
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def light_at(name, loc, target, size, power, color=(1.0, 0.95, 0.9), kind="AREA", coll=None):
    """Area light aimed at a target point."""
    ld = bpy.data.lights.new(name, kind)
    if kind == "AREA":
        ld.size = size
    else:
        ld.shadow_soft_size = size
    ld.energy = power
    ld.color = color
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    d = Vector(target) - Vector(loc)
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    link(ob, coll)
    return ob
