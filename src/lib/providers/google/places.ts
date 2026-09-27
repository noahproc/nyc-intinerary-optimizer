import type { Interest, LatLng, Place, TimeWindow, WeeklyHours } from "../../types";
import type { PlacesProvider } from "../types";

// Google Places API (New): Text Search to resolve wishlist entries, Nearby
// Search for "along the way" candidates. Opening hours come from
// regularOpeningHours.periods.

const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.types",
  "places.regularOpeningHours.periods",
  "places.userRatingCount",
  "places.editorialSummary",
].join(",");

const NYC_BIAS = { circle: { center: { latitude: 40.7359, longitude: -73.9911 }, radius: 30000 } };

const TYPE_TO_INTEREST: Record<string, Interest> = {
  restaurant: "food",
  bakery: "food",
  cafe: "food",
  food: "food",
  art_gallery: "art",
  museum: "art",
  observation_deck: "views",
  tourist_attraction: "views",
  shopping_mall: "shopping",
  store: "shopping",
  book_store: "shopping",
  historical_landmark: "history",
  park: "parks",
  amusement_park: "kids",
  zoo: "kids",
  aquarium: "kids",
};

const NEARBY_TYPES = ["tourist_attraction", "museum", "art_gallery", "bakery", "park", "historical_landmark", "observation_deck", "book_store"];

interface GPlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location: { latitude: number; longitude: number };
  types?: string[];
  userRatingCount?: number;
  editorialSummary?: { text: string };
  regularOpeningHours?: {
    periods?: { open: { day: number; hour: number; minute: number }; close?: { day: number; hour: number; minute: number } }[];
  };
}

function toHours(g: GPlace): WeeklyHours | undefined {
  const periods = g.regularOpeningHours?.periods;
  if (!periods?.length) return undefined;
  // A single period with no close = open 24/7.
  if (periods.length === 1 && !periods[0].close) return undefined;
  const week: TimeWindow[][] = Array.from({ length: 7 }, () => []);
  for (const p of periods) {
    const start = p.open.hour * 60 + p.open.minute;
    let end = p.close ? p.close.hour * 60 + p.close.minute : 24 * 60;
    if (p.close && p.close.day !== p.open.day) end += 24 * 60; // closes after midnight
    week[p.open.day].push({ start, end });
  }
  return week;
}

function toPlace(g: GPlace): Place {
  const categories = [...new Set((g.types ?? []).map((t) => TYPE_TO_INTEREST[t]).filter(Boolean))];
  const isFood = categories.includes("food");
  const isMuseum = g.types?.includes("museum");
  return {
    id: `g:${g.id}`,
    name: g.displayName?.text ?? "Unnamed place",
    address: g.formattedAddress,
    location: { lat: g.location.latitude, lng: g.location.longitude },
    categories,
    hours: toHours(g),
    suggestedDurationMin: isMuseum ? 120 : isFood ? 30 : 45,
    popularity: Math.min(1, Math.log10((g.userRatingCount ?? 10) + 1) / 5),
    blurb: g.editorialSummary?.text,
  };
}

export class GooglePlacesProvider implements PlacesProvider {
  readonly name = "Google Places API";
  constructor(private apiKey: string) {}

  private async post(path: string, body: unknown): Promise<GPlace[]> {
    const res = await fetch(`https://places.googleapis.com/v1/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": this.apiKey, "X-Goog-FieldMask": FIELDS },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`Places API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return ((await res.json()) as { places?: GPlace[] }).places ?? [];
  }

  async search(query: string): Promise<Place[]> {
    const places = await this.post("places:searchText", { textQuery: query, locationBias: NYC_BIAS, pageSize: 10 });
    return places.map(toPlace);
  }

  async nearby(center: LatLng, radiusKm: number): Promise<Place[]> {
    const places = await this.post("places:searchNearby", {
      includedTypes: NEARBY_TYPES,
      maxResultCount: 20,
      rankPreference: "POPULARITY",
      locationRestriction: {
        circle: { center: { latitude: center.lat, longitude: center.lng }, radius: Math.min(50000, radiusKm * 1000) },
      },
    });
    return places.map(toPlace);
  }
}
