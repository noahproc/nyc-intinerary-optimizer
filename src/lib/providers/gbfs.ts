import { haversineKm } from "../geo";
import type { BikeAvailability, LatLng } from "../types";
import type { BikeProvider } from "./types";

// Citi Bike publishes a public GBFS feed (no key). We read station_information
// (locations) and station_status (live counts) and cache them for a minute.

const DISCOVERY = "https://gbfs.citibikenyc.com/gbfs/2.3/gbfs.json";

interface StationInfo {
  station_id: string;
  name: string;
  lat: number;
  lon: number;
}
interface StationStatus {
  station_id: string;
  num_bikes_available: number;
  num_ebikes_available?: number;
  num_docks_available: number;
  is_renting?: number | boolean;
  is_returning?: number | boolean;
}
type Station = StationInfo & StationStatus;

let cache: { at: number; stations: Station[] } | null = null;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`GBFS ${res.status} for ${url}`);
  return (await res.json()) as T;
}

async function loadStations(): Promise<Station[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.stations;
  const discovery = await getJson<{ data: Record<string, { feeds: { name: string; url: string }[] }> }>(DISCOVERY);
  const feeds = (discovery.data.en ?? Object.values(discovery.data)[0]).feeds;
  const url = (name: string) => feeds.find((f) => f.name === name)?.url;
  const [info, status] = await Promise.all([
    getJson<{ data: { stations: StationInfo[] } }>(url("station_information")!),
    getJson<{ data: { stations: StationStatus[] } }>(url("station_status")!),
  ]);
  const byId = new Map(status.data.stations.map((s) => [s.station_id, s]));
  const stations = info.data.stations
    .filter((s) => byId.has(s.station_id))
    .map((s) => ({ ...s, ...byId.get(s.station_id)! }));
  cache = { at: Date.now(), stations };
  return stations;
}

function closest(p: LatLng, stations: Station[], ok: (s: Station) => boolean): Station | undefined {
  let best: Station | undefined;
  let bestKm = Infinity;
  for (const s of stations) {
    if (!ok(s)) continue;
    const km = haversineKm(p, { lat: s.lat, lng: s.lon });
    if (km < bestKm) {
      bestKm = km;
      best = s;
    }
  }
  return bestKm < 1 ? best : undefined;
}

const on = (v: number | boolean | undefined) => v === undefined || v === true || v === 1;

export class GbfsBikeProvider implements BikeProvider {
  readonly name = "Citi Bike GBFS (live)";

  async availability(from: LatLng, to: LatLng): Promise<BikeAvailability | null> {
    const stations = await loadStations();
    const pickup = closest(from, stations, (s) => on(s.is_renting) && s.num_bikes_available > 0);
    const dropoff = closest(to, stations, (s) => on(s.is_returning) && s.num_docks_available > 0);
    if (!pickup || !dropoff) return null;
    return {
      pickupStation: pickup.name,
      bikesAvailable: pickup.num_bikes_available,
      ebikesAvailable: pickup.num_ebikes_available ?? 0,
      dropoffStation: dropoff.name,
      docksAvailable: dropoff.num_docks_available,
      live: true,
    };
  }
}
