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

export function spacetimeAStar(
  start: NavVec3,
  goal: NavVec3,
  navGrid: NavGrid,
  elevators: Map<string, Elevator>,
  constraints: STConstraint[],
  maxT = 400   // doubled vs old (nav steps are 2× finer than world steps)
): NavVec3[] | null {
  const cset = new Set(constraints.map(c => key(c.nx, c.ny, c.floor, c.t)));
  const h = (v: NavVec3) => navGrid.manhattan(v, goal);

  // Min-heap via sorted array (warehouse scale is small enough)
  const open: Node[] = [];
  const push = (n: Node) => { open.push(n); open.sort((a, b) => a.f - b.f); };

  const visited = new Map<string, number>();

  push({ nx: start.nx, ny: start.ny, floor: start.floor, t: 0, g: 0, f: h(start), parent: null });

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

      push({ nx: nv.nx, ny: nv.ny, floor: nv.floor, t: nt, g: ng, f: ng + h(nv), parent: cur });
    }
  }

  return null;
}
