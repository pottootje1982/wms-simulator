import { NavVec3, STConstraint, Elevator } from '../types';
import { NavGrid } from '../world/NavGrid';
import { spacetimeAStar } from './AStar';

export interface CBSAgent {
  id: string;
  startNav: NavVec3;
  goalNav: NavVec3;
}

interface Conflict {
  agentA: string;
  agentB: string;
  nx: number;
  ny: number;
  floor: number;
  t: number;
  type: 'vertex' | 'edge';
}

interface CTNode {
  constraints: Map<string, STConstraint[]>;
  solution: Map<string, NavVec3[]>;
  cost: number;
}

function padPath(path: NavVec3[], len: number): NavVec3[] {
  if (path.length === 0) return path;
  const p = [...path];
  while (p.length < len) p.push(p[p.length - 1]);
  return p;
}

function findConflict(solution: Map<string, NavVec3[]>): Conflict | null {
  const ids = [...solution.keys()];
  const maxLen = Math.max(...[...solution.values()].map((p) => p.length));

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      const pa = padPath(solution.get(a)!, maxLen);
      const pb = padPath(solution.get(b)!, maxLen);

      for (let t = 0; t < maxLen; t++) {
        const va = pa[t];
        const vb = pb[t];
        // Vertex conflict
        if (va.nx === vb.nx && va.ny === vb.ny && va.floor === vb.floor) {
          return {
            agentA: a,
            agentB: b,
            nx: va.nx,
            ny: va.ny,
            floor: va.floor,
            t,
            type: 'vertex',
          };
        }
        // Edge conflict (swap)
        if (t + 1 < maxLen) {
          const va2 = pa[t + 1];
          const vb2 = pb[t + 1];
          if (
            va.nx === vb2.nx &&
            va.ny === vb2.ny &&
            va.floor === vb2.floor &&
            vb.nx === va2.nx &&
            vb.ny === va2.ny &&
            vb.floor === va2.floor
          ) {
            return {
              agentA: a,
              agentB: b,
              nx: va.nx,
              ny: va.ny,
              floor: va.floor,
              t,
              type: 'edge',
            };
          }
        }
      }
    }
  }
  return null;
}

function cloneConstraints(
  src: Map<string, STConstraint[]>,
): Map<string, STConstraint[]> {
  const m = new Map<string, STConstraint[]>();
  for (const [k, v] of src) m.set(k, [...v]);
  return m;
}

export function planPaths(
  agents: CBSAgent[],
  navGrid: NavGrid,
  elevators: Map<string, Elevator>,
  existingNavPaths: Map<string, NavVec3[]> = new Map(),
  maxIter = 500,
): Map<string, NavVec3[]> {
  if (agents.length === 0) return new Map();

  const root: CTNode = {
    constraints: new Map(agents.map((a) => [a.id, []])),
    solution: new Map(),
    cost: 0,
  };

  for (const a of agents) {
    const path = spacetimeAStar(
      a.startNav,
      a.goalNav,
      navGrid,
      elevators,
      root.constraints.get(a.id)!,
    );
    root.solution.set(a.id, path ?? existingNavPaths.get(a.id) ?? [a.startNav]);
  }
  root.cost = [...root.solution.values()].reduce((s, p) => s + p.length, 0);

  const OPEN: CTNode[] = [root];
  let iter = 0;

  while (OPEN.length > 0 && iter < maxIter) {
    iter++;
    OPEN.sort((a, b) => a.cost - b.cost);
    const node = OPEN.shift()!;

    const conflict = findConflict(node.solution);
    if (!conflict) return node.solution;

    for (const agentId of [conflict.agentA, conflict.agentB]) {
      const child: CTNode = {
        constraints: cloneConstraints(node.constraints),
        solution: new Map(node.solution),
        cost: 0,
      };

      const ac = child.constraints.get(agentId) ?? [];
      ac.push({
        nx: conflict.nx,
        ny: conflict.ny,
        floor: conflict.floor,
        t: conflict.t,
      });
      child.constraints.set(agentId, ac);

      const agent = agents.find((a) => a.id === agentId);
      if (!agent) continue;

      const newPath = spacetimeAStar(
        agent.startNav,
        agent.goalNav,
        navGrid,
        elevators,
        ac,
      );
      if (!newPath) continue;

      child.solution.set(agentId, newPath);
      child.cost = [...child.solution.values()].reduce(
        (s, p) => s + p.length,
        0,
      );
      OPEN.push(child);
    }
  }

  return OPEN.length > 0 ? OPEN[0].solution : root.solution;
}
