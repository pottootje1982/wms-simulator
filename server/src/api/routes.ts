import { FastifyInstance, FastifyRequest } from 'fastify';
import { World } from '../world/World';
import { SimulationEngine } from '../simulation/SimulationEngine';
import { WSHub } from '../ws/Hub';
import {
  WorldConfig,
  Vec3,
  Shelf,
  ShelfSlot,
  Elevator,
  Conveyor,
  ConveyorCell,
  Robot,
  Parcel,
  Operator,
  Wall,
  TransferTask,
  FullStatePayload,
} from '../types';
import { nanoid } from '../util';

export function registerRoutes(
  app: FastifyInstance,
  world: World,
  engine: SimulationEngine,
  hub: WSHub,
) {
  let batchMode = false;

  const broadcastFull = () => {
    if (batchMode) return;
    hub.broadcast({
      type: 'full_state',
      payload: world.toFullState(
        engine.tick,
        engine.running,
        engine.ticksPerSecond,
      ),
    });
  };

  // ── World ────────────────────────────────────────────────
  app.post(
    '/api/world',
    async (req: FastifyRequest<{ Body: WorldConfig }>, reply) => {
      const { width, depth, floors } = req.body;
      if (!width || !depth || !floors)
        return reply.status(400).send({ error: 'width/depth/floors required' });
      world.reset({ width, depth, floors });
      engine.reset();
      broadcastFull();
      return { ok: true, config: world.config };
    },
  );

  app.get('/api/world', async () =>
    world.toFullState(engine.tick, engine.running, engine.ticksPerSecond),
  );

  app.delete('/api/world', async () => {
    world.reset();
    engine.reset();
    broadcastFull();
    return { ok: true };
  });

  // ── Simulation control ───────────────────────────────────
  app.post(
    '/api/sim/start',
    async (req: FastifyRequest<{ Body: { ticksPerSecond?: number } }>) => {
      engine.start(req.body?.ticksPerSecond ?? 5);
      broadcastFull();
      return { ok: true, ticksPerSecond: engine.ticksPerSecond };
    },
  );

  app.post('/api/sim/pause', async () => {
    engine.pause();
    return { ok: true };
  });

  app.post('/api/sim/reset', async () => {
    engine.reset();
    broadcastFull();
    return { ok: true };
  });

  app.post(
    '/api/sim/perpetual',
    async (req: FastifyRequest<{ Body: { outboundConveyorId: string; floor?: number } }>) => {
      engine.enablePerpetual(req.body.outboundConveyorId, req.body.floor);
      return { ok: true };
    },
  );

  app.post('/api/sim/perpetual/stop', async () => {
    engine.disablePerpetual();
    return { ok: true };
  });

  app.post('/api/world/begin-batch', async () => {
    batchMode = true;
    return { ok: true };
  });

  app.post('/api/world/end-batch', async () => {
    batchMode = false;
    broadcastFull();
    return { ok: true };
  });

  app.get('/api/sim/state', async () =>
    world.toFullState(engine.tick, engine.running, engine.ticksPerSecond),
  );

  // ── Shelves ──────────────────────────────────────────────
  app.post(
    '/api/shelves',
    async (
      req: FastifyRequest<{
        Body: {
          label?: string;
          x: number;
          y: number;
          floor: number;
          rows: number;
          cols: number;
          facing?: 'N' | 'S' | 'E' | 'W';
        };
      }>,
      reply,
    ) => {
      const { label, x, y, floor, rows, cols, facing = 'E' } = req.body;
      if (
        x === undefined ||
        y === undefined ||
        floor === undefined ||
        !rows ||
        !cols
      )
        return reply
          .status(400)
          .send({ error: 'x/y/floor/rows/cols required' });

      const dx = facing === 'W' ? -1 : (facing === 'N' || facing === 'S') ? 0 : 1;
      const dy = facing === 'S' ? 1 : facing === 'N' ? -1 : 0;
      const shelfX = x + dx;
      const shelfY = y + dy;
      const slots: ShelfSlot[][] = Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => ({ row: r, col: c })),
      );
      const id = nanoid();
      const shelf: Shelf = {
        id,
        label: label ?? id,
        accessPosition: { x, y, floor },
        shelfPosition: { x: shelfX, y: shelfY, floor },
        rows,
        cols,
        slots,
        facing,
      };
      world.shelves.set(id, shelf);
      world.placeShelf(shelf);
      broadcastFull();
      return shelf;
    },
  );

  app.delete(
    '/api/shelves/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const shelf = world.shelves.get(req.params.id);
      if (!shelf) return reply.status(404).send({ error: 'Not found' });
      world.shelves.delete(req.params.id);
      world.removeShelf(shelf);
      broadcastFull();
      return { ok: true };
    },
  );

  // ── Walls ────────────────────────────────────────────────
  app.post(
    '/api/walls',
    async (
      req: FastifyRequest<{
        Body: { cells: Array<{ x: number; y: number; floor: number }> };
      }>,
    ) => {
      const created: Wall[] = [];
      for (const { x, y, floor } of req.body.cells ?? []) {
        const id = nanoid();
        const wall: Wall = { id, position: { x, y, floor } };
        world.walls.set(id, wall);
        world.placeWall(wall);
        created.push(wall);
      }
      broadcastFull();
      return created;
    },
  );

  // ── Elevators ────────────────────────────────────────────
  app.post(
    '/api/elevators',
    async (
      req: FastifyRequest<{
        Body: { x: number; y: number; floors: number[] };
      }>,
    ) => {
      const { x, y, floors } = req.body;
      const id = nanoid();
      const elev: Elevator = {
        id,
        x,
        y,
        floors,
        currentFloor: floors[0] ?? 0,
        status: 'idle',
        occupantIds: [],
      };
      world.elevators.set(id, elev);
      world.placeElevator(elev);
      broadcastFull();
      return elev;
    },
  );

  // ── Conveyors ────────────────────────────────────────────
  app.post(
    '/api/conveyors',
    async (
      req: FastifyRequest<{
        Body: { label?: string; cells: ConveyorCell[]; speedTicks?: number };
      }>,
    ) => {
      const { label, cells, speedTicks = 2 } = req.body;
      const id = nanoid();
      const conv: Conveyor = { id, label, cells, active: true, speedTicks };
      world.conveyors.set(id, conv);
      world.placeConveyor(conv);
      broadcastFull();
      return conv;
    },
  );

  // ── Robots ───────────────────────────────────────────────
  app.post(
    '/api/robots',
    async (
      req: FastifyRequest<{
        Body: {
          name?: string;
          x: number;
          y: number;
          floor: number;
          color?: string;
        };
      }>,
    ) => {
      const { name, x, y, floor, color = '#f59e0b' } = req.body;
      const id = nanoid();
      // Snap spawn position to nearest nav cell center to maintain the
      // invariant that robot positions are always nav-cell-aligned
      const snapped = world.navGrid.navToWorldVec3(
        world.navGrid.worldToNavVec3({ x, y, floor }),
      );
      const robot: Robot = {
        id,
        name: name ?? `Robot-${id.slice(0, 4)}`,
        position: snapped,
        prevPosition: snapped,
        visualOffset: 0,
        status: 'idle',
        color,
        battery: 100,
        basePosition: snapped,
      };
      world.robots.set(id, robot);
      broadcastFull();
      return robot;
    },
  );

  app.delete(
    '/api/robots/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
      if (!world.robots.has(req.params.id))
        return reply.status(404).send({ error: 'Not found' });
      world.robots.delete(req.params.id);
      broadcastFull();
      return { ok: true };
    },
  );

  // ── Operators ────────────────────────────────────────────
  app.post(
    '/api/operators',
    async (
      req: FastifyRequest<{
        Body: { name?: string; x: number; y: number; floor: number };
      }>,
    ) => {
      const { name, x, y, floor } = req.body;
      const id = nanoid();
      const op: Operator = {
        id,
        name: name ?? `Op-${id.slice(0, 4)}`,
        position: { x, y, floor },
      };
      world.operators.set(id, op);
      world.placeOperator(op);
      broadcastFull();
      return op;
    },
  );

  // ── Parcels ──────────────────────────────────────────────
  app.post(
    '/api/parcels',
    async (
      req: FastifyRequest<{
        Body: {
          label?: string;
          color?: string;
          shelfId: string;
          slotRow: number;
          slotCol: number;
        };
      }>,
      reply,
    ) => {
      const { label, color = '#78350f', shelfId, slotRow, slotCol } = req.body;
      const shelf = world.shelves.get(shelfId);
      if (!shelf) return reply.status(404).send({ error: 'Shelf not found' });
      const slot = shelf.slots[slotRow]?.[slotCol];
      if (!slot) return reply.status(400).send({ error: 'Invalid slot' });
      if (slot.parcelId)
        return reply.status(409).send({ error: 'Slot occupied' });

      const id = nanoid();
      const parcel: Parcel = {
        id,
        label: label ?? `PKG-${id.slice(0, 4)}`,
        color,
        status: 'on_shelf',
        shelfId,
        slotRow,
        slotCol,
      };
      slot.parcelId = id;
      world.parcels.set(id, parcel);
      broadcastFull();
      return parcel;
    },
  );

  // ── Commands ─────────────────────────────────────────────
  app.post(
    '/api/commands/transfer',
    async (
      req: FastifyRequest<{
        Body: {
          parcelId: string;
          targetX: number;
          targetY: number;
          targetFloor: number;
          targetShelfId?: string;
          targetSlotRow?: number;
          targetSlotCol?: number;
          robotId?: string;
        };
      }>,
      reply,
    ) => {
      const {
        parcelId,
        targetX,
        targetY,
        targetFloor,
        targetShelfId,
        targetSlotRow,
        targetSlotCol,
        robotId,
      } = req.body;
      if (!world.parcels.has(parcelId))
        return reply.status(404).send({ error: 'Parcel not found' });

      const id = nanoid();
      const task: TransferTask = {
        id,
        parcelId,
        targetPosition: { x: targetX, y: targetY, floor: targetFloor },
        targetShelfId,
        targetSlotRow,
        targetSlotCol,
        robotId,
        status: 'queued',
        createdAt: engine.tick,
      };
      world.tasks.set(id, task);
      broadcastFull();
      return task;
    },
  );

  app.get('/api/commands', async () => [...world.tasks.values()]);
}
