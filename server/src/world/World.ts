import {
  WorldConfig,
  Vec3,
  Robot,
  Shelf,
  Elevator,
  Conveyor,
  Parcel,
  Operator,
  Wall,
  TransferTask,
  FullStatePayload,
} from '../types';
import { NavGrid, NavCell, SHELF_HALF, WALL_HALF } from './NavGrid';

export { NavCell };

export class World {
  config: WorldConfig;
  navGrid: NavGrid;
  robots = new Map<string, Robot>();
  shelves = new Map<string, Shelf>();
  elevators = new Map<string, Elevator>();
  conveyors = new Map<string, Conveyor>();
  parcels = new Map<string, Parcel>();
  operators = new Map<string, Operator>();
  walls = new Map<string, Wall>();
  tasks = new Map<string, TransferTask>();

  constructor(config: WorldConfig) {
    this.config = config;
    this.navGrid = new NavGrid(config.width, config.depth, config.floors);
  }

  reset(config?: WorldConfig) {
    if (config) this.config = config;
    this.navGrid.reset(
      this.config.width,
      this.config.depth,
      this.config.floors,
    );
    this.robots.clear();
    this.shelves.clear();
    this.elevators.clear();
    this.conveyors.clear();
    this.parcels.clear();
    this.operators.clear();
    this.walls.clear();
    this.tasks.clear();
  }

  // ── Entity placement ──────────────────────────────────────

  placeShelf(s: Shelf) {
    const sp = s.shelfPosition;
    this.navGrid.blockRect(
      sp.x,
      sp.y,
      sp.floor,
      SHELF_HALF,
      SHELF_HALF,
      'shelf',
      s.id,
    );
  }

  removeShelf(s: Shelf) {
    const sp = s.shelfPosition;
    this.navGrid.unblockRect(sp.x, sp.y, sp.floor, SHELF_HALF, SHELF_HALF);
  }

  placeWall(w: Wall) {
    const p = w.position;
    this.navGrid.blockRect(
      p.x,
      p.y,
      p.floor,
      WALL_HALF,
      WALL_HALF,
      'wall',
      w.id,
    );
  }

  placeElevator(e: Elevator) {
    const { nx, ny } = this.navGrid.worldToNav(e.x, e.y);
    for (const f of e.floors) {
      this.navGrid.setNavCell(nx, ny, f, {
        walkable: true,
        cellType: 'elevator_shaft',
        entityId: e.id,
      });
    }
  }

  placeConveyor(c: Conveyor) {
    for (const cell of c.cells) {
      const { nx, ny } = this.navGrid.worldToNav(cell.x, cell.y);
      this.navGrid.setNavCell(nx, ny, cell.floor, {
        walkable: true,
        cellType: 'conveyor',
        entityId: c.id,
      });
    }
  }

  placeOperator(op: Operator) {
    const { nx, ny } = this.navGrid.worldToNav(op.position.x, op.position.y);
    this.navGrid.setNavCell(nx, ny, op.position.floor, {
      walkable: true,
      cellType: 'operator_station',
      entityId: op.id,
    });
  }

  // ── World-space cell query ─────────────────────────────────

  getCellAtWorld(wx: number, wy: number, floor: number) {
    return this.navGrid.getCellAtWorld(wx, wy, floor);
  }

  // ── Pathfinding helpers (delegated to NavGrid) ─────────────

  inBounds(x: number, y: number, floor: number): boolean {
    const { nx, ny } = this.navGrid.worldToNav(x, y);
    return this.navGrid.inBounds(nx, ny, floor);
  }

  isWalkable(x: number, y: number, floor: number): boolean {
    const { nx, ny } = this.navGrid.worldToNav(x, y);
    return this.navGrid.isWalkable(nx, ny, floor);
  }

  manhattan(a: Vec3, b: Vec3): number {
    return (
      Math.abs(a.x - b.x) +
      Math.abs(a.y - b.y) +
      Math.abs(a.floor - b.floor) * 5
    );
  }

  toFullState(tick: number, running: boolean, tps: number): FullStatePayload {
    return {
      tick,
      running,
      ticksPerSecond: tps,
      config: this.config,
      robots: [...this.robots.values()],
      shelves: [...this.shelves.values()],
      elevators: [...this.elevators.values()],
      conveyors: [...this.conveyors.values()],
      parcels: [...this.parcels.values()],
      operators: [...this.operators.values()],
      walls: [...this.walls.values()],
      tasks: [...this.tasks.values()],
    };
  }
}
