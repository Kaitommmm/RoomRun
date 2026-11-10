"""Soi people -> public/models/people.glb. Four rigged figures in the kid's style, one idle each.

Same build as kid.py: smooth rigid parts, each weighted 100% to one bone, big head with
the kid's face set (lib.face). Own small skeleton per figure with the kid's Mixamo bone
names (mixamorig:Head etc.), built in the figure's final pose, so the rest pose is the
pose (sitters are seated in rest) and idles are small rotations on top.
Part colours are baked into one colour attribute under one material, so each figure is
one draw call in the game. No outline on people.
Nodes (front -Y, feet at z 0 unless noted), actions <node>_idle:
  vendor      apron + cap, stirs the pot with a ladle; stands at the cart's open end
  rider       moto-taxi vest, scrolls a phone; waits by the cart
  sit_uncle   in stools space: on the stool at (0.1, -0.52), facing the table; fans himself
  sit_auntie  in stools space: on the stool at (-0.62, 0), facing the table; nods and chats

  blender --background --factory-startup --python art/blender/people.py [-- preview.png]
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from mathutils import Matrix, Quaternion

B = 'mixamorig:'
FPS = 24
K = 0.95  # head size against the kid's (radii 0.165, 0.15, 0.15): adults keep a big toy head

reset()
bpy.context.scene.render.fps = FPS
# muted so the neon signs stay the loudest thing on the street
skin = mat('skin', 0xd9a27a); skin_dark = mat('skin_dark', 0xb87d58)
hair = mat('hair', 0x1c1719); grey_hair = mat('grey_hair', 0x8a8690); brow = mat('flat_brow', 0x1a1418)
apron = mat('apron', 0xe6e0d2); cap = mat('cap', 0x3c5a7a); vendor_shirt = mat('vendor_shirt', 0x8a3a3a)
vest = mat('vest', 0xd8742c); rider_shirt = mat('rider_shirt', 0x2e3550); phone = mat('phone', 0x101014)
tank = mat('tank', 0xe8e4dc); plaid = mat('plaid', 0x5a6a8a); fan = mat('fan', 0xc9a04a)
blouse = mat('blouse', 0xb06a80); sarong = mat('sarong', 0x4a3a5a)
pants = mat('pants', 0x2a2a30); sandal = mat('sandal', 0x2a2420); strap = mat('strap', 0x3a6a8a)
steel = mat('steel', 0xc8d2dc); white = mat('white', 0xf0f0f0)

parts = []  # (bmesh, material, bone) of the figure being built


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


def ball(c, r, m=skin, bone='Head', seg=12, rings=8):
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


# ---- poses: joint points in metres; the skeleton and the parts are both built from them
def V(*a):
    return Vector(a)


def standing():
    """Arms down, feet together. head = head centre."""
    J = {'base': V(0, 0, 0.8), 'chest': V(0, 0, 1.1), 'neck': V(0, 0, 1.3), 'head': V(0, -0.005, 1.47)}
    for s, k in ((1, 'Left'), (-1, 'Right')):
        J[k + 'Arm'] = V(s * 0.2, 0, 1.25); J[k + 'ForeArm'] = V(s * 0.24, 0.02, 1.02); J[k + 'Hand'] = V(s * 0.25, -0.01, 0.82)
        J[k + 'UpLeg'] = V(s * 0.09, 0, 0.82); J[k + 'Leg'] = V(s * 0.1, -0.02, 0.46); J[k + 'Foot'] = V(s * 0.1, 0, 0.1)
    return J


def sitting():
    """On a 0.42 m stool, knees forward (-Y)."""
    J = {'base': V(0, 0.03, 0.5), 'chest': V(0, 0.0, 0.78), 'neck': V(0, -0.02, 0.98), 'head': V(0, -0.03, 1.15)}
    for s, k in ((1, 'Left'), (-1, 'Right')):
        J[k + 'Arm'] = V(s * 0.2, -0.01, 0.93); J[k + 'ForeArm'] = V(s * 0.24, 0.0, 0.7); J[k + 'Hand'] = V(s * 0.2, -0.2, 0.62)
        J[k + 'UpLeg'] = V(s * 0.1, -0.02, 0.52); J[k + 'Leg'] = V(s * 0.13, -0.42, 0.52); J[k + 'Foot'] = V(s * 0.14, -0.46, 0.1)
    return J


def bones(J):
    """(name, head, tail, parent) for the skeleton of pose J."""
    up = Vector((0, 0, 1))
    out = [('Hips', J['base'], J['base'].lerp(J['chest'], 0.45), None),
           ('Spine', J['base'].lerp(J['chest'], 0.45), J['chest'], 'Hips'),
           ('Spine2', J['chest'], J['neck'], 'Spine'),
           ('Neck', J['neck'], J['neck'].lerp(J['head'], 0.4), 'Spine2'),
           ('Head', J['neck'].lerp(J['head'], 0.4), J['head'] + up * 0.16, 'Neck')]
    for k in ('Left', 'Right'):
        sh, el, wr = J[k + 'Arm'], J[k + 'ForeArm'], J[k + 'Hand']
        an = J[k + 'Foot']
        out += [(k + 'Shoulder', Vector((sh.x * 0.2, sh.y, sh.z)), sh, 'Spine2'),
                (k + 'Arm', sh, el, k + 'Shoulder'),
                (k + 'ForeArm', el, wr, k + 'Arm'),
                (k + 'Hand', wr, wr + (wr - el).normalized() * 0.08, k + 'ForeArm'),
                (k + 'UpLeg', J[k + 'UpLeg'], J[k + 'Leg'], 'Hips'),
                (k + 'Leg', J[k + 'Leg'], an, k + 'UpLeg'),
                (k + 'Foot', an, an + Vector((0, -0.14, -0.06)), k + 'Leg')]
    return out


# ---- shared body: torso, head + face + hair, arms with mitten hands, legs with flip-flops
def body(J, top, bottom, sk=skin, sleeve=None, shin=None, belly=False, hair_m=hair, hair_cut=0.0):
    """sleeve: short-sleeve material (None = bare arms); shin: lower-leg material (None = skin, shorts)."""
    base, chest, neck, hc = J['base'], J['chest'], J['neck'], J['head']
    tube(base + V(0, 0, -0.05), base + V(0, 0, 0.12), 0.17, 0.168, bottom, 'Hips', 12, 0.78)
    tube(base + V(0, 0, 0.08), chest, 0.165, 0.17, top, 'Spine', 12, 0.74)
    tube(chest + V(0, 0, -0.02), neck + V(0, 0, 0.01), 0.175, 0.15, top, 'Spine2', 12, 0.72)
    if belly:
        ball(chest.lerp(base, 0.4) + V(0, -0.07, 0), (0.17, 0.13, 0.15), top, 'Spine', 12, 8)
    tube(neck + V(0, 0, -0.02), hc + V(0, 0, -0.08), 0.05, m=sk, bone='Neck', sides=8)

    ball(hc, (0.165 * K, 0.15 * K, 0.15 * K), sk, 'Head', 16, 10)
    face(ball, block, hc, sk, brow, K)
    # hair cap: a bigger head shell cut below a slanted line (fringe high at the front, low at the back), like the kid
    capb = ball(hc + V(0, 0.005, 0.012) * K, (0.172 * K, 0.162 * K, 0.158 * K), hair_m, 'Head', 16, 10)
    cut = []
    for v in capb.verts:
        y = (v.co.y - hc.y) / K
        line = 0.05 if y < -0.08 else -0.02 + 0.5 * max(0.0, -y) - 0.6 * max(0.0, y - 0.02)
        if (v.co.z - hc.z) / K < line + hair_cut:
            cut.append(v)
    bmesh.ops.delete(capb, geom=cut, context='VERTS')
    bmesh.ops.solidify(capb, geom=capb.faces, thickness=0.012 * K)
    top_ = ball(hc + V(0, 0.01, 0.055) * K, (0.168 * K, 0.158 * K, 0.11 * K), hair_m, 'Head', 16, 8)
    bmesh.ops.delete(top_, geom=[v for v in top_.verts if v.co.z < hc.z + 0.03 * K], context='VERTS')

    for k, s in (('Left', 1), ('Right', -1)):
        sh, el, wr = J[k + 'Arm'], J[k + 'ForeArm'], J[k + 'Hand']
        if sleeve:
            tube(sh - V(s * 0.02, 0, 0), sh.lerp(el, 0.5), 0.07, 0.065, sleeve, k + 'Arm', 10)
        ball(sh, (0.06, 0.06, 0.06), sleeve or sk, k + 'Arm', 10, 6)  # shoulder cap
        tube(sh, el, 0.052, 0.046, sk, k + 'Arm', 8)
        tube(el - (el - sh).normalized() * 0.015, wr, 0.046, 0.04, sk, k + 'ForeArm', 8)
        hand = wr + (wr - el).normalized() * 0.045
        ball(hand, (0.05, 0.035, 0.05), sk, k + 'Hand', 10, 6)  # mitten hand
        ball(hand + V(-s * 0.02, -0.035, 0.005), (0.018, 0.018, 0.018), sk, k + 'Hand', 6, 4)  # thumb

        hp, kn, an = J[k + 'UpLeg'], J[k + 'Leg'], J[k + 'Foot']
        tube(hp + (hp - kn).normalized() * 0.04, kn, 0.088, 0.076, bottom, k + 'UpLeg', 10)
        ball(kn, (0.074, 0.074, 0.074), shin or bottom, k + 'Leg', 10, 6)
        tube(kn, an + V(0, 0, -0.04), 0.064, 0.052, shin or sk, k + 'Leg', 8)
        # flip-flop: rounded foot on a flat sole, a coloured strap across
        toe = an + V(0, -0.07, -0.06)
        ball(toe, (0.056, 0.11, 0.045), sk, k + 'Foot', 10, 6)
        block(toe + V(0, 0, -0.035), (0.11, 0.24, 0.016), sandal, k + 'Foot', 0.006)
        block(toe + V(0, -0.03, 0.01), (0.105, 0.025, 0.03), strap, k + 'Foot', 0.006)


def vendor(J):
    J['RightForeArm'] = V(-0.25, -0.12, 1.06); J['RightHand'] = V(-0.18, -0.32, 1.0)  # ladle hand over the pot
    body(J, vendor_shirt, pants, skin_dark, sleeve=vendor_shirt, shin=pants)
    hc = J['head']
    ball(hc + V(0, 0.01, 0.07), (0.17 * K, 0.16 * K, 0.11 * K), cap, 'Head', 16, 8)  # cap crown
    ball(hc + V(0, -0.16, 0.06), (0.11, 0.08, 0.014), cap, 'Head', 12, 4)  # bill
    block((0, -0.135, 0.92), (0.34, 0.025, 0.66), apron, 'Spine', 0.01)
    block((0, -0.125, 1.24), (0.24, 0.02, 0.03), apron, 'Spine2', 0.006)  # bib strap
    wr, el = J['RightHand'], J['RightForeArm']
    h = wr + (wr - el).normalized() * 0.045
    tube(h, h + V(0.02, -0.14, -0.2), 0.012, m=steel, bone='RightHand', sides=6)
    ball(h + V(0.02, -0.15, -0.23), (0.045, 0.045, 0.03), steel, 'RightHand', 8, 5)


def rider(J):
    for k, s in (('Left', 1), ('Right', -1)):  # phone up at the chest, both hands on it
        J[k + 'ForeArm'] = V(s * 0.23, -0.05, 1.03); J[k + 'Hand'] = V(s * 0.07, -0.25, 1.1)
    body(J, rider_shirt, pants, skin, sleeve=rider_shirt, shin=pants)
    tube(J['base'] + V(0, 0, 0.1), J['chest'] + V(0, 0, 0.0), 0.178, 0.183, vest, 'Spine', 12, 0.76)
    tube(J['chest'] + V(0, 0, -0.02), J['neck'] + V(0, 0, -0.03), 0.188, 0.162, vest, 'Spine2', 12, 0.74)
    block((0, 0.142, 1.15), (0.18, 0.01, 0.12), white, 'Spine2', 0.004)  # number plate on the back
    block((0, 0.15, 1.15), (0.1, 0.008, 0.07), vest, 'Spine2')
    h = J['RightHand'] + (J['RightHand'] - J['RightForeArm']).normalized() * 0.045
    block(h + V(0.05, -0.03, 0.03), (0.085, 0.014, 0.15), phone, 'RightHand', 0.006, rot=('X', 0.6))


def sit_uncle(J):
    J['RightForeArm'] = V(-0.27, -0.16, 0.72); J['RightHand'] = V(-0.22, -0.24, 0.94)  # fan up by the face
    J['LeftForeArm'] = V(0.15, -0.34, 0.62); J['LeftHand'] = V(0.07, -0.5, 0.66)  # elbow on the knee
    body(J, tank, plaid, skin_dark, shin=None, belly=True, hair_m=grey_hair, hair_cut=0.02)
    wr, el = J['RightHand'], J['RightForeArm']
    h = wr + (wr - el).normalized() * 0.045
    tube(h, h + V(0, 0, 0.08), 0.01, m=fan, bone='RightHand', sides=5)
    ball(h + V(0, -0.005, 0.17), (0.11, 0.012, 0.1), fan, 'RightHand', 12, 4)


def sit_auntie(J):
    for k, s in (('Left', 1), ('Right', -1)):  # hands in her lap
        J[k + 'ForeArm'] = V(s * 0.23, -0.06, 0.71); J[k + 'Hand'] = V(s * 0.07, -0.3, 0.62)
    body(J, blouse, sarong, skin, sleeve=blouse, shin=sarong)
    hc = J['head']
    ball(hc + V(0, 0.12, 0.09) * K, (0.075, 0.07, 0.07), hair, 'Head', 10, 8)  # bun


# ---- idles: keys of {bone: (x, y, z)} angles about the figure's axes (x + nods forward,
# y + tips toward its left, z + turns to its left), first key == last key
IDLES = {
    'vendor': (2.4, [  # stirs the pot
        {'RightArm': (0, 0, 0.12), 'Head': (0.18, 0, 0), 'Spine': (0, 0, 0.03)},
        {'RightArm': (0.1, 0, 0), 'RightForeArm': (0.08, 0, 0), 'Head': (0.18, 0, 0)},
        {'RightArm': (0, 0, -0.12), 'Head': (0.2, 0, 0), 'Spine': (0, 0, -0.03)},
        {'RightArm': (-0.1, 0, 0), 'RightForeArm': (-0.08, 0, 0), 'Head': (0.18, 0, 0)},
        {'RightArm': (0, 0, 0.12), 'Head': (0.18, 0, 0), 'Spine': (0, 0, 0.03)},
    ]),
    'rider': (3.0, [  # scrolls the phone
        {'Head': (0.32, 0, 0), 'RightHand': (0, 0, 0), 'Hips': (0, 0.02, 0)},
        {'Head': (0.32, 0, 0), 'RightHand': (0.14, 0, 0)},
        {'Head': (0.34, 0, 0.04), 'RightHand': (0, 0, 0)},
        {'Head': (0.3, 0.04, 0), 'RightHand': (0.14, 0, 0), 'Hips': (0, -0.02, 0)},
        {'Head': (0.32, 0, 0), 'RightHand': (0, 0, 0), 'Hips': (0, 0.02, 0)},
    ]),
    'sit_uncle': (2.0, [  # fans himself
        {'RightForeArm': (0, -0.3, 0), 'Head': (-0.08, 0, 0)},
        {'RightForeArm': (0, 0.25, 0), 'Head': (-0.08, 0, 0), 'Spine': (-0.03, 0, 0)},
        {'RightForeArm': (0, -0.3, 0), 'Head': (-0.1, 0, 0), 'Spine': (-0.03, 0, 0)},
        {'RightForeArm': (0, 0.25, 0), 'Head': (-0.08, 0, 0)},
        {'RightForeArm': (0, -0.3, 0), 'Head': (-0.08, 0, 0)},
    ]),
    'sit_auntie': (3.0, [  # nods and chats
        {},
        {'Head': (0.16, 0, 0), 'RightForeArm': (-0.3, 0, 0)},
        {'Head': (0, 0, 0.06), 'RightForeArm': (-0.4, 0, 0.2)},
        {'Head': (0.13, 0.06, 0), 'RightForeArm': (-0.3, 0, 0), 'Spine': (0, 0, 0.05)},
        {'Head': (0, 0.08, 0), 'Spine': (0, 0, 0.03)},
        {},
    ]),
}


def key_idle(arm, name):
    dur, keys = IDLES[name]
    used = sorted({b for k in keys for b in k})
    for i, k in enumerate(keys):
        for b in used:
            pb = arm.pose.bones[B + b]
            ri = pb.bone.matrix_local.to_3x3().inverted()  # figure axes into the bone's rest frame
            # front is -Y and its left +X: +X tips the top forward, +Y toward its left, +Z turns the front to its left
            x, y, z = k.get(b, (0, 0, 0))
            pb.rotation_mode = 'QUATERNION'
            pb.rotation_quaternion = (Quaternion(ri @ Vector((1, 0, 0)), x) @ Quaternion(ri @ Vector((0, 1, 0)), y)
                                      @ Quaternion(ri @ Vector((0, 0, 1)), z))
            pb.keyframe_insert('rotation_quaternion', frame=1 + round(i * dur / (len(keys) - 1) * FPS))
    arm.animation_data.action.name = name + '_idle'


def figure(name, pose, build, rot=0.0, at=(0, 0, 0)):
    """Skeleton + one joined, skinned, vertex-coloured mesh; turned by rot about Z and moved to `at` (stools space)."""
    J = pose()
    parts.clear()
    build(J)
    a = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, a)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    for bn, h, t, p in bones(J):
        eb = a.edit_bones.new(B + bn)
        eb.head, eb.tail = h, t
        if p:
            eb.parent = a.edit_bones[B + p]
    bpy.ops.object.mode_set(mode='OBJECT')

    objs = []
    for i, (bm, m, bone) in enumerate(parts):
        me = bpy.data.meshes.new(f'{name}_part{i}')
        bm.normal_update()
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = True
        col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        c = m.diffuse_color[:]
        for d in col.data:
            d.color = c
        o = bpy.data.objects.new(me.name, me)
        bpy.context.scene.collection.objects.link(o)
        o.vertex_groups.new(name=B + bone).add(range(len(me.vertices)), 1.0, 'REPLACE')
        objs.append(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    body_ = bpy.context.view_layer.objects.active
    body_.name = body_.data.name = name + '_body'
    body_.data.materials.append(mat('people', 0xffffff))
    body_.parent = arm
    body_.modifiers.new('Armature', 'ARMATURE').object = arm

    key_idle(arm, name)
    arm.rotation_euler.z = rot
    arm.location = at
    print('FIGURE', name, sum(len(p.vertices) - 2 for p in body_.data.polygons), 'tris')
    return arm, body_


figs = [
    figure('vendor', standing, vendor),
    figure('rider', standing, rider),
    # stools space: front stool (0.1, -0.52) and left stool (-0.62, 0), both turned to face the table
    figure('sit_uncle', sitting, sit_uncle, rot=P, at=(0.1, -0.52, 0)),
    figure('sit_auntie', sitting, sit_auntie, rot=P / 2, at=(-0.62, 0, 0)),
]
bpy.context.scene.frame_set(1)
bpy.ops.object.select_all(action='DESELECT')
for arm, body_ in figs:
    arm.select_set(True)
    body_.select_set(True)
dst = os.path.join(OUT, 'people.glb')
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=True, export_animations=True,
                          export_animation_mode='ACTIONS', export_skins=True, export_yup=True,
                          export_vertex_color='ACTIVE')
print('WROTE', dst)

if '--' in sys.argv and len(sys.argv) > sys.argv.index('--') + 1:
    for (arm, _), x in zip(figs, (-1.5, -0.5, 0.5, 1.5)):  # a row, all facing the camera
        arm.rotation_euler.z = 0
        arm.location = (x, 0, 0)
    stage(sys.argv[sys.argv.index('--') + 1], target=(0, 0, 0.85), az=-15, el=8, dist=4.6, size=(1400, 800), color='VERTEX')
