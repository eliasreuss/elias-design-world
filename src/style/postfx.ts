import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Runs after OutputPass, so it works on display (sRGB) values.
const PrintShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uDpr: { value: 1 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uDpr;
    uniform float uTime;
    varying vec2 vUv;

    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }

    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      // alpha is 1 where the world was drawn, 0 on the empty background
      float mask = smoothstep(0.0, 1.0, src.a);
      vec3 c = src.rgb / max(src.a, 0.001);
      vec2 px = gl_FragCoord.xy / uDpr;

      // warm grade: cream highlights, plum-brown shadows
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c *= vec3(1.03, 1.0, 0.92);
      c = mix(c, c * vec3(0.92, 0.82, 0.9) + vec3(0.03, 0.015, 0.03), (1.0 - l) * 0.55);

      // static paper fibre, as if printed on rough stock
      float fibre = vnoise(px * vec2(0.12, 0.5)) * 0.4 + vnoise(px * 0.9) * 0.35 + hash(floor(px)) * 0.25;
      c *= 1.0 + (fibre - 0.5) * 0.14;

      // film grain that "boils" at 12 fps rather than fizzing every frame
      float t = floor(uTime * 12.0);
      float g = hash(floor(px) + vec2(t * 17.0, t * 31.0)) - 0.5;
      c += g * 0.09 * (0.55 + l * 0.6);

      // premultiplied: the canvas stays see-through wherever there is no world,
      // so the page's own colour is the background and nothing has to match it
      gl_FragColor = vec4(clamp(c, 0.0, 1.0) * mask, mask);
    }
  `,
};

export class PrintFx {
  private readonly composer: EffectComposer;
  private readonly print: ShaderPass;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.composer.addPass(new OutputPass());
    this.print = new ShaderPass(PrintShader);
    this.composer.addPass(this.print);
  }

  setSize(width: number, height: number): void {
    const dpr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(width, height);
    this.print.uniforms.uDpr.value = dpr;
  }

  render(time: number): void {
    this.print.uniforms.uTime.value = time;
    this.composer.render();
  }
}
