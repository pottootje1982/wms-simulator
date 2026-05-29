import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocketPlugin from '@fastify/websocket';
import { World } from './world/World';
import { SimulationEngine } from './simulation/SimulationEngine';
import { WSHub } from './ws/Hub';
import { registerRoutes } from './api/routes';

const app = Fastify({ logger: true });

async function main() {
  await app.register(cors, { origin: true });
  await app.register(websocketPlugin);

  const world  = new World({ width: 20, depth: 15, floors: 2 });
  const engine = new SimulationEngine(world);
  const hub    = new WSHub();

  // Wire sim events → WebSocket broadcast
  engine.onTick = payload => hub.broadcast({ type: 'tick_update', payload });
  engine.onEvent = event  => hub.broadcast({ type: 'sim_event',   payload: event });

  registerRoutes(app, world, engine, hub);

  // WebSocket endpoint
  app.get('/ws', { websocket: true }, (socket) => {
    hub.add(socket);
    // Send full state on connect
    socket.send(JSON.stringify({
      type: 'full_state',
      payload: world.toFullState(engine.tick, engine.running, engine.ticksPerSecond)
    }));
  });

  const port = parseInt(process.env.PORT ?? '3000');
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`WMS server running on http://localhost:${port}`);
}

main().catch(err => { console.error(err); process.exit(1); });
