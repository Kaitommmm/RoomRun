import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { offsetLayer } from '../src/render/people.js';

describe('offsetLayer', () => {
  it('offsets on top of a clip never pile up, even when time is frozen (hit-stop) or the track is constant', () => {
    const root = new THREE.Object3D();
    const bone = new THREE.Bone(); bone.name = 'b'; root.add(bone);
    const clip = new THREE.AnimationClip('c', 1, [new THREE.QuaternionKeyframeTrack('b.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])]);
    const mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(clip).play();
    const layer = offsetLayer([bone]);
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.1);
    for (let i = 0; i < 10; i++) {
      layer.undo();
      mixer.update(0);
      layer.keep();
      bone.quaternion.premultiply(turn);
    }
    expect(bone.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0.1);
  });
});
