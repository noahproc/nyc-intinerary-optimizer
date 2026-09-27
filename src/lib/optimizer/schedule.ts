import type { Minutes, TimeWindow } from "../types";

/** Everything the scheduler needs about one stop, indexed by position in the matrix. */
export interface NodeSpec {
  id: string;
  durationMin: Minutes;
  /** Allowed visit windows; empty = cannot be visited today. */
  windows: TimeWindow[];
}

export interface Problem {
  /** Node 0 = trip start, last node = trip end, stops in between. */
  nodes: NodeSpec[];
  /** travel[i][j] in minutes. */
  travel: Minutes[][];
  dayStart: Minutes;
  dayEnd: Minutes;
}

export interface Visit {
  node: number;
  arrive: Minutes;
  start: Minutes;
  depart: Minutes;
  wait: Minutes;
  /** Minutes past the latest allowed finish (0 when on time). */
  late: Minutes;
}

export interface Simulation {
  /** When to leave the start; later than dayStart if the first stop isn't open yet. */
  leaveAt: Minutes;
  visits: Visit[];
  endArrive: Minutes;
  travel: Minutes;
  wait: Minutes;
  /** Total lateness incl. overrunning the day end. 0 = feasible. */
  late: Minutes;
}

/**
 * Walk a route (stop node indices, excluding start/end) forward in time.
 * Picks the earliest window each visit fits in; if none fits, the visit is
 * scheduled anyway and its lateness recorded, so callers can either reject the
 * route (optimizer) or show the conflict (fixed-order schedules).
 */
export function simulate(p: Problem, route: number[]): Simulation {
  const endNode = p.nodes.length - 1;
  let t = p.dayStart;
  // Don't make people wait outside the first stop: just leave later.
  if (route.length) {
    const first = p.nodes[route[0]];
    const arrive = t + p.travel[0][route[0]];
    const fit = first.windows.find((w) => Math.max(arrive, w.start) + first.durationMin <= w.end);
    if (fit && fit.start > arrive) t += fit.start - arrive;
  }
  const leaveAt = t;
  let prev = 0;
  let travel = 0;
  let wait = 0;
  let late = 0;
  const visits: Visit[] = [];

  for (const node of route) {
    const leg = p.travel[prev][node];
    travel += leg;
    const arrive = t + leg;
    const { durationMin, windows } = p.nodes[node];
    let start = arrive;
    let lateHere = 0;
    const fit = windows.find((w) => Math.max(arrive, w.start) + durationMin <= w.end);
    if (fit) {
      start = Math.max(arrive, fit.start);
    } else {
      // Nothing fits: take the next window that hasn't started, else the last one.
      const next = windows.find((w) => w.start >= arrive) ?? windows[windows.length - 1];
      if (next) {
        start = Math.max(arrive, next.start);
        lateHere = Math.max(1, start + durationMin - next.end);
      } else {
        lateHere = 24 * 60; // closed all day
      }
    }
    late += lateHere;
    wait += start - arrive;
    t = start + durationMin;
    visits.push({ node, arrive, start, depart: t, wait: start - arrive, late: lateHere });
    prev = node;
  }

  const lastLeg = p.travel[prev][endNode];
  travel += lastLeg;
  const endArrive = t + lastLeg;
  late += Math.max(0, endArrive - p.dayEnd);
  return { leaveAt, visits, endArrive, travel, wait, late };
}

/** Lower is better: time not spent at sights (travel + idle waits), then finishing early. */
export function objective(s: Simulation): number {
  return s.travel + 0.8 * s.wait + 0.01 * s.endArrive;
}
