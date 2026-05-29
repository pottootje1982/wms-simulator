import * as THREE from 'three';
import { SceneManager } from './SceneManager';
import {
  FullStatePayload,
  TickUpdatePayload,
  WorldConfig,
  Robot,
  Shelf,
  Elevator,
  Parcel,
  Wall,
  Conveyor,
  ConveyorDir,
  ConveyorCell,
} from '../types';

const CELL = 1.5; // world units per grid cell
const FLOOR_H = 5.5; // world units per floor (tall enough for racks + clearance)

function cellPos(x: number, y: number, floor: number): THREE.Vector3 {
  return new THREE.Vector3(x * CELL, floor * FLOOR_H, y * CELL);
}

function hexColor(c: string): number {
  return parseInt(c.replace('#', '0x'), 16);
}

function dirBetween(a: ConveyorCell, b: ConveyorCell): ConveyorDir {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  return Math.abs(dx) > Math.abs(dy)
    ? dx > 0
      ? 'E'
      : 'W'
    : dy > 0
      ? 'S'
      : 'N';
}

// ── Shared materials (created once) ───────────────────────

const M = {
  wall: new THREE.MeshLambertMaterial({ color: 0x8fa4ad }),
  rackUpright: new THREE.MeshLambertMaterial({ color: 0x5a6d7a }),
  rackBeam: new THREE.MeshLambertMaterial({ color: 0x6d8290 }),
  rackPlank: new THREE.MeshLambertMaterial({ color: 0x9eb8c2 }),
  rackBack: new THREE.MeshLambertMaterial({
    color: 0x7a9ba8,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
  }),
  convFrame: new THREE.MeshLambertMaterial({ color: 0x3d4a55 }),
  convBelt: new THREE.MeshLambertMaterial({ color: 0x505f6e }),
  convEdge: new THREE.MeshLambertMaterial({ color: 0xe8a020 }), // safety yellow
  elevFrame: new THREE.MeshLambertMaterial({
    color: 0x7a9ab0,
    transparent: true,
    opacity: 0.55,
  }),
  elevDoor: new THREE.MeshLambertMaterial({ color: 0xb0c8d8 }),
  wheel: new THREE.MeshLambertMaterial({ color: 0x2d3748 }),
};

// ── Floor tile canvas texture ──────────────────────────────

function makeFloorTexture(): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#d5d0c8';
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#c4bfb7';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, S - 2, S - 2);
  // Subtle inner highlight
  ctx.strokeStyle = '#dbd6ce';
  ctx.lineWidth = 1;
  ctx.strokeRect(3, 3, S - 6, S - 6);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ── Conveyor belt arrow texture ────────────────────────────

function makeConveyorTexture(dir: ConveyorDir): THREE.CanvasTexture {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#505f6e';
  ctx.fillRect(0, 0, S, S);

  // Diagonal stripes as belt texture
  ctx.strokeStyle = '#6a8090';
  ctx.lineWidth = 7;
  for (let i = -S; i < S * 2; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + S, S);
    ctx.stroke();
  }

  // Directional chevron arrow
  ctx.fillStyle = '#7a8f9f';
  ctx.strokeStyle = '#7a8f9f';
  ctx.lineWidth = 3;
  ctx.save();
  ctx.translate(S / 2, S / 2);
  const angle = { N: -Math.PI / 2, S: Math.PI / 2, E: 0, W: Math.PI }[dir] ?? 0;
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-8, -9);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-8, 9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  return new THREE.CanvasTexture(c);
}

export class WarehouseRenderer {
  private sm: SceneManager;
  private worldGroup = new THREE.Group();
  private robotMeshes = new Map<string, THREE.Group>();
  private parcelMeshes = new Map<string, THREE.Mesh>();
  private elevatorMeshes = new Map<string, THREE.Group>();
  private conveyorBelts: THREE.Mesh[] = []; // for UV scroll animation
  private activeFloor = 0;

  constructor(sm: SceneManager) {
    this.sm = sm;
    sm.scene.add(this.worldGroup);
  }

  setFloor(floor: number) {
    this.activeFloor = floor;
    this.updateFloorVisibility();
  }

  private updateFloorVisibility() {
    this.worldGroup.traverse((obj) => {
      if (obj.userData.floor !== undefined)
        obj.visible = (obj.userData.floor as number) === this.activeFloor;
    });
    for (const [, g] of this.robotMeshes)
      g.visible = g.userData.floor === this.activeFloor;
    for (const [, m] of this.parcelMeshes)
      m.visible = m.userData.floor === this.activeFloor;
  }

  // ── State application ──────────────────────────────────

  applyFullState(state: FullStatePayload) {
    this.worldGroup.clear();
    this.robotMeshes.clear();
    this.parcelMeshes.clear();
    this.elevatorMeshes.clear();
    this.conveyorBelts = [];

    this.buildFloors(state.config);
    for (const w of state.walls) this.addWall(w);
    for (const s of state.shelves) this.addShelf(s);
    for (const e of state.elevators) this.addElevator(e);
    for (const c of state.conveyors) this.addConveyor(c);
    for (const r of state.robots) this.addRobot(r);
    for (const p of state.parcels) this.addParcel(p);

    this.updateFloorVisibility();
    this.centerCamera(state.config);
  }

  applyTickUpdate(update: TickUpdatePayload) {
    for (const r of update.robots) this.updateRobot(r);
    for (const e of update.elevators) this.updateElevator(e);
    for (const p of update.parcels) this.updateParcel(p);
  }

  animateFrame(dt: number) {
    const speed = 7;

    // Smooth robot movement
    for (const [, group] of this.robotMeshes) {
      const target = group.userData.targetPos as THREE.Vector3;
      if (target) group.position.lerp(target, Math.min(dt * speed, 1));
    }

    // Smooth parcel movement
    for (const [, mesh] of this.parcelMeshes) {
      const group = mesh as unknown as THREE.Group;
      const carriedBy = group.userData.carriedBy as string | null;
      if (carriedBy) {
        const robot = this.robotMeshes.get(carriedBy);
        if (robot) {
          group.position.copy(robot.position);
          group.position.y += 0.56;
          group.userData.floor = robot.userData.floor;
        }
      } else {
        const target = group.userData.targetPos as THREE.Vector3 | null;
        if (target) group.position.lerp(target, Math.min(dt * speed, 1));
      }
    }

    // Scroll conveyor belt UV
    const beltSpeed = 1.0;
    for (const mesh of this.conveyorBelts) {
      const mat = mesh.material as THREE.MeshLambertMaterial;
      if (mat.map) {
        const dir = mesh.userData.direction as ConveyorDir;
        if (dir === 'E') mat.map.offset.x += dt * beltSpeed;
        if (dir === 'W') mat.map.offset.x -= dt * beltSpeed;
        if (dir === 'S') mat.map.offset.y -= dt * beltSpeed;
        if (dir === 'N') mat.map.offset.y += dt * beltSpeed;
        mat.map.needsUpdate = true;
      }
    }
  }

  // ── Floor ──────────────────────────────────────────────

  private buildFloors(cfg: WorldConfig) {
    const floorTex = makeFloorTexture();

    for (let f = 0; f < cfg.floors; f++) {
      // Tile the texture so each grid cell = 1 tile
      const tileTex = floorTex.clone();
      tileTex.repeat.set(cfg.width, cfg.depth);
      tileTex.needsUpdate = true;

      const geo = new THREE.PlaneGeometry(cfg.width * CELL, cfg.depth * CELL);
      const mat = new THREE.MeshLambertMaterial({ map: tileTex });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(
        (cfg.width / 2) * CELL,
        f * FLOOR_H - 0.01,
        (cfg.depth / 2) * CELL,
      );
      mesh.receiveShadow = true;
      mesh.userData.floor = f;
      this.worldGroup.add(mesh);

      // Yellow aisle marking lines (every 3 cells)
      const aisleGroup = new THREE.Group();
      aisleGroup.userData.floor = f;
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xe8c14a,
        transparent: true,
        opacity: 0.4,
      });
      for (let x = 0; x <= cfg.width; x += 3) {
        const pts = [
          new THREE.Vector3(x * CELL, f * FLOOR_H + 0.01, 0),
          new THREE.Vector3(x * CELL, f * FLOOR_H + 0.01, cfg.depth * CELL),
        ];
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          lineMat,
        );
        aisleGroup.add(line);
      }
      this.worldGroup.add(aisleGroup);

      // Upper floor structure: add a ceiling/mezzanine for floors > 0
      if (f > 0) {
        const ceilGeo = new THREE.PlaneGeometry(
          cfg.width * CELL,
          cfg.depth * CELL,
        );
        const ceilMat = new THREE.MeshLambertMaterial({
          color: 0xb8c8cc,
          side: THREE.BackSide,
          transparent: true,
          opacity: 0.3,
        });
        const ceil = new THREE.Mesh(ceilGeo, ceilMat);
        ceil.rotation.x = -Math.PI / 2;
        ceil.position.set(
          (cfg.width / 2) * CELL,
          f * FLOOR_H - 0.01,
          (cfg.depth / 2) * CELL,
        );
        ceil.userData.floor = f - 1;
        this.worldGroup.add(ceil);
      }
    }
  }

  // ── Wall ──────────────────────────────────────────────

  private addWall(w: Wall) {
    const { x, y, floor } = w.position;
    const group = new THREE.Group();
    group.userData.floor = floor;

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(CELL, FLOOR_H * 0.65, CELL),
      M.wall,
    );
    body.position.set(0, FLOOR_H * 0.325, 0);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Horizontal band detail
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(CELL + 0.02, 0.08, CELL + 0.02),
      new THREE.MeshLambertMaterial({ color: 0xf5c518 }), // yellow safety stripe
    );
    band.position.y = 0.25;
    group.add(band);

    const base = cellPos(x, y, floor);
    group.position.copy(base);
    this.worldGroup.add(group);
  }

  // ── Shelf rack ────────────────────────────────────────

  private addShelf(s: Shelf) {
    const sp = s.shelfPosition;
    const group = new THREE.Group();
    group.userData.floor = sp.floor;

    const W = CELL * 0.88;
    const D = CELL * 0.52;
    const levels = Math.min(s.rows, 5);
    const rackH = 0.5 + levels * 0.58;
    const levelH = rackH / (levels + 0.5);

    // 4 corner uprights
    const upGeo = new THREE.BoxGeometry(0.055, rackH, 0.055);
    for (const [ux, uz] of [
      [-W / 2 + 0.04, -D / 2 + 0.04],
      [W / 2 - 0.04, -D / 2 + 0.04],
      [-W / 2 + 0.04, D / 2 - 0.04],
      [W / 2 - 0.04, D / 2 - 0.04],
    ]) {
      const up = new THREE.Mesh(upGeo, M.rackUpright);
      up.position.set(ux, rackH / 2, uz);
      up.castShadow = true;
      group.add(up);
    }

    // Shelf planks + front/back cross-beams at each level
    const plankGeo = new THREE.BoxGeometry(W - 0.04, 0.04, D - 0.04);
    const beamGeo = new THREE.BoxGeometry(W - 0.04, 0.035, 0.04);

    for (let l = 0; l <= levels; l++) {
      const y = l === 0 ? 0.025 : l * levelH + 0.025;

      const plank = new THREE.Mesh(plankGeo, M.rackPlank);
      plank.position.y = y;
      plank.receiveShadow = true;
      group.add(plank);

      // Front beam
      const beamF = new THREE.Mesh(beamGeo, M.rackBeam);
      beamF.position.set(0, y + 0.038, D / 2 - 0.04);
      group.add(beamF);
      // Back beam
      const beamB = new THREE.Mesh(beamGeo, M.rackBeam);
      beamB.position.set(0, y + 0.038, -D / 2 + 0.04);
      group.add(beamB);

      // Place visible parcel stubs on shelf (1 per slot column, if occupied)
      if (l > 0 && l <= levels) {
        for (let c = 0; c < s.cols; c++) {
          const slot = s.slots[l - 1]?.[c];
          if (slot?.parcelId) {
            const stub = new THREE.Mesh(
              new THREE.BoxGeometry(0.18, 0.18, 0.15),
              new THREE.MeshLambertMaterial({ color: 0xb07020 }),
            );
            stub.position.set(
              -W / 2 + 0.12 + c * ((W - 0.24) / Math.max(s.cols - 1, 1)),
              (l - 1) * levelH + 0.12,
              0,
            );
            group.add(stub);
          }
        }
      }
    }

    // Back panel (mesh-like opacity)
    const backPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(W - 0.06, rackH),
      M.rackBack,
    );
    backPanel.position.set(0, rackH / 2, -D / 2 + 0.01);
    group.add(backPanel);

    // Label strip
    const labelGeo = new THREE.BoxGeometry(W * 0.5, 0.1, 0.02);
    const labelMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.position.set(0, 0.08, D / 2 + 0.01);
    group.add(label);

    const base = cellPos(sp.x, sp.y, sp.floor);
    group.position.copy(base);
    this.worldGroup.add(group);
  }

  // ── Elevator ──────────────────────────────────────────

  private addElevator(e: Elevator) {
    for (const f of e.floors) {
      const group = new THREE.Group();
      group.userData.floor = f;

      const H = FLOOR_H * 0.8;
      const half = CELL * 0.45;

      // 4 corner columns
      for (const [cx2, cz2] of [
        [-half, -half],
        [half, -half],
        [-half, half],
        [half, half],
      ]) {
        const col = new THREE.Mesh(
          new THREE.BoxGeometry(0.07, H, 0.07),
          new THREE.MeshLambertMaterial({ color: 0x6a8eaa }),
        );
        col.position.set(cx2, H / 2, cz2);
        col.castShadow = true;
        group.add(col);
      }

      // Platform / platform floor
      const platform = new THREE.Mesh(
        new THREE.BoxGeometry(CELL * 0.85, 0.06, CELL * 0.85),
        new THREE.MeshLambertMaterial({ color: 0x8ab4c8 }),
      );
      platform.position.y = 0.03;
      platform.name = 'platform';
      group.add(platform);

      // Shaft walls (semi-transparent)
      const shaftMat = new THREE.MeshLambertMaterial({
        color: 0x9bc0d0,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
      });
      for (const [sx, sz, sw, sd] of [
        [0, -half, CELL * 0.9, 0.01],
        [0, half, CELL * 0.9, 0.01],
        [-half, 0, 0.01, CELL * 0.9],
        [half, 0, 0.01, CELL * 0.9],
      ]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(sw, H, sd), shaftMat);
        wall.position.set(sx, H / 2, sz);
        group.add(wall);
      }

      // Floor indicator label
      const indicator = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.25, 0.02),
        new THREE.MeshLambertMaterial({ color: 0xf59e0b }),
      );
      indicator.position.set(half + 0.02, 1.2, 0);
      group.add(indicator);

      const base = cellPos(e.x, e.y, f);
      group.position.copy(base);
      this.elevatorMeshes.set(`${e.id}-${f}`, group);
      this.worldGroup.add(group);
    }
  }

  // ── Conveyor belt ─────────────────────────────────────

  private addConveyor(c: Conveyor) {
    for (let i = 0; i < c.cells.length; i++) {
      const cc = c.cells[i];
      const prev = i > 0 ? c.cells[i - 1] : null;
      const p = cellPos(cc.x, cc.y, cc.floor);
      const baseY = p.y;

      // Incoming direction (how parcel arrives at this cell)
      const inDir: ConveyorDir = prev ? dirBetween(prev, cc) : cc.direction;
      const isBend = inDir !== cc.direction;

      // Frame: extend in travel direction(s) to close the gap between cells
      const isNS = cc.direction === 'N' || cc.direction === 'S';
      const frameW = isBend ? CELL + 0.01 : isNS ? CELL * 0.88 : CELL + 0.01;
      const frameD = isBend ? CELL + 0.01 : isNS ? CELL + 0.01 : CELL * 0.88;
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(frameW, 0.18, frameD),
        M.convFrame,
      );
      frame.position.set(p.x, baseY + 0.09, p.z);
      frame.castShadow = true;
      frame.userData.floor = cc.floor;
      this.worldGroup.add(frame);

      if (isBend) {
        this.addBendBelt(cc, inDir, p.x, p.z, baseY);
      } else {
        this.addStraightBelt(cc, p.x, p.z, baseY);
        this.addConveyorEdges(cc, p.x, p.z, baseY);
      }
    }
  }

  private addStraightBelt(
    cc: ConveyorCell,
    px: number,
    pz: number,
    baseY: number,
  ) {
    const isNS = cc.direction === 'N' || cc.direction === 'S';
    const beltW = isNS ? CELL * 0.78 : CELL + 0.01;
    const beltD = isNS ? CELL + 0.01 : CELL * 0.78;
    const beltTex = makeConveyorTexture(cc.direction);
    beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping;
    const belt = new THREE.Mesh(
      new THREE.BoxGeometry(beltW, 0.025, beltD),
      new THREE.MeshLambertMaterial({ map: beltTex, color: 0x607080 }),
    );
    belt.position.set(px, baseY + 0.213, pz);
    belt.userData.floor = cc.floor;
    belt.userData.direction = cc.direction;
    this.worldGroup.add(belt);
    this.conveyorBelts.push(belt);
  }

  private addBendBelt(
    cc: ConveyorCell,
    inDir: ConveyorDir,
    px: number,
    pz: number,
    baseY: number,
  ) {
    const hC = CELL * 0.44;
    const dirs: Record<ConveyorDir, { dx: number; dz: number }> = {
      E: { dx: 1, dz: 0 },
      W: { dx: -1, dz: 0 },
      S: { dx: 0, dz: 1 },
      N: { dx: 0, dz: -1 },
    };
    const from = dirs[inDir];
    const to = dirs[cc.direction];

    // Entry / exit points in shape space. rotation.x = -π/2 maps shape Y → world -Z,
    // so shape Y = -(world Z offset). Entry is on the face opposite the incoming direction;
    // exit is on the face matching the outgoing direction.
    const entryX = -from.dx * hC;
    const entryY = from.dz * hC; // no negation: shape -Y = world +Z
    const exitX = to.dx * hC;
    const exitY = -to.dz * hC; // negated: shape -Y = world +Z

    // Arc centre: perpendicular bisectors
    const isFromHoriz = from.dx !== 0;
    const cX = isFromHoriz ? entryX : exitX;
    const cY = isFromHoriz ? exitY : entryY;

    const startAngle = Math.atan2(entryY - cY, entryX - cX);
    const endAngle = Math.atan2(exitY - cY, exitX - cX);

    let sweep = endAngle - startAngle;
    if (sweep > Math.PI) sweep -= 2 * Math.PI;
    if (sweep < -Math.PI) sweep += 2 * Math.PI;
    const clockwise = sweep < 0;

    // Annular sector belt surface — midline at hC, half-width matching straight belt (CELL*0.78/2)
    const beltHW = CELL * 0.39;
    const R_out = hC + beltHW;
    const R_in = Math.max(hC - beltHW, CELL * 0.02);
    const shape = new THREE.Shape();
    const sC = Math.cos(startAngle),
      sS = Math.sin(startAngle);
    const eC = Math.cos(endAngle),
      eS = Math.sin(endAngle);

    shape.moveTo(cX + R_in * sC, cY + R_in * sS);
    shape.lineTo(cX + R_out * sC, cY + R_out * sS);
    shape.absarc(cX, cY, R_out, startAngle, endAngle, clockwise);
    shape.lineTo(cX + R_in * eC, cY + R_in * eS);
    shape.absarc(cX, cY, R_in, endAngle, startAngle, !clockwise);
    shape.closePath();

    const geo = new THREE.ShapeGeometry(shape, 24);
    const beltTex = makeConveyorTexture(cc.direction);
    beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping;
    beltTex.repeat.set(2, 2);
    const belt = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ map: beltTex, color: 0x607080 }),
    );
    belt.rotation.x = -Math.PI / 2;
    belt.position.set(px, baseY + 0.22, pz);
    belt.userData.floor = cc.floor;
    belt.userData.direction = cc.direction;
    this.worldGroup.add(belt);
    this.conveyorBelts.push(belt);

    // Corner guide rails (yellow arc strips at inner & outer edge)
    for (const R of [R_in + 0.02, R_out - 0.02]) {
      const railShape = new THREE.Shape();
      railShape.moveTo(cX + (R - 0.025) * sC, cY + (R - 0.025) * sS);
      railShape.lineTo(cX + (R + 0.025) * sC, cY + (R + 0.025) * sS);
      railShape.absarc(cX, cY, R + 0.025, startAngle, endAngle, clockwise);
      railShape.lineTo(cX + (R - 0.025) * eC, cY + (R - 0.025) * eS);
      railShape.absarc(cX, cY, R - 0.025, endAngle, startAngle, !clockwise);
      railShape.closePath();

      const rail = new THREE.Mesh(
        new THREE.ShapeGeometry(railShape, 24),
        M.convEdge,
      );
      rail.rotation.x = -Math.PI / 2;
      rail.position.set(px, baseY + 0.235, pz);
      rail.userData.floor = cc.floor;
      this.worldGroup.add(rail);
    }

    // Mid-arc directional arrow
    const midAngle = startAngle + sweep * 0.5;
    const midR = (R_in + R_out) * 0.5;
    const arrowMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.22, 4),
      new THREE.MeshLambertMaterial({ color: 0x7a9fb0 }),
    );
    arrowMesh.rotation.x = -Math.PI / 2;
    // Tangent angle at midpoint: perpendicular to radius
    const tangentAngle = midAngle + (clockwise ? -Math.PI / 2 : Math.PI / 2);
    arrowMesh.rotation.z = -tangentAngle;
    arrowMesh.position.set(
      px + cX + midR * Math.cos(midAngle),
      baseY + 0.26,
      pz + cY + midR * Math.sin(midAngle),
    );
    arrowMesh.userData.floor = cc.floor;
    this.worldGroup.add(arrowMesh);
  }

  private addConveyorEdges(
    cc: ConveyorCell,
    px: number,
    pz: number,
    baseY: number,
  ) {
    const isNS = cc.direction === 'N' || cc.direction === 'S';
    const edgeW = isNS ? CELL * 0.88 : CELL + 0.01;
    const edgeD = isNS ? CELL + 0.01 : CELL * 0.88;
    for (const offset of [-1, 1]) {
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(edgeW, 0.08, edgeD),
        M.convEdge,
      );
      edge.position.set(
        px + (isNS ? 0 : offset * CELL * 0.41),
        baseY + 0.17,
        pz + (isNS ? offset * CELL * 0.41 : 0),
      );
      edge.userData.floor = cc.floor;
      this.worldGroup.add(edge);
    }
  }

  // ── AGV Robot ─────────────────────────────────────────

  private addRobot(r: Robot) {
    const group = new THREE.Group();
    const bodyHex = hexColor(r.color);
    const bodyColor = new THREE.Color(bodyHex);
    const darkHex = bodyColor.clone().multiplyScalar(0.65).getHex();

    // Main flat body — AGV chassis
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(CELL * 0.65, 0.16, CELL * 0.65),
      new THREE.MeshLambertMaterial({ color: bodyHex }),
    );
    body.position.y = 0.13;
    body.castShadow = true;
    group.add(body);

    // Top cap panel (slightly darker)
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(CELL * 0.56, 0.05, CELL * 0.56),
      new THREE.MeshLambertMaterial({ color: darkHex }),
    );
    cap.position.y = 0.235;
    group.add(cap);

    // Sensor mast (thin cylinder)
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.04, 0.42, 8),
      new THREE.MeshLambertMaterial({ color: 0x2d3748 }),
    );
    mast.position.y = 0.47;
    group.add(mast);

    // Sensor head (LIDAR disc)
    const sensor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.08, 0.09, 12),
      new THREE.MeshLambertMaterial({ color: 0x1a202c }),
    );
    sensor.position.y = 0.7;
    group.add(sensor);

    // Status LED ring (torus)
    const led = new THREE.Mesh(
      new THREE.TorusGeometry(0.065, 0.018, 6, 18),
      new THREE.MeshBasicMaterial({ color: 0x22c55e }),
    );
    led.rotation.x = Math.PI / 2;
    led.position.y = 0.72;
    led.name = 'led';
    group.add(led);

    // 4 rubber wheels
    const wheelGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.055, 10);
    for (const [wx, wz] of [
      [-0.25, -0.25],
      [0.25, -0.25],
      [-0.25, 0.25],
      [0.25, 0.25],
    ] as [number, number][]) {
      const w = new THREE.Mesh(wheelGeo, M.wheel);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.055, wz);
      group.add(w);
    }

    // Bumper strip (front safety bumper)
    const bumper = new THREE.Mesh(
      new THREE.BoxGeometry(CELL * 0.65, 0.05, 0.04),
      new THREE.MeshLambertMaterial({ color: 0x1a202c }),
    );
    bumper.position.set(0, 0.13, CELL * 0.33);
    group.add(bumper);

    const pos = cellPos(r.position.x, r.position.y, r.position.floor);
    group.position.copy(pos);
    group.userData.targetPos = pos.clone();
    group.userData.floor = r.position.floor;
    group.userData.id = r.id;
    this.robotMeshes.set(r.id, group);
    this.worldGroup.add(group);
  }

  // ── Parcel ────────────────────────────────────────────

  private addParcel(p: Parcel) {
    const color = hexColor(p.color);
    const group = new THREE.Group();

    // Box body
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(CELL * 0.38, CELL * 0.32, CELL * 0.38),
      new THREE.MeshLambertMaterial({ color }),
    );
    box.castShadow = true;
    group.add(box);

    // White label strip on top
    const label = new THREE.Mesh(
      new THREE.BoxGeometry(CELL * 0.24, 0.02, CELL * 0.18),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
    );
    label.position.y = CELL * 0.16 + 0.01;
    group.add(label);

    // Tape stripe (X)
    const tape = new THREE.Mesh(
      new THREE.BoxGeometry(CELL * 0.38, 0.015, 0.04),
      new THREE.MeshLambertMaterial({ color: 0xf8d070 }),
    );
    tape.position.y = CELL * 0.1;
    group.add(tape);

    this.parcelMeshes.set(p.id, group as unknown as THREE.Mesh);
    group.userData.targetPos = null;
    group.userData.carriedBy = null;
    group.userData.floor = 0;
    this.worldGroup.add(group);
    this.updateParcel(p);
  }

  // ── Update helpers ────────────────────────────────────

  private updateRobot(r: Robot) {
    let group = this.robotMeshes.get(r.id);
    if (!group) {
      this.addRobot(r);
      group = this.robotMeshes.get(r.id)!;
    }

    group.userData.targetPos = cellPos(
      r.position.x,
      r.position.y,
      r.position.floor,
    );
    group.userData.floor = r.position.floor;

    const led = group.getObjectByName('led') as THREE.Mesh | undefined;
    if (led) {
      const mat = led.material as THREE.MeshBasicMaterial;
      const ledColors: Record<string, number> = {
        idle: 0x22c55e,
        navigating_to_pickup: 0x3b82f6,
        navigating_to_dropoff: 0x3b82f6,
        navigating_to_elevator: 0x818cf8,
        picking_up: 0xf59e0b,
        dropping_off: 0xf59e0b,
        in_elevator: 0xa78bfa,
        charging: 0x10b981,
      };
      mat.color.setHex(ledColors[r.status] ?? 0x64748b);
    }
    this.updateFloorVisibility();
  }

  private updateParcel(p: Parcel) {
    const mesh = this.parcelMeshes.get(p.id) as unknown as
      | THREE.Group
      | undefined;
    if (!mesh) {
      this.addParcel(p);
      return;
    }

    if (p.status === 'being_carried' && p.carriedBy) {
      mesh.userData.carriedBy = p.carriedBy;
      const robot = this.robotMeshes.get(p.carriedBy);
      if (robot) {
        mesh.userData.floor = robot.userData.floor;
      }
    } else if (p.position) {
      mesh.userData.carriedBy = null;
      const pos = cellPos(p.position.x, p.position.y, p.position.floor);
      pos.y += 0.22;
      if (!mesh.userData.targetPos) {
        // First placement — snap immediately
        mesh.position.copy(pos);
      }
      mesh.userData.targetPos = pos.clone();
      mesh.userData.floor = p.position.floor;
    } else if (p.shelfId) {
      mesh.userData.carriedBy = null;
      mesh.userData.targetPos = null;
      mesh.visible = false;
      return;
    }
    mesh.visible = mesh.userData.floor === this.activeFloor;
  }

  private updateElevator(e: Elevator) {
    const group = this.elevatorMeshes.get(`${e.id}-${e.currentFloor}`);
    if (!group) return;
    const platform = group.getObjectByName('platform') as
      | THREE.Mesh
      | undefined;
    if (platform) {
      const mat = platform.material as THREE.MeshLambertMaterial;
      mat.color.setHex(e.status === 'doors_open' ? 0x22d3ee : 0x8ab4c8);
    }
  }

  private centerCamera(cfg: WorldConfig) {
    const cx = (cfg.width / 2) * CELL;
    const cz = (cfg.depth / 2) * CELL;
    this.sm.controls.target.set(cx, 0, cz);
    this.sm.camera.position.set(cx + 20, 30, cz + 24);
    this.sm.controls.update();
  }
}
