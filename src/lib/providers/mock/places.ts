import { PLACES } from "../../fixtures/places";
import { haversineKm } from "../../geo";
import type { LatLng, Place } from "../../types";
import type { PlacesProvider } from "../types";

export class MockPlacesProvider implements PlacesProvider {
  readonly name = "mock (fixture catalog)";

  async search(query: string): Promise<Place[]> {
    const q = query.trim().toLowerCase();
    if (!q) return PLACES;
    return PLACES.filter((p) => p.name.toLowerCase().includes(q) || p.categories.some((c) => c === q));
  }

  async nearby(center: LatLng, radiusKm: number): Promise<Place[]> {
    return PLACES.filter((p) => haversineKm(center, p.location) <= radiusKm);
  }
}
