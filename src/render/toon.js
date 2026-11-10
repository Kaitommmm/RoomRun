// One shared cartoon look: 4-step toon shading, plus thin black inverted-hull
// outlines on characters only (the street stays clean). Every model (code
// stand-ins, Blender props, picture-to-3D characters) goes through here so they all match.
import * as THREE from 'three';

let gradient = null;
/** 4 flat light bands instead of smooth shading. */
export function gradientMap() {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([100, 160, 215, 255]), 4, 1, THREE.RedFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

const toonCache = new Map();

/**
 * @param {number} color
 * @param {{ emissive?: number, emissiveIntensity?: number, vertexColors?: boolean, map?: THREE.Texture }} [opts]
 * @returns {THREE.MeshToonMaterial} shared per argument set; clone before changing it per object
 */
export function toonMaterial(color, { emissive = 0, emissiveIntensity = 1, vertexColors = false, map } = {}) {
  const key = `${color}|${emissive}|${emissiveIntensity}|${vertexColors}|${map ? map.uuid : ''}`;
  let m = toonCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, emissive, emissiveIntensity, vertexColors, gradientMap: gradientMap() });
    if (map) m.map = map;
    toonCache.set(key, m);
  }
  return m;
}

/**
 * Character-only look (kid, dogs), shared by every character material and live-tunable:
 * floor = flat colour they never drop below (cartoon self-lit, so they read in the dark soi);
 * rim = hard-edged back light in the street lamps' warm yellow.
 */
export const CHARACTER_LOOK = {
  floor: { value: 0.55 },
  rimColor: { value: new THREE.Color(0xffc060) },
  rimStrength: { value: 0.22 },
};

function characterCompile(shader) {
  Object.assign(shader.uniforms, { charFloor: CHARACTER_LOOK.floor, rimColor: CHARACTER_LOOK.rimColor, rimStrength: CHARACTER_LOOK.rimStrength });
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float charFloor;\nuniform vec3 rimColor;\nuniform float rimStrength;')
    .replace('#include <opaque_fragment>', `
    // brighten dim light up to the floor by scaling it, so the lamps' warm tint stays
    float litLum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
    float floorLum = charFloor * dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    outgoingLight *= max(1.0, floorLum / max(litLum, 1e-4));
    float rimDot = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
    outgoingLight += rimColor * smoothstep(0.66, 0.7, rimDot) * rimStrength;
    #include <opaque_fragment>`);
}

/**
 * Gives a toon material the character look, in place. Material.clone drops it
 * (userData.rim survives, so callers can re-add it).
 * @param {THREE.Material} material
 */
export function withRim(material) {
  if (material.onBeforeCompile === characterCompile) return material;
  material.onBeforeCompile = characterCompile;
  material.customProgramCacheKey = () => 'toon-character';
  material.userData.rim = true;
  material.needsUpdate = true;
  return material;
}

const outlineCache = new Map();

/** Canvas size in CSS pixels; the renderer keeps it current so outlines stay a fixed width on screen. */
export const OUTLINE_RESOLUTION = { value: new THREE.Vector2(1280, 720) };

/**
 * Black back faces pushed out along smoothed normals, in screen space, so the
 * line is `thickness` CSS pixels wide near or far (no chunky bars up close,
 * no sub-pixel flicker far away).
 */
export function outlineMaterial(thickness = 1.5) {
  let m = outlineCache.get(thickness);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.outlineThickness = { value: thickness };
      shader.uniforms.outlineResolution = OUTLINE_RESOLUTION;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 outlineNormal;\nuniform float outlineThickness;\nuniform vec2 outlineResolution;')
        // skinned meshes skin objectNormal, so feed it the smoothed normal
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = outlineNormal;')
        .replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef USE_SKINNING
          vec3 outN = objectNormal;
        #else
          vec3 outN = outlineNormal;
        #endif
        vec2 dir = (projectionMatrix * vec4(normalMatrix * outN, 0.0)).xy;
        float len = length(dir);
        if (len > 1e-5) gl_Position.xy += dir / len * outlineThickness * 2.0 / outlineResolution * gl_Position.w;`);
    };
    m.customProgramCacheKey = () => `outline-${thickness}`;
    outlineCache.set(thickness, m);
  }
  return m;
}

/**
 * Adds an `outlineNormal` attribute: normals averaged over vertices that share
 * a position, so a box's shell stays closed at the corners.
 * @param {THREE.BufferGeometry} geometry changed in place and returned
 */
export function withOutlineNormals(geometry) {
  if (geometry.getAttribute('outlineNormal')) return geometry;
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  const pos = geometry.getAttribute('position');
  const nor = geometry.getAttribute('normal');
  const sums = new Map();
  const keyOf = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = keyOf(i);
    const s = sums.get(k) || [0, 0, 0];
    s[0] += nor.getX(i); s[1] += nor.getY(i); s[2] += nor.getZ(i);
    sums.set(k, s);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = sums.get(keyOf(i));
    const len = Math.hypot(x, y, z) || 1;
    out[i * 3] = x / len; out[i * 3 + 1] = y / len; out[i * 3 + 2] = z / len;
  }
  geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(out, 3));
  return geometry;
}

const outlinedGeometries = new WeakMap();

/**
 * Black inverted-hull outline as a child of `mesh` (works for skinned meshes).
 * @param {THREE.Mesh} mesh
 * @returns {THREE.Mesh} the outline mesh
 */
export function addOutline(mesh, thickness = 1.5) {
  let geo = outlinedGeometries.get(mesh.geometry);
  if (!geo) {
    geo = withOutlineNormals(mesh.geometry.clone());
    outlinedGeometries.set(mesh.geometry, geo);
  }
  const mat = outlineMaterial(thickness);
  let outline;
  if (/** @type {any} */ (mesh).isSkinnedMesh) {
    const skinned = /** @type {THREE.SkinnedMesh} */ (mesh);
    outline = new THREE.SkinnedMesh(geo, mat);
    outline.bind(skinned.skeleton, skinned.bindMatrix);
  } else {
    outline = new THREE.Mesh(geo, mat);
  }
  outline.name = `${mesh.name || 'mesh'}-outline`;
  outline.raycast = () => {};
  mesh.add(outline);
  return outline;
}
