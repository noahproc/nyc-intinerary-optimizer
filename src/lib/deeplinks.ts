import type { LatLng } from "./types";

// Hand-offs to the apps that actually sell the ride. We never buy tickets.

export function uberLink(from: LatLng, to: LatLng, fromName: string, toName: string): string {
  const q = new URLSearchParams({
    action: "setPickup",
    "pickup[latitude]": String(from.lat),
    "pickup[longitude]": String(from.lng),
    "pickup[nickname]": fromName,
    "dropoff[latitude]": String(to.lat),
    "dropoff[longitude]": String(to.lng),
    "dropoff[nickname]": toName,
  });
  return `https://m.uber.com/ul/?${q.toString()}`;
}

export function googleMapsDirections(from: LatLng, to: LatLng, travelmode: "transit" | "walking" | "bicycling" | "driving"): string {
  const q = new URLSearchParams({
    api: "1",
    origin: `${from.lat},${from.lng}`,
    destination: `${to.lat},${to.lng}`,
    travelmode,
  });
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

export const LINKS = {
  omny: "https://omny.info",
  path: "https://www.panynj.gov/path/en/fares.html",
  trainTime: "https://www.mta.info/traintime",
  citiBike: "https://citibikenyc.com/pricing",
};
