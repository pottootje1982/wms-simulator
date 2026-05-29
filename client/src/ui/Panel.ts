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
  //
  //  36 wide × 22 deep, floor 0
  //
  //  y=0   ►►►►►►►►►► INBOUND ►►►►►►►► [dock]
  //  y=1   · · · [R1][R2][R3][R4] · · [↕]   robots + elevator
  //  y=2   ▓ RACK A·N (32 bays, facing S into aisle) ▓
  //  y=3   ─────────── AISLE A ───────────────────────
  //  y=4   ─────────── AISLE A ───────────────────────
  //  y=5   ▓ RACK A·S ▓
  //  y=6   ▓ RACK B·N ▓  (back-to-back with A·S)
  //  y=7   ─────────── AISLE B ───────────────────────
  //  y=8   ─────────── AISLE B ───────────────────────
  //  y=9   ▓ RACK B·S ▓
  //  y=10  · · · · · HIGHWAY · · · · · · · · · · · ·
  //  y=11  · · · · · HIGHWAY · · · · · · · · · · · ·
  //  y=12  ▓ RACK C·N ▓
  //  y=13  ─────────── AISLE C ───────────────────────
  //  y=14  ─────────── AISLE C ───────────────────────
  //  y=15  ▓ RACK C·S ▓
  //  y=16  ▓ RACK D·N ▓  (back-to-back with C·S)
  //  y=17  ─────────── AISLE D ───────────────────────
  //  y=18  ─────────── AISLE D ───────────────────────
  //  y=19  ▓ RACK D·S ▓
  //  y=20  · · · [R5][R6][R7][R8] · · [↕]   robots + elevator
  //  y=21  [dock] ◄◄◄◄◄◄ OUTBOUND ◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄

  private async loadDemo() {
    const BAYS = 32;   // bays per rack row (x = 1..BAYS)
    const W    = 36;
    const D    = 22;

    await post('/api/world', { width: W, depth: D, floors: 2 });
    await post('/api/world/begin-batch', {});

    // ── Conveyors ──────────────────────────────────────────
    await post('/api/conveyors', {
      label: 'Inbound', speedTicks: 3,
      cells: Array.from({ length: W - 1 }, (_, i) => ({ x: i, y: 0, floor: 0, direction: 'E' as const })),
    });

    const outboundConv = await post('/api/conveyors', {
      label: 'Outbound', speedTicks: 2,
      cells: Array.from({ length: W - 1 }, (_, i) => ({ x: W - 2 - i, y: 21, floor: 0, direction: 'W' as const })),
    });

    // ── Rack rows ──────────────────────────────────────────
    // Each row: BAYS shelves at x=1..BAYS, facing N or S
    // facing='N' → body at accessY-1 (body above aisle on screen)
    // facing='S' → body at accessY+1 (body below aisle on screen)
    const rackRows: { accessY: number; facing: 'N' | 'S' }[] = [
      { accessY: 3,  facing: 'N' },  // body y=2  — A·N
      { accessY: 4,  facing: 'S' },  // body y=5  — A·S
      { accessY: 7,  facing: 'N' },  // body y=6  — B·N
      { accessY: 8,  facing: 'S' },  // body y=9  — B·S
      { accessY: 13, facing: 'N' },  // body y=12 — C·N
      { accessY: 14, facing: 'S' },  // body y=15 — C·S
      { accessY: 17, facing: 'N' },  // body y=16 — D·N
      { accessY: 18, facing: 'S' },  // body y=19 — D·S
    ];

    const rowLabels = ['A·N','A·S','B·N','B·S','C·N','C·S','D·N','D·S'];
    const allShelves: { id: string; slots: { row: number; col: number; parcelId?: string }[][] }[] = [];

    for (let ri = 0; ri < rackRows.length; ri++) {
      const { accessY, facing } = rackRows[ri];
      const rowLabel = rowLabels[ri];
      const rowPromises = Array.from({ length: BAYS }, (_, bi) =>
        post('/api/shelves', {
          label: `${rowLabel}-${bi + 1}`,
          x: bi + 1, y: accessY, floor: 0,
          rows: 3, cols: 2,
          facing,
        })
      );
      const rowShelves = await Promise.all(rowPromises);
      allShelves.push(...rowShelves);
    }

    // ── Robots ─────────────────────────────────────────────
    const colors = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899'];
    const robotDefs = [
      { name:'R1', x:4,  y:1  }, { name:'R2', x:6,  y:1  },
      { name:'R3', x:8,  y:1  }, { name:'R4', x:10, y:1  },
      { name:'R5', x:4,  y:20 }, { name:'R6', x:6,  y:20 },
      { name:'R7', x:8,  y:20 }, { name:'R8', x:10, y:20 },
    ];
    await Promise.all(robotDefs.map((r, i) =>
      post('/api/robots', { name: r.name, x: r.x, y: r.y, floor: 0, color: colors[i] })
    ));

    // ── Elevators ──────────────────────────────────────────
    await post('/api/elevators', { x: W - 2, y: 1,  floors: [0, 1] });
    await post('/api/elevators', { x: W - 2, y: 20, floors: [0, 1] });

    // ── Initial parcels (~40% fill) ────────────────────────
    const parcelColors = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#e91e8c'];
    let colorIdx = 0;
    await Promise.all(
      allShelves.flatMap(shelf =>
        shelf.slots.flat()
          .filter(() => Math.random() < 0.4)
          .map(slot =>
            post('/api/parcels', {
              shelfId: shelf.id,
              slotRow: slot.row,
              slotCol: slot.col,
              color: parcelColors[colorIdx++ % parcelColors.length],
            })
          )
      )
    );

    await post('/api/world/end-batch', {});

    // ── Start simulation ───────────────────────────────────
    await post('/api/sim/start', { ticksPerSecond: 5 });
    await post('/api/sim/perpetual', { outboundConveyorId: outboundConv.id });
  }
}
