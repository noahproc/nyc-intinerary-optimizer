import { summarizeCost } from "./cost";
import { haversineKm } from "./geo";
import { optimize } from "./optimizer/optimize";
import { simulate, type NodeSpec, type Problem } from "./optimizer/schedule";
import { getProviders, type Providers } from "./providers";
import { availableChoices, estimateMinutes } from "./providers/mock/router";
import { formatClock, hm, timezoneNote, windowsOn } from "./time";
import {
  END_ID,
  START_ID,
  legKey,
  type Leg,
  type ModeChoice,
  type ScheduledStop,
  type Segment,
  type SegmentMode,
  type Stop,
  type Suggestion,
  type Trip,
  type TripRequest,
  type UnscheduledStop,
} from "./types";

// Orchestrates one planning request:
//   estimate matrix -> optimize order -> route the chosen legs for real ->
//   repair if real times broke the plan -> suggestions -> cost bundle.

const SEGMENT_RANK: SegmentMode[] = ["lirr", "metro-north", "path", "subway", "bus", "citibike", "uber", "drive", "walk"];

function primaryMode(segments: Segment[]): SegmentMode {
  if (!segments.length) return "walk";
  return [...segments].sort((a, b) => SEGMENT_RANK.indexOf(a.mode) - SEGMENT_RANK.indexOf(b.mode))[0].mode;
}

function windowsFor(stop: Stop, date: string) {
  if (stop.event) return [{ start: stop.event.start, end: stop.event.start + stop.durationMin }];
  const open = windowsOn(stop.place, date);
  const pref = stop.window;
  if (!pref) return open;
  return open
    .map((w) => ({ start: Math.max(w.start, pref.start), end: Math.min(w.end, pref.end) }))
    .filter((w) => w.end > w.start);
}

export async function planTrip(req: TripRequest, providers: Providers = getProviders()): Promise<Trip> {
  const warnings = providers.warnings;
  const startStop: Stop = { id: START_ID, place: req.start, durationMin: 0, priority: "must" };
  const endStop: Stop = { id: END_ID, place: req.end, durationMin: 0, priority: "must" };
  const all = [startStop, ...req.stops, endStop];
  const idx = new Map(all.map((s, i) => [s.id, i]));
  const overrides = req.overrides ?? {};
  const travelers = Math.max(1, req.travelers ?? 1);

  const nodes: NodeSpec[] = all.map((s, i) => ({
    id: s.id,
    durationMin: s.durationMin,
    windows: i === 0 || i === all.length - 1 ? [{ start: 0, end: hm(48) }] : windowsFor(s, req.date),
  }));

  const choiceNotes = new Map<string, string>();
  const choiceFor = (i: number, j: number): ModeChoice => {
    const key = legKey(all[i].id, all[j].id);
    const want = overrides[key];
    if (!want) return "transit";
    if (availableChoices(all[i].place.location, all[j].place.location).includes(want)) return want;
    choiceNotes.set(key, `${want} isn't practical for this leg, so it uses transit.`);
    return "transit";
  };

  // 1. Fast estimate matrix (respecting per-leg overrides).
  const travel = all.map((a, i) =>
    all.map((b, j) => (i === j ? 0 : estimateMinutes(a.place.location, b.place.location, choiceFor(i, j)))),
  );
  const problem: Problem = { nodes, travel, dayStart: req.dayStart, dayEnd: req.dayEnd };
  const score = all.map((s) => (s.priority === "must" ? 100 : 10) * (1 + (s.place.popularity ?? 0.5)));
  const must = new Set(all.map((s, i) => (s.priority === "must" ? i : -1)).filter((i) => i > 0 && i < all.length - 1));

  // 2. Order the stops.
  const fixed = req.fixedOrder?.map((id) => idx.get(id)).filter((i): i is number => i !== undefined && i > 0 && i < all.length - 1);
  const result = optimize({ ...problem, score, must }, fixed);
  let route = result.route;
  const unscheduled: UnscheduledStop[] = result.dropped.map((d) => ({ stop: all[d.node], reason: d.reason }));

  // 3. Route each chosen leg for real, departing at its scheduled time.
  const routed = new Map<string, Segment[]>();
  const realProblem: Problem = { ...problem, travel: travel.map((r) => r.slice()) };
  async function routeLegs() {
    const sim = simulate(realProblem, route);
    const path = [0, ...route, all.length - 1];
    const departs = [sim.leaveAt, ...sim.visits.map((v) => v.depart)];
    await Promise.all(
      path.slice(0, -1).map(async (from, k) => {
        const to = path[k + 1];
        const key = legKey(all[from].id, all[to].id);
        if (routed.has(key)) return;
        const segments =
          (await providers.routing.route({
            from: all[from].place.location,
            to: all[to].place.location,
            choice: choiceFor(from, to),
            date: req.date,
            departAt: departs[k],
          })) ?? [];
        routed.set(key, segments);
        realProblem.travel[from][to] = segments.reduce((t, s) => t + s.durationMin, 0);
      }),
    );
    return simulate(realProblem, route);
  }

  let sim = await routeLegs();
  // 4. Repair: if real travel times broke the plan, drop the least valuable nice-to-have.
  if (!fixed) {
    while (sim.late > 0) {
      const nices = route.filter((n) => !must.has(n)).sort((a, b) => score[a] - score[b]);
      if (!nices.length) break;
      const drop = nices[0];
      route = route.filter((n) => n !== drop);
      unscheduled.push({ stop: all[drop], reason: "Dropped once live travel times were applied; the day ran long." });
      sim = await routeLegs();
    }
  }
  for (const v of sim.visits) {
    if (v.late > 0) {
      const s = all[v.node];
      warnings.push(
        s.event
          ? `${s.place.name}: arrives ${formatClock(v.arrive)}, after the ${formatClock(s.event!.start)} start.`
          : `${s.place.name}: can't finish before it closes with this order/mode. Try re-optimizing or a faster mode.`,
      );
    }
  }
  if (sim.endArrive > req.dayEnd) warnings.push(`You'd get back at ${formatClock(sim.endArrive)}, after your ${formatClock(req.dayEnd)} end time.`);

  // 5. Assemble schedule + legs.
  const schedule: ScheduledStop[] = [
    { stop: startStop, arrive: req.dayStart, start: req.dayStart, depart: sim.leaveAt, waitMin: 0 },
    ...sim.visits.map((v) => ({ stop: all[v.node], arrive: v.arrive, start: v.start, depart: v.depart, waitMin: v.wait })),
    { stop: endStop, arrive: sim.endArrive, start: sim.endArrive, depart: sim.endArrive, waitMin: 0 },
  ];
  const path = [0, ...route, all.length - 1];
  const legs: Leg[] = await Promise.all(
    path.slice(0, -1).map(async (from, k) => {
      const to = path[k + 1];
      const key = legKey(all[from].id, all[to].id);
      const segments = routed.get(key) ?? [];
      const choice = choiceFor(from, to);
      const leg: Leg = {
        fromStopId: all[from].id,
        toStopId: all[to].id,
        choice,
        mode: primaryMode(segments),
        segments,
        durationMin: segments.reduce((t, s) => t + s.durationMin, 0),
        costUsd: Math.round(segments.reduce((t, s) => t + s.costUsd, 0) * 100) / 100,
        availableChoices: availableChoices(all[from].place.location, all[to].place.location),
        suggestions: [],
        notes: choiceNotes.has(key) ? [choiceNotes.get(key)!] : [],
      };
      if (segments.some((s) => s.mode === "citibike")) {
        leg.bike = (await providers.bikes.availability(all[from].place.location, all[to].place.location)) ?? undefined;
        if (!leg.bike) leg.notes.push("No Citi Bike dock with bikes/docks near one end right now.");
      }
      return leg;
    }),
  );

  // 6. Along-the-way suggestions.
  await addSuggestions(req, all, route, realProblem, legs, providers);

  const visitMin = sim.visits.reduce((t, v) => t + all[v.node].durationMin, 0);
  return {
    request: req,
    schedule,
    legs,
    unscheduled,
    cost: summarizeCost(legs, schedule, travelers),
    timeNote: timezoneNote(req.homeTimeZone, req.date, req.dayStart),
    totals: {
      travelMin: sim.travel,
      visitMin,
      waitMin: sim.wait,
      slackMin: Math.max(0, req.dayEnd - sim.endArrive),
    },
    providers: { routing: providers.routing.name, places: providers.places.name, bikes: providers.bikes.name },
    warnings,
  };
}

async function addSuggestions(
  req: TripRequest,
  all: Stop[],
  route: number[],
  real: Problem,
  legs: Leg[],
  providers: Providers,
) {
  const maxDetour = req.maxDetourMin ?? 10;
  const baseEnd = simulate(real, route).endArrive;
  const taken = new Set(all.map((s) => s.place.id));
  const path = [0, ...route, all.length - 1];
  const best = new Map<string, { legIndex: number; s: Suggestion; score: number }>();

  await Promise.all(
    legs.map(async (leg, k) => {
      if (leg.durationMin < 3) return;
      const a = all[path[k]].place;
      const b = all[path[k + 1]].place;
      const mid = { lat: (a.location.lat + b.location.lat) / 2, lng: (a.location.lng + b.location.lng) / 2 };
      const radius = Math.max(1.5, haversineKm(a.location, b.location) / 2 + 1);
      const candidates = await providers.places.nearby(mid, radius);

      for (const place of candidates) {
        if (taken.has(place.id)) continue;
        const matched = place.categories.filter((c) => req.interests.includes(c));
        if (req.interests.length && !matched.length) continue;
        const toP = estimateMinutes(a.location, place.location, leg.choice);
        const fromP = estimateMinutes(place.location, b.location, leg.choice);
        const detour = Math.max(0, toP + fromP - leg.durationMin);
        if (detour > maxDetour) continue;

        // Does the rest of the day still work with this stop inserted here?
        const extra: NodeSpec = { id: place.id, durationMin: place.suggestedDurationMin, windows: windowsOn(place, req.date) };
        const { problem, P, remap } = withExtraNode(real, extra, (i) => (i === path[k] ? toP : 999), (j) => (j === path[k + 1] ? fromP : 999));
        const sim = simulate(problem, [...route.slice(0, k), P, ...route.slice(k)].map((x) => (x === P ? P : remap(x))));
        if (sim.late > 0) continue;

        const added = detour + place.suggestedDurationMin;
        const suggestion: Suggestion = {
          place,
          detourMin: Math.round(detour),
          totalAddedMin: Math.round(added),
          matchedInterests: matched,
          reason: `${detour <= 1 ? "Practically on the way" : `+${Math.round(detour)} min detour`}; ${
            sim.endArrive > baseEnd + 0.5
              ? `back ${Math.round(sim.endArrive - baseEnd)} min later (${formatClock(sim.endArrive)}).`
              : "fits in free time, rest of the day unchanged."
          }`,
        };
        const sc = ((place.popularity ?? 0.5) * (1 + 0.5 * matched.length)) / (1 + detour / 10);
        const prev = best.get(place.id);
        if (!prev || sc > prev.score) best.set(place.id, { legIndex: k, s: suggestion, score: sc });
      }
    }),
  );

  const perLeg = new Map<number, { s: Suggestion; score: number }[]>();
  for (const { legIndex, s, score } of best.values()) {
    perLeg.set(legIndex, [...(perLeg.get(legIndex) ?? []), { s, score }]);
  }
  for (const [k, list] of perLeg) {
    legs[k].suggestions = list.sort((x, y) => y.score - x.score).slice(0, 3).map((x) => x.s);
  }
}

/**
 * Copy of `p` with one extra node inserted just before the end node.
 * `to(i)` / `from(j)` give travel between the new node and original node i / j.
 */
function withExtraNode(p: Problem, spec: NodeSpec, to: (i: number) => number, from: (j: number) => number) {
  const end = p.nodes.length - 1;
  const P = end;
  const nodes = [...p.nodes.slice(0, end), spec, p.nodes[end]];
  const old = (i: number) => (i < end ? i : end); // new index -> original (end moved to end+1)
  const travel = nodes.map((_, i) =>
    nodes.map((_, j) => {
      if (i === j) return 0;
      if (i === P) return from(old(j));
      if (j === P) return to(old(i));
      return p.travel[old(i)][old(j)];
    }),
  );
  return { problem: { ...p, nodes, travel }, P, remap: (x: number) => (x === end ? end + 1 : x) };
}
