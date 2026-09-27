import type { LatLng } from "./types";

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type Region = "manhattan" | "outer-boroughs" | "nj-hudson" | "long-island" | "north";

/** Coarse region classification: enough to pick PATH vs LIRR vs Metro-North. */
export function regionOf(p: LatLng): Region {
  if (p.lat > 40.66 && p.lat < 40.9 && p.lng < -74.021) return "nj-hudson";
  if (p.lng > -73.7 && p.lat < 41.2) return "long-island";
  if (p.lat > 40.915) return "north";
  if (isManhattan(p)) return "manhattan";
  return "outer-boroughs";
}

// Coarse outline of Manhattan (lat, lng), clockwise from the Battery.
const MANHATTAN: [number, number][] = [
  [40.7003, -74.015], [40.711, -74.0185], [40.73, -74.013], [40.758, -74.006],
  [40.785, -73.988], [40.82, -73.962], [40.85, -73.947], [40.878, -73.926],
  [40.874, -73.91], [40.835, -73.934], [40.81, -73.934], [40.795, -73.928],
  [40.776, -73.942], [40.758, -73.958], [40.742, -73.97], [40.727, -73.971],
  [40.713, -73.976], [40.708, -73.999], [40.701, -74.011],
];

export function isManhattan(p: LatLng): boolean {
  let inside = false;
  for (let i = 0, j = MANHATTAN.length - 1; i < MANHATTAN.length; j = i++) {
    const [yi, xi] = MANHATTAN[i];
    const [yj, xj] = MANHATTAN[j];
    if (yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Manhattan south of 96th St (the for-hire congestion surcharge zone). */
export function inManhattanSurchargeZone(p: LatLng): boolean {
  return isManhattan(p) && p.lat < 40.7855;
}

/** Congestion Relief Zone: Manhattan south of 60th St. */
export function inCongestionZone(p: LatLng): boolean {
  return isManhattan(p) && p.lat < 40.7685;
}

export function crossesHudson(a: LatLng, b: LatLng): boolean {
  return (regionOf(a) === "nj-hudson") !== (regionOf(b) === "nj-hudson");
}

export function nearest<T extends { location: LatLng }>(p: LatLng, items: T[]): T {
  let best = items[0];
  let bestD = Infinity;
  for (const it of items) {
    const d = haversineKm(p, it.location);
    if (d < bestD) {
      bestD = d;
      best = it;
    }
  }
  return best;
}

/** Straight-line distance from p to segment a–b, in km (small-area approximation). */
export function distanceToSegmentKm(p: LatLng, a: LatLng, b: LatLng): number {
  const kx = 111.32 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110.57;
  const ax = (a.lng - p.lng) * kx;
  const ay = (a.lat - p.lat) * ky;
  const bx = (b.lng - p.lng) * kx;
  const by = (b.lat - p.lat) * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}
