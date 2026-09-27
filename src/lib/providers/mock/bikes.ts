import type { BikeAvailability, LatLng } from "../../types";
import type { BikeProvider } from "../types";

/** Deterministic fake availability so the demo looks the same every run. */
export class MockBikeProvider implements BikeProvider {
  readonly name = "mock (fixture availability)";

  async availability(from: LatLng, to: LatLng): Promise<BikeAvailability> {
    const seed = Math.abs(Math.round((from.lat + to.lng) * 10000)) % 17;
    return {
      pickupStation: `Dock near ${from.lat.toFixed(3)}, ${from.lng.toFixed(3)}`,
      bikesAvailable: 3 + seed,
      ebikesAvailable: seed % 4,
      dropoffStation: `Dock near ${to.lat.toFixed(3)}, ${to.lng.toFixed(3)}`,
      docksAvailable: 2 + ((seed * 7) % 19),
      live: false,
    };
  }
}
