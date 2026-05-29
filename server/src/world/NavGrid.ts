import { Vec3, NavVec3, CellType, Elevator } from '../types';

export const NAV_CELL_SIZE = 0.5;

// Half-extents used when blocking obstacle rectangles in the nav-grid
export const SHELF_HALF = 0.35;
export const WALL_HALF  = 0.45;

export interface NavCell {
  walkable: boolean;
  cellType: CellType;
  entityId?: string;
}

const EMPTY_CELL: NavCell = { walkable: true, cellType: 'empty' };

export class NavGrid {
  readonly cellSize = NAV_CELL_SIZE;
  navW: number;
  navD: number;
  floors: number;
  private cells: NavCell[][][];   // [floor][ny][nx]

  constructor(worldWidth: number, worldDepth: number, floors: number) {
    this.navW   = Math.ceil(worldWidth  / NAV_CELL_SIZE);
    this.navD   = Math.ceil(worldDepth  / NAV_CELL_SIZE);
    this.floors = floors;
    this.cells  = this.buildCells();
  }

  private buildCells(): NavCell[][][] {
    return Array.from({ length: this.floors }, () =>
      Array.from({ length: this.navD }, () =>
        Array.from({ length: this.navW }, () => ({ ...EMPTY_CELL }))
      )
    );
  }

  // ── Coordinate conversion ──────────────────────────────────

  worldToNav(wx: number, wy: number): { nx: number; ny: number } {
    return {
      nx: Math.round(wx / this.cellSize),
      ny: Math.round(wy / this.cellSize),
    };
  }

  navToWorld(nx: number, ny: number): { wx: number; wy: number } {
    return { wx: nx * this.cellSize, wy: ny * this.cellSize };
  }

  worldToNavVec3(v: Vec3): NavVec3 {
    const { nx, ny } = this.worldToNav(v.x, v.y);
    return { nx, ny, floor: v.floor };
  }

  navToWorldVec3(n: NavVec3): Vec3 {
    const { wx, wy } = this.navToWorld(n.nx, n.ny);
    return { x: wx, y: wy, floor: n.floor };
  }

  // ── Bounds ────────────────────────────────────────────────

  inBounds(nx: number, ny: number, floor: number): boolean {
    return floor >= 0 && floor < this.floors &&
           ny >= 0 && ny < this.navD &&
           nx >= 0 && nx < this.navW;
  }

  // ── Cell access ───────────────────────────────────────────

  getCell(nx: number, ny: number, floor: number): NavCell | null {
    if (!this.inBounds(nx, ny, floor)) return null;
    return this.cells[floor][ny][nx];
  }

  getCellAtWorld(wx: number, wy: number, floor: number): NavCell | null {
    const { nx, ny } = this.worldToNav(wx, wy);
    return this.getCell(nx, ny, floor);
  }

  isWalkable(nx: number, ny: number, floor: number): boolean {
    return this.getCell(nx, ny, floor)?.walkable ?? false;
  }

  // ── Blocking API ──────────────────────────────────────────

  /** Mark all nav cells overlapping [cx±halfW, cy±halfD] as blocked. */
  blockRect(
    cx: number, cy: number, floor: number,
    halfW: number, halfD: number,
    cellType: CellType, entityId?: string
  ) {
    const nxMin = Math.ceil((cx - halfW) / this.cellSize);
    const nxMax = Math.floor((cx + halfW) / this.cellSize);
    const nyMin = Math.ceil((cy - halfD) / this.cellSize);
    const nyMax = Math.floor((cy + halfD) / this.cellSize);
    for (let ny = nyMin; ny <= nyMax; ny++) {
      for (let nx = nxMin; nx <= nxMax; nx++) {
        if (this.inBounds(nx, ny, floor)) {
          this.cells[floor][ny][nx] = { walkable: false, cellType, entityId };
        }
      }
    }
  }

  /** Restore nav cells in the given rect to empty+walkable. */
  unblockRect(cx: number, cy: number, floor: number, halfW: number, halfD: number) {
    const nxMin = Math.ceil((cx - halfW) / this.cellSize);
    const nxMax = Math.floor((cx + halfW) / this.cellSize);
    const nyMin = Math.ceil((cy - halfD) / this.cellSize);
    const nyMax = Math.floor((cy + halfD) / this.cellSize);
    for (let ny = nyMin; ny <= nyMax; ny++) {
      for (let nx = nxMin; nx <= nxMax; nx++) {
        if (this.inBounds(nx, ny, floor)) {
          this.cells[floor][ny][nx] = { ...EMPTY_CELL };
        }
      }
    }
  }

  /** Set a single nav cell — used for walkable entities (conveyor, elevator_shaft, operator). */
  setNavCell(nx: number, ny: number, floor: number, patch: Partial<NavCell>) {
    if (!this.inBounds(nx, ny, floor)) return;
    this.cells[floor][ny][nx] = { ...this.cells[floor][ny][nx], ...patch };
  }

  // ── Pathfinding ───────────────────────────────────────────

  neighbors(pos: NavVec3): NavVec3[] {
    const dirs = [{ dnx: 1, dny: 0 }, { dnx: -1, dny: 0 }, { dnx: 0, dny: 1 }, { dnx: 0, dny: -1 }];
    return dirs
      .map(d => ({ nx: pos.nx + d.dnx, ny: pos.ny + d.dny, floor: pos.floor }))
      .filter(p => this.isWalkable(p.nx, p.ny, p.floor));
  }

  neighborsWithElevator(pos: NavVec3, elevators: Map<string, Elevator>): NavVec3[] {
    const n = this.neighbors(pos);
    if (this.getCell(pos.nx, pos.ny, pos.floor)?.cellType === 'elevator_shaft') {
      for (const elev of elevators.values()) {
        const elevNav = this.worldToNav(elev.x, elev.y);
        if (elevNav.nx === pos.nx && elevNav.ny === pos.ny) {
          for (const f of elev.floors) {
            if (f !== pos.floor) n.push({ nx: pos.nx, ny: pos.ny, floor: f });
          }
          break;
        }
      }
    }
    return n;
  }

  manhattan(a: NavVec3, b: NavVec3): number {
    // floor penalty ×10 because 1 world unit = 2 nav steps
    return Math.abs(a.nx - b.nx) + Math.abs(a.ny - b.ny) + Math.abs(a.floor - b.floor) * 10;
  }

  // ── Reset ─────────────────────────────────────────────────

  reset(worldWidth: number, worldDepth: number, floors: number) {
    this.navW   = Math.ceil(worldWidth  / NAV_CELL_SIZE);
    this.navD   = Math.ceil(worldDepth  / NAV_CELL_SIZE);
    this.floors = floors;
    this.cells  = this.buildCells();
  }
}
