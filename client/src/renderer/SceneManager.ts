import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class SceneManager {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  private raf = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0xbdd5de); // warehouse ceiling / sky

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xbdd5de, 50, 130);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 500);
    this.camera.position.set(20, 28, 28);
    this.camera.lookAt(10, 0, 8);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 110;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.04;

    this.setupLights();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private setupLights() {
    // Hemisphere: warm sky above, cool ground below — warehouse feel
    const hemi = new THREE.HemisphereLight(0xfff4e0, 0xd8dde0, 0.75);
    this.scene.add(hemi);

    // Main overhead sun — harsh industrial directional
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(15, 40, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -70;
    sun.shadow.camera.right = sun.shadow.camera.top = 70;
    sun.shadow.bias = -0.0003;
    this.scene.add(sun);

    // Soft fill from opposite side
    const fill = new THREE.DirectionalLight(0xd0e8ff, 0.45);
    fill.position.set(-10, 15, -5);
    this.scene.add(fill);
  }

  resize() {
    const w = this.renderer.domElement.parentElement!.clientWidth;
    const h = this.renderer.domElement.parentElement!.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  startLoop(onFrame?: (dt: number) => void) {
    let last = 0;
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      onFrame?.(dt);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stopLoop() {
    cancelAnimationFrame(this.raf);
  }
}
