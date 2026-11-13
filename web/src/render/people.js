// Soi people: the rigged figures from art/blender/people.py on the spots the street
// leaves for them (environment.peopleSpots). A small pool of skinned clones follows
// the live spots near the kid; each plays its idle, turns its head to the kid as it
// passes and startles on a nearby crash or in the caught cutscene. No outline, no gameplay.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadModel } from './models.js';
import { toonMaterial } from './toon.js';
import { PEOPLE, headYaw, lookYaw, startleWeight, ease } from './peopleLogic.js';

const KINDS = ['vendor', 'rider', 'sit_uncle', 'sit_auntie'];
const MAX_LIVE = 6;
/** Spots taken this far ahead of / behind the kid, metres. */
const AHEAD = 70, BEHIND = 20;
/** Startle pose at full weight, rad: spine leans back, shoulders up. */
const LEAN = 0.25, SHRUG = 0.15;
const TURN_RATE = 6;
/** Share of a head turn the upper body takes, so it isn't the head alone. */
const BODY_SHARE = 0.35;

const up = new THREE.Vector3(0, 1, 0);
const v = new THREE.Vector3(), axis = new THREE.Vector3(), front = new THREE.Vector3(), side = new THREE.Vector3();
const q = new THREE.Quaternion(), qa = new THREE.Quaternion();

/** Turns `bone` by `angle` about a world-space axis, in its parent's frame (on top of the clip pose). */
function turnBone(bone, worldAxis, angle) {
  if (!bone || !angle) return;
  bone.parent.getWorldQuaternion(q).invert();
  axis.copy(worldAxis).applyQuaternion(q);
  bone.quaternion.premultiply(qa.setFromAxisAngle(axis, angle));
}

/**
 * Offsets on top of a clip (head turn, startle) have to come off before the mixer runs: it only
 * writes a bone whose clip value changed, so on a constant track or in hit-stop (dt 0) an offset
 * left on would pile up every frame. Per frame: undo(), mixer.update(), keep(), add the offsets.
 * @param {THREE.Object3D[]} bones
 */
export function offsetLayer(bones) {
  const base = bones.map((b) => b.quaternion.clone());
  return {
    undo() { bones.forEach((b, i) => b.quaternion.copy(base[i])); },
    keep() { bones.forEach((b, i) => base[i].copy(b.quaternion)); },
  };
}

/**
 * @param {THREE.Scene} scene
 * @returns {{ sync(spots: Array<{ id: string, kind: string, x: number, z: number, ry: number }>, kid: { x: number, z: number }, phase: string, dt: number): void, onEvent(e: string): void }}
 */
export function createPeople(scene) {
  /** @type {Record<string, { node: THREE.Object3D, clip: THREE.AnimationClip }> | null} */
  let templates = null;
  loadModel('people').then((obj) => {
    const clips = obj.userData.animations ?? [];
    const found = {};
    for (const kind of KINDS) {
      const node = obj.getObjectByName(kind);
      const clip = clips.find((c) => c.name === `${kind}_idle`);
      if (!node || !clip) return;
      // colours are baked per vertex: one material, one draw call per figure
      node.traverse((o) => { if (o.isMesh) o.material = toonMaterial(0xffffff, { vertexColors: true }); });
      found[kind] = { node, clip };
    }
    templates = found;
  }).catch(() => {}); // no people.glb: the street just has no people

  const pool = Object.fromEntries(KINDS.map((k) => [k, []]));
  /** @type {Map<string, any>} spot id -> live figure */
  const live = new Map();
  const kidAt = { x: 0, z: 0 };

  function make(kind) {
    const { node, clip } = templates[kind];
    const holder = new THREE.Group();
    const figure = cloneSkinned(node); // keeps its own offset: sitters sit in stools space
    holder.add(figure);
    scene.add(holder);
    const mixer = new THREE.AnimationMixer(figure);
    const action = mixer.clipAction(clip).play();
    // the four figures share bone names, so GLTFLoader suffixes them per figure (mixamorigHead_3)
    const bones = {};
    figure.traverse((o) => { if (o.isBone) bones[o.name.replace(/^mixamorig|_\d+$/g, '')] = o; });
    const bone = (n) => bones[n];
    const f = { kind, holder, figure, mixer, action, clip, head: bone('Head'), spine: bone('Spine'), chest: bone('Spine2'),
      shoulders: [bone('LeftShoulder'), bone('RightShoulder')], yaw: 0, startle: Infinity };
    f.layer = offsetLayer([f.spine, f.chest, ...f.shoulders, f.head].filter(Boolean));
    return f;
  }

  function take(spot) {
    const f = pool[spot.kind].pop() ?? make(spot.kind);
    f.holder.position.set(spot.x, 0, spot.z);
    f.holder.rotation.y = spot.ry;
    f.holder.visible = true;
    f.action.time = Math.random() * f.clip.duration; // neighbours don't move in step
    f.yaw = 0;
    f.startle = Infinity;
    return f;
  }

  function release(id, f) {
    f.holder.visible = false;
    f.startle = Infinity;
    pool[f.kind].push(f);
    live.delete(id);
  }

  const wanted = [];
  const wantedIds = new Set();
  return {
    sync(spots, kid, phase, dt) {
      if (!templates) return;
      kidAt.x = kid.x; kidAt.z = kid.z;
      wanted.length = 0;
      for (const s of spots) {
        const ahead = kid.z - s.z; // the kid runs toward -z
        if (ahead <= AHEAD && ahead >= -BEHIND && templates[s.kind]) wanted.push(s);
      }
      wanted.sort((a, b) => Math.abs(kid.z - a.z) - Math.abs(kid.z - b.z));
      wanted.length = Math.min(wanted.length, MAX_LIVE);
      wantedIds.clear();
      for (const s of wanted) wantedIds.add(s.id);
      for (const [id, f] of live) if (!wantedIds.has(id)) release(id, f);
      for (const s of wanted) if (!live.has(s.id)) live.set(s.id, take(s));

      const caught = phase === 'caught';
      for (const f of live.values()) {
        f.layer.undo();
        f.mixer.update(dt);
        f.layer.keep();
        f.figure.updateMatrixWorld(true);
        f.head.getWorldPosition(v);
        f.figure.getWorldDirection(front);
        const facing = Math.atan2(front.x, front.z);
        const dx = kid.x - v.x, dz = kid.z - v.z;
        if (caught && dx * dx + dz * dz < PEOPLE.startleRange * PEOPLE.startleRange) f.startle = 0.3; // hold at full
        else if (f.startle !== Infinity) f.startle += dt;
        const w = startleWeight(f.startle);

        f.yaw = ease(f.yaw, headYaw(v.x, v.z, facing, kid.x, kid.z, PEOPLE.maxYaw, f.yaw), TURN_RATE, dt);
        const yaw = w ? f.yaw + (lookYaw(v.x, v.z, facing, kid.x, kid.z, PEOPLE.maxYaw, f.yaw) - f.yaw) * w : f.yaw;
        side.set(1, 0, 0).transformDirection(f.figure.matrixWorld); // the figure's left
        turnBone(f.spine, side, -LEAN * w); // + would tip the top forward
        turnBone(f.shoulders[0], front, SHRUG * w);
        turnBone(f.shoulders[1], front, -SHRUG * w);
        turnBone(f.chest, up, yaw * BODY_SHARE);
        turnBone(f.head, up, yaw * (1 - BODY_SHARE));
      }
    },
    onEvent(e) {
      if (e === 'hit') {
        for (const f of live.values()) {
          const dx = kidAt.x - f.holder.position.x, dz = kidAt.z - f.holder.position.z;
          if (dx * dx + dz * dz < PEOPLE.startleRange * PEOPLE.startleRange) f.startle = 0; // restart, never stack
        }
      } else if (e === 'run-start') for (const f of live.values()) { f.startle = Infinity; f.yaw = 0; }
    },
  };
}
