import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class SceneManager {
  renderer: THREE.WebGLRenderer;
  scene   : THREE.Scene;
  camera  : THREE.PerspectiveCamera;
  controls: OrbitControls;
  private raf = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x0f172a);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0f172a, 40, 120);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    this.camera.position.set(20, 25, 25);
    this.camera.lookAt(10, 0, 8);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance  = 5;
    this.controls.maxDistance  = 100;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;

    this.setupLights();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private setupLights() {
    const ambient = new THREE.AmbientLight(0x94a3b8, 0.6);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(20, 40, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far  = 200;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -60;
    sun.shadow.camera.right = sun.shadow.camera.top   =  60;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x6366f1, 0.3);
    fill.position.set(-10, 10, -10);
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

  stopLoop() { cancelAnimationFrame(this.raf); }
}
