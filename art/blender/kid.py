"""Low-poly cartoon kid on the existing Mixamo rig -> public/models/kid_v2.glb.

Takes the skeleton and clips (idle/run/jump/caught) from public/models/kid.glb,
drops the TRELLIS mesh and builds a new body from simple parts. Each part is
weighted 100% to one bone (rigid, like a toy figure), so no re-rig is needed;
knees and elbows get a ball so the tube ends hide inside it when they bend.
Rest pose is the Mixamo T-pose: ground z -0.5, head top z 0.48, front -Y.
Materials named sp_flat_* (face details) get no outline in the game.

  blender --background --factory-startup --python art/blender/kid.py [-- preview.png]
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from mathutils import Matrix

SRC = os.path.join(OUT, 'kid.glb')
DST = os.path.join(OUT, 'kid_v2.glb')

reset()
bpy.ops.import_scene.gltf(filepath=SRC)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in list(bpy.data.objects):
    if o is not arm:
        bpy.data.objects.remove(o)
B = 'mixamorig:'
mw = arm.matrix_world


def joint(name):
    return mw @ arm.data.bones[B + name].head_local


skin = mat('skin', 0xf2b98e); shirt = mat('shirt', 0xf4f4f8); navy = mat('navy', 0x1f2f6a)
hair = mat('hair', 0x1a1418); shoe = mat('shoe', 0x161616); sock = mat('sock', 0xf0f0f0)
bag = mat('bag', 0xd8323a); bag_dark = mat('bag_dark', 0x9a1f28); yellow = mat('yellow', 0xffd23f)
brow = mat('flat_brow', 0x1a1418)

parts = []  # (bmesh, material, bone)


def add(bm, m, bone):
    parts.append((bm, m, bone))
    return bm


def tube(a, b, r1, r2=None, m=skin, bone='Hips', sides=10, squash=1.0):
    """Tapered cylinder from point a to point b; squash flattens it front-to-back."""
    a, b = Vector(a), Vector(b)
    bm = bmesh.new()
    d = b - a
    bmesh.ops.create_cone(bm, cap_ends=True, segments=sides, radius1=r1, radius2=r1 if r2 is None else r2, depth=d.length)
    for v in bm.verts:
        v.co.y *= squash
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation((a + b) / 2) @ rot, verts=bm.verts)
    return add(bm, m, bone)


def ball(c, r, m=skin, bone='Head', seg=14, rings=10):
    """Ellipsoid at c with radii r = (rx, ry, rz)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1)
    for v in bm.verts:
        v.co = Vector((v.co.x * r[0] + c[0], v.co.y * r[1] + c[1], v.co.z * r[2] + c[2]))
    return add(bm, m, bone)


def block(c, s, m, bone, bevel=0.0, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co = Vector((v.co.x * s[0], v.co.y * s[1], v.co.z * s[2]))
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect='EDGES')
    if rot:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rot[1], 3, rot[0]))
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(c))
    return add(bm, m, bone)


def cone(base, tip, r, m, bone, sides=6):
    return tube(base, tip, r, 0.0, m, bone, sides)


# ---- head: big round head, spiky black hair, big eyes (the face reads from the front camera)
HC = Vector((0, -0.005, 0.345))
ball(HC, (0.165, 0.15, 0.15), skin, 'Head', 18, 12)
face(ball, block, HC, skin, brow)

# hair cap: a slightly bigger head shell cut off below a slanted line (fringe high at the front, low at the back)
cap = ball(HC + Vector((0, 0.005, 0.012)), (0.172, 0.162, 0.158), hair, 'Head', 18, 12)
hairline = lambda co: (co.z - HC.z) - (0.05 if co.y < -0.08 else -0.02 + 0.5 * max(0.0, -co.y) - 0.6 * max(0.0, co.y - 0.02))
# cut exactly on the line: dropping whole sphere verts left a saw-tooth edge with skin showing in the steps
cross = [e for e in cap.edges if (hairline(e.verts[0].co) < 0) != (hairline(e.verts[1].co) < 0)]
edge_cut = []
for e in cross:
    a, b = e.verts
    fa, fb = hairline(a.co), hairline(b.co)
    edge_cut.append(bmesh.utils.edge_split(e, a, fa / (fa - fb))[1])
bmesh.ops.connect_verts(cap, verts=edge_cut)
bmesh.ops.delete(cap, geom=[v for v in cap.verts if hairline(v.co) < -1e-6], context='VERTS')
bmesh.ops.solidify(cap, geom=cap.faces, thickness=0.012)
# short Thai schoolboy cut: a soft mound on top plus a fringe swept to one side, no spikes
top = ball(HC + Vector((0, 0.01, 0.06)), (0.17, 0.16, 0.12), hair, 'Head', 18, 10)
bmesh.ops.delete(top, geom=[v for v in top.verts if v.co.z < HC.z + 0.03], context='VERTS')
ball((0.025, -0.132, 0.425), (0.125, 0.04, 0.032), hair, 'Head', 14, 8)  # fringe band
ball((0.1, -0.12, 0.41), (0.06, 0.04, 0.035), hair, 'Head', 10, 8)  # swept end, heavier on one side
tube(joint('Neck') + Vector((0, 0, -0.01)), joint('Head') + Vector((0, 0, 0.03)), 0.04, m=skin, bone='Neck')

# ---- torso: white school shirt, navy shorts, red backpack on the back (faces the camera)
tube((0, 0, -0.04), (0, 0, 0.09), 0.105, 0.11, shirt, 'Spine', 12, 0.72)
tube((0, 0, 0.06), (0, 0, 0.2), 0.115, 0.1, shirt, 'Spine2', 12, 0.72)
block((0, -0.06, 0.19), (0.1, 0.03, 0.03), shirt, 'Spine2', 0.008)  # collar
tube((0, 0, -0.12), (0, 0, -0.02), 0.11, 0.108, navy, 'Hips', 12, 0.75)
block((0, 0.115, 0.08), (0.19, 0.08, 0.2), bag, 'Spine2', 0.025)
block((0, 0.16, 0.04), (0.13, 0.03, 0.08), bag_dark, 'Spine2', 0.012)
block((0, 0.16, 0.115), (0.11, 0.032, 0.02), yellow, 'Spine2', 0.006)
for s in (-1, 1):  # straps over the shoulders
    block((s * 0.065, -0.078, 0.1), (0.025, 0.012, 0.17), bag, 'Spine2', 0.004)
    block((s * 0.065, 0.0, 0.195), (0.025, 0.16, 0.014), bag, 'Spine2', 0.004)

# ---- limbs (left built from bones, right mirrored by bone name)
for side in ('Left', 'Right'):
    sh, el, wr = joint(side + 'Arm'), joint(side + 'ForeArm'), joint(side + 'Hand')
    hip, kn, an, toe = joint(side + 'UpLeg'), joint(side + 'Leg'), joint(side + 'Foot'), joint(side + 'ToeBase')
    s = 1 if side == 'Left' else -1
    tube(sh - Vector((s * 0.02, 0, 0)), sh.lerp(el, 0.55), 0.048, 0.045, shirt, side + 'Arm', 10)  # short sleeve
    tube(sh, el, 0.03, 0.028, skin, side + 'Arm', 8)
    tube(el - (el - sh).normalized() * 0.012, wr, 0.028, 0.026, skin, side + 'ForeArm', 8)
    # knee and elbow balls: both tubes turn about the ball's centre, so their ends stay inside it
    # when the joint bends (rigid tube ends crossed and the outline traced the cut)
    ball(el, (0.031, 0.031, 0.031), skin, side + 'ForeArm', 10, 8)
    hand = wr + (wr - el).normalized() * 0.04
    ball(hand, (0.042, 0.026, 0.036), skin, side + 'Hand', 10, 8)  # mitten hand
    ball(hand + Vector((-s * 0.015, -0.03, 0.0)), (0.014, 0.014, 0.014), skin, side + 'Hand', 8, 6)  # thumb

    tube(hip + Vector((0, 0, 0.06)), hip.lerp(kn, 0.5), 0.062, 0.06, navy, side + 'UpLeg', 10)  # shorts leg
    tube(hip, kn, 0.04, 0.035, skin, side + 'UpLeg', 8)
    tube(kn + Vector((0, 0, 0.012)), kn.lerp(an, 0.5), 0.035, 0.032, skin, side + 'Leg', 8)
    ball(kn, (0.039, 0.039, 0.039), skin, side + 'Leg', 10, 8)
    tube(kn.lerp(an, 0.45), an + Vector((0, 0, -0.01)), 0.038, 0.036, sock, side + 'Leg', 8)
    fwd = Vector((toe.x - an.x, toe.y - an.y, 0)).normalized()
    toe_c = Vector((an.x + fwd.x * 0.04, an.y + fwd.y * 0.04, -0.465))
    ball(toe_c, (0.045, 0.088, 0.04), shoe, side + 'Foot', 14, 10)  # round cartoon school shoe
    block(toe_c + Vector((0, 0, -0.03)), (0.084, 0.17, 0.014), mat('sole', 0x3a3a40), side + 'Foot', 0.005)

# ---- join into one skinned mesh
objs = []
for i, (bm, m, bone) in enumerate(parts):
    me = bpy.data.meshes.new(f'kid_part{i}')
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(me.name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(m)
    o.vertex_groups.new(name=B + bone).add(range(len(me.vertices)), 1.0, 'REPLACE')
    objs.append(o)
bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
body.name = body.data.name = 'kid'

body.parent = arm
body.matrix_parent_inverse = arm.matrix_world.inverted()
body.modifiers.new('Armature', 'ARMATURE').object = arm

bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
body.select_set(True)
bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', use_selection=True, export_animations=True,
                          export_animation_mode='ACTIONS', export_skins=True, export_yup=True)
print('WROTE', DST, len(body.data.vertices), 'verts', len(body.data.polygons), 'faces')

if '--' in sys.argv and len(sys.argv) > sys.argv.index('--') + 1:
    sc = bpy.context.scene
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    cam.location = (0.9, -1.6, 0.35)
    cam.rotation_euler = (math.radians(90), 0, math.radians(30))
    cam.data.lens = 40
    sc.camera = cam
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sc.collection.objects.link(sun)
    sun.rotation_euler = (0.7, 0.2, 0.5)
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x = sc.render.resolution_y = 700
    sc.render.filepath = sys.argv[sys.argv.index('--') + 1]
    bpy.ops.render.render(write_still=True)
