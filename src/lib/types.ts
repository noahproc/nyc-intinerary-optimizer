// Core data model. All clock times are "minutes after local midnight in
// America/New_York" on the day in question (a multi-day trip is planned as one
// `Trip` per day), which keeps the optimizer free of timezone math. Convert at
// the edges with lib/time.ts.

export type Minutes = number;

export interface LatLng {
  lat: number;
  lng: number;
}

export type Interest =
  | "food"
  | "art"
  | "views"
  | "shopping"
  | "history"
  | "parks"
  | "kids";

/** A visit must start at or after `start` and finish by `end`. */
export interface TimeWindow {
  start: Minutes;
  end: Minutes;
}

/** Weekly opening hours: index 0 = Sunday. Empty array = closed that day. */
export type WeeklyHours = TimeWindow[][];

export interface Place {
  id: string;
  name: string;
  location: LatLng;
  address?: string;
  categories: Interest[];
  /** Omitted = always open (parks, streets, viewpoints). */
  hours?: WeeklyHours;
  /** Typical visit length. */
  suggestedDurationMin: Minutes;
  blurb?: string;
  /** 0..1 notability, used to rank "along the way" suggestions. */
  popularity?: number;
}

export type Priority = "must" | "nice";

/** A wishlist entry: a place plus what the user wants from it. */
export interface Stop {
  id: string;
  place: Place;
  durationMin: Minutes;
  priority: Priority;
  /** A fixed-time event (timed ticket, show). Overrides opening hours. */
  event?: { start: Minutes };
  /** User preference, e.g. dinner between 5 and 8 PM. Intersected with opening hours. */
  window?: TimeWindow;
  /** Pin to a trip day (0 = first day). Omitted = let the planner choose. */
  day?: number;
}

/** What the user can pick for a leg. "transit" = best public transit option. */
export type ModeChoice = "transit" | "bus" | "citibike" | "walk" | "uber" | "drive";

/** The concrete vehicle for a segment. */
export type SegmentMode =
  | "walk"
  | "subway"
  | "bus"
  | "path"
  | "lirr"
  | "metro-north"
  | "citibike"
  | "uber"
  | "drive";

/** How a segment gets paid for; drives the cost "bundle". */
export type PaymentChannel =
  | "omny" // MTA subway + local bus: tap any contactless card/phone
  | "tapp" // PATH: same contactless card, separate PATH charge
  | "mta-rail" // LIRR / Metro-North: TrainTime app or ticket machine
  | "citibike" // Citi Bike / Lyft app
  | "uber" // Uber app
  | "car" // user's own / rental car
  | "free";

export interface Segment {
  mode: SegmentMode;
  durationMin: Minutes;
  distanceKm: number;
  from: LatLng;
  to: LatLng;
  /** e.g. "PATH WTC → Exchange Place" or "1 train". */
  label?: string;
  costUsd: number;
  payment: PaymentChannel;
  /** Encoded or explicit polyline for the map; falls back to from→to. */
  path?: LatLng[];
}

export interface BikeAvailability {
  pickupStation: string;
  bikesAvailable: number;
  ebikesAvailable: number;
  dropoffStation: string;
  docksAvailable: number;
  live: boolean;
}

export interface Leg {
  fromStopId: string;
  toStopId: string;
  choice: ModeChoice;
  /** Most significant segment mode, for display. */
  mode: SegmentMode;
  segments: Segment[];
  durationMin: Minutes;
  costUsd: number;
  /** Modes that make sense for this pair (e.g. no Citi Bike across the Hudson). */
  availableChoices: ModeChoice[];
  bike?: BikeAvailability;
  suggestions: Suggestion[];
  notes: string[];
}

export interface ScheduledStop {
  stop: Stop;
  arrive: Minutes;
  /** Visit start (after any wait for opening / event start). */
  start: Minutes;
  depart: Minutes;
  waitMin: Minutes;
}

export interface Suggestion {
  place: Place;
  /** Added minutes of travel vs. the direct leg. */
  detourMin: Minutes;
  /** Travel detour + visit duration. */
  totalAddedMin: Minutes;
  matchedInterests: Interest[];
  reason: string;
}

export interface UnscheduledStop {
  stop: Stop;
  reason: string;
}

export interface TripRequest {
  /** YYYY-MM-DD in America/New_York; the first day of the trip. */
  date: string;
  /** Number of days, starting at `date`. Omitted = 1. Every day shares start/end and hours. */
  days?: number;
  start: Place;
  end: Place;
  dayStart: Minutes;
  dayEnd: Minutes;
  stops: Stop[];
  interests: Interest[];
  /** Party size; transit fares are per rider, Uber/driving per vehicle. */
  travelers?: number;
  /** IANA timezone of the visitor's home, for the jet-lag note. */
  homeTimeZone?: string;
  /** Per-leg overrides keyed by `${fromStopId}>${toStopId}`. */
  overrides?: Record<string, ModeChoice>;
  /** If set, skip ordering and schedule stops in exactly this order. */
  fixedOrder?: string[];
  /**
   * Multi-day counterpart of `fixedOrder`: stop ids per day, in order. Keeps the
   * day assignment and order stable when re-planning after a small edit; stops
   * not listed are assigned and slotted in by the planner.
   */
  fixedDays?: string[][];
  maxDetourMin?: Minutes;
}

export interface CostLine {
  payment: PaymentChannel;
  title: string;
  totalUsd: number;
  legs: { fromStopId: string; toStopId: string; label: string; costUsd: number }[];
  howToPay: string;
  deepLinks: { label: string; url: string }[];
}

export interface CostSummary {
  totalUsd: number;
  lines: CostLine[];
  notes: string[];
}

export interface Trip {
  request: TripRequest;
  /** Includes the synthetic start/end stops at either end. */
  schedule: ScheduledStop[];
  legs: Leg[];
  unscheduled: UnscheduledStop[];
  cost: CostSummary;
  timeNote?: string;
  totals: { travelMin: Minutes; visitMin: Minutes; waitMin: Minutes; slackMin: Minutes };
  providers: { routing: string; places: string; bikes: string };
  warnings: string[];
}

/** A whole trip: one planned `Trip` per day plus trip-wide totals. */
export interface TripPlan {
  request: TripRequest;
  days: Trip[];
  /** All days combined, with the OMNY weekly fare cap applied across days. */
  cost: CostSummary;
  totals: Trip["totals"];
  /** Trip-wide warnings (e.g. a provider fell back to offline data). Per-day ones are on each day. */
  warnings: string[];
}

/** Longest trip the planner accepts. */
export const MAX_DAYS = 14;

export const START_ID = "__start";
export const END_ID = "__end";

export const legKey = (from: string, to: string) => `${from}>${to}`;
