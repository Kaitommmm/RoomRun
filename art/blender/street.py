"""Street kit -> public/models/street_lamp.glb + street_kit.glb.

street_lamp: concrete power pole at the origin, lamp arm along +X (environment.js
turns it toward the road), lamp head at x 1.45, z 6.36 like the code pole.
Nodes `lamp` and `lamp_tx` (with a transformer).
street_kit: sidewalk dressing, each at its own origin, front -Y:
scooter (long axis Y), stools (table + stools), spirit_house, pots.

  blender --background --factory-startup --python art/blender/street.py [-- preview.png]
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

reset()
concrete = mat('concrete', 0xa09aa8); dsteel = mat('darksteel', 0x5a6470); lamp_glow = mat('lamp', 0xffb45a, glow=True)
yellow = mat('yellow', 0xffd23f); black = mat('flat_black', 0x1a1a1a); porcelain = mat('porcelain', 0xf0ece4)
tx_grey = mat('tx_grey', 0x7a7a84); white = mat('white', 0xf6f2ea); red = mat('red', 0xe83a3a); blue = mat('blue', 0x3a7ad8)
tire = mat('tire', 0x1e1e1e); chrome = mat('chrome', 0xdddddd); seat = mat('seat', 0x1a1a1a); steel = mat('steel', 0xc8d2dc)
stool_red = mat('stool_red', 0xe8343a); stool_blue = mat('stool_blue', 0x2f7fe0); gold = mat('gold', 0xe8b030)
gold_glow = mat('candle', 0xffd27a, glow=True); shrine_red = mat('shrine_red', 0xc8282c); pot = mat('pot', 0xb8643a)
leaf = mat('leaf', 0x3f9f4a); leaf2 = mat('leaf_dark', 0x2f7f3f); garland = mat('garland', 0xffe070); pink = mat('pink', 0xff6fae)


def pole(c):
    box(c, 'pole', (0.3, 0.3, 8.6), (0, 0, 4.3), concrete)
    for k in range(4):  # yellow-black band at the base
        box(c, 'band', (0.32, 0.32, 0.25), (0, 0, 0.45 + k * 0.25), yellow if k % 2 == 0 else black)
    box(c, 'crossarm', (0.12, 1.6, 0.12), (0, 0, 7.9), dsteel)
    for y in (-0.7, -0.25, 0.25, 0.7):
        cyl(c, 'insulator', 0.05, 0.14, (0, y, 8.03), porcelain, verts=6)
    box(c, 'arm', (1.5, 0.08, 0.08), (0.75, 0, 6.48), dsteel)
    box(c, 'arm_brace', (0.9, 0.05, 0.05), (0.42, 0, 6.2), dsteel, rot=(0, -0.55, 0))
    box(c, 'head', (0.62, 0.32, 0.12), (1.45, 0, 6.42), tx_grey, bevel=0.03)
    box(c, 'lens', (0.55, 0.28, 0.06), (1.45, 0, 6.34), lamp_glow)
    box(c, 'plate', (0.22, 0.03, 0.3), (0, -0.165, 2.6), white)
    box(c, 'plate_no', (0.16, 0.02, 0.06), (0, -0.18, 2.62), black)


def lamp():
    c = coll('lamp')
    pole(c)
    return join(c, 'lamp')


def lamp_tx():
    c = coll('lamp_tx')
    pole(c)
    box(c, 'tx_shelf', (0.9, 0.7, 0.08), (-0.4, 0, 5.0), dsteel)
    cyl(c, 'tx', 0.3, 0.8, (-0.45, 0, 5.44), tx_grey, verts=10)
    cyl(c, 'tx_cap', 0.32, 0.06, (-0.45, 0, 5.87), dsteel, verts=10)
    for y in (-0.15, 0.15):
        cyl(c, 'tx_bushing', 0.04, 0.2, (-0.45, y, 5.98), porcelain, verts=6)
    return join(c, 'lamp_tx')


def scooter():
    c = coll('scooter')
    box(c, 'deck', (0.3, 0.75, 0.1), (0, 0.0, 0.32), black)
    box(c, 'body_rear', (0.38, 0.75, 0.42), (0, 0.42, 0.58), red, bevel=0.06)
    box(c, 'seat', (0.3, 0.6, 0.1), (0, 0.38, 0.84), seat, bevel=0.03)
    box(c, 'leg_shield', (0.4, 0.14, 0.62), (0, -0.4, 0.62), red, bevel=0.05)
    box(c, 'fork', (0.06, 0.06, 0.62), (0, -0.55, 0.55), chrome, rot=(0.25, 0, 0))
    box(c, 'bar', (0.62, 0.06, 0.06), (0, -0.52, 1.1), chrome)
    box(c, 'headlight_box', (0.22, 0.14, 0.16), (0, -0.58, 1.02), red, bevel=0.03)
    box(c, 'mirror_l', (0.03, 0.03, 0.18), (-0.25, -0.5, 1.2), chrome)
    box(c, 'mirror_r', (0.03, 0.03, 0.18), (0.25, -0.5, 1.2), chrome)
    box(c, 'basket', (0.3, 0.22, 0.18), (0, -0.72, 0.9), chrome)
    for y in (-0.55, 0.5):
        cyl(c, 'wheel', 0.24, 0.1, (0, y, 0.24), tire, verts=12, rot=(0, P / 2, 0))
        cyl(c, 'hub', 0.09, 0.12, (0, y, 0.24), chrome, verts=8, rot=(0, P / 2, 0))
    return join(c, 'scooter')


def stools():
    c = coll('stools')
    box(c, 'table_top', (0.75, 0.6, 0.03), (0, 0, 0.7), steel)
    for x in (-0.33, 0.33):
        for y in (-0.26, 0.26):
            box(c, 'table_leg', (0.03, 0.03, 0.69), (x, y, 0.345), steel)
    for i, (x, y) in enumerate(((-0.62, 0.0), (0.62, 0.05), (0.0, 0.5), (0.1, -0.52))):
        m = stool_red if i % 2 == 0 else stool_blue
        cyl(c, 'stool', 0.16, 0.42, (x, y, 0.21), m, verts=10, r2=0.13)
    cyl(c, 'bowl', 0.09, 0.06, (0.12, 0.05, 0.75), white, verts=8, r2=0.06)
    cyl(c, 'condiments', 0.05, 0.12, (-0.2, -0.1, 0.78), red, verts=6)
    return join(c, 'stools')


def spirit_house():
    c = coll('spirit_house')
    box(c, 'plinth', (0.6, 0.6, 0.18), (0, 0, 0.09), white)
    cyl(c, 'post', 0.1, 1.15, (0, 0, 0.75), white, verts=8)
    box(c, 'deck', (0.85, 0.85, 0.06), (0, 0, 1.35), gold)
    box(c, 'house', (0.5, 0.45, 0.5), (0, 0.04, 1.63), shrine_red)
    for s in (-1, 1):  # two-layer gabled roof
        box(c, 'roof1', (0.38, 0.62, 0.04), (s * 0.15, 0.04, 1.97), gold, rot=(0, s * 0.75, 0))
        box(c, 'roof2', (0.26, 0.42, 0.04), (s * 0.1, 0.04, 2.16), shrine_red, rot=(0, s * 0.8, 0))
    box(c, 'spire', (0.04, 0.04, 0.28), (0, 0.04, 2.36), gold)
    box(c, 'door', (0.18, 0.02, 0.28), (0, -0.19, 1.58), gold)
    for s in (-1, 1):
        cyl(c, 'candle', 0.02, 0.1, (s * 0.3, -0.3, 1.43), gold_glow, verts=5)
    for k in range(6):  # marigold garland
        sphere(c, 'garland', 0.045, (-0.25 + k * 0.1, -0.25, 1.33 - 0.04 * math.sin(k / 5 * P)), garland, seg=5, rings=3)
    sphere(c, 'fanta', 0.04, (0.18, -0.3, 1.43), pink, seg=5, rings=3, scale=(1, 1, 2))
    return join(c, 'spirit_house')


def pots():
    c = coll('pots')
    for i, (x, y, r) in enumerate(((0, 0, 0.26), (0.48, 0.1, 0.2), (-0.42, 0.05, 0.18))):
        cyl(c, 'pot', r, r * 1.5, (x, y, r * 0.75), pot, verts=8, r2=r * 0.8)
        sphere(c, 'bush', r * 1.4, (x, y, r * 1.5 + r * 0.9), leaf if i % 2 == 0 else leaf2, seg=7, rings=5)
    for k in range(4):  # a few spiky leaves on the big pot
        box(c, 'spike', (0.05, 0.02, 0.45), (0, 0, 0.75), leaf2, rot=(0.4, 0, k * P / 2))
    return join(c, 'pots')


lamps = [lamp(), lamp_tx()]
kit = [scooter(), stools(), spirit_house(), pots()]
export(lamps, 'street_lamp.glb')
export(kit, 'street_kit.glb')

if '--' in sys.argv:
    for o, x in zip(lamps, (-2.2, -0.2)):
        o.location.x = x
    for o, x in zip(kit, (1.6, 3.0, 4.4, 5.8)):
        o.location.x = x
    stage(sys.argv[sys.argv.index('--') + 1], target=(1.8, 0, 2.6), az=-20, el=8, dist=14, size=(1200, 800), kid=(0.8, -1.4))
