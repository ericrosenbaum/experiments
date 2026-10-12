// The look: an HDR sky that also lights the scene (so plastic reflects it), a
// sun whose shadow map follows the camera, and a post stack of ambient
// occlusion, a little bloom, a grade and a vignette. Add ?fx=low to the URL
// for a plain look (flat sky color, no reflections or post effects) that
// slow GPUs can keep up with; it drops to that by itself if frames get slow,
// and this browser remembers, so later visits start plain instead of
// switching a few seconds in. ?fx=high forgets that and tries the full look.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { setGloss } from './world/bricks.js';

const SUN_DIR = new THREE.Vector3(30, 50, 20).normalize();
const FX_KEY = 'brick-behaviors.fx'; // 'low' once this browser was too slow for the full look
const store = {
  get() { try { return localStorage.getItem(FX_KEY); } catch { return null; } },
  set(v) { try { if (v) localStorage.setItem(FX_KEY, v); else localStorage.removeItem(FX_KEY); } catch { /* storage blocked */ } },
};
const SHADOW_R = 45; // half-size of the shadow box around the camera target

// Gentle contrast and saturation, then a vignette. Runs on display colors.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.28 }, saturation: { value: 1.06 }, contrast: { value: 1.05 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float vignette, saturation, contrast; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      c = (c - 0.5) * contrast + 0.5;
      vec2 d = vUv - 0.5;
      c *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export class Graphics {
  constructor(container) {
    const asked = location.search.match(/[?&]fx=(low|high)\b/)?.[1];
    if (asked === 'high') store.set(null);
    this.fancy = asked ? asked === 'high' : store.get() !== 'low';
    const renderer = new THREE.WebGLRenderer({ antialias: !this.fancy, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping; // keeps toy colors true where ACES greys them
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500);
    this.hemi = new THREE.HemisphereLight(0xdff1ff, 0x5d7a3a, 1.4);
    this.sun = new THREE.DirectionalLight(0xfff4dd, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.setScalar(this.fancy ? 4096 : 2048);
    Object.assign(this.sun.shadow.camera, { left: -SHADOW_R, right: SHADOW_R, top: SHADOW_R, bottom: -SHADOW_R, near: 1, far: 160 });
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.03; // keeps hat brims from striping the faces under them
    this.sun.shadow.radius = 3;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this._slow = 0;

    if (this.fancy) this._buildComposer();
    setGloss(this.fancy);
    addEventListener('resize', () => this.resize());
  }

  _buildComposer() {
    const { renderer, scene, camera } = this;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    // AO at full size looks best but costs the most; half is plenty here.
    const ao = new GTAOPass(scene, camera, size.x / 2, size.y / 2);
    ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.5, thickness: 1.5, scale: 1.0, samples: 12 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    ao.blendIntensity = 0.9;
    composer.addPass(ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.22, 0.5, 0.92);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    composer.addPass(this.grade);
    this.composer = composer;
    this.ao = ao;
  }

  // The sky is a small HDR equirect: zenith to horizon gradient, a darker band
  // below the horizon, and a sun glow bright enough to bloom. It's both the
  // background and the light the plastic reflects.
  setSky(theme) {
    this.theme = theme;
    if (!this.fancy) {
      this.scene.background = new THREE.Color(theme.sky);
      this.scene.environment = null;
      return;
    }
    const W = 256, H = 128;
    const data = new Float32Array(W * H * 4);
    const light = new Float32Array(W * H * 4); // a greyer copy to light with, so greys stay grey
    const horizon = new THREE.Color(theme.sky);
    const space = !!theme.stars;
    const zenith = space ? new THREE.Color(0x010208) : horizon.clone().multiplyScalar(0.55).lerp(new THREE.Color(0x2f6fd0), 0.35);
    const sunC = new THREE.Color(theme.sun[0]);
    const band = new THREE.Color(0x3a2a6a); // a faint galaxy band in space
    const bandDir = new THREE.Vector3(0.3, 0.5, 0.81).normalize();
    const d = new THREE.Vector3();
    const c = new THREE.Color();
    // three's equirect lookup: u = atan(z, x) / 2pi + 0.5, v = asin(y) / pi + 0.5
    for (let j = 0; j < H; j++) {
      const lat = ((j + 0.5) / H - 0.5) * Math.PI;
      for (let i = 0; i < W; i++) {
        const lon = ((i + 0.5) / W - 0.5) * Math.PI * 2;
        d.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
        const y = d.y;
        if (y >= 0) c.copy(horizon).lerp(zenith, Math.pow(y, 0.6));
        else c.copy(horizon); // below the horizon is all fog
        if (space) {
          const b = Math.exp(-Math.pow(d.dot(bandDir) / 0.18, 2));
          c.lerp(band, b * 0.5);
        }
        const s = Math.max(0, d.dot(SUN_DIR));
        const glow = Math.pow(s, 600) * 40 + Math.pow(s, 24) * (space ? 0.15 : 0.6);
        c.r += sunC.r * glow; c.g += sunC.g * glow; c.b += sunC.b * glow;
        const k = (j * W + i) * 4;
        data[k] = c.r; data[k + 1] = c.g; data[k + 2] = c.b; data[k + 3] = 1;
        const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
        light[k] = l + (c.r - l) * 0.35; light[k + 1] = l + (c.g - l) * 0.35; light[k + 2] = l + (c.b - l) * 0.35; light[k + 3] = 1;
      }
    }
    const equirect = (arr) => {
      const t = new THREE.DataTexture(arr, W, H, THREE.RGBAFormat, THREE.FloatType);
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.magFilter = t.minFilter = THREE.LinearFilter;
      t.needsUpdate = true;
      return t;
    };
    const tex = equirect(data);
    const lightTex = equirect(light);
    this.skyTex?.dispose();
    this.envRT?.dispose();
    this.skyTex = tex;
    this.envRT = this.pmrem.fromEquirectangular(lightTex);
    lightTex.dispose();
    this.scene.background = tex;
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = space ? 0.9 : 0.55;
    if (!space) this.hemi.intensity *= 0.6; // the sky lights things too
    if (this.bloom) this.bloom.strength = space ? 0.45 : 0.22;
  }

  resize() {
    const { renderer, camera, composer } = this;
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    if (composer) {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      composer.setSize(innerWidth, innerHeight);
      this.ao.setSize(size.x / 2, size.y / 2);
    }
  }

  // Keep the shadow map's box centered on what the camera looks at, snapped to
  // whole shadow texels so edges don't shimmer as the camera moves.
  _placeSun(target) {
    const texel = (2 * SHADOW_R) / this.sun.shadow.mapSize.x;
    const p = target.clone();
    p.x = Math.round(p.x / texel) * texel;
    p.z = Math.round(p.z / texel) * texel;
    p.y = 0;
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).addScaledVector(SUN_DIR, 80);
  }

  render(dt, target) {
    this._placeSun(target);
    if (!this.composer) { this.renderer.render(this.scene, this.camera); return; }
    // If it can't keep up, fall back to plain rendering rather than stutter.
    // One long frame (loading, a tab switch) counts as a short one, so only
    // seconds of steady slowness switch it.
    const step = Math.min(dt, 0.25);
    this._slow = dt > 1 / 28 ? this._slow + step : Math.max(0, this._slow - step);
    if (this._slow > 4) {
      console.info('graphics: frames are slow, switching to the plain look; this browser will start that way next time (?fx=high to try again)');
      store.set('low');
      this.composer = null;
      this.fancy = false;
      setGloss(false);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.sun.shadow.mapSize.setScalar(2048);
      this.hemi.intensity = this.theme.hemi[2];
      this.setSky(this.theme);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.composer.render(dt);
  }
}
