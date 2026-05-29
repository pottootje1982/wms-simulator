import { post } from '../api';
import { FullStatePayload } from '../types';

export class Panel {
  private state: FullStatePayload | null = null;

  init() {
    this.bindTabs();
    this.bindConfigure();
    this.bindEntities();
    this.bindCommands();
  }

  updateState(state: FullStatePayload) {
    this.state = state;
    this.refreshEntityList();
    this.refreshTaskList();
    this.refreshRobotStatus();
  }

  // ── Tabs ────────────────────────────────────────────────

  private bindTabs() {
    document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`)!.classList.add('active');
      });
    });
  }

  // ── Configure tab ────────────────────────────────────────

  private bindConfigure() {
    document.getElementById('btn-create-world')!.addEventListener('click', async () => {
      const width  = +(document.getElementById('cfg-width') as HTMLInputElement).value;
      const depth  = +(document.getElementById('cfg-depth') as HTMLInputElement).value;
      const floors = +(document.getElementById('cfg-floors') as HTMLInputElement).value;
      await post('/api/world', { width, depth, floors }).catch(e => alert(String(e)));
    });

    document.getElementById('btn-reset-world')!.addEventListener('click', async () => {
      if (!confirm('Reset entire world?')) return;
      await fetch('/api/world', { method: 'DELETE' });
    });

    document.getElementById('btn-sim-start')!.addEventListener('click', async () => {
      const tps = +(document.getElementById('cfg-tps') as HTMLInputElement).value;
      await post('/api/sim/start', { ticksPerSecond: tps }).catch(e => alert(String(e)));
    });

    document.getElementById('btn-sim-pause')!.addEventListener('click', async () => {
      await post('/api/sim/pause', {}).catch(e => alert(String(e)));
    });

    document.getElementById('btn-sim-reset')!.addEventListener('click', async () => {
      await post('/api/sim/reset', {}).catch(e => alert(String(e)));
    });

    document.getElementById('btn-demo')!.addEventListener('click', async () => {
      await this.loadDemo().catch(e => alert(String(e)));
    });
  }

  // ── Entities tab ─────────────────────────────────────────

  private bindEntities() {
    document.getElementById('btn-add-shelf')!.addEventListener('click', async () => {
      await post('/api/shelves', {
        label: (document.getElementById('shelf-label') as HTMLInputElement).value || undefined,
        x:     +(document.getElementById('shelf-x') as HTMLInputElement).value,
        y:     +(document.getElementById('shelf-y') as HTMLInputElement).value,
        floor: +(document.getElementById('shelf-floor') as HTMLInputElement).value,
        rows:  +(document.getElementById('shelf-rows') as HTMLInputElement).value,
        cols:  +(document.getElementById('shelf-cols') as HTMLInputElement).value,
      }).catch(e => alert(String(e)));
    });

    document.getElementById('btn-add-robot')!.addEventListener('click', async () => {
      await post('/api/robots', {
        name:  (document.getElementById('robot-name') as HTMLInputElement).value || undefined,
        x:     +(document.getElementById('robot-x') as HTMLInputElement).value,
        y:     +(document.getElementById('robot-y') as HTMLInputElement).value,
        floor: +(document.getElementById('robot-floor') as HTMLInputElement).value,
        color: (document.getElementById('robot-color') as HTMLInputElement).value,
      }).catch(e => alert(String(e)));
    });

    document.getElementById('btn-add-elevator')!.addEventListener('click', async () => {
      const floorsStr = (document.getElementById('elev-floors') as HTMLInputElement).value;
      const floors = floorsStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      await post('/api/elevators', {
        x: +(document.getElementById('elev-x') as HTMLInputElement).value,
        y: +(document.getElementById('elev-y') as HTMLInputElement).value,
        floors,
      }).catch(e => alert(String(e)));
    });

    document.getElementById('btn-add-walls')!.addEventListener('click', async () => {
      const raw = (document.getElementById('wall-cells') as HTMLInputElement).value;
      try {
        const cells = JSON.parse(raw);
        await post('/api/walls', { cells }).catch(e => alert(String(e)));
      } catch { alert('Invalid JSON for wall cells'); }
    });

    document.getElementById('btn-add-parcel')!.addEventListener('click', async () => {
      await post('/api/parcels', {
        shelfId:  (document.getElementById('parcel-shelf-id') as HTMLInputElement).value,
        slotRow:  +(document.getElementById('parcel-row') as HTMLInputElement).value,
        slotCol:  +(document.getElementById('parcel-col') as HTMLInputElement).value,
        label:    (document.getElementById('parcel-label') as HTMLInputElement).value || undefined,
      }).catch(e => alert(String(e)));
    });
  }

  // ── Commands tab ─────────────────────────────────────────

  private bindCommands() {
    document.getElementById('btn-issue-transfer')!.addEventListener('click', async () => {
      const shelfId = (document.getElementById('cmd-shelf-id') as HTMLInputElement).value.trim();
      await post('/api/commands/transfer', {
        parcelId:     (document.getElementById('cmd-parcel-id') as HTMLInputElement).value.trim(),
        targetX:      +(document.getElementById('cmd-tx') as HTMLInputElement).value,
        targetY:      +(document.getElementById('cmd-ty') as HTMLInputElement).value,
        targetFloor:  +(document.getElementById('cmd-tfloor') as HTMLInputElement).value,
        targetShelfId: shelfId || undefined,
        targetSlotRow: shelfId ? +(document.getElementById('cmd-srow') as HTMLInputElement).value : undefined,
        targetSlotCol: shelfId ? +(document.getElementById('cmd-scol') as HTMLInputElement).value : undefined,
      }).catch(e => alert(String(e)));
    });
  }

  // ── Lists ────────────────────────────────────────────────

  private refreshEntityList() {
    if (!this.state) return;
    const list = document.getElementById('entity-list')!;
    list.innerHTML = '';

    const addItems = (label: string, items: { id: string; label?: string; name?: string; color?: string }[]) => {
      if (items.length === 0) return;
      const header = document.createElement('li');
      header.className = 'section-title';
      header.textContent = `${label} (${items.length})`;
      list.appendChild(header);
      items.forEach(item => {
        const li = document.createElement('li');
        li.className = 'entity-item';
        li.innerHTML = `
          ${item.color ? `<div class="dot" style="background:${item.color}"></div>` : ''}
          <span class="entity-name" title="${item.id}">${item.label ?? item.name ?? item.id}</span>
          <span class="entity-status">${item.id.slice(0, 8)}</span>
        `;
        list.appendChild(li);
      });
    };

    addItems('Shelves',   this.state.shelves.map(s => ({ id: s.id, label: s.label })));
    addItems('Robots',    this.state.robots.map(r => ({ id: r.id, name: r.name, color: r.color })));
    addItems('Parcels',   this.state.parcels.map(p => ({ id: p.id, label: p.label, color: p.color })));
    addItems('Elevators', this.state.elevators.map(e => ({ id: e.id, label: `Elevator ${e.x},${e.y}` })));
  }

  private refreshTaskList() {
    if (!this.state) return;
    const list = document.getElementById('task-list')!;
    list.innerHTML = '';
    const sorted = [...this.state.tasks].sort((a, b) => b.createdAt - a.createdAt);
    sorted.slice(0, 20).forEach(t => {
      const div = document.createElement('div');
      div.className = `task-item ${t.status}`;
      const parcel = this.state!.parcels.find(p => p.id === t.parcelId);
      const robot  = t.robotId ? this.state!.robots.find(r => r.id === t.robotId) : null;
      div.innerHTML = `
        <div class="task-row"><span>Parcel</span><span>${parcel?.label ?? t.parcelId.slice(0,8)}</span></div>
        <div class="task-row"><span>Status</span><span>${t.status}</span></div>
        <div class="task-row"><span>Robot</span><span>${robot?.name ?? '&#x2014;'}</span></div>
        <div class="task-row"><span>Dest</span><span>(${t.targetPosition.x},${t.targetPosition.y},F${t.targetPosition.floor})</span></div>
      `;
      list.appendChild(div);
    });
    if (sorted.length === 0) list.textContent = 'No tasks yet.';
  }

  refreshRobotStatus() {
    if (!this.state) return;
    const list = document.getElementById('robot-status-list')!;
    list.innerHTML = '';
    this.state.robots.forEach(r => {
      const li = document.createElement('li');
      li.className = 'entity-item';
      const statusColor = r.status === 'idle' ? '#22c55e' : r.status.startsWith('navigating') ? '#3b82f6' : '#f59e0b';
      li.innerHTML = `
        <div class="dot" style="background:${r.color}"></div>
        <span class="entity-name">${r.name}</span>
        <span class="entity-status" style="color:${statusColor}">${r.status.replace(/_/g,' ')}</span>
      `;
      list.appendChild(li);
    });
  }

  // ── Demo warehouse ───────────────────────────────────────

  private async loadDemo() {
    // Create world
    await post('/api/world', { width: 20, depth: 15, floors: 2 });

    // Shelves on floor 0
    const s1 = await post('/api/shelves', { label: 'A1', x: 2, y: 3, floor: 0, rows: 3, cols: 4 });
    const s2 = await post('/api/shelves', { label: 'A2', x: 2, y: 6, floor: 0, rows: 3, cols: 4 });
    const s3 = await post('/api/shelves', { label: 'B1', x: 6, y: 3, floor: 0, rows: 3, cols: 4 });
    await post('/api/shelves', { label: 'C1', x: 2, y: 3, floor: 1, rows: 2, cols: 3 });

    // Elevator
    await post('/api/elevators', { x: 10, y: 7, floors: [0, 1] });

    // Robots
    await post('/api/robots', { name: 'R1', x: 0, y: 0, floor: 0, color: '#f59e0b' });
    await post('/api/robots', { name: 'R2', x: 1, y: 0, floor: 0, color: '#06b6d4' });
    await post('/api/robots', { name: 'R3', x: 2, y: 0, floor: 0, color: '#a855f7' });

    // Parcels
    const p1 = await post('/api/parcels', { label: 'PKG-001', shelfId: s1.id, slotRow: 0, slotCol: 0, color: '#b45309' });
    const p2 = await post('/api/parcels', { label: 'PKG-002', shelfId: s2.id, slotRow: 0, slotCol: 0, color: '#065f46' });
    const p3 = await post('/api/parcels', { label: 'PKG-003', shelfId: s3.id, slotRow: 1, slotCol: 2, color: '#7c2d12' });

    // Some walls
    await post('/api/walls', { cells: [
      { x: 4, y: 0, floor: 0 }, { x: 4, y: 1, floor: 0 }, { x: 4, y: 2, floor: 0 },
    ]});

    // Issue transfers
    await post('/api/commands/transfer', { parcelId: p1.id, targetX: 15, targetY: 5, targetFloor: 0 });
    await post('/api/commands/transfer', { parcelId: p2.id, targetX: 12, targetY: 8, targetFloor: 0 });
    // p3 is declared but used only to demonstrate the pattern; suppress unused warning
    void p3;

    // Start sim
    await post('/api/sim/start', { ticksPerSecond: 5 });
  }
}
