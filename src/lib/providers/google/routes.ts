import { FARES } from "../../fares";
import { nycToDate } from "../../time";
import type { LatLng, ModeChoice, Segment, SegmentMode } from "../../types";
import { buildSegments } from "../mock/router";
import type { RouteRequest, RoutingProvider } from "../types";
import { decodePolyline } from "./polyline";

// Google Routes API (computeRoutes). Durations and paths come from Google;
// costs come from our fare table, since Google rarely returns NYC fares.
// To swap in OpenTripPlanner + GTFS, implement RoutingProvider the same way.

const ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
const FIELDS = [
  "routes.legs.steps.travelMode",
  "routes.legs.steps.staticDuration",
  "routes.legs.steps.distanceMeters",
  "routes.legs.steps.startLocation",
  "routes.legs.steps.endLocation",
  "routes.legs.steps.polyline.encodedPolyline",
  "routes.legs.steps.transitDetails.transitLine.nameShort",
  "routes.legs.steps.transitDetails.transitLine.name",
  "routes.legs.steps.transitDetails.transitLine.vehicle.type",
  "routes.legs.steps.transitDetails.transitLine.agencies.name",
  "routes.legs.steps.transitDetails.stopDetails.departureStop.name",
  "routes.legs.steps.transitDetails.stopDetails.arrivalStop.name",
  "routes.legs.steps.transitDetails.stopDetails.departureTime",
  "routes.legs.steps.transitDetails.stopDetails.arrivalTime",
  "routes.duration",
].join(",");

interface GStep {
  travelMode: "WALK" | "TRANSIT" | "DRIVE" | "BICYCLE";
  staticDuration?: string;
  distanceMeters?: number;
  startLocation?: { latLng: { latitude: number; longitude: number } };
  endLocation?: { latLng: { latitude: number; longitude: number } };
  polyline?: { encodedPolyline?: string };
  transitDetails?: {
    transitLine?: { name?: string; nameShort?: string; vehicle?: { type?: string }; agencies?: { name?: string }[] };
    stopDetails?: {
      departureStop?: { name?: string };
      arrivalStop?: { name?: string };
      departureTime?: string;
      arrivalTime?: string;
    };
  };
}

const secs = (d?: string) => (d ? Number(d.replace("s", "")) : 0);
const ll = (l?: { latLng: { latitude: number; longitude: number } }): LatLng | undefined =>
  l ? { lat: l.latLng.latitude, lng: l.latLng.longitude } : undefined;

function classify(step: GStep): { mode: SegmentMode; payment: Segment["payment"]; cost: number } {
  const line = step.transitDetails?.transitLine;
  const agency = (line?.agencies ?? []).map((a) => a.name ?? "").join(" ");
  const vehicle = line?.vehicle?.type ?? "";
  if (/PATH|Trans-Hudson/i.test(agency)) return { mode: "path", payment: "tapp", cost: FARES.path };
  if (/Long Island Rail/i.test(agency)) return { mode: "lirr", payment: "mta-rail", cost: FARES.cityTicket };
  if (/Metro-North/i.test(agency)) return { mode: "metro-north", payment: "mta-rail", cost: FARES.cityTicket };
  if (/BUS/.test(vehicle)) return { mode: "bus", payment: "omny", cost: FARES.subwayBus };
  return { mode: "subway", payment: "omny", cost: FARES.subwayBus };
}

function toSegments(steps: GStep[], req: RouteRequest): Segment[] {
  const out: Segment[] = [];
  for (const step of steps) {
    const from = ll(step.startLocation) ?? req.from;
    const to = ll(step.endLocation) ?? req.to;
    const durationMin = secs(step.staticDuration) / 60;
    const distanceKm = (step.distanceMeters ?? 0) / 1000;
    const path = step.polyline?.encodedPolyline ? decodePolyline(step.polyline.encodedPolyline) : undefined;
    if (step.travelMode === "TRANSIT") {
      const c = classify(step);
      const td = step.transitDetails;
      const label = [
        td?.transitLine?.nameShort || td?.transitLine?.name,
        td?.stopDetails?.departureStop?.name && `${td.stopDetails.departureStop.name} → ${td?.stopDetails?.arrivalStop?.name}`,
      ]
        .filter(Boolean)
        .join(" · ");
      let ride = durationMin;
      if (td?.stopDetails?.departureTime && td.stopDetails.arrivalTime) {
        ride = (Date.parse(td.stopDetails.arrivalTime) - Date.parse(td.stopDetails.departureTime)) / 60000;
      }
      out.push({ mode: c.mode, from, to, durationMin: Math.round(ride), distanceKm, costUsd: c.cost, payment: c.payment, label, path });
    } else {
      const mode: SegmentMode = step.travelMode === "BICYCLE" ? "citibike" : step.travelMode === "DRIVE" ? "drive" : "walk";
      const last = out[out.length - 1];
      // Merge consecutive same-mode steps (Google splits walks turn by turn).
      if (last && last.mode === mode) {
        last.durationMin += durationMin;
        last.distanceKm += distanceKm;
        last.to = to;
        last.path = [...(last.path ?? []), ...(path ?? [])];
      } else {
        out.push({ mode, from, to, durationMin, distanceKm, costUsd: 0, payment: "free", path });
      }
    }
  }
  return out.map((s) => ({ ...s, durationMin: Math.round(s.durationMin), distanceKm: Math.round(s.distanceKm * 10) / 10 }));
}

/** Re-price a Google drive/bike route using our fare model for Uber / Citi Bike / car. */
function reprice(segments: Segment[], req: RouteRequest): Segment[] {
  const modelled = buildSegments(req.from, req.to, req.choice).find((s) => s.mode !== "walk");
  if (!modelled) return segments;
  const googleMin = segments.reduce((t, s) => t + s.durationMin, 0);
  const pickupWait = req.choice === "uber" ? 6 : 0;
  return [
    {
      ...modelled,
      durationMin: Math.round(googleMin + pickupWait),
      path: segments.flatMap((s) => s.path ?? []),
    },
  ];
}

const TRAVEL_MODE: Record<ModeChoice, string> = {
  transit: "TRANSIT",
  bus: "TRANSIT",
  walk: "WALK",
  citibike: "BICYCLE",
  uber: "DRIVE",
  drive: "DRIVE",
};

export class GoogleRoutingProvider implements RoutingProvider {
  readonly name = "Google Routes API";
  constructor(private apiKey: string) {}

  async route(req: RouteRequest): Promise<Segment[] | null> {
    const travelMode = TRAVEL_MODE[req.choice];
    const departure = nycToDate(req.date, req.departAt);
    const body: Record<string, unknown> = {
      origin: { location: { latLng: { latitude: req.from.lat, longitude: req.from.lng } } },
      destination: { location: { latLng: { latitude: req.to.lat, longitude: req.to.lng } } },
      travelMode,
      // Google rejects past departure times; fall back to "now" for demos on old dates.
      departureTime: departure.getTime() > Date.now() ? departure.toISOString() : undefined,
      computeAlternativeRoutes: false,
    };
    if (travelMode === "DRIVE") body.routingPreference = "TRAFFIC_AWARE";
    if (req.choice === "bus") body.transitPreferences = { allowedTravelModes: ["BUS"] };

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": this.apiKey, "X-Goog-FieldMask": FIELDS },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`Routes API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { routes?: { duration?: string; legs?: { steps?: GStep[] }[] }[] };
    const route = json.routes?.[0];
    const steps = route?.legs?.flatMap((l) => l.steps ?? []) ?? [];
    if (!steps.length) return null;
    const segments = toSegments(steps, req);
    // Step times exclude platform waits; fold the difference into the first ride.
    const gap = Math.round(secs(route?.duration) / 60 - segments.reduce((t, s) => t + s.durationMin, 0));
    const firstRide = segments.find((s) => s.payment !== "free");
    if (firstRide && gap > 0) firstRide.durationMin += gap;
    return travelMode === "DRIVE" || travelMode === "BICYCLE" ? reprice(segments, req) : segments;
  }
}
