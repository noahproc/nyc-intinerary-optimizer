// Print the demo itinerary to the terminal: `npm run demo` (add `lirr` for the LIRR variant).
import { DEMO_LIRR_REQUEST, DEMO_REQUEST } from "../src/lib/fixtures/demo";
import { planTrip } from "../src/lib/planner";
import { getProviders } from "../src/lib/providers";
import { formatClock } from "../src/lib/time";
import { legKey, type TripRequest } from "../src/lib/types";

async function main() {
  let req: TripRequest = process.argv.includes("lirr") ? DEMO_LIRR_REQUEST : DEMO_REQUEST;
  let trip = await planTrip(req, getProviders({ BIKE_PROVIDER: "mock" }));
  if (process.argv.includes("uber")) {
    // "We're tired after dinner": Uber the leg into Top of the Rock, keep the order.
    const leg = trip.legs.find((l) => l.toStopId === "top-of-the-rock")!;
    req = {
      ...req,
      overrides: { [legKey(leg.fromStopId, leg.toStopId)]: "uber" },
      fixedOrder: trip.schedule.slice(1, -1).map((s) => s.stop.id),
    };
    trip = await planTrip(req, getProviders({ BIKE_PROVIDER: "mock" }));
  }
  if (trip.timeNote) console.log(trip.timeNote, "\n");
  trip.schedule.forEach((s, i) => {
    const wait = s.waitMin ? ` (wait ${Math.round(s.waitMin)} min)` : "";
    console.log(`${formatClock(s.start).padStart(8)}  ${s.stop.place.name}${wait}${s.depart > s.start ? ` → ${formatClock(s.depart)}` : ""}`);
    const leg = trip.legs[i];
    if (!leg) return;
    const parts = leg.segments.filter((x) => x.durationMin > 0).map((x) => `${x.label ?? x.mode} ${x.durationMin}m`);
    console.log(`            ↓ ${leg.mode.toUpperCase()} ${leg.durationMin} min, $${leg.costUsd.toFixed(2)}  [${parts.join(" | ")}]`);
    for (const sg of leg.suggestions) console.log(`              + along the way: ${sg.place.name}: ${sg.reason}`);
  });
  for (const u of trip.unscheduled) console.log(`\n! Not scheduled: ${u.stop.place.name}: ${u.reason}`);
  for (const w of trip.warnings) console.log(`! ${w}`);
  console.log(`\nTotal $${trip.cost.totalUsd.toFixed(2)} for ${req.travelers ?? 1} travelers`);
  for (const l of trip.cost.lines) console.log(`  ${l.title}: $${l.totalUsd.toFixed(2)} (${l.legs.length} legs)`);
  console.log(`Travel ${trip.totals.travelMin} min · wait ${Math.round(trip.totals.waitMin)} min · slack ${Math.round(trip.totals.slackMin)} min`);
}

main();
