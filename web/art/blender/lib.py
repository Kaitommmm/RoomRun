"""Shared helpers for the street-prop scripts.

Run a prop script with:
  blender --background --factory-startup --python art/blender/<script>.py
Blender axes: X across, -Y = front (glTF +Z), Z up. 1 unit = 1 m.
Material names carry meaning for environment.js: sp_facade / sp_awning are
recoloured per house, sp_window is lit or dark per house, sp_flat_* parts get
no outline, and emissive materials become unlit glow.
"""
import bpy, bmesh, math, os
from mathutils import Vector

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'public', 'models')
P = math.pi


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    return sc


def hexcol(h):
    def ch(v):
        v = v / 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (ch((h >> 16) & 255), ch((h >> 8) & 255), ch(h & 255), 1)


def mat(name, h, glow=False):
    m = bpy.data.materials.get('sp_' + name)
    if m:
        return m
    m = bpy.data.materials.new('sp_' + name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = hexcol(h)
    b.inputs['Roughness'].default_value = 0.8
    if glow:
        b.inputs['Emission Color'].default_value = hexcol(h)
        b.inputs['Emission Strength'].default_value = 1.0
    m.diffuse_color = hexcol(h)
    return m


def coll(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def _obj(c, name, bm, m):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    c.objects.link(o)
    me.materials.append(m)
    return o


def box(c, name, size, loc, m, rot=(0, 0, 0), bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, affect='EDGES')
    o = _obj(c, name, bm, m)
    o.location = loc
    o.rotation_euler = rot
    return o


def cyl(c, name, r, depth, loc, m, verts=12, rot=(0, 0, 0), r2=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r if r2 is None else r2, depth=depth)
    o = _obj(c, name, bm, m)
    o.location = loc
    o.rotation_euler = rot
    return o


def sphere(c, name, r, loc, m, seg=8, rings=5, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    o = _obj(c, name, bm, m)
    o.location = loc
    o.scale = scale
    return o


def text(c, name, body, size, loc, m, rot=(P / 2, 0, 0), extrude=0.01, font='C:/Windows/Fonts/tahomabd.ttf'):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    cu.resolution_u = 2
    cu.font = bpy.data.fonts.load(font, check_existing=True)
    o = bpy.data.objects.new(name, cu)
    c.objects.link(o)
    cu.materials.append(m)
    o.location = loc
    o.rotation_euler = rot
    return o


def join(c, name):
    """Join a collection into one mesh object called `name`, origin at world 0."""
    vl = bpy.context.view_layer
    for o in vl.objects:
        o.select_set(False)
    objs = list(c.objects)
    for o in objs:
        o.select_set(True)
    vl.objects.active = objs[0]
    if any(o.type == 'FONT' for o in objs):
        bpy.ops.object.convert(target='MESH')
    if len(objs) > 1:
        bpy.ops.object.join()
    o = vl.objects.active
    o.name = name
    o.data.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def export(objs, filename):
    vl = bpy.context.view_layer
    for o in vl.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    vl.objects.active = objs[0]
    path = os.path.join(OUT, filename)
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, use_active_scene=True, export_format='GLB',
                              export_yup=True, export_apply=True)
    print('EXPORT', path, {o.name: tris(o) for o in objs})
    return path


def face(ball, block, hc, skin, brow, k=1.0, bone='Head'):
    """The kid's face set around head centre hc (head radii 0.165, 0.15, 0.15 at k=1), scaled by k.
    ball(c, r, m, bone, seg, rings) / block(c, s, m, bone, bevel, rot) are the caller's rigid-part builders.
    Ears and nose in `skin`, brows in `brow`; eyes, shine, cheeks and mouth are sp_flat_* (no outline)."""
    eye = mat('flat_eye', 0x24150f); shine = mat('flat_shine', 0xffffff); cheek = mat('flat_cheek', 0xff8f8f)
    mouth = mat('flat_mouth', 0x7a1e22)
    hc = Vector(hc)

    def at(x, y, z):
        return hc + Vector((x, y, z)) * k

    def sz(*r):
        return tuple(v * k for v in r)

    for s in (-1, 1):
        ball(at(s * 0.165, 0.005, -0.01), sz(0.035, 0.025, 0.045), skin, bone, 10, 8)  # ears
        ball(at(s * 0.06, -0.135, -0.01), sz(0.03, 0.02, 0.04), eye, bone, 12, 8)
        ball(at(s * 0.06 - 0.01, -0.152, 0.005), sz(0.011, 0.006, 0.012), shine, bone, 8, 6)
        block(at(s * 0.065, -0.142, 0.045), sz(0.06, 0.02, 0.014), brow, bone, rot=('Y', s * -0.25))
        ball(at(s * 0.105, -0.12, -0.045), sz(0.025, 0.012, 0.015), cheek, bone, 8, 6)
    ball(at(0, -0.15, -0.025), sz(0.012, 0.01, 0.01), skin, bone, 8, 6)  # nose
    ball(at(0, -0.137, -0.073), sz(0.04, 0.012, 0.018), mouth, bone, 12, 6)  # open grin


def stage(path, target=(0, 0, 1), az=-30, el=14, dist=8.0, lens=40, size=(1280, 720), kid=None, color='MATERIAL'):
    """Workbench render of the scene as it stands (place objects first). kid=(x, y) adds a 1.35 m reference post.
    color: workbench colour source, 'VERTEX' for meshes coloured by attribute."""
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light = 'STUDIO'
    sh.color_type = color
    sh.show_object_outline = True
    sh.object_outline_color = (0, 0, 0)
    sc.render.resolution_x, sc.render.resolution_y = size
    sc.world = bpy.data.worlds.new('w')
    sc.world.color = (0.12, 0.08, 0.22)
    if kid:
        cyl(coll('ref'), 'kid_ref', 0.22, 1.35, (kid[0], kid[1], 0.675), mat('kidref', 0x3a7bd5))
    tgt = Vector(target)
    a, e = math.radians(az), math.radians(el)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    cam.location = tgt + Vector((math.sin(a) * math.cos(e) * dist, -math.cos(a) * math.cos(e) * dist, math.sin(e) * dist))
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens
    sc.camera = cam
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('PREVIEW', path)
