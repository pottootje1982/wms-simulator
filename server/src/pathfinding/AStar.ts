import { Vec3 } from '../types';
import { World } from '../world/World';

export interface STConstraint {
  x: number; y: number; floor: number; t: number;
}

interface Node {
  x: number; y: number; floor: number; t: number;
  g: number; f: number;
  parent: Node | null;
}

function key(x: number, y: number, floor: number, t: number) {
  return `${x},${y},${floor},${t}`;
}

export function spacetimeAStar(
  start: Vec3,
  goal: Vec3,
  world: World,
  constraints: STConstraint[],
  maxT = 200
): Vec3[] | null {
  const cset = new Set(constraints.map(c => key(c.x, c.y, c.floor, c.t)));
  const h = (v: Vec3) => world.manhattan(v, goal);

  // Min-heap via sorted array (small enough for warehouse scale)
  const open: Node[] = [];
  const push = (n: Node) => {
    open.push(n);
    open.sort((a, b) => a.f - b.f);
  };

  const visited = new Map<string, number>();

  push({ x: start.x, y: start.y, floor: start.floor, t: 0, g: 0, f: h(start), parent: null });

  while (open.length > 0) {
    const cur = open.shift()!;
    const k = key(cur.x, cur.y, cur.floor, cur.t);

    if ((visited.get(k) ?? Infinity) <= cur.g) continue;
    visited.set(k, cur.g);

    if (cur.x === goal.x && cur.y === goal.y && cur.floor === goal.floor) {
      // Reconstruct path
      const path: Vec3[] = [];
      let n: Node | null = cur;
      while (n) {
        path.unshift({ x: n.x, y: n.y, floor: n.floor });
        n = n.parent;
      }
      return path;
    }

    if (cur.t >= maxT) continue;

    const curVec: Vec3 = { x: cur.x, y: cur.y, floor: cur.floor };
    const nexts = [...world.neighborsWithElevator(curVec), curVec]; // include wait

    for (const nv of nexts) {
      const nt = cur.t + 1;
      if (cset.has(key(nv.x, nv.y, nv.floor, nt))) continue;

      const ng = cur.g + 1;
      const nk = key(nv.x, nv.y, nv.floor, nt);
      if ((visited.get(nk) ?? Infinity) <= ng) continue;

      push({ x: nv.x, y: nv.y, floor: nv.floor, t: nt, g: ng, f: ng + h(nv), parent: cur });
    }
  }

  return null; // no path
}
