import type { BikeAvailability, LatLng, Minutes, ModeChoice, Place, Segment } from "../types";

/**
 * Routing is split in two so a slow/paid backend (Google Routes, OpenTripPlanner)
 * is only hit for the legs we actually show:
 *  - the optimizer's inner loop uses a fast local estimate (see providers/mock/router.ts),
 *  - `route()` is called once per final leg to get real segments.
 */
export interface RoutingProvider {
  readonly name: string;
  route(req: RouteRequest): Promise<Segment[] | null>;
}

export interface RouteRequest {
  from: LatLng;
  to: LatLng;
  choice: ModeChoice;
  /** YYYY-MM-DD in America/New_York. */
  date: string;
  departAt: Minutes;
}

export interface PlacesProvider {
  readonly name: string;
  search(query: string): Promise<Place[]>;
  /** Candidate places near a corridor, for "along the way" suggestions. */
  nearby(center: LatLng, radiusKm: number): Promise<Place[]>;
}

export interface BikeProvider {
  readonly name: string;
  availability(from: LatLng, to: LatLng): Promise<BikeAvailability | null>;
}
