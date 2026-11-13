// WebGL renderer, mood A "neon soi night" sky and fog, bloom on the neon.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OUTLINE_RESOLUTION } from './toon.js';

export const MOOD = {
  skyTop: 0x1b0f45, skyLow: 0x7a3f86, fog: 0x5a2f72, fogNear: 22, fogFar: 125,
  hemiSky: 0x9a8cff, hemiGround: 0x3a2440, hemi: 0.6, moon: 0xffc890, moonI: 0.35,
  lamp: 0xffa040,
  // Only colours pushed above 1.0 (neon signs, lamp bulbs, lit windows) bloom.
  bloom: { strength: 0.85, radius: 0.5, threshold: 1.0 },
  exposure: 0.95,
};

function skyTexture(top, low) {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 512);
  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
  grd.addColorStop(0, hex(top));
  grd.addColorStop(0.75, hex(low));
  grd.addColorStop(1, hex(MOOD.fog));
  g.fillStyle = grd;
  g.fillRect(0, 0, 2, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** @param {HTMLCanvasElement} canvas */
export function createRenderer(canvas) {
  let quality = 'standard';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // filmic curve: neon rolls off softly instead of clipping flat; OutputPass applies it
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = MOOD.exposure;

  const scene = new THREE.Scene();
  scene.background = skyTexture(MOOD.skyTop, MOOD.skyLow);
  scene.fog = new THREE.Fog(MOOD.fog, MOOD.fogNear, MOOD.fogFar);
  scene.add(new THREE.HemisphereLight(MOOD.hemiSky, MOOD.hemiGround, MOOD.hemi));
  const moon = new THREE.DirectionalLight(MOOD.moon, MOOD.moonI);
  moon.position.set(-4, 10, 6);
  scene.add(moon);

  const camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.3, 400); // near 0.3 (not 0.1): 3x depth precision, less far-away z-fighting

  // Multisampled HDR target so outlines stay smooth and neon can go above 1.0.
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const { strength, radius, threshold } = MOOD.bloom;
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), strength, radius, threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'battery' ? 1 : 2));
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    OUTLINE_RESOLUTION.value.set(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  resize();

  return {
    renderer,
    scene,
    camera,
    composer,
    bloom,
    render() { composer.render(); },
    resize,
    setQuality(value) {
      quality = value === 'battery' ? 'battery' : 'standard';
      bloom.enabled = quality !== 'battery';
      resize();
    },
  };
}
