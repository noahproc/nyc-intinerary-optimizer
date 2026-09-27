import { formatClock } from "../time";
import { objective, simulate, type Problem } from "./schedule";

// Orienteering with time windows, solved heuristically:
//   1. greedy insertion (must-sees first, then nice-to-haves by value/added-time),
//   2. local search with 2-opt and single-stop relocate,
//   3. retry insertion of leftovers, and swap out a nice-to-have if a must-see
//      still doesn't fit.
// Good enough for ~15 stops in a few ms; no solver dependency.

export interface OptimizeInput extends Problem {
  /** Score per stop node (index-aligned with nodes; start/end ignored). */
  score: number[];
  /** Stop nodes that are must-sees. */
  must: Set<number>;
}

export interface OptimizeResult {
  route: number[];
  dropped: { node: number; reason: string }[];
}

const feasible = (p: Problem, route: number[]) => simulate(p, route).late === 0;
const cost = (p: Problem, route: number[]) => objective(simulate(p, route));

/** Best feasible position for `node` in `route`, or null. */
export function bestInsertion(p: Problem, route: number[], node: number): { pos: number; added: number } | null {
  const base = cost(p, route);
  let best: { pos: number; added: number } | null = null;
  for (let pos = 0; pos <= route.length; pos++) {
    const cand = [...route.slice(0, pos), node, ...route.slice(pos)];
    const sim = simulate(p, cand);
    if (sim.late > 0) continue;
    const added = objective(sim) - base;
    if (!best || added < best.added) best = { pos, added };
  }
  return best;
}

function greedyInsert(input: OptimizeInput, route: number[], pool: number[]): number[] {
  const remaining = new Set(pool);
  while (remaining.size) {
    let pick: { node: number; pos: number; ratio: number } | null = null;
    for (const node of remaining) {
      const ins = bestInsertion(input, route, node);
      if (!ins) continue;
      const added = ins.added + input.nodes[node].durationMin;
      const ratio = input.score[node] / Math.max(1, added);
      if (!pick || ratio > pick.ratio) pick = { node, pos: ins.pos, ratio };
    }
    if (!pick) break;
    route = [...route.slice(0, pick.pos), pick.node, ...route.slice(pick.pos)];
    remaining.delete(pick.node);
  }
  return route;
}

function localSearch(p: Problem, route: number[]): number[] {
  let best = route;
  let bestCost = cost(p, best);
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    // 2-opt: reverse route[i..j]
    for (let i = 0; i < best.length - 1 && !improved; i++) {
      for (let j = i + 1; j < best.length && !improved; j++) {
        const cand = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        if (!feasible(p, cand)) continue;
        const c = cost(p, cand);
        if (c < bestCost - 1e-6) {
          best = cand;
          bestCost = c;
          improved = true;
        }
      }
    }
    // Relocate: move one stop elsewhere (handles time windows better than 2-opt).
    for (let i = 0; i < best.length && !improved; i++) {
      const without = [...best.slice(0, i), ...best.slice(i + 1)];
      for (let pos = 0; pos <= without.length && !improved; pos++) {
        if (pos === i) continue;
        const cand = [...without.slice(0, pos), best[i], ...without.slice(pos)];
        if (!feasible(p, cand)) continue;
        const c = cost(p, cand);
        if (c < bestCost - 1e-6) {
          best = cand;
          bestCost = c;
          improved = true;
        }
      }
    }
  }
  return best;
}

/** Try to fit a must-see by removing one nice-to-have. */
function swapInMust(input: OptimizeInput, route: number[], must: number): number[] | null {
  const nices = route.filter((n) => !input.must.has(n)).sort((a, b) => input.score[a] - input.score[b]);
  for (const nice of nices) {
    const without = route.filter((n) => n !== nice);
    const ins = bestInsertion(input, without, must);
    if (ins) return [...without.slice(0, ins.pos), must, ...without.slice(ins.pos)];
  }
  return null;
}

function explain(input: OptimizeInput, route: number[], node: number): string {
  const { windows, durationMin } = input.nodes[node];
  if (windows.length === 0) return "Closed on this date.";
  const inDay = windows.filter((w) => Math.min(w.end, input.dayEnd) - Math.max(w.start, input.dayStart) >= durationMin);
  if (inDay.length === 0) {
    const w = windows[0];
    return `Only possible ${formatClock(w.start)}–${formatClock(w.end)}, which doesn't fit your ${formatClock(input.dayStart)}–${formatClock(input.dayEnd)} day.`;
  }
  // Minimum extra time it would need, ignoring windows.
  let minAdded = Infinity;
  const base = simulate(input, route);
  for (let pos = 0; pos <= route.length; pos++) {
    const sim = simulate(input, [...route.slice(0, pos), node, ...route.slice(pos)]);
    minAdded = Math.min(minAdded, sim.late - base.late);
  }
  const need = Number.isFinite(minAdded) && minAdded > 0 ? ` (about ${Math.ceil(minAdded)} min short)` : "";
  return input.must.has(node)
    ? `Doesn't fit with the other must-sees in your hours${need}. Try a longer day or dropping a stop.`
    : `Not enough time after the must-sees${need}.`;
}

export function optimize(input: OptimizeInput, fixed?: number[]): OptimizeResult {
  const stopNodes = input.nodes.map((_, i) => i).slice(1, -1);
  if (fixed) {
    // Keep the user's order; only slot in stops that aren't placed yet.
    const route = greedyInsert(input, fixed, stopNodes.filter((n) => !fixed.includes(n)));
    const dropped = stopNodes.filter((n) => !route.includes(n)).map((node) => ({ node, reason: explain(input, route, node) }));
    return { route, dropped };
  }
  const musts = stopNodes.filter((n) => input.must.has(n));
  const nices = stopNodes.filter((n) => !input.must.has(n));

  let route = greedyInsert(input, [], musts);
  route = localSearch(input, route);
  for (const m of musts.filter((n) => !route.includes(n))) {
    const retry = bestInsertion(input, route, m);
    if (retry) route = [...route.slice(0, retry.pos), m, ...route.slice(retry.pos)];
  }
  route = greedyInsert(input, route, nices);
  route = localSearch(input, route);

  for (const m of musts.filter((n) => !route.includes(n))) {
    const swapped = swapInMust(input, route, m);
    if (swapped) route = localSearch(input, greedyInsert(input, swapped, nices.filter((n) => !swapped.includes(n))));
  }
  // Local search can open up room; one more pass for leftovers.
  route = localSearch(input, greedyInsert(input, route, stopNodes.filter((n) => !route.includes(n))));

  const dropped = stopNodes.filter((n) => !route.includes(n)).map((node) => ({ node, reason: explain(input, route, node) }));
  return { route, dropped };
}
