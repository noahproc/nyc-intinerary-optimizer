// Fare assumptions in one place. These are estimates for planning, not quotes;
// verify before a real launch (MTA / PANYNJ / Citi Bike publish current fares).
export const FARES_AS_OF = "2026 estimates";

export const FARES = {
  /** MTA subway & local bus, OMNY tap. Includes one free bus/subway transfer within 2 h. */
  subwayBus: 3.0,
  /** OMNY 7-day fare cap: after this many paid rides in 7 days, the rest are free. */
  omnyWeeklyCapRides: 12,
  /** PATH single ride via TAPP contactless. */
  path: 3.0,
  /** LIRR / Metro-North ride within NYC (CityTicket). */
  cityTicket: 5.0,
  /** Rough off-peak commuter-rail fare model outside NYC: base + per km. */
  railOffPeakBase: 5.0,
  railOffPeakPerKm: 0.14,
  /** Citi Bike single ride (classic bike, 30 min). */
  citiBikeSingle: 4.99,
  citiBikeDayPass: 25.0,
  /** Uber/rideshare fare model. */
  uberBase: 5.0,
  uberPerKm: 1.55,
  uberPerMin: 0.65,
  uberMinimum: 12.0,
  /** NY State congestion surcharge on for-hire trips touching Manhattan below 96th St. */
  uberManhattanSurcharge: 2.75,
  /** Hudson River crossing toll passed through to the rider. */
  hudsonToll: 17.0,
  /** Personal car: fuel + wear per km, and a typical Manhattan garage stay. */
  drivePerKm: 0.22,
  manhattanParking: 25.0,
  /** Congestion Relief Zone toll (passenger car, E-ZPass, peak), once per day. */
  congestionZoneToll: 9.0,
} as const;
