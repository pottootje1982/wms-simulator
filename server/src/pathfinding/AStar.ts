import { NavVec3, STConstraint, Elevator } from '../types';
import { NavGrid } from '../world/NavGrid';

interface Node {
  nx: number; ny: number; floor: number; t: number;
  g: number; f: number;
  parent: Node | null;
}

function key(nx: number, ny: number, floor: number, t: number) {
  return `${nx},${ny},${floor},${t}`;
}

class NodeHeap {
  private data: Node[] = [];
  get length() { return this.data.length; }

  push(n: Node) {
    this.data.push(n);
    let i = this.data.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.data[p].f <= this.data[i].f) break;
      [this.data[i], this.data[p]] = [this.data[p], this.data[i]];
      i = p;
    }
  }

  shift(): Node | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      let i = 0;
      while (true) {
        let m = i;
        const l = 2 * i + 1, r = 2 * i + 2, n = this.data.length;
        if (l < n && this.data[l].f < this.data[m].f) m = l;
        if (r < n && this.data[r].f < this.data[m].f) m = r;
        if (m === i) break;
        [this.data[i], this.data[m]] = [this.data[m], this.data[i]];
        i = m;
      }
    }
    return top;
  }
}

export function spacetimeAStar(
  start: NavVec3,
  goal: NavVec3,
  navGrid: NavGrid,
  elevators: Map<string, Elevator>,
  constraints: STConstraint[],
  maxT = 200,
): NavVec3[] | null {
  const cset = new Set(constraints.map((c) => key(c.nx, c.ny, c.floor, c.t)));
  const h = (v: NavVec3) => navGrid.manhattan(v, goal);

  const open = new NodeHeap();
  const visited = new Map<string, number>();

  open.push({ nx: start.nx, ny: start.ny, floor: start.floor, t: 0, g: 0, f: h(start), parent: null });

  while (open.length > 0) {
    const cur = open.shift()!;
    const k = key(cur.nx, cur.ny, cur.floor, cur.t);

    if ((visited.get(k) ?? Infinity) <= cur.g) continue;
    visited.set(k, cur.g);

    if (cur.nx === goal.nx && cur.ny === goal.ny && cur.floor === goal.floor) {
      const path: NavVec3[] = [];
      let n: Node | null = cur;
      while (n) {
        path.unshift({ nx: n.nx, ny: n.ny, floor: n.floor });
        n = n.parent;
      }
      return path;
    }

    if (cur.t >= maxT) continue;

    const curNav: NavVec3 = { nx: cur.nx, ny: cur.ny, floor: cur.floor };
    const nexts = [...navGrid.neighborsWithElevator(curNav, elevators), curNav]; // include wait

    for (const nv of nexts) {
      const nt = cur.t + 1;
      if (cset.has(key(nv.nx, nv.ny, nv.floor, nt))) continue;

      const ng = cur.g + 1;
      const nk = key(nv.nx, nv.ny, nv.floor, nt);
      if ((visited.get(nk) ?? Infinity) <= ng) continue;

      open.push({ nx: nv.nx, ny: nv.ny, floor: nv.floor, t: nt, g: ng, f: ng + h(nv), parent: cur });
    }
  }

  return null;
}
