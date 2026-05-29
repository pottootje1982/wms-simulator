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
    document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document
          .querySelectorAll('.tab-btn')
          .forEach((b) => b.classList.remove('active'));
        document
          .querySelectorAll('.tab-pane')
          .forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        document
          .getElementById(`tab-${btn.dataset.tab}`)!
          .classList.add('active');
      });
    });
  }

  // ── Configure tab ────────────────────────────────────────

  private bindConfigure() {
    document
      .getElementById('btn-create-world')!
      .addEventListener('click', async () => {
        const width = +(
          document.getElementById('cfg-width') as HTMLInputElement
        ).value;
        const depth = +(
          document.getElementById('cfg-depth') as HTMLInputElement
        ).value;
        const floors = +(
          document.getElementById('cfg-floors') as HTMLInputElement
        ).value;
        await post('/api/world', { width, depth, floors }).catch((e) =>
          alert(String(e)),
        );
      });

    document
      .getElementById('btn-reset-world')!
      .addEventListener('click', async () => {
        if (!confirm('Reset entire world?')) return;
        await fetch('/api/world', { method: 'DELETE' });
      });

    document
      .getElementById('btn-sim-start')!
      .addEventListener('click', async () => {
        const tps = +(document.getElementById('cfg-tps') as HTMLInputElement)
          .value;
        await post('/api/sim/start', { ticksPerSecond: tps }).catch((e) =>
          alert(String(e)),
        );
      });

    document
      .getElementById('btn-sim-pause')!
      .addEventListener('click', async () => {
        await post('/api/sim/pause', {}).catch((e) => alert(String(e)));
      });

    document
      .getElementById('btn-sim-reset')!
      .addEventListener('click', async () => {
        await post('/api/sim/reset', {}).catch((e) => alert(String(e)));
      });

    document.getElementById('btn-demo')!.addEventListener('click', async () => {
      await this.loadDemo().catch((e) => alert(String(e)));
    });
  }

  // ── Entities tab ─────────────────────────────────────────

  private bindEntities() {
    document
      .getElementById('btn-add-shelf')!
      .addEventListener('click', async () => {
        await post('/api/shelves', {
          label:
            (document.getElementById('shelf-label') as HTMLInputElement)
              .value || undefined,
          x: +(document.getElementById('shelf-x') as HTMLInputElement).value,
          y: +(document.getElementById('shelf-y') as HTMLInputElement).value,
          floor: +(document.getElementById('shelf-floor') as HTMLInputElement)
            .value,
          rows: +(document.getElementById('shelf-rows') as HTMLInputElement)
            .value,
          cols: +(document.getElementById('shelf-cols') as HTMLInputElement)
            .value,
        }).catch((e) => alert(String(e)));
      });

    document
      .getElementById('btn-add-robot')!
      .addEventListener('click', async () => {
        await post('/api/robots', {
          name:
            (document.getElementById('robot-name') as HTMLInputElement).value ||
            undefined,
          x: +(document.getElementById('robot-x') as HTMLInputElement).value,
          y: +(document.getElementById('robot-y') as HTMLInputElement).value,
          floor: +(document.getElementById('robot-floor') as HTMLInputElement)
            .value,
          color: (document.getElementById('robot-color') as HTMLInputElement)
            .value,
        }).catch((e) => alert(String(e)));
      });

    document
      .getElementById('btn-add-elevator')!
      .addEventListener('click', async () => {
        const floorsStr = (
          document.getElementById('elev-floors') as HTMLInputElement
        ).value;
        const floors = floorsStr
          .split(',')
          .map((s) => parseInt(s.trim()))
          .filter((n) => !isNaN(n));
        await post('/api/elevators', {
          x: +(document.getElementById('elev-x') as HTMLInputElement).value,
          y: +(document.getElementById('elev-y') as HTMLInputElement).value,
          floors,
        }).catch((e) => alert(String(e)));
      });

    document
      .getElementById('btn-add-walls')!
      .addEventListener('click', async () => {
        const raw = (document.getElementById('wall-cells') as HTMLInputElement)
          .value;
        try {
          const cells = JSON.parse(raw);
          await post('/api/walls', { cells }).catch((e) => alert(String(e)));
        } catch {
          alert('Invalid JSON for wall cells');
        }
      });

    document
      .getElementById('btn-add-parcel')!
      .addEventListener('click', async () => {
        await post('/api/parcels', {
          shelfId: (
            document.getElementById('parcel-shelf-id') as HTMLInputElement
          ).value,
          slotRow: +(document.getElementById('parcel-row') as HTMLInputElement)
            .value,
          slotCol: +(document.getElementById('parcel-col') as HTMLInputElement)
            .value,
          label:
            (document.getElementById('parcel-label') as HTMLInputElement)
              .value || undefined,
        }).catch((e) => alert(String(e)));
      });
  }

  // ── Commands tab ─────────────────────────────────────────

  private bindCommands() {
    document
      .getElementById('btn-issue-transfer')!
      .addEventListener('click', async () => {
        const shelfId = (
          document.getElementById('cmd-shelf-id') as HTMLInputElement
        ).value.trim();
        await post('/api/commands/transfer', {
          parcelId: (
            document.getElementById('cmd-parcel-id') as HTMLInputElement
          ).value.trim(),
          targetX: +(document.getElementById('cmd-tx') as HTMLInputElement)
            .value,
          targetY: +(document.getElementById('cmd-ty') as HTMLInputElement)
            .value,
          targetFloor: +(
            document.getElementById('cmd-tfloor') as HTMLInputElement
          ).value,
          targetShelfId: shelfId || undefined,
          targetSlotRow: shelfId
            ? +(document.getElementById('cmd-srow') as HTMLInputElement).value
            : undefined,
          targetSlotCol: shelfId
            ? +(document.getElementById('cmd-scol') as HTMLInputElement).value
            : undefined,
        }).catch((e) => alert(String(e)));
      });
  }

  // ── Lists ────────────────────────────────────────────────

  private refreshEntityList() {
    if (!this.state) return;
    const list = document.getElementById('entity-list')!;
    list.innerHTML = '';

    const addItems = (
      label: string,
      items: { id: string; label?: string; name?: string; color?: string }[],
    ) => {
      if (items.length === 0) return;
      const header = document.createElement('li');
      header.className = 'section-title';
      header.textContent = `${label} (${items.length})`;
      list.appendChild(header);
      items.forEach((item) => {
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

    addItems(
      'Shelves',
      this.state.shelves.map((s) => ({ id: s.id, label: s.label })),
    );
    addItems(
      'Robots',
      this.state.robots.map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
      })),
    );
    addItems(
      'Parcels',
      this.state.parcels.map((p) => ({
        id: p.id,
        label: p.label,
        color: p.color,
      })),
    );
    addItems(
      'Elevators',
      this.state.elevators.map((e) => ({
        id: e.id,
        label: `Elevator ${e.x},${e.y}`,
      })),
    );
  }

  private refreshTaskList() {
    if (!this.state) return;
    const list = document.getElementById('task-list')!;
    list.innerHTML = '';
    const sorted = [...this.state.tasks].sort(
      (a, b) => b.createdAt - a.createdAt,
    );
    sorted.slice(0, 20).forEach((t) => {
      const div = document.createElement('div');
      div.className = `task-item ${t.status}`;
      const parcel = this.state!.parcels.find((p) => p.id === t.parcelId);
      const robot = t.robotId
        ? this.state!.robots.find((r) => r.id === t.robotId)
        : null;
      div.innerHTML = `
        <div class="task-row"><span>Parcel</span><span>${parcel?.label ?? t.parcelId.slice(0, 8)}</span></div>
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
    this.state.robots.forEach((r) => {
      const li = document.createElement('li');
      li.className = 'entity-item';
      const statusColor =
        r.status === 'idle'
          ? '#22c55e'
          : r.status.startsWith('navigating')
            ? '#3b82f6'
            : '#f59e0b';
      li.innerHTML = `
        <div class="dot" style="background:${r.color}"></div>
        <span class="entity-name">${r.name}</span>
        <span class="entity-status" style="color:${statusColor}">${r.status.replace(/_/g, ' ')}</span>
      `;
      list.appendChild(li);
    });
  }

  // ── Demo warehouse ───────────────────────────────────────

  private async loadDemo() {
    // World: 30 wide × 22 deep, 2 floors
    await post('/api/world', { width: 30, depth: 22, floors: 2 });

    // ── Conveyors ──────────────────────────────────────────
    // Conv1: Main inbound — W→E at y=0 (x=0..22), bends S at (22,0), S to y=18
    await post('/api/conveyors', {
      label: 'Inbound Main',
      speedTicks: 2,
      cells: [
        ...Array.from({ length: 22 }, (_, i) => ({
          x: i,
          y: 0,
          floor: 0,
          direction: 'E' as const,
        })),
        { x: 22, y: 0, floor: 0, direction: 'S' as const }, // bend E→S
        ...Array.from({ length: 18 }, (_, i) => ({
          x: 22,
          y: i + 1,
          floor: 0,
          direction: 'S' as const,
        })),
      ],
    });

    // Conv2: Cross-distribution — E at y=10 (x=2..13), bends N at (14,10), N to y=2
    await post('/api/conveyors', {
      label: 'Cross Sort',
      speedTicks: 2,
      cells: [
        ...Array.from({ length: 12 }, (_, i) => ({
          x: i + 2,
          y: 10,
          floor: 0,
          direction: 'E' as const,
        })),
        { x: 14, y: 10, floor: 0, direction: 'N' as const }, // bend E→N
        ...Array.from({ length: 8 }, (_, i) => ({
          x: 14,
          y: 9 - i,
          floor: 0,
          direction: 'N' as const,
        })),
      ],
    });

    // Conv3: Outbound shipping — straight E at y=19 (x=0..21)
    await post('/api/conveyors', {
      label: 'Outbound Ship',
      speedTicks: 3,
      cells: [
        ...Array.from({ length: 22 }, (_, i) => ({
          x: i,
          y: 19,
          floor: 0,
          direction: 'E' as const,
        })),
      ],
    });

    // Conv4: Floor-1 L-shape — E at y=2 (x=2..9), bends S at (10,2), S to y=8
    await post('/api/conveyors', {
      label: 'F1 Pick Feed',
      speedTicks: 2,
      cells: [
        ...Array.from({ length: 8 }, (_, i) => ({
          x: i + 2,
          y: 2,
          floor: 1,
          direction: 'E' as const,
        })),
        { x: 10, y: 2, floor: 1, direction: 'S' as const }, // bend E→S
        ...Array.from({ length: 6 }, (_, i) => ({
          x: 10,
          y: i + 3,
          floor: 1,
          direction: 'S' as const,
        })),
      ],
    });

    // ── Shelves floor 0 ────────────────────────────────────
    // Lane A  (access x=2, shelf x=3): 3 bays
    const sA1 = await post('/api/shelves', {
      label: 'A1',
      x: 2,
      y: 4,
      floor: 0,
      rows: 2,
      cols: 4,
    });
    const sA2 = await post('/api/shelves', {
      label: 'A2',
      x: 2,
      y: 7,
      floor: 0,
      rows: 2,
      cols: 4,
    });
    const sA3 = await post('/api/shelves', {
      label: 'A3',
      x: 2,
      y: 13,
      floor: 0,
      rows: 2,
      cols: 4,
    });
    // Lane B  (access x=6, shelf x=7): 3 bays
    const sB1 = await post('/api/shelves', {
      label: 'B1',
      x: 6,
      y: 4,
      floor: 0,
      rows: 2,
      cols: 4,
    });
    const sB2 = await post('/api/shelves', {
      label: 'B2',
      x: 6,
      y: 7,
      floor: 0,
      rows: 2,
      cols: 4,
    });
    const sB3 = await post('/api/shelves', {
      label: 'B3',
      x: 6,
      y: 13,
      floor: 0,
      rows: 2,
      cols: 4,
    });
    // Lane C  (access x=10, shelf x=11): 2 bays, above/below cross belt
    const sC1 = await post('/api/shelves', {
      label: 'C1',
      x: 10,
      y: 5,
      floor: 0,
      rows: 2,
      cols: 4,
    });
    const sC2 = await post('/api/shelves', {
      label: 'C2',
      x: 10,
      y: 13,
      floor: 0,
      rows: 2,
      cols: 4,
    });
    // Lane D  (access x=16, shelf x=17): 3 bays
    const sD1 = await post('/api/shelves', {
      label: 'D1',
      x: 16,
      y: 4,
      floor: 0,
      rows: 2,
      cols: 4,
    });
    const sD2 = await post('/api/shelves', {
      label: 'D2',
      x: 16,
      y: 8,
      floor: 0,
      rows: 2,
      cols: 4,
    });
    const sD3 = await post('/api/shelves', {
      label: 'D3',
      x: 16,
      y: 13,
      floor: 0,
      rows: 2,
      cols: 4,
    });

    // ── Shelves floor 1 ────────────────────────────────────
    const sE1 = await post('/api/shelves', {
      label: 'E1',
      x: 4,
      y: 5,
      floor: 1,
      rows: 2,
      cols: 3,
    });
    const sE2 = await post('/api/shelves', {
      label: 'E2',
      x: 4,
      y: 9,
      floor: 1,
      rows: 2,
      cols: 3,
    });
    const sF1 = await post('/api/shelves', {
      label: 'F1',
      x: 8,
      y: 5,
      floor: 1,
      rows: 2,
      cols: 3,
    });

    // ── Elevators ──────────────────────────────────────────
    await post('/api/elevators', { x: 20, y: 11, floors: [0, 1] });
    await post('/api/elevators', { x: 20, y: 14, floors: [0, 1] });

    // ── Operators ──────────────────────────────────────────
    await post('/api/operators', { name: 'Op-1', x: 25, y: 10, floor: 0 });
    await post('/api/operators', { name: 'Op-2', x: 25, y: 13, floor: 0 });

    // ── Robots floor 0 ────────────────────────────────────
    await post('/api/robots', {
      name: 'R1',
      x: 0,
      y: 20,
      floor: 0,
      color: '#f59e0b',
    });
    await post('/api/robots', {
      name: 'R2',
      x: 2,
      y: 20,
      floor: 0,
      color: '#06b6d4',
    });
    await post('/api/robots', {
      name: 'R3',
      x: 4,
      y: 20,
      floor: 0,
      color: '#a855f7',
    });
    await post('/api/robots', {
      name: 'R4',
      x: 6,
      y: 20,
      floor: 0,
      color: '#ef4444',
    });
    await post('/api/robots', {
      name: 'R5',
      x: 8,
      y: 20,
      floor: 0,
      color: '#10b981',
    });
    await post('/api/robots', {
      name: 'R6',
      x: 10,
      y: 20,
      floor: 0,
      color: '#0ea5e9',
    });
    await post('/api/robots', {
      name: 'R7',
      x: 12,
      y: 20,
      floor: 0,
      color: '#f97316',
    });

    // ── Robot floor 1 ─────────────────────────────────────
    await post('/api/robots', {
      name: 'R8',
      x: 0,
      y: 1,
      floor: 1,
      color: '#e879f9',
    });

    // ── Parcels floor 0 ───────────────────────────────────
    const pA1a = await post('/api/parcels', {
      label: 'PKG-A1a',
      shelfId: sA1.id,
      slotRow: 0,
      slotCol: 0,
      color: '#d97706',
    });
    const pA1b = await post('/api/parcels', {
      label: 'PKG-A1b',
      shelfId: sA1.id,
      slotRow: 1,
      slotCol: 2,
      color: '#b45309',
    });
    const pA2a = await post('/api/parcels', {
      label: 'PKG-A2a',
      shelfId: sA2.id,
      slotRow: 0,
      slotCol: 1,
      color: '#92400e',
    });
    const pA3a = await post('/api/parcels', {
      label: 'PKG-A3a',
      shelfId: sA3.id,
      slotRow: 1,
      slotCol: 3,
      color: '#78350f',
    });
    const pB1a = await post('/api/parcels', {
      label: 'PKG-B1a',
      shelfId: sB1.id,
      slotRow: 0,
      slotCol: 0,
      color: '#065f46',
    });
    const pB1b = await post('/api/parcels', {
      label: 'PKG-B1b',
      shelfId: sB1.id,
      slotRow: 1,
      slotCol: 3,
      color: '#047857',
    });
    const pB2a = await post('/api/parcels', {
      label: 'PKG-B2a',
      shelfId: sB2.id,
      slotRow: 0,
      slotCol: 2,
      color: '#0f766e',
    });
    const pC1a = await post('/api/parcels', {
      label: 'PKG-C1a',
      shelfId: sC1.id,
      slotRow: 0,
      slotCol: 0,
      color: '#1d4ed8',
    });
    const pC2a = await post('/api/parcels', {
      label: 'PKG-C2a',
      shelfId: sC2.id,
      slotRow: 0,
      slotCol: 2,
      color: '#1e40af',
    });
    const pD1a = await post('/api/parcels', {
      label: 'PKG-D1a',
      shelfId: sD1.id,
      slotRow: 0,
      slotCol: 1,
      color: '#7c3aed',
    });
    const pD2a = await post('/api/parcels', {
      label: 'PKG-D2a',
      shelfId: sD2.id,
      slotRow: 0,
      slotCol: 0,
      color: '#6d28d9',
    });
    const pD3a = await post('/api/parcels', {
      label: 'PKG-D3a',
      shelfId: sD3.id,
      slotRow: 1,
      slotCol: 2,
      color: '#c2410c',
    });
    // Shelf fill (not tasked — gives shelves a fuller look)
    await post('/api/parcels', {
      label: 'PKG-B3a',
      shelfId: sB3.id,
      slotRow: 0,
      slotCol: 1,
      color: '#0369a1',
    });
    await post('/api/parcels', {
      label: 'PKG-D1b',
      shelfId: sD1.id,
      slotRow: 1,
      slotCol: 3,
      color: '#4338ca',
    });

    // ── Parcels floor 1 ───────────────────────────────────
    const pE1a = await post('/api/parcels', {
      label: 'PKG-E1a',
      shelfId: sE1.id,
      slotRow: 0,
      slotCol: 0,
      color: '#b91c1c',
    });
    await post('/api/parcels', {
      label: 'PKG-E2a',
      shelfId: sE2.id,
      slotRow: 0,
      slotCol: 1,
      color: '#991b1b',
    });
    await post('/api/parcels', {
      label: 'PKG-F1a',
      shelfId: sF1.id,
      slotRow: 1,
      slotCol: 0,
      color: '#9a3412',
    });

    // ── Transfer tasks ────────────────────────────────────
    // 2 parcels onto Conv1 (inbound main, y=0)
    await post('/api/commands/transfer', {
      parcelId: pA1a.id,
      targetX: 0,
      targetY: 0,
      targetFloor: 0,
    });
    await post('/api/commands/transfer', {
      parcelId: pB1a.id,
      targetX: 1,
      targetY: 0,
      targetFloor: 0,
    });
    // 2 parcels onto Conv2 (cross sort, y=10, starts at x=2)
    await post('/api/commands/transfer', {
      parcelId: pC1a.id,
      targetX: 2,
      targetY: 10,
      targetFloor: 0,
    });
    await post('/api/commands/transfer', {
      parcelId: pD1a.id,
      targetX: 4,
      targetY: 10,
      targetFloor: 0,
    });
    // 4 parcels onto Conv3 (outbound, y=19)
    await post('/api/commands/transfer', {
      parcelId: pA2a.id,
      targetX: 0,
      targetY: 19,
      targetFloor: 0,
    });
    await post('/api/commands/transfer', {
      parcelId: pB2a.id,
      targetX: 1,
      targetY: 19,
      targetFloor: 0,
    });
    await post('/api/commands/transfer', {
      parcelId: pD2a.id,
      targetX: 2,
      targetY: 19,
      targetFloor: 0,
    });
    await post('/api/commands/transfer', {
      parcelId: pC2a.id,
      targetX: 3,
      targetY: 19,
      targetFloor: 0,
    });

    // Floor-1 parcel onto Conv4 (F1 pick feed, y=2, starts at x=2)
    await post('/api/commands/transfer', {
      parcelId: pE1a.id,
      targetX: 2,
      targetY: 2,
      targetFloor: 1,
    });

    // ── Start ─────────────────────────────────────────────
    await post('/api/sim/start', { ticksPerSecond: 5 });

    // Suppress unused: fill parcels + extra shelf refs
    void pA1b;
    void pA3a;
    void pB1b;
    void pD3a;
  }
}
