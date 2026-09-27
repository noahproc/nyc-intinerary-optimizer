import { FARES } from "../../fares";
import { crossesHudson, haversineKm, inManhattanSurchargeZone, isManhattan, nearest, regionOf } from "../../geo";
import { LIRR_CITY, LIRR_ISLAND, MNR_CITY, MNR_NORTH, PATH_NJ, PATH_NY, type Station } from "../../fixtures/stations";
import type { LatLng, Minutes, ModeChoice, Segment, SegmentMode } from "../../types";
import type { RouteRequest, RoutingProvider } from "../types";

// A deterministic, offline multimodal model of NYC transit. It is the optimizer's
// fast travel-time estimate for every provider, and the full router when no API
// key is configured. Speeds are door-to-door averages, tuned to be in the right
// ballpark rather than exact.

const WALK_KMH = 4.8;
const WALK_DETOUR = 1.3;
const SUBWAY_KMH = 26;
const BUS_KMH = 11;
const BIKE_KMH = 12.5;
const PATH_KMH = 35;
const RAIL_KMH = 50;

const round = (n: number) => Math.round(n * 10) / 10;
const money = (n: number) => Math.round(n * 100) / 100;

function seg(mode: SegmentMode, from: LatLng, to: LatLng, durationMin: number, extra: Partial<Segment> = {}): Segment {
  return {
    mode,
    from,
    to,
    durationMin: Math.round(durationMin),
    distanceKm: round(haversineKm(from, to)),
    costUsd: 0,
    payment: "free",
    ...extra,
  };
}

function walk(from: LatLng, to: LatLng): Segment {
  const km = haversineKm(from, to) * WALK_DETOUR;
  return seg("walk", from, to, (km / WALK_KMH) * 60, { distanceKm: round(km) });
}

/** Subway within the five boroughs: walk to station, wait, ride, walk out. */
function subway(from: LatLng, to: LatLng): Segment[] {
  const km = haversineKm(from, to);
  const ride = 5 + ((km * 1.25) / SUBWAY_KMH) * 60;
  return [
    seg("walk", from, from, 5, { distanceKm: 0.4, label: "Walk to station" }),
    seg("subway", from, to, ride, { costUsd: FARES.subwayBus, payment: "omny", label: "Subway" }),
    seg("walk", to, to, 4, { distanceKm: 0.3, label: "Walk from station" }),
  ];
}

/** Short hops walk; longer ones take the subway. */
function cityHop(from: LatLng, to: LatLng): Segment[] {
  return haversineKm(from, to) < 1.1 ? [walk(from, to)] : subway(from, to);
}

function bus(from: LatLng, to: LatLng): Segment[] {
  const km = haversineKm(from, to);
  return [
    seg("walk", from, from, 3, { distanceKm: 0.2, label: "Walk to stop" }),
    seg("bus", from, to, 6 + ((km * 1.3) / BUS_KMH) * 60, { costUsd: FARES.subwayBus, payment: "omny", label: "Local bus" }),
    seg("walk", to, to, 3, { distanceKm: 0.2, label: "Walk from stop" }),
  ];
}

function citibike(from: LatLng, to: LatLng): Segment[] {
  const km = haversineKm(from, to) * 1.25;
  const ride = 2 + (km / BIKE_KMH) * 60;
  const overage = Math.max(0, Math.ceil(ride - 30)) * 0.36;
  return [
    seg("walk", from, from, 3, { distanceKm: 0.2, label: "Walk to dock" }),
    seg("citibike", from, to, ride, {
      distanceKm: round(km),
      costUsd: money(FARES.citiBikeSingle + overage),
      payment: "citibike",
      label: "Citi Bike",
    }),
    seg("walk", to, to, 2, { distanceKm: 0.1, label: "Walk from dock" }),
  ];
}

function carSpeedKmh(from: LatLng, to: LatLng): number {
  return isManhattan(from) || isManhattan(to) ? 16 : 28;
}

function uber(from: LatLng, to: LatLng): Segment[] {
  const km = haversineKm(from, to) * 1.35;
  const tunnel = crossesHudson(from, to) ? 10 : 0;
  const drive = (km / carSpeedKmh(from, to)) * 60 + tunnel;
  let cost = FARES.uberBase + FARES.uberPerKm * km + FARES.uberPerMin * drive;
  if (inManhattanSurchargeZone(from) || inManhattanSurchargeZone(to)) cost += FARES.uberManhattanSurcharge;
  if (crossesHudson(from, to)) cost += FARES.hudsonToll;
  return [
    seg("uber", from, to, drive + 6, {
      distanceKm: round(km),
      costUsd: money(Math.max(FARES.uberMinimum, cost)),
      payment: "uber",
      label: "Uber (incl. ~6 min pickup wait)",
    }),
  ];
}

function drive(from: LatLng, to: LatLng): Segment[] {
  const km = haversineKm(from, to) * 1.35;
  const parkingSearch = isManhattan(to) ? 10 : 3;
  const tunnel = crossesHudson(from, to) ? 10 : 0;
  let cost = FARES.drivePerKm * km;
  if (isManhattan(to)) cost += FARES.manhattanParking;
  if (crossesHudson(from, to) && regionOf(to) !== "nj-hudson") cost += FARES.hudsonToll;
  return [
    seg("drive", from, to, (km / carSpeedKmh(from, to)) * 60 + tunnel + parkingSearch, {
      distanceKm: round(km),
      costUsd: money(cost),
      payment: "car",
      label: isManhattan(to) ? "Drive + park (garage est.)" : "Drive",
    }),
  ];
}

// PATH service patterns; a station pair is only valid if one line serves both.
const PATH_LINES = [
  ["World Trade Center", "Exchange Place", "Grove St", "Journal Square"],
  ["Journal Square", "Grove St", "Newport", "Christopher St", "9th St", "14th St", "23rd St", "33rd St"],
  ["Hoboken", "Christopher St", "9th St", "14th St", "23rd St", "33rd St"],
  ["Hoboken", "Newport", "Exchange Place", "World Trade Center"],
];
const pathConnects = (a: string, b: string) => PATH_LINES.some((l) => l.includes(a) && l.includes(b));

/** City point <-> rail station, walking or by subway; labelled for the direction of travel. */
function stationHop(point: LatLng, station: Station, toStation: boolean): Segment[] {
  const segs = toStation ? cityHop(point, station.location) : cityHop(station.location, point);
  if (segs.length === 1) segs[0].label = toStation ? `Walk to ${station.name}` : `Walk from ${station.name}`;
  return segs;
}

function pathRide(a: Station, b: Station): Segment {
  const km = haversineKm(a.location, b.location);
  return seg("path", a.location, b.location, 4 + 2 + ((km * 1.3) / PATH_KMH) * 60, {
    costUsd: FARES.path,
    payment: "tapp",
    label: `PATH ${a.name} → ${b.name}`,
  });
}

/** NYC <-> Jersey City/Hoboken via PATH, choosing the fastest valid station pair. */
function pathTrip(from: LatLng, to: LatLng): Segment[] {
  const toNJ = regionOf(to) === "nj-hudson";
  let best: Segment[] = [];
  let bestMin = Infinity;
  for (const ny of PATH_NY) {
    for (const nj of PATH_NJ) {
      if (!pathConnects(ny.name, nj.name)) continue;
      const legs = toNJ
        ? [...stationHop(from, ny, true), pathRide(ny, nj), walk(nj.location, to)]
        : [walk(from, nj.location), pathRide(nj, ny), ...stationHop(to, ny, false)];
      const total = legs.reduce((t, s) => t + s.durationMin, 0);
      if (total < bestMin) {
        bestMin = total;
        best = legs;
      }
    }
  }
  return best;
}

function commuterRail(from: LatLng, to: LatLng, cityStations: Station[], farStations: Station[], mode: "lirr" | "metro-north"): Segment[] {
  const outbound = regionOf(to) === (mode === "lirr" ? "long-island" : "north");
  const city = nearest(outbound ? from : to, cityStations);
  const far = nearest(outbound ? to : from, farStations);
  const km = haversineKm(city.location, far.location);
  const fare = FARES.railOffPeakBase + FARES.railOffPeakPerKm * km;
  const name = mode === "lirr" ? "LIRR" : "Metro-North";
  const [a, b] = outbound ? [city, far] : [far, city];
  const ride = seg(mode, a.location, b.location, 8 + ((km * 1.2) / RAIL_KMH) * 60, {
    costUsd: Math.round(fare * 4) / 4,
    payment: "mta-rail",
    label: `${name} ${a.name} → ${b.name}`,
  });
  const farPoint = outbound ? to : from;
  const walkable = haversineKm(far.location, farPoint) < 2.5;
  const farHop = (x: LatLng, y: LatLng) => (walkable ? [walk(x, y)] : uber(x, y));
  return outbound
    ? [...stationHop(from, city, true), ride, ...farHop(far.location, to)]
    : [...farHop(from, far.location), ride, ...stationHop(to, city, false)];
}

function transit(from: LatLng, to: LatLng): Segment[] {
  const rf = regionOf(from);
  const rt = regionOf(to);
  const km = haversineKm(from, to);

  if (rf === "nj-hudson" && rt === "nj-hudson") {
    if (km < 2) return [walk(from, to)];
    const a = nearest(from, PATH_NJ);
    const b = nearest(to, PATH_NJ);
    if (a.name === b.name) return [walk(from, to)];
    const hop = seg("path", a.location, b.location, 8, { costUsd: FARES.path, payment: "tapp", label: `PATH ${a.name} → ${b.name}` });
    return [walk(from, a.location), hop, walk(b.location, to)];
  }
  if (rt === "nj-hudson" || rf === "nj-hudson") return pathTrip(from, to);
  if ((rt === "long-island") !== (rf === "long-island")) return commuterRail(from, to, LIRR_CITY, LIRR_ISLAND, "lirr");
  if ((rt === "north") !== (rf === "north")) return commuterRail(from, to, MNR_CITY, MNR_NORTH, "metro-north");
  if (rf === "long-island" || rf === "north") return km < 1.5 ? [walk(from, to)] : uber(from, to);

  return cityHop(from, to);
}

export function availableChoices(from: LatLng, to: LatLng): ModeChoice[] {
  const rf = regionOf(from);
  const rt = regionOf(to);
  const km = haversineKm(from, to);
  const nyc = (r: string) => r === "manhattan" || r === "outer-boroughs";
  const choices: ModeChoice[] = ["transit"];
  if (nyc(rf) && nyc(rt)) choices.push("bus");
  const bikeable = (nyc(rf) && nyc(rt)) || (rf === "nj-hudson" && rt === "nj-hudson");
  if (bikeable && km < 10) choices.push("citibike");
  if (!crossesHudson(from, to) && km < 6) choices.push("walk");
  choices.push("uber", "drive");
  return choices;
}

export function buildSegments(from: LatLng, to: LatLng, choice: ModeChoice): Segment[] {
  if (haversineKm(from, to) < 0.05) return [];
  switch (choice) {
    case "walk":
      return [walk(from, to)];
    case "bus":
      return bus(from, to);
    case "citibike":
      return citibike(from, to);
    case "uber":
      return uber(from, to);
    case "drive":
      return drive(from, to);
    case "transit":
      return transit(from, to);
  }
}

/** Fast travel-time estimate used inside the optimizer. */
export function estimateMinutes(from: LatLng, to: LatLng, choice: ModeChoice = "transit"): Minutes {
  return buildSegments(from, to, choice).reduce((t, s) => t + s.durationMin, 0);
}

export class MockRoutingProvider implements RoutingProvider {
  readonly name = "mock (offline transit model)";
  async route(req: RouteRequest): Promise<Segment[]> {
    return buildSegments(req.from, req.to, req.choice);
  }
}
