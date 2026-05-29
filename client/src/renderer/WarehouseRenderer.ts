import * as THREE from 'three';
import { SceneManager } from './SceneManager';
import {
  FullStatePayload, TickUpdatePayload, WorldConfig,
  Robot, Shelf, Elevator, Parcel, Wall, Conveyor
} from '../types';

const CELL = 1.5;   // world units per grid cell
const FLOOR_H = 5;  // world units per floor

function cellPos(x: number, y: number, floor: number): THREE.Vector3 {
  return new THREE.Vector3(x * CELL, floor * FLOOR_H, y * CELL);
}

// Materials
const MAT = {
  floor:     new THREE.MeshLambertMaterial({ color: 0x1e293b }),
  floorGrid: new THREE.MeshLambertMaterial({ color: 0x334155, transparent: true, opacity: 0.3 }),
  shelf:     new THREE.MeshLambertMaterial({ color: 0x78350f }),
  shelfRack: new THREE.MeshLambertMaterial({ color: 0xb45309 }),
  wall:      new THREE.MeshLambertMaterial({ color: 0x475569 }),
  elevator:  new THREE.MeshLambertMaterial({ color: 0x6366f1, transparent: true, opacity: 0.7 }),
  conveyor:  new THREE.MeshLambertMaterial({ color: 0x0f766e }),
  charging:  new THREE.MeshLambertMaterial({ color: 0x16a34a }),
  operator:  new THREE.MeshLambertMaterial({ color: 0x7c3aed }),
};

export class WarehouseRenderer {
  private sm: SceneManager;
  private worldGroup = new THREE.Group();
  private robotMeshes   = new Map<string, THREE.Group>();
  private parcelMeshes  = new Map<string, THREE.Mesh>();
  private elevatorMeshes = new Map<string, THREE.Mesh>();
  private activeFloor = 0;
  private config?: WorldConfig;

  constructor(sm: SceneManager) {
    this.sm = sm;
    sm.scene.add(this.worldGroup);
  }

  setFloor(floor: number) {
    this.activeFloor = floor;
    this.updateFloorVisibility();
  }

  private updateFloorVisibility() {
    // All floors visible but higher floors are slightly transparent
    this.worldGroup.traverse(obj => {
      if (obj instanceof THREE.Mesh && obj.userData.floor !== undefined) {
        const f = obj.userData.floor as number;
        obj.visible = f === this.activeFloor;
      }
    });
    // Robots/parcels always visible if on active floor
    for (const [, g] of this.robotMeshes) g.visible = g.userData.floor === this.activeFloor;
    for (const [, m] of this.parcelMeshes) m.visible = m.userData.floor === this.activeFloor;
  }

  applyFullState(state: FullStatePayload) {
    this.config = state.config;
    this.worldGroup.clear();
    this.robotMeshes.clear();
    this.parcelMeshes.clear();
    this.elevatorMeshes.clear();

    this.buildFloors(state.config);
    for (const w of state.walls)     this.addWall(w);
    for (const s of state.shelves)   this.addShelf(s);
    for (const e of state.elevators) this.addElevator(e);
    for (const c of state.conveyors) this.addConveyor(c);
    for (const r of state.robots)    this.addRobot(r);
    for (const p of state.parcels)   this.addParcel(p);

    this.updateFloorVisibility();
    this.centerCamera(state.config);
  }

  applyTickUpdate(update: TickUpdatePayload) {
    for (const r of update.robots)    this.updateRobot(r);
    for (const e of update.elevators) this.updateElevator(e);
    for (const p of update.parcels)   this.updateParcel(p);
  }

  animateFrame(dt: number) {
    const speed = 6; // visual interpolation speed
    for (const [, group] of this.robotMeshes) {
      const target = group.userData.targetPos as THREE.Vector3;
      if (target) group.position.lerp(target, Math.min(dt * speed, 1));
    }
  }

  // ── Build floor planes ─────────────────────────────────

  private buildFloors(cfg: WorldConfig) {
    for (let f = 0; f < cfg.floors; f++) {
      const geo = new THREE.PlaneGeometry(cfg.width * CELL, cfg.depth * CELL);
      const mesh = new THREE.Mesh(geo, MAT.floor.clone());
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(
        (cfg.width  / 2 - 0.5) * CELL,
        f * FLOOR_H - 0.01,
        (cfg.depth / 2 - 0.5) * CELL
      );
      mesh.receiveShadow = true;
      mesh.userData.floor = f;
      this.worldGroup.add(mesh);

      // Grid lines
      const grid = new THREE.GridHelper(Math.max(cfg.width, cfg.depth) * CELL, Math.max(cfg.width, cfg.depth), 0x334155, 0x1e293b);
      grid.position.set((cfg.width / 2 - 0.5) * CELL, f * FLOOR_H, (cfg.depth / 2 - 0.5) * CELL);
      grid.userData.floor = f;
      this.worldGroup.add(grid);
    }
  }

  private addWall(w: Wall) {
    const geo = new THREE.BoxGeometry(CELL, CELL * 1.5, CELL);
    const mesh = new THREE.Mesh(geo, MAT.wall);
    mesh.position.copy(cellPos(w.position.x, w.position.y, w.position.floor));
    mesh.position.y += CELL * 0.75;
    mesh.castShadow = true;
    mesh.userData.floor = w.position.floor;
    this.worldGroup.add(mesh);
  }

  private addShelf(s: Shelf) {
    const sp = s.shelfPosition;
    const group = new THREE.Group();
    group.userData.floor = sp.floor;

    // Main frame
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(CELL * 0.9, CELL * 2, CELL * 0.9),
      MAT.shelf
    );
    frame.position.y = CELL;
    frame.castShadow = true;
    group.add(frame);

    // Shelf levels
    const levels = Math.min(s.rows, 4);
    for (let r = 0; r < levels; r++) {
      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(CELL * 0.85, 0.05, CELL * 0.85),
        MAT.shelfRack
      );
      plank.position.y = 0.3 + r * 0.55;
      group.add(plank);
    }

    const base = cellPos(sp.x, sp.y, sp.floor);
    group.position.copy(base);
    this.worldGroup.add(group);
  }

  private addElevator(e: Elevator) {
    for (const f of e.floors) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(CELL, CELL * 3, CELL),
        MAT.elevator.clone()
      );
      mesh.position.copy(cellPos(e.x, e.y, f));
      mesh.position.y += CELL * 1.5;
      mesh.userData.floor = f;
      this.worldGroup.add(mesh);
      this.elevatorMeshes.set(`${e.id}-${f}`, mesh);
    }
  }

  private addConveyor(c: Conveyor) {
    for (const cc of c.cells) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(CELL * 0.9, 0.12, CELL * 0.9),
        MAT.conveyor
      );
      const p = cellPos(cc.x, cc.y, cc.floor);
      mesh.position.set(p.x, p.y + 0.06, p.z);
      mesh.userData.floor = cc.floor;
      this.worldGroup.add(mesh);

      // Arrow indicator
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.15, 0.3, 4),
        new THREE.MeshLambertMaterial({ color: 0x99f6e4 })
      );
      arrow.position.set(p.x, p.y + 0.25, p.z);
      const rot = { N: 0, S: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 }[cc.direction] ?? 0;
      arrow.rotation.y = rot;
      arrow.rotation.z = -Math.PI / 2;
      arrow.userData.floor = cc.floor;
      this.worldGroup.add(arrow);
    }
  }

  private addRobot(r: Robot) {
    const group = new THREE.Group();
    const bodyColor = parseInt(r.color.replace('#', ''), 16);

    // Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(CELL * 0.55, CELL * 0.45, CELL * 0.55),
      new THREE.MeshLambertMaterial({ color: bodyColor })
    );
    body.position.y = 0.33;
    body.castShadow = true;
    group.add(body);

    // Head/sensor dome
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(CELL * 0.2, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0xf8fafc })
    );
    head.position.y = 0.62;
    group.add(head);

    // Status LED
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x22c55e })
    );
    led.position.set(0, 0.75, CELL * 0.2);
    led.name = 'led';
    group.add(led);

    // Wheels (4 corners)
    const wheelGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.06, 8);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    for (const [wx, wz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]] as [number, number][]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.1, wz);
      group.add(w);
    }

    const pos = cellPos(r.position.x, r.position.y, r.position.floor);
    group.position.copy(pos);
    group.userData.targetPos = pos.clone();
    group.userData.floor = r.position.floor;
    group.userData.id = r.id;
    this.robotMeshes.set(r.id, group);
    this.worldGroup.add(group);
  }

  private addParcel(p: Parcel) {
    const color = parseInt(p.color.replace('#', ''), 16);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(CELL * 0.4, CELL * 0.35, CELL * 0.4),
      new THREE.MeshLambertMaterial({ color })
    );
    mesh.castShadow = true;
    this.parcelMeshes.set(p.id, mesh);
    this.worldGroup.add(mesh);
    this.updateParcel(p);
  }

  private updateRobot(r: Robot) {
    let group = this.robotMeshes.get(r.id);
    if (!group) { this.addRobot(r); group = this.robotMeshes.get(r.id)!; }

    const target = cellPos(r.position.x, r.position.y, r.position.floor);
    group.userData.targetPos = target;
    group.userData.floor = r.position.floor;

    // Update LED color by status
    const led = group.getObjectByName('led') as THREE.Mesh | undefined;
    if (led) {
      const mat = led.material as THREE.MeshBasicMaterial;
      if (r.status === 'idle')         mat.color.setHex(0x22c55e);
      else if (r.status.startsWith('navigating')) mat.color.setHex(0x3b82f6);
      else if (r.status === 'picking_up' || r.status === 'dropping_off') mat.color.setHex(0xf59e0b);
      else if (r.status === 'in_elevator') mat.color.setHex(0xa855f7);
      else mat.color.setHex(0x64748b);
    }
    this.updateFloorVisibility();
  }

  private updateParcel(p: Parcel) {
    const mesh = this.parcelMeshes.get(p.id);
    if (!mesh) { this.addParcel(p); return; }

    if (p.status === 'being_carried' && p.carriedBy) {
      const robot = this.robotMeshes.get(p.carriedBy);
      if (robot) {
        mesh.position.copy(robot.userData.targetPos as THREE.Vector3);
        mesh.position.y += 0.7;
        mesh.userData.floor = robot.userData.floor;
      }
    } else if (p.position) {
      const pos = cellPos(p.position.x, p.position.y, p.position.floor);
      mesh.position.copy(pos);
      mesh.position.y += 0.25;
      mesh.userData.floor = p.position.floor;
    } else if (p.shelfId) {
      mesh.visible = false;
      return;
    }
    mesh.visible = mesh.userData.floor === this.activeFloor;
  }

  private updateElevator(e: Elevator) {
    const m = this.elevatorMeshes.get(`${e.id}-${e.currentFloor}`);
    if (!m) return;
    const mat = m.material as THREE.MeshLambertMaterial;
    mat.color.setHex(e.status === 'doors_open' ? 0x22d3ee : 0x6366f1);
  }

  private centerCamera(cfg: WorldConfig) {
    const cx = (cfg.width  / 2) * CELL;
    const cz = (cfg.depth  / 2) * CELL;
    this.sm.controls.target.set(cx, 0, cz);
    this.sm.camera.position.set(cx + 20, 25, cz + 20);
    this.sm.controls.update();
  }
}
