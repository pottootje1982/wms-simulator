import { Vec3 } from '../types';
import { World } from '../world/World';
import { STConstraint, spacetimeAStar } from './AStar';

export interface CBSAgent { id: string; start: Vec3; goal: Vec3; }

interface Conflict {
  agentA: string; agentB: string;
  x: number; y: number; floor: number; t: number;
  type: 'vertex' | 'edge';
  // edge only
  ax2?: number; ay2?: number; bx2?: number; by2?: number;
}

interface CTNode {
  constraints: Map<string, STConstraint[]>; // agentId -> constraints
  solution: Map<string, Vec3[]>;
  cost: number;
}

function padPath(path: Vec3[], len: number): Vec3[] {
  if (path.length === 0) return path;
  const p = [...path];
  while (p.length < len) p.push(p[p.length - 1]);
  return p;
}

function findConflict(solution: Map<string, Vec3[]>): Conflict | null {
  const ids = [...solution.keys()];
  const maxLen = Math.max(...[...solution.values()].map(p => p.length));

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]; const b = ids[j];
      const pa = padPath(solution.get(a)!, maxLen);
      const pb = padPath(solution.get(b)!, maxLen);

      for (let t = 0; t < maxLen; t++) {
        const va = pa[t]; const vb = pb[t];
        // Vertex conflict
        if (va.x === vb.x && va.y === vb.y && va.floor === vb.floor) {
          return { agentA: a, agentB: b, x: va.x, y: va.y, floor: va.floor, t, type: 'vertex' };
        }
        // Edge conflict (swap)
        if (t + 1 < maxLen) {
          const va2 = pa[t + 1]; const vb2 = pb[t + 1];
          if (va.x === vb2.x && va.y === vb2.y && va.floor === vb2.floor &&
              vb.x === va2.x && vb.y === va2.y && vb.floor === va2.floor) {
            return { agentA: a, agentB: b, x: va.x, y: va.y, floor: va.floor, t, type: 'edge' };
          }
        }
      }
    }
  }
  return null;
}

function cloneConstraints(src: Map<string, STConstraint[]>): Map<string, STConstraint[]> {
  const m = new Map<string, STConstraint[]>();
  for (const [k, v] of src) m.set(k, [...v]);
  return m;
}

export function planPaths(
  agents: CBSAgent[],
  world: World,
  existingPaths: Map<string, Vec3[]> = new Map(),
  maxIter = 500
): Map<string, Vec3[]> {
  if (agents.length === 0) return new Map();

  // Build root
  const root: CTNode = {
    constraints: new Map(agents.map(a => [a.id, []])),
    solution: new Map(),
    cost: 0
  };

  for (const a of agents) {
    const path = spacetimeAStar(a.start, a.goal, world, root.constraints.get(a.id)!);
    if (!path) {
      // Agent has no path — skip (return existing path or empty)
      root.solution.set(a.id, existingPaths.get(a.id) ?? [a.start]);
    } else {
      root.solution.set(a.id, path);
    }
  }
  root.cost = [...root.solution.values()].reduce((s, p) => s + p.length, 0);

  const OPEN: CTNode[] = [root];
  let iter = 0;

  while (OPEN.length > 0 && iter < maxIter) {
    iter++;
    OPEN.sort((a, b) => a.cost - b.cost);
    const node = OPEN.shift()!;

    const conflict = findConflict(node.solution);
    if (!conflict) return node.solution; // conflict-free

    for (const agentId of [conflict.agentA, conflict.agentB]) {
      const child: CTNode = {
        constraints: cloneConstraints(node.constraints),
        solution: new Map(node.solution),
        cost: 0
      };

      const ac = child.constraints.get(agentId) ?? [];
      ac.push({ x: conflict.x, y: conflict.y, floor: conflict.floor, t: conflict.t });
      child.constraints.set(agentId, ac);

      const agent = agents.find(a => a.id === agentId);
      if (!agent) continue;

      const newPath = spacetimeAStar(agent.start, agent.goal, world, ac);
      if (!newPath) continue; // infeasible branch

      child.solution.set(agentId, newPath);
      child.cost = [...child.solution.values()].reduce((s, p) => s + p.length, 0);
      OPEN.push(child);
    }
  }

  // CBS timed out — return best known solution
  return OPEN.length > 0 ? OPEN[0].solution : root.solution;
}
