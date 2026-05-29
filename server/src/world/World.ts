import {
  Cell, CellType, WorldConfig, Vec3,
  Robot, Shelf, Elevator, Conveyor,
  Parcel, Operator, Wall, TransferTask,
  FullStatePayload
} from '../types';

export class World {
  config: WorldConfig;
  cells: Cell[][][];                    // [floor][y][x]
  robots    = new Map<string, Robot>();
  shelves   = new Map<string, Shelf>();
  elevators = new Map<string, Elevator>();
  conveyors = new Map<string, Conveyor>();
  parcels   = new Map<string, Parcel>();
  operators = new Map<string, Operator>();
  walls     = new Map<string, Wall>();
  tasks     = new Map<string, TransferTask>();

  constructor(config: WorldConfig) {
    this.config = config;
    this.cells = this.buildCells(config);
  }

  private buildCells(cfg: WorldConfig): Cell[][][] {
    const cells: Cell[][][] = [];
    for (let f = 0; f < cfg.floors; f++) {
      cells[f] = [];
      for (let y = 0; y < cfg.depth; y++) {
        cells[f][y] = [];
        for (let x = 0; x < cfg.width; x++) {
          cells[f][y][x] = { type: 'empty' };
        }
      }
    }
    return cells;
  }

  reset(config?: WorldConfig) {
    if (config) this.config = config;
    this.cells = this.buildCells(this.config);
    this.robots.clear(); this.shelves.clear(); this.elevators.clear();
    this.conveyors.clear(); this.parcels.clear(); this.operators.clear();
    this.walls.clear(); this.tasks.clear();
  }

  inBounds(x: number, y: number, floor: number): boolean {
    return floor >= 0 && floor < this.config.floors &&
           y >= 0 && y < this.config.depth &&
           x >= 0 && x < this.config.width;
  }

  getCell(x: number, y: number, floor: number): Cell | null {
    if (!this.inBounds(x, y, floor)) return null;
    return this.cells[floor][y][x];
  }

  setCell(x: number, y: number, floor: number, cell: Cell) {
    if (!this.inBounds(x, y, floor)) return;
    this.cells[floor][y][x] = cell;
  }

  isWalkable(x: number, y: number, floor: number): boolean {
    const c = this.getCell(x, y, floor);
    if (!c) return false;
    return c.type !== 'wall' && c.type !== 'shelf';
  }

  neighbors(pos: Vec3): Vec3[] {
    const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
    return dirs
      .map(d => ({ x: pos.x + d.dx, y: pos.y + d.dy, floor: pos.floor }))
      .filter(p => this.isWalkable(p.x, p.y, p.floor));
  }

  /** Neighbors including cross-floor elevator transitions */
  neighborsWithElevator(pos: Vec3): Vec3[] {
    const n = this.neighbors(pos);
    // Check if standing on an elevator shaft
    const cell = this.getCell(pos.x, pos.y, pos.floor);
    if (cell?.type === 'elevator_shaft') {
      const elev = this.findElevatorAt(pos.x, pos.y);
      if (elev) {
        for (const f of elev.floors) {
          if (f !== pos.floor) n.push({ x: pos.x, y: pos.y, floor: f });
        }
      }
    }
    return n;
  }

  findElevatorAt(x: number, y: number): Elevator | undefined {
    for (const e of this.elevators.values()) {
      if (e.x === x && e.y === y) return e;
    }
    return undefined;
  }

  manhattan(a: Vec3, b: Vec3): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.floor - b.floor) * 5;
  }

  toFullState(tick: number, running: boolean, tps: number): FullStatePayload {
    return {
      tick, running, ticksPerSecond: tps,
      config: this.config,
      robots:    [...this.robots.values()],
      shelves:   [...this.shelves.values()],
      elevators: [...this.elevators.values()],
      conveyors: [...this.conveyors.values()],
      parcels:   [...this.parcels.values()],
      operators: [...this.operators.values()],
      walls:     [...this.walls.values()],
      tasks:     [...this.tasks.values()],
    };
  }
}
