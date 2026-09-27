import { FARES, FARES_AS_OF } from "./fares";
import { inCongestionZone } from "./geo";
import { LINKS, uberLink } from "./deeplinks";
import type { CostLine, CostSummary, Leg, PaymentChannel, ScheduledStop, Trip } from "./types";

const money = (n: number) => Math.round(n * 100) / 100;

const CHANNEL_INFO: Record<Exclude<PaymentChannel, "free">, { title: string; howToPay: string; perRider: boolean }> = {
  omny: {
    title: "Subway & bus — OMNY",
    howToPay:
      "Tap the same contactless card or phone at every turnstile and bus. Free bus↔subway transfer within 2 h; rides beyond 12 in 7 days are free (fare cap). Each rider needs their own card/device.",
    perRider: true,
  },
  tapp: {
    title: "PATH — TAPP contactless",
    howToPay: "Same contactless card works at PATH turnstiles, but it's a separate PATH charge (no free transfer to/from the subway).",
    perRider: true,
  },
  "mta-rail": {
    title: "LIRR / Metro-North — separate ticket",
    howToPay: "Buy in the MTA TrainTime app (or station machines) before boarding; onboard purchase costs more. OMNY is not accepted.",
    perRider: true,
  },
  citibike: {
    title: "Citi Bike",
    howToPay: "Unlock in the Citi Bike (or Lyft) app. Each rider needs a bike; kids must be 16+.",
    perRider: true,
  },
  uber: { title: "Uber", howToPay: "Deep link opens Uber with pickup and drop-off pre-filled. Price is per car.", perRider: false },
  car: { title: "Driving", howToPay: "Fuel/parking estimate for your own or rental car.", perRider: false },
};

export function summarizeCost(legs: Leg[], schedule: ScheduledStop[], travelers: number): CostSummary {
  const names = Object.fromEntries(schedule.map((s) => [s.stop.id, s.stop.place.name]));
  const lines = new Map<PaymentChannel, CostLine>();
  const notes: string[] = [];
  let bikeRides = 0;
  let drivesIntoZone = false;

  for (const leg of legs) {
    // One OMNY fare per leg even if it combines bus + subway (free transfer).
    const perChannel = new Map<PaymentChannel, number>();
    for (const s of leg.segments) {
      if (s.payment === "free") continue;
      if (s.payment === "omny") perChannel.set("omny", FARES.subwayBus);
      else perChannel.set(s.payment, (perChannel.get(s.payment) ?? 0) + s.costUsd);
      if (s.mode === "citibike") bikeRides++;
      if (s.mode === "drive" && inCongestionZone(s.to)) drivesIntoZone = true;
    }
    for (const [payment, unit] of perChannel) {
      if (payment === "free") continue;
      const info = CHANNEL_INFO[payment];
      const cost = money(info.perRider ? unit * travelers : unit);
      const line =
        lines.get(payment) ??
        ({ payment, title: info.title, totalUsd: 0, legs: [], howToPay: info.howToPay, deepLinks: [] } as CostLine);
      line.totalUsd = money(line.totalUsd + cost);
      line.legs.push({
        fromStopId: leg.fromStopId,
        toStopId: leg.toStopId,
        label: `${names[leg.fromStopId]} → ${names[leg.toStopId]}`,
        costUsd: cost,
      });
      if (payment === "uber") {
        const s = leg.segments.find((x) => x.mode === "uber")!;
        line.deepLinks.push({
          label: `Uber: ${names[leg.fromStopId]} → ${names[leg.toStopId]}`,
          url: uberLink(s.from, s.to, names[leg.fromStopId], names[leg.toStopId]),
        });
      }
      lines.set(payment, line);
    }
  }

  const add = (p: PaymentChannel, label: string, url: string) => lines.get(p)?.deepLinks.push({ label, url });
  add("omny", "How OMNY works", LINKS.omny);
  add("tapp", "PATH fares & TAPP", LINKS.path);
  add("mta-rail", "Open MTA TrainTime", LINKS.trainTime);
  add("citibike", "Citi Bike pricing & app", LINKS.citiBike);

  const bike = lines.get("citibike");
  if (bike && bikeRides >= 5) {
    notes.push(`${bikeRides} Citi Bike rides: a $${FARES.citiBikeDayPass} day pass per rider is likely cheaper.`);
  }
  if (drivesIntoZone) {
    const car = lines.get("car")!;
    car.totalUsd = money(car.totalUsd + FARES.congestionZoneToll);
    notes.push(`Includes one $${FARES.congestionZoneToll} Congestion Relief Zone toll (Manhattan below 60th St, once per day).`);
  }
  const uber = lines.get("uber");
  if (uber && travelers > 4) notes.push("More than 4 travelers: you'll need an UberXL (higher fare) or two cars.");
  if (travelers > 1) notes.push(`Transit and Citi Bike costs are for ${travelers} riders; Uber and driving are per vehicle. Kids under 44" ride the subway, bus, and PATH free.`);
  notes.push(`Fares are ${FARES_AS_OF}. No tickets are purchased here; links hand off to each operator's app.`);

  const order: PaymentChannel[] = ["omny", "tapp", "mta-rail", "citibike", "uber", "car"];
  const sorted = order.filter((p) => lines.has(p)).map((p) => lines.get(p)!);
  return { totalUsd: money(sorted.reduce((t, l) => t + l.totalUsd, 0)), lines: sorted, notes };
}

/**
 * Merge per-day fare bundles into one for the whole trip. Leg labels get a
 * "Day N" prefix, and OMNY's weekly cap is applied across days: after 12 paid
 * rides in 7 days, each rider's remaining subway/bus rides that week are free.
 */
export function combineCosts(days: Trip[], travelers: number): CostSummary {
  if (days.length === 1) return days[0].cost;
  const lines = new Map<PaymentChannel, CostLine>();
  const notes = new Set<string>();
  const omnyDay: number[] = [];

  days.forEach((trip, d) => {
    for (const line of trip.cost.lines) {
      const into = lines.get(line.payment) ?? { ...line, totalUsd: 0, legs: [], deepLinks: [] };
      into.totalUsd = money(into.totalUsd + line.totalUsd);
      for (const leg of line.legs) {
        into.legs.push({ ...leg, label: `Day ${d + 1}: ${leg.label}` });
        if (line.payment === "omny") omnyDay.push(d);
      }
      for (const link of line.deepLinks) if (!into.deepLinks.some((x) => x.url === link.url)) into.deepLinks.push(link);
      lines.set(line.payment, into);
    }
    trip.cost.notes.forEach((n) => notes.add(n));
  });

  const omny = lines.get("omny");
  let freed = 0;
  if (omny) {
    // Weeks counted from the first day of the trip.
    const rides = new Map<number, number>();
    omny.legs.forEach((leg, k) => {
      const week = Math.floor(omnyDay[k] / 7);
      const n = (rides.get(week) ?? 0) + 1;
      rides.set(week, n);
      if (n > FARES.omnyWeeklyCapRides && leg.costUsd > 0) {
        freed = money(freed + leg.costUsd);
        leg.costUsd = 0;
        leg.label += " (free: fare cap)";
      }
    });
    omny.totalUsd = money(omny.totalUsd - freed);
  }

  const order: PaymentChannel[] = ["omny", "tapp", "mta-rail", "citibike", "uber", "car"];
  const sorted = order.filter((p) => lines.has(p)).map((p) => lines.get(p)!);
  const capNote = freed
    ? [`OMNY fare cap: rides after the ${FARES.omnyWeeklyCapRides}th in 7 days are free, saving about $${freed.toFixed(2)}${travelers > 1 ? " across your group" : ""}.`]
    : [];
  return { totalUsd: money(sorted.reduce((t, l) => t + l.totalUsd, 0)), lines: sorted, notes: [...capNote, ...notes] };
}
