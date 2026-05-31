import { World } from '../world/World';
import {
  Robot,
  TransferTask,
  Parcel,
  TickUpdatePayload,
  SimEvent,
  Vec3,
  NavVec3,
  STConstraint,
} from '../types';
import { spacetimeAStar } from '../pathfinding/AStar';

const PICKUP_TICKS = 3;
const DROPOFF_TICKS = 3;
const ELEVATOR_TICKS = 8;
const DOOR_OPEN_TICKS = 4;

// Robot advances 2 nav steps per tick = 1.0 world unit/tick (nav cell size 0.5)
const NAV_STEPS_PER_TICK = 2;

export class SimulationEngine {
  world: World;
  tick = 0;
  running = false;
  ticksPerSecond = 5;

  private interval?: ReturnType<typeof setInterval>;
  private robotWaitTick = new Map<string, number>();
  private robotNavPaths = new Map<string, NavVec3[]>();
  private robotNavIdx = new Map<string, number>();

  onTick?: (payload: TickUpdatePayload) => void;
  onEvent?: (event: SimEvent) => void;

  // ── Perpetual mode ─────────────────────────────────────
  private perpetual = false;
  // Map of floor → outbound conveyor ID; use floor=-1 as the "all floors" fallback
  private outboundByFloor = new Map<number, string>();
  private perpetualParcelCounter = 0;
  private perpetualTaskCounter = 0;

  constructor(world: World) {
    this.world = world;
  }

  /** Register an outbound conveyor for a specific floor (or -1 for all floors). */
  enablePerpetual(outboundConveyorId: string, floor = -1) {
    this.perpetual = true;
    this.outboundByFloor.set(floor, outboundConveyorId);
  }

  disablePerpetual() {
    this.perpetual = false;
    this.outboundByFloor.clear();
  }

  start(tps = 5) {
    if (this.running) return;
    this.ticksPerSecond = tps;
    this.running = true;
    this.interval = setInterval(() => this.doTick(), 1000 / tps);
  }

  pause() {
    this.running = false;
    if (this.interval) clearInterval(this.interval);
  }

  reset() {
    this.pause();
    this.tick = 0;
    this.robotWaitTick.clear();
    this.robotNavPaths.clear();
    this.robotNavIdx.clear();
    this.perpetual = false;
    this.perpetualParcelCounter = 0;
    this.perpetualTaskCounter = 0;
  }

  // ── Main tick ──────────────────────────────────────────

  private doTick() {
    this.tick++;
    this.assignPendingTasks();
    this.processElevators();
    this.processConveyors();
    this.processRobots();
    if (this.perpetual) this.generatePerpetualTasks();

    if (this.onTick) {
      this.onTick({
        tick: this.tick,
        robots: [...this.world.robots.values()],
        elevators: [...this.world.elevators.values()],
        parcels: [...this.world.parcels.values()],
        tasks: [...this.world.tasks.values()],
      });
    }
  }

  // ── Task assignment ────────────────────────────────────

  private assignPendingTasks() {
    const pending = [...this.world.tasks.values()].filter(
      (t) => t.status === 'queued',
    );
    if (pending.length === 0) return;

    const idleRobots = [...this.world.robots.values()].filter(
      (r) => r.status === 'idle' && !r.taskId,
    );
    if (idleRobots.length === 0) return;

    for (const task of pending) {
      if (idleRobots.length === 0) break;

      // Resolve parcel + pickup *before* robot selection so we can prefer
      // a robot already on the same floor — avoids needless cross-floor trips.
      const parcel = this.world.parcels.get(task.parcelId);
      if (!parcel) { task.status = 'failed'; continue; }
      const pickupPos = this.getParcelAccessPos(parcel);
      if (!pickupPos) { task.status = 'failed'; continue; }

      const sameFloorIdx = idleRobots.findIndex(
        r => r.position.floor === pickupPos.floor,
      );
      const robot = sameFloorIdx >= 0
        ? idleRobots.splice(sameFloorIdx, 1)[0]
        : idleRobots.shift()!;

      task.status    = 'assigned';
      task.robotId   = robot.id;
      task.startedAt = this.tick;
      robot.taskId   = task.id;
      robot.status   = 'navigating_to_pickup';
      this.planPath(robot, pickupPos);
    }
  }

  private getParcelAccessPos(parcel: Parcel): Vec3 | null {
    if (parcel.shelfId) {
      const shelf = this.world.shelves.get(parcel.shelfId);
      return shelf ? shelf.accessPosition : null;
    }
    return parcel.position ?? null;
  }

  // ── Robot FSM ──────────────────────────────────────────

  private processRobots() {
    for (const robot of this.world.robots.values()) {
      switch (robot.status) {
        case 'navigating_to_pickup':
        case 'navigating_to_dropoff':
        case 'navigating_to_elevator':
          this.stepRobot(robot);
          break;
        case 'picking_up':
          this.handlePickup(robot);
          break;
        case 'dropping_off':
          this.handleDropoff(robot);
          break;
        case 'waiting_for_elevator':
          this.handleWaitElevator(robot);
          break;
        case 'in_elevator':
          this.handleInElevator(robot);
          break;
      }
    }
  }

  private planPath(robot: Robot, goal: Vec3) {
    const navGrid = this.world.navGrid;

    // Prioritized planning: add space-time constraints from all other robots'
    // committed paths so this robot routes around them without replanning others.
    const constraints: STConstraint[] = [];
    for (const [otherId, path] of this.robotNavPaths) {
      if (otherId === robot.id) continue;
      for (let t = 0; t < path.length; t++) {
        constraints.push({
          nx: path[t].nx,
          ny: path[t].ny,
          floor: path[t].floor,
          t,
        });
      }
    }

    const startNav = navGrid.worldToNavVec3(robot.position);
    const goalNav = navGrid.worldToNavVec3(goal);
    const navPath = spacetimeAStar(
      startNav,
      goalNav,
      navGrid,
      this.world.elevators,
      constraints,
    );

    if (navPath && navPath.length > 0) {
      this.robotNavPaths.set(robot.id, navPath);
      this.robotNavIdx.set(robot.id, 0);
    } else {
      robot.status = 'idle';
      if (robot.taskId) {
        const task = this.world.tasks.get(robot.taskId);
        if (task) task.status = 'failed';
        robot.taskId = undefined;
      }
    }
  }

  private getRobotGoal(robot: Robot): Vec3 | undefined {
    if (!robot.taskId) return undefined;
    const task = this.world.tasks.get(robot.taskId);
    if (!task) return undefined;
    if (robot.status === 'navigating_to_pickup') {
      const parcel = this.world.parcels.get(task.parcelId);
      if (!parcel) return undefined;
      return this.getParcelAccessPos(parcel) ?? undefined;
    }
    return task.targetPosition;
  }

  private stepRobot(robot: Robot) {
    const navPath = this.robotNavPaths.get(robot.id);
    let idx = this.robotNavIdx.get(robot.id) ?? 0;

    if (!navPath || idx >= navPath.length - 1) {
      this.onRobotArrived(robot);
      return;
    }

    robot.prevPosition = { ...robot.position };

    for (
      let step = 0;
      step < NAV_STEPS_PER_TICK && idx < navPath.length - 1;
      step++
    ) {
      idx++;
      robot.position = this.world.navGrid.navToWorldVec3(navPath[idx]);
      // Stop immediately on floor change (elevator transition)
      if (robot.prevPosition.floor !== robot.position.floor) {
        robot.status = 'in_elevator';
        this.robotWaitTick.set(robot.id, this.tick);
        this.robotNavIdx.set(robot.id, idx);
        return;
      }
    }

    this.robotNavIdx.set(robot.id, idx);
    robot.visualOffset = 0;

    if (idx >= navPath.length - 1) this.onRobotArrived(robot);
  }

  private onRobotArrived(robot: Robot) {
    if (!robot.taskId) {
      robot.status = 'idle';
      return;
    }
    const task = this.world.tasks.get(robot.taskId);
    if (!task) {
      robot.status = 'idle';
      return;
    }

    if (robot.status === 'navigating_to_pickup') {
      robot.status = 'picking_up';
      this.robotWaitTick.set(robot.id, this.tick);
    } else if (robot.status === 'navigating_to_dropoff') {
      robot.status = 'dropping_off';
      this.robotWaitTick.set(robot.id, this.tick);
    }
  }

  private handlePickup(robot: Robot) {
    const started = this.robotWaitTick.get(robot.id) ?? this.tick;
    if (this.tick - started < PICKUP_TICKS) return;

    const task = this.world.tasks.get(robot.taskId!)!;
    const parcel = this.world.parcels.get(task.parcelId);
    if (!parcel) {
      robot.status = 'idle';
      return;
    }

    if (parcel.shelfId) {
      const shelf = this.world.shelves.get(parcel.shelfId)!;
      const slot = shelf.slots[parcel.slotRow!]?.[parcel.slotCol!];
      if (slot) slot.parcelId = undefined;
    }
    parcel.status = 'being_carried';
    parcel.shelfId = undefined;
    parcel.carriedBy = robot.id;
    robot.heldParcelId = parcel.id;
    task.status = 'in_progress';

    this.emit('parcel_picked_up', { robotId: robot.id, parcelId: parcel.id });

    robot.status = 'navigating_to_dropoff';
    this.planPath(robot, task.targetPosition);
  }

  private handleDropoff(robot: Robot) {
    const started = this.robotWaitTick.get(robot.id) ?? this.tick;
    if (this.tick - started < DROPOFF_TICKS) return;

    const task = this.world.tasks.get(robot.taskId!)!;
    const parcel = this.world.parcels.get(task.parcelId)!;

    parcel.carriedBy = undefined;
    parcel.position = { ...robot.position };

    const targetCell = this.world.getCellAtWorld(
      task.targetPosition.x,
      task.targetPosition.y,
      task.targetPosition.floor,
    );
    if (targetCell?.cellType === 'conveyor') {
      parcel.status = 'on_conveyor';
      parcel.position = { ...task.targetPosition };
    } else {
      parcel.status = 'delivered';
    }

    if (task.targetShelfId) {
      const shelf = this.world.shelves.get(task.targetShelfId);
      if (
        shelf &&
        task.targetSlotRow !== undefined &&
        task.targetSlotCol !== undefined
      ) {
        parcel.shelfId = shelf.id;
        parcel.slotRow = task.targetSlotRow;
        parcel.slotCol = task.targetSlotCol;
        parcel.status = 'on_shelf';
        shelf.slots[task.targetSlotRow][task.targetSlotCol].parcelId =
          parcel.id;
      }
    }

    robot.heldParcelId = undefined;
    task.status = 'completed';
    task.completedAt = this.tick;
    robot.taskId = undefined;
    robot.status = 'idle';

    this.emit('parcel_dropped_off', { robotId: robot.id, parcelId: parcel.id });
    this.emit('task_completed', { taskId: task.id });
  }

  private handleInElevator(robot: Robot) {
    const started = this.robotWaitTick.get(robot.id) ?? this.tick;
    if (this.tick - started < ELEVATOR_TICKS) return;
    const task = this.world.tasks.get(robot.taskId ?? '');
    if (!task) {
      robot.status = 'idle';
      return;
    }
    robot.status = robot.heldParcelId
      ? 'navigating_to_dropoff'
      : 'navigating_to_pickup';
  }

  private handleWaitElevator(robot: Robot) {
    robot.status = 'in_elevator';
    this.robotWaitTick.set(robot.id, this.tick);
  }

  // ── Elevators ──────────────────────────────────────────

  private processElevators() {
    for (const elev of this.world.elevators.values()) {
      if (elev.status === 'moving_up' || elev.status === 'moving_down') {
        if (elev.targetFloor !== undefined) {
          elev.currentFloor = elev.targetFloor;
          elev.targetFloor = undefined;
          elev.status = 'doors_open';
          elev.doorsOpenTick = this.tick;
        }
      } else if (elev.status === 'doors_open') {
        if (this.tick - (elev.doorsOpenTick ?? 0) >= DOOR_OPEN_TICKS) {
          elev.status = 'idle';
        }
      }
    }
  }

  // ── Conveyors ──────────────────────────────────────────

  private processConveyors() {
    for (const conv of this.world.conveyors.values()) {
      if (!conv.active) continue;
      if (this.tick % conv.speedTicks !== 0) continue;

      // Iterate in reverse so a parcel that just moved to cell i+1
      // is not moved again when we reach that cell.
      for (let i = conv.cells.length - 1; i >= 0; i--) {
        const cell = conv.cells[i];
        const parcel = this.findParcelAt(cell.x, cell.y, cell.floor);
        if (!parcel || parcel.status !== 'on_conveyor') continue;

        const next = conv.cells[i + 1];
        if (next) {
          parcel.position = { x: next.x, y: next.y, floor: next.floor };
        } else {
          parcel.status = 'delivered';
        }
      }
    }
  }

  private findParcelAt(
    x: number,
    y: number,
    floor: number,
  ): Parcel | undefined {
    for (const p of this.world.parcels.values()) {
      if (
        p.position?.x === x &&
        p.position?.y === y &&
        p.position?.floor === floor
      )
        return p;
    }
    return undefined;
  }

  // ── Perpetual task generation ──────────────────────────

  private readonly PARCEL_COLORS = [
    '#e74c3c',
    '#e67e22',
    '#f1c40f',
    '#2ecc71',
    '#1abc9c',
    '#3498db',
    '#9b59b6',
    '#e91e8c',
    '#00bcd4',
    '#ff5722',
  ];

  private generatePerpetualTasks() {
    const activeTasks = [...this.world.tasks.values()].filter(
      (t) =>
        t.status === 'queued' ||
        t.status === 'assigned' ||
        t.status === 'in_progress',
    ).length;
    const robotCount = this.world.robots.size;
    const maxQueue = robotCount * 2;

    if (activeTasks < maxQueue) {
      // Emit one task per registered outbound (per floor), most-specific floor first
      for (const [floor, conveyorId] of this.outboundByFloor) {
        const conv = this.world.conveyors.get(conveyorId);
        if (conv) this.tryCreatePickingTask(conv, floor === -1 ? undefined : floor);
      }
    }

    // Restock shelves periodically so there are always parcels to pick
    if (this.tick % 15 === 0) {
      this.restockShelf();
    }
  }

  private tryCreatePickingTask(
    outbound: { id: string; cells: { x: number; y: number; floor: number }[] },
    onlyFloor?: number,  // when set, only pick from shelves on this floor
  ) {
    const entryCell = outbound.cells[0];
    // Don't place if entry cell is already occupied
    if (this.findParcelAt(entryCell.x, entryCell.y, entryCell.floor)) return;

    // Find an occupied shelf slot with no pending task (optionally floor-filtered)
    const taskedParcelIds = new Set(
      [...this.world.tasks.values()]
        .filter((t) => t.status !== 'completed' && t.status !== 'failed')
        .map((t) => t.parcelId),
    );

    const candidates: Parcel[] = [];
    for (const p of this.world.parcels.values()) {
      if (p.status !== 'on_shelf' || taskedParcelIds.has(p.id)) continue;
      if (onlyFloor !== undefined) {
        const shelf = p.shelfId ? this.world.shelves.get(p.shelfId) : undefined;
        if (!shelf || shelf.accessPosition.floor !== onlyFloor) continue;
      }
      candidates.push(p);
    }

    if (candidates.length === 0) return;

    const parcel = candidates[Math.floor(Math.random() * candidates.length)];
    const taskId = `perp-task-${++this.perpetualTaskCounter}`;
    const task: TransferTask = {
      id: taskId,
      parcelId: parcel.id,
      targetPosition: {
        x: entryCell.x,
        y: entryCell.y,
        floor: entryCell.floor,
      },
      status: 'queued',
      createdAt: this.tick,
    };
    this.world.tasks.set(taskId, task);
  }

  private restockShelf() {
    const shelves = [...this.world.shelves.values()];
    if (shelves.length === 0) return;

    // Find a shelf with empty slots (prefer shelves with few parcels)
    const withEmpty = shelves
      .map((s) => ({
        shelf: s,
        emptySlots: s.slots.flat().filter((sl) => !sl.parcelId),
      }))
      .filter((e) => e.emptySlots.length > 0);

    if (withEmpty.length === 0) return;

    // Pick the shelf with the most empty slots (most depleted)
    withEmpty.sort((a, b) => b.emptySlots.length - a.emptySlots.length);
    const { shelf, emptySlots } = withEmpty[0];
    const slot = emptySlots[Math.floor(Math.random() * emptySlots.length)];

    const parcelId = `perp-parcel-${++this.perpetualParcelCounter}`;
    const color =
      this.PARCEL_COLORS[
        this.perpetualParcelCounter % this.PARCEL_COLORS.length
      ];
    const parcel: Parcel = {
      id: parcelId,
      label: `P${this.perpetualParcelCounter}`,
      color,
      status: 'on_shelf',
      shelfId: shelf.id,
      slotRow: slot.row,
      slotCol: slot.col,
    };
    slot.parcelId = parcelId;
    this.world.parcels.set(parcelId, parcel);
  }

  private emit(type: SimEvent['type'], data: Record<string, unknown>) {
    this.onEvent?.({ type, tick: this.tick, data });
  }
}
