"""Shophouse kit -> public/models/shophouse.glb.

Stackable modules, each 4.8 m wide (X), 5 m deep, front at Y=0 facing -Y:
ground_shutter / ground_shop (0-3.2 m, with awning), upper_a / upper_b
(one 3.2 m floor), roof_a / roof_b (parapet + roof clutter).
environment.js stacks them, stretches X to the house width and recolours
sp_facade / sp_awning per house.

  blender --background --factory-startup --python art/blender/shophouse.py [-- preview.png]
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

reset()
facade = mat('facade', 0xf2d6a2); trim = mat('trim', 0xe8e2ec); awn = mat('awning', 0xff3b3b); awnw = mat('awning_white', 0xf4f4f4)
shutter = mat('shutter', 0x9aa0aa); rib = mat('flat_rib', 0x6d727c); dark = mat('flat_dark', 0x2a2a30); dsteel = mat('darksteel', 0x5a6470)
yellow = mat('yellow', 0xffd23f); shop = mat('shoplight', 0xffc27a, glow=True); wood = mat('wood', 0x8a5a3a); tile = mat('tile', 0xd8c8b0)
fridge = mat('fridge_glass', 0xd8f4ff, glow=True); white = mat('white', 0xf6f2ea); gate = mat('gate', 0xe8c040)
window = mat('window', 0x2a3346); alu = mat('alu', 0xb8c0c8); green = mat('flat_green', 0x2f5f4f); pot = mat('pot', 0xb8643a)
leaf = mat('leaf', 0x3f9f4a); glass = mat('glass', 0x9fd8ff); pipe = mat('pipe', 0x8a8494)
goods = [mat('g_red', 0xe83a3a), mat('g_blue', 0x2f8fff), mat('g_green', 0x3fbf5f), mat('g_orange', 0xff9a2f), mat('g_pink', 0xff6fae), yellow]
cloth = [mat('c_red', 0xe8413a), mat('c_white', 0xf4f4f4), mat('c_blue', 0x3a6fd8), mat('c_yellow', 0xffc83a)]
W = 4.8


def awning(c):
    n = 8; w = 4.4 / n
    for i in range(n):
        box(c, 'awn', (w, 1.1, 0.06), (-2.2 + w * (i + 0.5), -0.52, 2.85), awn if i % 2 == 0 else awnw, rot=(0.32, 0, 0))
    for i in range(n * 2):
        box(c, 'flap', (w / 2, 0.02, 0.16), (-2.2 + w / 2 * (i + 0.5), -1.04, 2.6), awn if (i // 2) % 2 == 0 else awnw)
    for s in (-1, 1):
        box(c, 'awn_rod', (0.03, 1.0, 0.03), (s * 2.1, -0.5, 2.62), dsteel, rot=(-0.55, 0, 0))


def ground_frame(c, recess):
    if recess:
        box(c, 'body', (W, 4.1, 3.2), (0, 2.95, 1.6), facade)
        for s in (-1, 1):
            box(c, 'jamb', (0.45, 0.9, 3.2), (s * 2.175, 0.45, 1.6), facade)
        box(c, 'lintel', (W, 0.9, 0.8), (0, 0.45, 2.8), facade)
    else:
        box(c, 'body', (W, 5, 3.2), (0, 2.5, 1.6), facade)
    for s in (-1, 1):
        box(c, 'pilaster', (0.3, 0.12, 3.2), (s * 2.25, -0.06, 1.6), trim)
    box(c, 'beam', (W, 0.14, 0.3), (0, -0.07, 3.05), trim)
    box(c, 'vent_panel', (3.9, 0.05, 0.3), (0, -0.04, 2.68), trim)  # breeze-block band
    for i in range(9):
        box(c, 'vent', (0.3, 0.02, 0.18), (-1.73 + i * 0.433, -0.07, 2.68), dark)


def ground_shutter():
    c = coll('ground_shutter')
    ground_frame(c, False)
    box(c, 'shutter', (3.9, 0.08, 2.45), (0, -0.04, 1.225), shutter)
    for i in range(12):
        box(c, 'rib', (3.9, 0.03, 0.035), (0, -0.09, 0.2 + i * 0.19), rib)
    box(c, 'bar', (3.9, 0.1, 0.08), (0, -0.1, 0.06), dsteel)
    for s in (-1, 1):
        box(c, 'handle', (0.14, 0.05, 0.05), (s * 0.9, -0.14, 0.2), dsteel)
    box(c, 'lock', (0.08, 0.05, 0.1), (0, -0.14, 0.14), yellow)
    box(c, 'house_no', (0.26, 0.03, 0.18), (2.25, -0.13, 2.1), mat('plate_blue', 0x2f5fbf))
    awning(c)
    return join(c, 'ground_shutter')


def ground_shop():
    c = coll('ground_shop')
    ground_frame(c, True)
    box(c, 'floor', (3.9, 0.9, 0.04), (0, 0.45, 0.02), tile)
    box(c, 'backlight', (3.9, 0.04, 2.4), (0, 0.88, 1.2), shop)
    for x in (-1.1, 0.15):
        for s in (-1, 1):
            box(c, 'shelf_side', (0.05, 0.3, 2.0), (x + s * 0.55, 0.7, 1.0), wood)
        for k, z in enumerate((0.35, 0.9, 1.45, 1.95)):
            box(c, 'plank', (1.15, 0.3, 0.04), (x, 0.7, z), wood)
            if z < 1.9:
                for j in range(4):
                    g = goods[(k * 4 + j + int(x * 10)) % len(goods)]
                    h = 0.3 - 0.06 * (j % 2)
                    box(c, 'good', (0.22, 0.2, h), (x - 0.4 + j * 0.27, 0.68, z + 0.02 + h / 2), g)
    box(c, 'fridge', (0.8, 0.55, 1.9), (1.45, 0.55, 0.95), white)
    box(c, 'fridge_glass', (0.66, 0.03, 1.6), (1.45, 0.27, 1.0), fridge)
    box(c, 'counter', (1.4, 0.45, 0.85), (-0.7, 0.3, 0.425), wood)
    box(c, 'counter_top', (1.45, 0.5, 0.04), (-0.7, 0.3, 0.87), glass)
    for s in (-1, 1):  # folding steel gate pushed to the sides
        box(c, 'gate_fold', (0.22, 0.1, 2.4), (s * 1.83, -0.05, 1.2), gate)
        for k in range(3):
            box(c, 'gate_bar', (0.03, 0.12, 2.4), (s * (1.75 + k * 0.08), -0.06, 1.2), dsteel)
    for i in range(7):
        box(c, 'snack', (0.14, 0.02, 0.24), (-1.5 + i * 0.5, 0.05, 2.22), goods[i % len(goods)])
    awning(c)
    return join(c, 'ground_shop')


def window_unit(c, x, z):
    box(c, 'win_frame', (1.35, 0.08, 1.45), (x, -0.04, z), white)
    box(c, 'win_glass', (1.1, 0.06, 1.2), (x, -0.07, z), window)
    for i in range(5):
        box(c, 'grille_v', (0.035, 0.03, 1.2), (x - 0.44 + i * 0.22, -0.12, z), dark)
    for dz in (-0.3, 0.3):
        box(c, 'grille_h', (1.1, 0.03, 0.035), (x, -0.12, z + dz), dark)
    box(c, 'sill', (1.45, 0.18, 0.07), (x, -0.09, z - 0.76), trim)


def upper_a():
    c = coll('upper_a')
    box(c, 'body', (W, 5, 3.2), (0, 2.5, 1.6), facade)
    box(c, 'floor_band', (W + 0.1, 0.12, 0.22), (0, -0.06, 0.11), trim)
    # windows sit high: the bottom 0.95 m is kept clear for the facade sign board environment.js adds
    for k in (-1, 1):
        window_unit(c, k * 1.1, 1.85)
        box(c, 'canopy', (1.5, 0.5, 0.05), (k * 1.1, -0.22, 2.78), alu, rot=(0.35, 0, 0))
    box(c, 'ac', (0.56, 0.4, 0.42), (0, -0.22, 1.75), white, bevel=0.03)  # AC between the windows
    cyl(c, 'ac_fan', 0.13, 0.02, (-0.08, -0.43, 1.75), dark, verts=10, rot=(P / 2, 0, 0))
    box(c, 'ac_bracket', (0.5, 0.4, 0.04), (0, -0.22, 1.52), dsteel)
    cyl(c, 'drain', 0.05, 3.2, (2.32, -0.08, 1.6), pipe, verts=6)
    return join(c, 'upper_a')


def upper_b():
    c = coll('upper_b')
    box(c, 'body', (W, 5, 3.2), (0, 2.5, 1.6), facade)
    box(c, 'balcony', (4.4, 0.8, 0.12), (0, -0.4, 0.15), trim)
    box(c, 'rail', (4.4, 0.06, 0.06), (0, -0.78, 1.1), green)
    for s in (-1, 1):
        box(c, 'rail_side', (0.06, 0.8, 0.06), (s * 2.18, -0.4, 1.1), green)
    for i in range(22):
        box(c, 'baluster', (0.03, 0.03, 0.9), (-2.1 + i * 0.2, -0.78, 0.66), green)
    box(c, 'door_frame', (2.3, 0.06, 2.2), (0, -0.03, 1.31), white)
    box(c, 'door_glass', (2.1, 0.05, 2.0), (0, -0.06, 1.31), window)
    box(c, 'mullion', (0.06, 0.08, 2.0), (0, -0.08, 1.31), white)
    for s in (-1, 1):  # breeze-block panels beside the door
        box(c, 'bb_panel', (0.8, 0.05, 1.5), (s * 1.75, -0.03, 1.5), trim)
        for i in range(3):
            for j in range(5):
                box(c, 'bb', (0.18, 0.02, 0.2), (s * 1.75 - 0.24 + i * 0.24, -0.06, 0.95 + j * 0.27), dark)
    for x in (-1.6, -1.2, 1.5):
        cyl(c, 'pot', 0.14, 0.24, (x, -0.5, 0.33), pot, verts=8, r2=0.11)
        sphere(c, 'plant', 0.2, (x, -0.5, 0.58), leaf, seg=7, rings=5)
    cyl(c, 'laundry_pole', 0.02, 2.6, (0.2, -0.65, 2.15), alu, verts=5, rot=(0, P / 2, 0))
    for i, x in enumerate((-0.8, -0.35, 0.15, 0.6, 1.1)):
        box(c, 'cloth', (0.34, 0.02, 0.42 + 0.1 * (i % 2)), (x, -0.65, 1.88 - 0.05 * (i % 2)), cloth[i % len(cloth)])
    return join(c, 'upper_b')


def roof_a():
    c = coll('roof_a')
    box(c, 'parapet', (W, 5, 0.6), (0, 2.5, 0.3), facade)
    box(c, 'cap', (W + 0.12, 0.25, 0.12), (0, -0.02, 0.62), trim)
    box(c, 'gable', (1.7, 0.16, 0.5), (0, -0.02, 0.93), facade)
    box(c, 'gable_cap', (1.82, 0.22, 0.08), (0, -0.02, 1.2), trim)
    box(c, 'plate', (0.8, 0.04, 0.3), (0, -0.11, 0.92), trim)
    text(c, 'year', '๒๕๑๐', 0.2, (0, -0.135, 0.9), mat('plate_text', 0x6a4a3a), extrude=0.005)
    cyl(c, 'antenna', 0.02, 1.8, (1.4, 2.0, 1.5), alu, verts=5)
    for k in range(4):
        box(c, 'antenna_bar', (0.9 - k * 0.15, 0.03, 0.03), (1.4, 2.0, 2.0 + k * 0.18), alu)
    return join(c, 'roof_a')


def roof_b():
    c = coll('roof_b')
    box(c, 'parapet', (W, 5, 0.35), (0, 2.5, 0.175), facade)
    box(c, 'cap', (W + 0.08, 0.2, 0.08), (0, -0.02, 0.38), trim)
    box(c, 'rail', (W - 0.2, 0.05, 0.05), (0, 0.08, 1.15), green)
    for i in range(9):
        box(c, 'post', (0.05, 0.05, 0.8), (-2.2 + i * 0.55, 0.08, 0.75), green)
    box(c, 'shed_roof', (3.0, 2.4, 0.06), (-0.4, 3.0, 2.35), mat('zinc', 0x8a9aa8), rot=(-0.15, 0, 0))
    for x in (-1.8, 1.0):
        box(c, 'shed_post', (0.08, 0.08, 2.1), (x, 2.0, 1.4), dsteel)
    cyl(c, 'dish', 0.35, 0.06, (1.6, 1.0, 1.2), white, verts=12, rot=(1.1, 0, 0.5), r2=0.2)
    box(c, 'dish_arm', (0.05, 0.05, 0.6), (1.6, 1.05, 0.75), dsteel)
    return join(c, 'roof_b')


gs, gp, ua, ub, ra, rb = objs = [ground_shutter(), ground_shop(), upper_a(), upper_b(), roof_a(), roof_b()]
export(objs, 'shophouse.glb')

if '--' in sys.argv:
    # preview: two stacked houses, shutter+upper_a+roof_a and shop+upper_b+upper_a+roof_b
    ua2 = ua.copy(); bpy.context.scene.collection.objects.link(ua2)
    for stack, x in (([gs, ua, ra], -2.45), ([gp, ub, ua2, rb], 2.45)):
        for i, o in enumerate(stack):
            o.location = (x, 0, 3.2 * i)
    stage(sys.argv[sys.argv.index('--') + 1], target=(0, 0, 5.0), az=-35, el=8, dist=22, size=(1100, 900), kid=(-3.4, -1.6))
