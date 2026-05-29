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
  //  FLOOR 0  (36 × 22)
  //   y=0  →→→→ INBOUND BELT →→→→→→→→→→→→→→→→→→→→→→→→→→
  //   y=2  ·[A1]··[B1]··[C1]··[D1]·  (shelf access left, unit right)
  //   y=4  ·[A2]··[B2]··[C2]··[D2]·
  //   y=6  ·[A3]··[B3]··[C3]··[D3]·
  //   y=8  ·[A4]··[B4]··[C4]··[D4]·
  //   y=10 →→→→→→→→→→→→ PICK BELT →→→→→→→→→→→→→→→→→→→→→↓
  //   y=11 ·[A5]··[B5]··[C5]·····················[Elev]··↓ SPINE x=35
  //   y=13 ·[A6]··[B6]··[C6]···························· ↓
  //   y=15 ·[A7]··[B7]··[C7]·····················[Elev]··↓
  //   y=17 ←←←←←←←←←←←←←←← OUTBOUND ←←←←←←←←←←←←←←←←↙
  //   y=18 [SHIP]  [Op-1]  [Op-2]
  //   y=20  R1  R2  R3  R4  R5  R6  R7
  //
  //  FLOOR 1  (partial)
  //   y=3  ·[E1]··[F1]·             [Elev]
  //   y=6  ·[E2]··[F2]·
  //   y=9  ·[E3]··[F3]·
  //   R8 starts at (2,0,1); picks from E/F, takes elevator to F0 pick belt

  private async loadDemo() {
    // World: 36 wide × 22 deep, 2 floors
    await post('/api/world', { width: 36, depth: 22, floors: 2 });

    // ── Conveyors ──────────────────────────────────────────
    // 1. INBOUND — straight E at y=0, x=0→28 (receiving dock visual)
    await post('/api/conveyors', { label: 'Inbound', speedTicks: 3, cells: [
      ...Array.from({ length: 29 }, (_, i) => ({ x: i, y: 0, floor: 0, direction: 'E' as const })),
    ]});

    // 2. PICK + SORT + OUTBOUND — one continuous U-belt
    //    East leg  : y=10, x=0→34
    //    SE bend   : (35,10) → S
    //    South spine: x=35, y=11→16
    //    SW bend   : (35,17) → W
    //    West leg  : y=17, x=34→0  (outbound to shipping dock)
    await post('/api/conveyors', { label: 'Pick · Sort · Outbound', speedTicks: 2, cells: [
      ...Array.from({ length: 35 }, (_, i) => ({ x: i,  y: 10,    floor: 0, direction: 'E' as const })),
      { x: 35, y: 10, floor: 0, direction: 'S' as const },  // bend E→S
      ...Array.from({ length: 6 },  (_, i) => ({ x: 35, y: 11+i, floor: 0, direction: 'S' as const })),
      { x: 35, y: 17, floor: 0, direction: 'W' as const },  // bend S→W
      ...Array.from({ length: 35 }, (_, i) => ({ x: 34-i, y: 17, floor: 0, direction: 'W' as const })),
    ]});

    // ── Shelves floor 0 ────────────────────────────────────
    // Lane A  access x=2, shelf x=3   (7 bays, y=2,4,6,8,11,13,15)
    const sA1 = await post('/api/shelves', { label:'A1', x:2,  y:2,  floor:0, rows:2, cols:4 });
    const sA2 = await post('/api/shelves', { label:'A2', x:2,  y:4,  floor:0, rows:2, cols:4 });
    const sA3 = await post('/api/shelves', { label:'A3', x:2,  y:6,  floor:0, rows:2, cols:4 });
    const sA4 = await post('/api/shelves', { label:'A4', x:2,  y:8,  floor:0, rows:2, cols:4 });
    const sA5 = await post('/api/shelves', { label:'A5', x:2,  y:11, floor:0, rows:2, cols:4 });
    const sA6 = await post('/api/shelves', { label:'A6', x:2,  y:13, floor:0, rows:2, cols:4 });
    const sA7 = await post('/api/shelves', { label:'A7', x:2,  y:15, floor:0, rows:2, cols:4 });
    // Lane B  access x=6, shelf x=7   (7 bays)
    const sB1 = await post('/api/shelves', { label:'B1', x:6,  y:2,  floor:0, rows:2, cols:4 });
    const sB2 = await post('/api/shelves', { label:'B2', x:6,  y:4,  floor:0, rows:2, cols:4 });
    const sB3 = await post('/api/shelves', { label:'B3', x:6,  y:6,  floor:0, rows:2, cols:4 });
    const sB4 = await post('/api/shelves', { label:'B4', x:6,  y:8,  floor:0, rows:2, cols:4 });
    const sB5 = await post('/api/shelves', { label:'B5', x:6,  y:11, floor:0, rows:2, cols:4 });
    const sB6 = await post('/api/shelves', { label:'B6', x:6,  y:13, floor:0, rows:2, cols:4 });
    const sB7 = await post('/api/shelves', { label:'B7', x:6,  y:15, floor:0, rows:2, cols:4 });
    // Lane C  access x=10, shelf x=11  (7 bays)
    const sC1 = await post('/api/shelves', { label:'C1', x:10, y:2,  floor:0, rows:2, cols:4 });
    const sC2 = await post('/api/shelves', { label:'C2', x:10, y:4,  floor:0, rows:2, cols:4 });
    const sC3 = await post('/api/shelves', { label:'C3', x:10, y:6,  floor:0, rows:2, cols:4 });
    const sC4 = await post('/api/shelves', { label:'C4', x:10, y:8,  floor:0, rows:2, cols:4 });
    const sC5 = await post('/api/shelves', { label:'C5', x:10, y:11, floor:0, rows:2, cols:4 });
    const sC6 = await post('/api/shelves', { label:'C6', x:10, y:13, floor:0, rows:2, cols:4 });
    const sC7 = await post('/api/shelves', { label:'C7', x:10, y:15, floor:0, rows:2, cols:4 });
    // Lane D  access x=14, shelf x=15  (4 bays, north zone only)
    const sD1 = await post('/api/shelves', { label:'D1', x:14, y:2,  floor:0, rows:2, cols:4 });
    const sD2 = await post('/api/shelves', { label:'D2', x:14, y:4,  floor:0, rows:2, cols:4 });
    const sD3 = await post('/api/shelves', { label:'D3', x:14, y:6,  floor:0, rows:2, cols:4 });
    const sD4 = await post('/api/shelves', { label:'D4', x:14, y:8,  floor:0, rows:2, cols:4 });

    // ── Shelves floor 1 ────────────────────────────────────
    // Lane E  access x=4, shelf x=5, floor=1
    const sE1 = await post('/api/shelves', { label:'E1', x:4, y:3, floor:1, rows:2, cols:3 });
    const sE2 = await post('/api/shelves', { label:'E2', x:4, y:6, floor:1, rows:2, cols:3 });
    const sE3 = await post('/api/shelves', { label:'E3', x:4, y:9, floor:1, rows:2, cols:3 });
    // Lane F  access x=8, shelf x=9, floor=1
    const sF1 = await post('/api/shelves', { label:'F1', x:8, y:3, floor:1, rows:2, cols:3 });
    const sF2 = await post('/api/shelves', { label:'F2', x:8, y:6, floor:1, rows:2, cols:3 });
    const sF3 = await post('/api/shelves', { label:'F3', x:8, y:9, floor:1, rows:2, cols:3 });

    // ── Elevator & operators ────────────────────────────────
    // Elevator at right side, between south shelves and outbound; serves both floors
    await post('/api/elevators', { x: 32, y: 15, floors: [0, 1] });
    await post('/api/operators', { name: 'Op-1', x: 22, y: 18, floor: 0 });
    await post('/api/operators', { name: 'Op-2', x: 26, y: 18, floor: 0 });

    // ── Robots ─────────────────────────────────────────────
    await post('/api/robots', { name:'R1', x:1,  y:20, floor:0, color:'#f59e0b' });
    await post('/api/robots', { name:'R2', x:3,  y:20, floor:0, color:'#06b6d4' });
    await post('/api/robots', { name:'R3', x:5,  y:20, floor:0, color:'#a855f7' });
    await post('/api/robots', { name:'R4', x:7,  y:20, floor:0, color:'#ef4444' });
    await post('/api/robots', { name:'R5', x:9,  y:20, floor:0, color:'#10b981' });
    await post('/api/robots', { name:'R6', x:11, y:20, floor:0, color:'#0ea5e9' });
    await post('/api/robots', { name:'R7', x:13, y:20, floor:0, color:'#f97316' });
    // Floor 1 robot — picks E/F shelves, navigates via elevator to drop on pick belt (floor 0)
    await post('/api/robots', { name:'R8', x:2,  y:0,  floor:1, color:'#e879f9' });

    // ── Parcels — one per shelf, tasked shelves get a second fill slot ──
    // Lane A (amber/orange)
    const pA1 = await post('/api/parcels', { label:'A1-001', shelfId:sA1.id, slotRow:0, slotCol:0, color:'#d97706' });
    await post('/api/parcels',             { label:'A1-002', shelfId:sA1.id, slotRow:1, slotCol:2, color:'#b45309' });
    const pA2 = await post('/api/parcels', { label:'A2-001', shelfId:sA2.id, slotRow:0, slotCol:1, color:'#92400e' });
    await post('/api/parcels',             { label:'A2-002', shelfId:sA2.id, slotRow:1, slotCol:3, color:'#78350f' });
    await post('/api/parcels',             { label:'A3-001', shelfId:sA3.id, slotRow:0, slotCol:0, color:'#c2410c' });
    await post('/api/parcels',             { label:'A4-001', shelfId:sA4.id, slotRow:1, slotCol:1, color:'#ea580c' });
    const pA5 = await post('/api/parcels', { label:'A5-001', shelfId:sA5.id, slotRow:0, slotCol:0, color:'#dc2626' });
    await post('/api/parcels',             { label:'A5-002', shelfId:sA5.id, slotRow:1, slotCol:2, color:'#b91c1c' });
    await post('/api/parcels',             { label:'A6-001', shelfId:sA6.id, slotRow:0, slotCol:3, color:'#991b1b' });
    await post('/api/parcels',             { label:'A7-001', shelfId:sA7.id, slotRow:1, slotCol:0, color:'#7f1d1d' });
    // Lane B (green)
    const pB1 = await post('/api/parcels', { label:'B1-001', shelfId:sB1.id, slotRow:0, slotCol:0, color:'#065f46' });
    await post('/api/parcels',             { label:'B1-002', shelfId:sB1.id, slotRow:1, slotCol:3, color:'#047857' });
    await post('/api/parcels',             { label:'B2-001', shelfId:sB2.id, slotRow:0, slotCol:2, color:'#059669' });
    const pB3 = await post('/api/parcels', { label:'B3-001', shelfId:sB3.id, slotRow:1, slotCol:0, color:'#10b981' });
    await post('/api/parcels',             { label:'B3-002', shelfId:sB3.id, slotRow:0, slotCol:2, color:'#0d9488' });
    await post('/api/parcels',             { label:'B4-001', shelfId:sB4.id, slotRow:0, slotCol:1, color:'#0f766e' });
    const pB5 = await post('/api/parcels', { label:'B5-001', shelfId:sB5.id, slotRow:0, slotCol:0, color:'#134e4a' });
    await post('/api/parcels',             { label:'B5-002', shelfId:sB5.id, slotRow:1, slotCol:3, color:'#164e63' });
    await post('/api/parcels',             { label:'B6-001', shelfId:sB6.id, slotRow:0, slotCol:2, color:'#155e75' });
    await post('/api/parcels',             { label:'B7-001', shelfId:sB7.id, slotRow:1, slotCol:1, color:'#0c4a6e' });
    // Lane C (blue)
    const pC1 = await post('/api/parcels', { label:'C1-001', shelfId:sC1.id, slotRow:0, slotCol:0, color:'#1d4ed8' });
    await post('/api/parcels',             { label:'C1-002', shelfId:sC1.id, slotRow:1, slotCol:2, color:'#1e40af' });
    await post('/api/parcels',             { label:'C2-001', shelfId:sC2.id, slotRow:0, slotCol:3, color:'#1e3a8a' });
    const pC3 = await post('/api/parcels', { label:'C3-001', shelfId:sC3.id, slotRow:0, slotCol:1, color:'#2563eb' });
    await post('/api/parcels',             { label:'C4-001', shelfId:sC4.id, slotRow:1, slotCol:0, color:'#3b82f6' });
    const pC5 = await post('/api/parcels', { label:'C5-001', shelfId:sC5.id, slotRow:0, slotCol:0, color:'#60a5fa' });
    await post('/api/parcels',             { label:'C5-002', shelfId:sC5.id, slotRow:1, slotCol:3, color:'#7c3aed' });
    await post('/api/parcels',             { label:'C6-001', shelfId:sC6.id, slotRow:0, slotCol:2, color:'#6d28d9' });
    await post('/api/parcels',             { label:'C7-001', shelfId:sC7.id, slotRow:1, slotCol:1, color:'#5b21b6' });
    // Lane D (pink/rose)
    const pD1 = await post('/api/parcels', { label:'D1-001', shelfId:sD1.id, slotRow:0, slotCol:0, color:'#be185d' });
    await post('/api/parcels',             { label:'D1-002', shelfId:sD1.id, slotRow:1, slotCol:2, color:'#9d174d' });
    await post('/api/parcels',             { label:'D2-001', shelfId:sD2.id, slotRow:0, slotCol:1, color:'#db2777' });
    const pD3 = await post('/api/parcels', { label:'D3-001', shelfId:sD3.id, slotRow:0, slotCol:3, color:'#ec4899' });
    await post('/api/parcels',             { label:'D3-002', shelfId:sD3.id, slotRow:1, slotCol:0, color:'#f472b6' });
    await post('/api/parcels',             { label:'D4-001', shelfId:sD4.id, slotRow:1, slotCol:2, color:'#f9a8d4' });
    // Floor 1 — Lane E (yellow)
    const pE1 = await post('/api/parcels', { label:'E1-001', shelfId:sE1.id, slotRow:0, slotCol:0, color:'#d97706' });
    await post('/api/parcels',             { label:'E2-001', shelfId:sE2.id, slotRow:0, slotCol:1, color:'#fbbf24' });
    await post('/api/parcels',             { label:'E3-001', shelfId:sE3.id, slotRow:1, slotCol:2, color:'#fcd34d' });
    // Floor 1 — Lane F (lime)
    const pF1 = await post('/api/parcels', { label:'F1-001', shelfId:sF1.id, slotRow:0, slotCol:0, color:'#84cc16' });
    await post('/api/parcels',             { label:'F2-001', shelfId:sF2.id, slotRow:1, slotCol:0, color:'#65a30d' });
    await post('/api/parcels',             { label:'F3-001', shelfId:sF3.id, slotRow:0, slotCol:2, color:'#4d7c0f' });

    // ── Transfer tasks — all targets are on the PICK BELT (y=10, floor=0) ──
    // Robots pick from shelves and deposit anywhere along the east leg of the U-belt.
    // Items then flow: east → spine (x=35) → south → west (outbound) → shipping dock.
    //
    // Drop x chosen near the robot's lane so paths are short:
    //   Lane A → x≈2..4,  Lane B → x≈6..8,  Lane C → x≈10..12,  Lane D → x≈14..15
    //   Floor-1 robots emerge from elevator on east side → drop farther east (x≈20-22)
    await post('/api/commands/transfer', { parcelId:pA1.id, targetX: 2,  targetY:10, targetFloor:0 });
    await post('/api/commands/transfer', { parcelId:pA2.id, targetX: 3,  targetY:10, targetFloor:0 });
    await post('/api/commands/transfer', { parcelId:pA5.id, targetX: 4,  targetY:10, targetFloor:0 });
    await post('/api/commands/transfer', { parcelId:pB1.id, targetX: 6,  targetY:10, targetFloor:0 });
    await post('/api/commands/transfer', { parcelId:pB3.id, targetX: 7,  targetY:10, targetFloor:0 });
    await post('/api/commands/transfer', { parcelId:pB5.id, targetX: 8,  targetY:10, targetFloor:0 });
    await post('/api/commands/transfer', { parcelId:pC1.id, targetX:10,  targetY:10, targetFloor:0 });
    await post('/api/commands/transfer', { parcelId:pC3.id, targetX:11,  targetY:10, targetFloor:0 });
    await post('/api/commands/transfer', { parcelId:pC5.id, targetX:12,  targetY:10, targetFloor:0 });
    await post('/api/commands/transfer', { parcelId:pD1.id, targetX:14,  targetY:10, targetFloor:0 });
    await post('/api/commands/transfer', { parcelId:pD3.id, targetX:15,  targetY:10, targetFloor:0 });
    // R8 (floor 1) picks E1 → elevator → drop farther east on pick belt
    await post('/api/commands/transfer', { parcelId:pE1.id, targetX:20,  targetY:10, targetFloor:0 });
    await post('/api/commands/transfer', { parcelId:pF1.id, targetX:22,  targetY:10, targetFloor:0 });

    // ── Start ─────────────────────────────────────────────
    await post('/api/sim/start', { ticksPerSecond: 5 });
  }
}
