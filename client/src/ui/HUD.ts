import { FullStatePayload, TickUpdatePayload } from '../types';

export class HUD {
  private tick    = document.getElementById('hud-tick')!;
  private status  = document.getElementById('hud-status')!;
  private robots  = document.getElementById('hud-robots')!;
  private tasks   = document.getElementById('hud-tasks')!;
  private floor   = document.getElementById('hud-floor')!;

  private logEl   = document.getElementById('log')!;

  updateFromFull(state: FullStatePayload) {
    this.tick.textContent   = String(state.tick);
    this.status.textContent = state.running ? 'Running' : 'Paused';
    this.status.style.color = state.running ? '#4ade80' : '#fb923c';
    this.robots.textContent = String(state.robots.length);
    const done = state.tasks.filter(t => t.status === 'completed').length;
    this.tasks.textContent  = `${done} / ${state.tasks.length}`;
  }

  updateFromTick(update: TickUpdatePayload) {
    this.tick.textContent = String(update.tick);
    const done = update.tasks.filter(t => t.status === 'completed').length;
    this.tasks.textContent = `${done} / ${update.tasks.length}`;
  }

  setFloor(f: number) { this.floor.textContent = String(f); }

  log(msg: string, type: 'info' | 'event' | 'error' = 'info') {
    const line = document.createElement('div');
    line.className = `log-line ${type === 'event' ? 'log-event' : type === 'error' ? 'log-error' : ''}`;
    line.textContent = msg;
    this.logEl.prepend(line);
    while (this.logEl.children.length > 100) this.logEl.lastChild?.remove();
  }
}
