import type { BikeAvailability, LatLng, Place, Segment } from "../types";
import { GbfsBikeProvider } from "./gbfs";
import { GooglePlacesProvider } from "./google/places";
import { GoogleRoutingProvider } from "./google/routes";
import { MockBikeProvider } from "./mock/bikes";
import { MockPlacesProvider } from "./mock/places";
import { MockRoutingProvider } from "./mock/router";
import type { BikeProvider, PlacesProvider, RouteRequest, RoutingProvider } from "./types";

// Every real provider is wrapped so any failure (no key, quota, offline demo
// venue wifi) falls back to fixtures instead of breaking the plan.

type Warn = (msg: string) => void;

class FallbackRouting implements RoutingProvider {
  constructor(private primary: RoutingProvider, private fallback: RoutingProvider, private warn: Warn) {}
  get name() {
    return this.primary.name;
  }
  async route(req: RouteRequest): Promise<Segment[] | null> {
    try {
      const r = await this.primary.route(req);
      if (r?.length) return r;
    } catch (e) {
      this.warn(`${this.primary.name} failed (${(e as Error).message}); using offline model.`);
    }
    return this.fallback.route(req);
  }
}

class FallbackPlaces implements PlacesProvider {
  constructor(private primary: PlacesProvider, private fallback: PlacesProvider, private warn: Warn) {}
  get name() {
    return this.primary.name;
  }
  async search(q: string): Promise<Place[]> {
    try {
      return await this.primary.search(q);
    } catch (e) {
      this.warn(`${this.primary.name} failed (${(e as Error).message}); using fixture catalog.`);
      return this.fallback.search(q);
    }
  }
  async nearby(c: LatLng, r: number): Promise<Place[]> {
    try {
      return await this.primary.nearby(c, r);
    } catch (e) {
      this.warn(`${this.primary.name} failed (${(e as Error).message}); using fixture catalog.`);
      return this.fallback.nearby(c, r);
    }
  }
}

class FallbackBikes implements BikeProvider {
  private failed = false;
  constructor(private primary: BikeProvider, private fallback: BikeProvider, private warn: Warn) {}
  get name() {
    return this.failed ? this.fallback.name : this.primary.name;
  }
  async availability(a: LatLng, b: LatLng): Promise<BikeAvailability | null> {
    if (!this.failed) {
      try {
        return await this.primary.availability(a, b);
      } catch (e) {
        this.failed = true;
        this.warn(`Citi Bike live feed unavailable (${(e as Error).message}); showing sample availability.`);
      }
    }
    return this.fallback.availability(a, b);
  }
}

export interface Providers {
  routing: RoutingProvider;
  places: PlacesProvider;
  bikes: BikeProvider;
  warnings: string[];
}

/** Build providers per request so warnings are scoped to that request. */
export function getProviders(env: Record<string, string | undefined> = process.env): Providers {
  const warnings: string[] = [];
  const warn: Warn = (m) => {
    if (!warnings.includes(m)) warnings.push(m);
  };
  const key = env.GOOGLE_MAPS_API_KEY;
  const wantGoogle = (v: string | undefined) => v === "google" || (v === undefined && !!key);

  const mockRouting = new MockRoutingProvider();
  const mockPlaces = new MockPlacesProvider();
  const mockBikes = new MockBikeProvider();

  const routing =
    key && wantGoogle(env.ROUTING_PROVIDER) ? new FallbackRouting(new GoogleRoutingProvider(key), mockRouting, warn) : mockRouting;
  const places =
    key && wantGoogle(env.PLACES_PROVIDER) ? new FallbackPlaces(new GooglePlacesProvider(key), mockPlaces, warn) : mockPlaces;
  const bikes = env.BIKE_PROVIDER === "mock" ? mockBikes : new FallbackBikes(new GbfsBikeProvider(), mockBikes, warn);

  return { routing, places, bikes, warnings };
}
