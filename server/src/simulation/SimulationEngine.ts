import { World } from '../world/World';
import {
  Robot,
  TransferTask,
  Parcel,
  Elevator,
  TickUpdatePayload,
  SimEvent,
  Vec3,
} from '../types';
import { planPaths, CBSAgent } from '../pathfinding/CBS';

const PICKUP_TICKS = 3;
const DROPOFF_TICKS = 3;
const ELEVATOR_TICKS = 8; // stubs: wait N ticks at shaft
const DOOR_OPEN_TICKS = 4;

export class SimulationEngine {
  world: World;
  tick = 0;
  running = false;
  ticksPerSecond = 5;

  private interval?: ReturnType<typeof setInterval>;
  private robotWaitTick = new Map<string, number>(); // robotId -> tick they started waiting
  private robotPaths = new Map<string, Vec3[]>(); // robotId -> remaining path
  private robotPathIdx = new Map<string, number>(); // robotId -> current index in path

  onTick?: (payload: TickUpdatePayload) => void;
  onEvent?: (event: SimEvent) => void;

  constructor(world: World) {
    this.world = world;
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
    this.robotPaths.clear();
    this.robotPathIdx.clear();
  }

  // ── Main tick ──────────────────────────────────────────

  private doTick() {
    this.tick++;
    this.assignPendingTasks();
    this.processElevators();
    this.processConveyors();
    this.processRobots();

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
      const robot = idleRobots.shift()!;

      task.status = 'assigned';
      task.robotId = robot.id;
      task.startedAt = this.tick;
      robot.taskId = task.id;
      robot.status = 'navigating_to_pickup';

      // Plan path to pickup
      const parcel = this.world.parcels.get(task.parcelId);
      if (!parcel) {
        task.status = 'failed';
        robot.taskId = undefined;
        robot.status = 'idle';
        continue;
      }

      const pickupPos = this.getParcelAccessPos(parcel);
      if (!pickupPos) {
        task.status = 'failed';
        robot.taskId = undefined;
        robot.status = 'idle';
        continue;
      }

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
    // Collect active robots that are moving (for CBS)
    const activeAgents: CBSAgent[] = [];
    for (const r of this.world.robots.values()) {
      if (r.id === robot.id) continue;
      if (
        r.status === 'navigating_to_pickup' ||
        r.status === 'navigating_to_dropoff'
      ) {
        const rGoal = this.getRobotGoal(r);
        if (rGoal)
          activeAgents.push({ id: r.id, start: r.position, goal: rGoal });
      }
    }
    activeAgents.push({ id: robot.id, start: robot.position, goal });

    const solution = planPaths(activeAgents, this.world, this.robotPaths);
    const path = solution.get(robot.id);
    if (path && path.length > 0) {
      this.robotPaths.set(robot.id, path);
      this.robotPathIdx.set(robot.id, 0);
    } else {
      // No path — robot stays idle
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
    const path = this.robotPaths.get(robot.id);
    const idx = this.robotPathIdx.get(robot.id) ?? 0;
    if (!path || idx >= path.length - 1) {
      // Arrived
      this.onRobotArrived(robot);
      return;
    }

    robot.prevPosition = robot.position;
    robot.position = path[idx + 1];
    robot.visualOffset = 0;
    this.robotPathIdx.set(robot.id, idx + 1);

    // Handle elevator transition (floor change)
    if (robot.prevPosition.floor !== robot.position.floor) {
      robot.status = 'in_elevator';
      this.robotWaitTick.set(robot.id, this.tick);
    }
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

    // Pick up parcel
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

    // Now navigate to destination
    robot.status = 'navigating_to_dropoff';
    this.planPath(robot, task.targetPosition);
  }

  private handleDropoff(robot: Robot) {
    const started = this.robotWaitTick.get(robot.id) ?? this.tick;
    if (this.tick - started < DROPOFF_TICKS) return;

    const task = this.world.tasks.get(robot.taskId!)!;
    const parcel = this.world.parcels.get(task.parcelId)!;

    // Place parcel — detect if target is a conveyor cell
    parcel.carriedBy = undefined;
    parcel.position = { ...robot.position };
    const targetCell = this.world.getCell(
      task.targetPosition.x,
      task.targetPosition.y,
      task.targetPosition.floor,
    );
    if (targetCell?.type === 'conveyor') {
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
    // Resume prior navigation status
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
    // Stub: immediately enter elevator
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

      // Move parcels along conveyor direction
      for (const cell of conv.cells) {
        const parcel = this.findParcelAt(cell.x, cell.y, cell.floor);
        if (!parcel || parcel.status !== 'on_conveyor') continue;

        const delta = dirDelta(cell.direction);
        const nx = cell.x + delta.dx;
        const ny = cell.y + delta.dy;
        const nextCell = this.world.getCell(nx, ny, cell.floor);
        if (!nextCell) continue;

        parcel.position = { x: nx, y: ny, floor: cell.floor };
        if (nextCell.type !== 'conveyor') parcel.status = 'delivered';
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

  private emit(type: SimEvent['type'], data: Record<string, unknown>) {
    this.onEvent?.({ type, tick: this.tick, data });
  }
}

function dirDelta(dir: string) {
  switch (dir) {
    case 'N':
      return { dx: 0, dy: -1 };
    case 'S':
      return { dx: 0, dy: 1 };
    case 'E':
      return { dx: 1, dy: 0 };
    case 'W':
      return { dx: -1, dy: 0 };
    default:
      return { dx: 0, dy: 0 };
  }
}
