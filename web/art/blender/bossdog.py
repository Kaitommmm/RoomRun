"""Low-poly cartoon boss dog on the existing Mesh2Motion rig -> public/models/bossdog_v2.glb.

Takes the skeleton and clips (Run/Bark/Bite/Howl/Idle/Sit) from public/models/bossdog.glb,
drops the TRELLIS mesh and builds a new body from simple parts. Head, ears, jaw and legs
are rigid (100% one bone, like the kid); torso and tail are lofts blended along their bone
chains, so the back bends smoothly and nothing hangs off the belly bone (the old spikes).
Rest pose: ground z 0, front -Y (glTF +Z), about 1.1 m nose to tail tip.
Material names matter in models.js: sp_coat / sp_tan are recoloured for the small dogs,
sp_flat_* parts get no outline. The game adds the glowing eyes (BOSS_EYES).

  blender --background --factory-startup --python art/blender/bossdog.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from mathutils import Matrix
from mathutils.geometry import intersect_point_line

SRC = os.path.join(OUT, 'bossdog.glb')
DST = os.path.join(OUT, 'bossdog_v2.glb')

reset()
bpy.ops.import_scene.gltf(filepath=SRC)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in list(bpy.data.objects):
    if o is not arm:
        bpy.data.objects.remove(o)
mw = arm.matrix_world


def seg(name):
    b = arm.data.bones[name]
    return mw @ b.head_local, mw @ b.tail_local


coat = mat('coat', 0x26222a); tan = mat('tan', 0xc8843c); nose = mat('nose', 0x0c0c0c)
scar = mat('flat_scar', 0xe08a8a); tooth = mat('tooth', 0xf4f0e0); mouth = mat('flat_mouth', 0x5a1418)
pad = mat('pad', 0x3a2a24)

parts = []  # (bmesh, material, bone name or list of bones to blend)


def add(bm, m, bone):
    parts.append((bm, m, bone))
    return bm


def tube(a, b, r1, r2=None, m=tan, bone='Hips', sides=10):
    a, b = Vector(a), Vector(b)
    bm = bmesh.new()
    d = b - a
    bmesh.ops.create_cone(bm, cap_ends=True, segments=sides, radius1=r1, radius2=r1 if r2 is None else r2, depth=d.length)
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation((a + b) / 2) @ rot, verts=bm.verts)
    return add(bm, m, bone)


def ball(c, r, m=coat, bone='Head', seg_=14, rings=10):
    """Ellipsoid at c with radii r = (rx, ry, rz)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg_, v_segments=rings, radius=1)
    for v in bm.verts:
        v.co = Vector((v.co.x * r[0] + c[0], v.co.y * r[1] + c[1], v.co.z * r[2] + c[2]))
    return add(bm, m, bone)


def loft(rings, m, bones, sides=14):
    """Closed tube through rings (centre, rx, rz); each ring stands across the path, x stays sideways."""
    bm = bmesh.new()
    loops = []
    for i, (c, rx, rz) in enumerate(rings):
        c = Vector(c)
        nxt = Vector(rings[min(i + 1, len(rings) - 1)][0]); prv = Vector(rings[max(i - 1, 0)][0])
        t = (nxt - prv).normalized()
        side = Vector((1, 0, 0))
        up = t.cross(side).normalized()
        if up.z < 0:
            up = -up
        loops.append([bm.verts.new(c + side * math.cos(a) * rx + up * math.sin(a) * rz)
                      for a in (2 * P * k / sides for k in range(sides))])
    for l0, l1 in zip(loops, loops[1:]):
        for k in range(sides):
            bm.faces.new((l0[k], l0[(k + 1) % sides], l1[(k + 1) % sides], l1[k]))
    for loop, flip in ((loops[0], True), (loops[-1], False)):  # end caps
        c = bm.verts.new(sum((v.co for v in loop), Vector()) / sides)
        for k in range(sides):
            f = (loop[(k + 1) % sides], loop[k], c) if flip else (loop[k], loop[(k + 1) % sides], c)
            bm.faces.new(f)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return add(bm, m, bones)


# ---- torso: chunky chest, slimmer waist, neck rising to the head (black-and-tan coat)
TORSO = ['Hips', 'Spine_1', 'Spine_2', 'Spine_2001', 'Spine_3', 'Spine_4']
loft([((0, 0.335, 0.435), 0.035, 0.04), ((0, 0.31, 0.43), 0.08, 0.085), ((0, 0.25, 0.43), 0.105, 0.11), ((0, 0.13, 0.43), 0.1, 0.095),
      ((0, 0.01, 0.42), 0.115, 0.115), ((0, -0.1, 0.4), 0.145, 0.16), ((0, -0.2, 0.4), 0.155, 0.17),
      ((0, -0.28, 0.43), 0.13, 0.145), ((0, -0.34, 0.48), 0.1, 0.11), ((0, -0.38, 0.52), 0.07, 0.08)],
     coat, TORSO)
ball((0, -0.32, 0.38), (0.105, 0.07, 0.12), tan, 'Spine_2001', 12, 8)  # tan chest bib
ball((0, -0.36, 0.45), (0.07, 0.05, 0.065), tan, 'Spine_3', 10, 8)  # tan throat

# ---- tail: thick at the base, curls a little up, tan tip
TAIL = ['Tail_Base', 'Tail_Mid001', 'Tail_End', 'Tail_Tip']
loft([((0, 0.26, 0.44), 0.04, 0.045), ((0, 0.35, 0.43), 0.04, 0.043), ((0, 0.44, 0.43), 0.033, 0.035),
      ((0, 0.5, 0.445), 0.025, 0.027), ((0, 0.545, 0.46), 0.012, 0.012)], coat, TAIL, 10)
ball((0, 0.53, 0.455), (0.022, 0.03, 0.022), tan, 'Tail_Tip', 8, 6)

# ---- head: big round skull (cartoon), long tan muzzle, big black nose, scar, torn left ear
ball((0, -0.45, 0.58), (0.14, 0.125, 0.125), coat, 'Head', 18, 12)
ball((0, -0.5, 0.545), (0.12, 0.08, 0.08), coat, 'Head', 14, 10)  # cheeks fill the jaw line
ball((0, -0.575, 0.535), (0.078, 0.095, 0.058), tan, 'Head', 14, 10)  # muzzle
ball((0, -0.668, 0.555), (0.036, 0.026, 0.028), nose, 'Head', 10, 8)
for s in (-1, 1):
    ball((s * 0.06, -0.552, 0.645), (0.034, 0.02, 0.016), tan, 'Head', 10, 6)  # tan brow dots
    cone_tip = Vector((s * 0.026, -0.645, 0.465))
    tube(cone_tip + Vector((0, 0, 0.035)), cone_tip, 0.013, 0.0, tooth, 'Head', 6)  # fangs over the lip
bm = bmesh.new()  # nose scar: a thin pink slash across the muzzle top
bmesh.ops.create_cube(bm, size=1)
for v in bm.verts:
    v.co = Vector((v.co.x * 0.085, v.co.y * 0.014, v.co.z * 0.008))
bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(0.6, 3, 'Z'))
bmesh.ops.translate(bm, verts=bm.verts, vec=Vector((0.014, -0.6, 0.59)))
add(bm, scar, 'Head')
ball((0, -0.57, 0.47), (0.058, 0.085, 0.025), tan, 'Chin', 12, 8)  # lower jaw (Bark/Bite open it)
ball((0, -0.57, 0.488), (0.05, 0.075, 0.012), mouth, 'Chin', 10, 6)

# ears: flat upright triangles with a pink inside; the left one is torn off halfway
def ear(s, bone, h):
    base, tip = Vector((s * 0.075, -0.43, 0.66)), Vector((s * 0.12, -0.44, 0.66 + h))
    loft([(base, 0.05, 0.02), (base.lerp(tip, 0.6), 0.03, 0.012), (tip, 0.004, 0.004)], coat, bone, 6)
    loft([(base + Vector((0, -0.016, 0.02)), 0.03, 0.006), (base.lerp(tip, 0.55) + Vector((0, -0.014, 0)), 0.015, 0.004)],
         scar, bone, 6)
ear(-1, 'Ear_R', 0.17)
loft([((0.075, -0.43, 0.66), 0.05, 0.02), ((0.09, -0.432, 0.72), 0.04, 0.016)], coat, 'Ear_L', 6)  # torn
ball((0.09, -0.432, 0.722), (0.04, 0.016, 0.008), scar, 'Ear_L', 8, 4)  # raw torn edge

# ---- legs: black up top, tan socks, round paws (front pair sits on one bone line, so offset sideways)
for side, s in (('L', 1), ('R', -1)):
    x = s * 0.075
    ball((x, -0.27, 0.33), (0.065, 0.08, 0.1), coat, f'Front_Leg_Shoulder_{side}', 12, 8)
    tube((x, -0.3, 0.32), (x, -0.278, 0.135), 0.052, 0.042, coat, f'Front_Leg_Upper_{side}', 10)
    ball((x, -0.279, 0.135), (0.042, 0.042, 0.042), tan, f'Front_Leg_Lower_{side}', 8, 6)
    tube((x, -0.279, 0.14), (x, -0.29, 0.045), 0.04, 0.036, tan, f'Front_Leg_Lower_{side}', 10)
    ball((x, -0.325, 0.03), (0.046, 0.062, 0.032), tan, f'Front_Leg_Ankle_{side}', 12, 8)
    ball((x, -0.32, 0.004), (0.036, 0.048, 0.008), pad, f'Front_Leg_Ankle_{side}', 10, 4)

    x = s * 0.085
    ball((x, 0.17, 0.28), (0.065, 0.11, 0.12), coat, f'Back_Leg_Upper_{side}', 12, 10)  # thigh
    tube((x, 0.13, 0.2), (x, 0.22, 0.09), 0.045, 0.036, tan, f'Back_Leg_Lower_{side}', 10)  # shin, slopes back
    ball((x, 0.22, 0.09), (0.036, 0.036, 0.036), tan, f'Back_Leg_Ankle_{side}', 8, 6)  # hock
    tube((x, 0.22, 0.09), (x, 0.2, 0.035), 0.034, 0.032, tan, f'Back_Leg_Ankle_{side}', 10)
    ball((x, 0.175, 0.03), (0.044, 0.06, 0.03), tan, f'Back_Leg_Ankle_{side}', 12, 8)
    ball((x, 0.18, 0.004), (0.034, 0.046, 0.008), pad, f'Back_Leg_Ankle_{side}', 10, 4)


# ---- weights: rigid parts take one bone; lofts blend the two nearest bones of their chain
def chain_weights(points, bones):
    segs = [seg(b) for b in bones]
    out = []
    for p in points:
        d = []
        for a, b in segs:
            q, f = intersect_point_line(p, a, b)
            q = a if f < 0 else b if f > 1 else q
            d.append((p - q).length)
        w = sorted(((1 / (di ** 4 + 1e-9), bn) for di, bn in zip(d, bones)), reverse=True)[:2]
        tot = w[0][0] + w[1][0]
        out.append([(bn, wi / tot) for wi, bn in w])
    return out


objs = []
for i, (bm, m, bone) in enumerate(parts):
    me = bpy.data.meshes.new(f'dog_part{i}')
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(me.name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(m)
    if isinstance(bone, str):
        o.vertex_groups.new(name=bone).add(range(len(me.vertices)), 1.0, 'REPLACE')
    else:
        groups = {bn: o.vertex_groups.new(name=bn) for bn in bone}
        for v, ws in zip(me.vertices, chain_weights([v.co.copy() for v in me.vertices], bone)):
            for bn, wi in ws:
                groups[bn].add([v.index], wi, 'REPLACE')
    objs.append(o)
bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
body.name = body.data.name = 'bossdog'
body.parent = arm
body.matrix_parent_inverse = arm.matrix_world.inverted()
body.modifiers.new('Armature', 'ARMATURE').object = arm

bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
body.select_set(True)
bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', use_selection=True, export_animations=True,
                          export_animation_mode='ACTIONS', export_skins=True, export_yup=True)
print('WROTE', DST, len(body.data.vertices), 'verts', len(body.data.polygons), 'faces')
