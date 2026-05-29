import { SceneManager } from './renderer/SceneManager';
import { WarehouseRenderer } from './renderer/WarehouseRenderer';
import { WSClient } from './ws/WSClient';
import { Panel } from './ui/Panel';
import { HUD } from './ui/HUD';
import { FullStatePayload, TickUpdatePayload, SimEvent } from './types';

// ── Boot ───────────────────────────────────────────────────
const canvas = document.getElementById('three-canvas') as HTMLCanvasElement;
const sm     = new SceneManager(canvas);
const wr     = new WarehouseRenderer(sm);
const ws     = new WSClient();
const panel  = new Panel();
const hud    = new HUD();

let activeFloor = 0;
let lastFullState: FullStatePayload | null = null;

// ── WebSocket ─────────────────────────────────────────────
ws.onFullState = (state: FullStatePayload) => {
  lastFullState = state;
  wr.applyFullState(state);
  panel.updateState(state);
  hud.updateFromFull(state);
  buildFloorButtons(state.config.floors);
};

ws.onTickUpdate = (update: TickUpdatePayload) => {
  wr.applyTickUpdate(update);
  hud.updateFromTick(update);
  if (lastFullState) {
    const merged: FullStatePayload = {
      ...lastFullState,
      tick:      update.tick,
      robots:    update.robots,
      elevators: update.elevators,
      parcels:   update.parcels,
      tasks:     update.tasks,
    };
    lastFullState = merged;
    panel.updateState(merged);
  }
};

ws.onSimEvent = (event: SimEvent) => {
  hud.log(`[T${event.tick}] ${event.type}: ${JSON.stringify(event.data)}`, 'event');
};

ws.onConnected    = () => hud.log('[WS] Connected to server', 'info');
ws.onDisconnected = () => hud.log('[WS] Disconnected — reconnecting…', 'error');

ws.connect(`ws://${location.hostname}:3000/ws`);

// ── Floor selector ────────────────────────────────────────
function buildFloorButtons(floors: number) {
  const container = document.getElementById('floor-selector')!;
  container.innerHTML = '';
  for (let f = 0; f < floors; f++) {
    const btn = document.createElement('button');
    btn.className = `floor-btn${f === activeFloor ? ' active' : ''}`;
    btn.textContent = `Floor ${f}`;
    btn.addEventListener('click', () => {
      activeFloor = f;
      wr.setFloor(f);
      hud.setFloor(f);
      container.querySelectorAll('.floor-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    container.appendChild(btn);
  }
}

// ── Panel ─────────────────────────────────────────────────
panel.init();

// ── Render loop ───────────────────────────────────────────
sm.startLoop(dt => {
  wr.animateFrame(dt);
});
