import { hm } from "../time";
import type { Stop, TripRequest } from "../types";
import { HOTEL, PLACES_BY_ID } from "./places";

const stop = (id: string, priority: Stop["priority"], durationMin?: number, extra: Partial<Stop> = {}): Stop => ({
  id,
  place: PLACES_BY_ID[id],
  priority,
  durationMin: durationMin ?? PLACES_BY_ID[id].suggestedDurationMin,
  ...extra,
});

/**
 * Demo: a family of four from London, one Saturday in October.
 * Manhattan museums in the morning, PATH to Jersey City for skyline views and
 * dinner, then a timed Top of the Rock slot back in Midtown.
 */
export const DEMO_REQUEST: TripRequest = {
  date: "2026-10-03",
  start: HOTEL,
  end: HOTEL,
  dayStart: hm(9),
  dayEnd: hm(22, 30),
  travelers: 4,
  homeTimeZone: "Europe/London",
  interests: ["food", "views", "art"],
  stops: [
    stop("met", "must", 150),
    stop("central-park", "nice", 45),
    stop("memorial-911", "must", 75),
    stop("exchange-place", "must", 30),
    stop("porta-jc", "nice", 75, { window: { start: hm(17), end: hm(20) } }),
    stop("top-of-the-rock", "must", 60, { event: { start: hm(20, 30) } }),
  ],
};

/** LIRR variant: swap Jersey City for a beach afternoon. */
export const DEMO_LIRR_REQUEST: TripRequest = {
  ...DEMO_REQUEST,
  stops: [stop("met", "must", 120), stop("long-beach", "must", 120), stop("top-of-the-rock", "must", 60, { event: { start: hm(20, 30) } })],
};
