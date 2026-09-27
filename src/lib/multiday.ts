import { combineCosts } from "./cost";
import { bestInsertion } from "./optimizer/optimize";
import { objective, simulate, type Problem } from "./optimizer/schedule";
import { planTrip, windowsFor } from "./planner";
import { getProviders, type Providers } from "./providers";
import { estimateMinutes } from "./providers/mock/router";
import { addDays, hm } from "./time";
import { END_ID, MAX_DAYS, START_ID, legKey, type Stop, type TripPlan, type TripRequest } from "./types";

// Multi-day trips: split the wishlist into days, then plan each day with the
// single-day planner. Assignment uses the fast estimate matrix and each day's
// own opening hours, so a museum closed on Mondays lands on another day.

/**
 * Weight of the fullness penalty, W * (sightseeing minutes / day length)^2 * day length.
 * Quadratic, so light days barely care (neighbors like the Met and Central Park
 * stay together) while a nearly full day pushes new stops to emptier ones.
 */
const BALANCE = 1.5;

export const dayCount = (req: TripRequest) => Math.min(MAX_DAYS, Math.max(1, Math.floor(req.days ?? 1)));

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Stop ids for each day. Stops that fit no day still get one, so that day's plan can explain why. */
export function assignDays(req: TripRequest): string[][] {
  const n = dayCount(req);
  const startStop: Stop = { id: START_ID, place: req.start, durationMin: 0, priority: "must" };
  const endStop: Stop = { id: END_ID, place: req.end, durationMin: 0, priority: "must" };
  const all = [startStop, ...req.stops, endStop];
  const last = all.length - 1;
  const idx = new Map(all.map((s, i) => [s.id, i]));
  const pin = (s: Stop) => (s.day !== undefined && s.day >= 0 && s.day < n ? s.day : undefined);

  const travel = all.map((a, i) =>
    all.map((b, j) => (i === j ? 0 : estimateMinutes(a.place.location, b.place.location, req.overrides?.[legKey(a.id, b.id)] ?? "transit"))),
  );
  const problems: Problem[] = range(n).map((d) => {
    const date = addDays(req.date, d);
    return {
      nodes: all.map((s, i) => ({
        id: s.id,
        durationMin: s.durationMin,
        windows: i === 0 || i === last ? [{ start: 0, end: hm(48) }] : windowsFor(s, date),
      })),
      travel,
      dayStart: req.dayStart,
      dayEnd: req.dayEnd,
    };
  });

  const routes: number[][] = range(n).map(() => []);
  const assigned: number[][] = range(n).map(() => []);
  const load = range(n).map(() => 0);
  const put = (i: number, d: number) => {
    assigned[d].push(i);
    load[d] += all[i].durationMin;
  };
  const dayLen = Math.max(60, req.dayEnd - req.dayStart);
  /** Fullness penalty for adding `dur` minutes to a day already holding `base`. */
  const crowding = (base: number, dur: number) => (BALANCE * ((base + dur) ** 2 - base ** 2)) / dayLen;

  // Keep an earlier split (re-plans after a small edit), except where a pin now says otherwise.
  const placed = new Set<number>();
  req.fixedDays?.slice(0, n).forEach((ids, d) => {
    for (const id of ids) {
      const i = idx.get(id);
      if (i === undefined || i === 0 || i === last || placed.has(i)) continue;
      const p = pin(all[i]);
      if (p !== undefined && p !== d) continue;
      placed.add(i);
      routes[d].push(i);
      put(i, d);
    }
  });

  const openDays = (i: number) => range(n).filter((d) => problems[d].nodes[i].windows.length > 0);
  const score = (s: Stop) => (s.priority === "must" ? 100 : 10) * (1 + (s.place.popularity ?? 0.5));
  const rest = range(all.length)
    .slice(1, -1)
    .filter((i) => !placed.has(i))
    .sort(
      (a, b) =>
        Number(pin(all[b]) !== undefined) - Number(pin(all[a]) !== undefined) ||
        Number(all[b].priority === "must") - Number(all[a].priority === "must") ||
        openDays(a).length - openDays(b).length ||
        score(all[b]) - score(all[a]),
    );

  for (const i of rest) {
    const p = pin(all[i]);
    let best: { d: number; pos: number; cost: number } | null = null;
    for (const d of p !== undefined ? [p] : range(n)) {
      const ins = bestInsertion(problems[d], routes[d], i);
      if (!ins) continue;
      const cost = ins.added + crowding(load[d], all[i].durationMin);
      if (!best || cost < best.cost) best = { d, pos: ins.pos, cost };
    }
    if (best) {
      routes[best.d].splice(best.pos, 0, i);
      put(i, best.d);
      continue;
    }
    const open = openDays(i);
    const pool = p !== undefined ? [p] : open.length ? open : range(n);
    put(i, pool.reduce((x, y) => (load[y] < load[x] ? y : x)));
  }

  // Greedy picks depend on the order stops were placed in; now that every stop
  // is placed, let each one re-pick its day by the same rule. A stop may bring
  // its nearest same-day neighbor along, so a pair like the two Jersey City
  // stops can move together (moving either alone costs an extra river crossing).
  const tourCost = (d: number, route: number[]) => objective(simulate(problems[d], route));
  const movable = new Set(rest.filter((i) => pin(all[i]) === undefined));
  const tryMove = (group: number[], from: number): boolean => {
    const dur = group.reduce((t, i) => t + all[i].durationMin, 0);
    const without = routes[from].filter((x) => !group.includes(x));
    const stay = tourCost(from, routes[from]) - tourCost(from, without) + crowding(load[from] - dur, dur);
    let best: { d: number; route: number[]; cost: number } | null = null;
    for (const d of range(n)) {
      if (d === from) continue;
      let route = routes[d];
      let added = 0;
      for (const i of group) {
        const ins = bestInsertion(problems[d], route, i);
        if (!ins) {
          route = [];
          break;
        }
        added += ins.added;
        route = [...route.slice(0, ins.pos), i, ...route.slice(ins.pos)];
      }
      if (!route.length) continue;
      const cost = added + crowding(load[d], dur);
      // Must beat staying by a clear minute so two near-equal days can't ping-pong.
      if (cost < stay - 1 && (!best || cost < best.cost)) best = { d, route, cost };
    }
    if (!best) return false;
    routes[from] = without;
    assigned[from] = assigned[from].filter((x) => !group.includes(x));
    load[from] -= dur;
    routes[best.d] = best.route;
    for (const i of group) put(i, best.d);
    return true;
  };
  for (let round = 0; round < 5; round++) {
    let moved = false;
    for (const i of movable) {
      const from = routes.findIndex((r) => r.includes(i));
      if (from < 0) continue;
      const buddy = routes[from].filter((j) => j !== i && movable.has(j)).sort((a, b) => travel[i][a] - travel[i][b])[0];
      if (tryMove([i], from) || (buddy !== undefined && tryMove([i, buddy], from))) moved = true;
    }
    if (!moved) break;
  }

  return assigned.map((list) => list.map((i) => all[i].id));
}

export async function planDays(req: TripRequest, providers: Providers = getProviders()): Promise<TripPlan> {
  const n = dayCount(req);
  const byId = new Map(req.stops.map((s) => [s.id, s]));
  const assignment = assignDays(req);

  const days = await Promise.all(
    assignment.map((ids, d) => {
      const fixedOrder = req.fixedDays ? req.fixedDays[d]?.filter((id) => ids.includes(id)) : n === 1 ? req.fixedOrder : undefined;
      return planTrip(
        { ...req, date: addDays(req.date, d), days: 1, stops: ids.map((id) => byId.get(id)!), fixedOrder, fixedDays: undefined },
        // Fresh warning list per day; provider-level warnings land in `providers.warnings`.
        { ...providers, warnings: [] },
      );
    }),
  );

  const sum = (k: keyof TripPlan["totals"]) => days.reduce((t, day) => t + day.totals[k], 0);
  return {
    request: { ...req, days: n },
    days,
    cost: combineCosts(days, Math.max(1, req.travelers ?? 1)),
    totals: { travelMin: sum("travelMin"), visitMin: sum("visitMin"), waitMin: sum("waitMin"), slackMin: sum("slackMin") },
    warnings: providers.warnings,
  };
}
