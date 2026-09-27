import { describe, expect, it } from "vitest";
import { DEMO_LIRR_REQUEST, DEMO_REQUEST } from "./fixtures/demo";
import { planTrip } from "./planner";
import { getProviders } from "./providers";
import { hm, timezoneNote, nycToDate } from "./time";
import { legKey } from "./types";

const offline = () => getProviders({ BIKE_PROVIDER: "mock" });

describe("planTrip (offline demo)", () => {
  it("schedules every must-see and hits the timed event", async () => {
    const trip = await planTrip(DEMO_REQUEST, offline());
    const ids = trip.schedule.map((s) => s.stop.id);
    for (const s of DEMO_REQUEST.stops.filter((x) => x.priority === "must")) expect(ids).toContain(s.id);
    const tor = trip.schedule.find((s) => s.stop.id === "top-of-the-rock")!;
    expect(tor.start).toBe(hm(20, 30));
    expect(trip.warnings).toEqual([]);
  });

  it("uses PATH to reach Jersey City and prices it separately from OMNY", async () => {
    const trip = await planTrip(DEMO_REQUEST, offline());
    expect(trip.legs.some((l) => l.segments.some((s) => s.mode === "path"))).toBe(true);
    const channels = trip.cost.lines.map((l) => l.payment);
    expect(channels).toContain("omny");
    expect(channels).toContain("tapp");
  });

  it("re-plans a leg as Uber and adds a prefilled Uber deep link", async () => {
    const first = await planTrip(DEMO_REQUEST, offline());
    const leg = first.legs.find((l) => l.toStopId === "top-of-the-rock")!;
    const trip = await planTrip(
      {
        ...DEMO_REQUEST,
        overrides: { [legKey(leg.fromStopId, leg.toStopId)]: "uber" },
        fixedOrder: first.schedule.slice(1, -1).map((s) => s.stop.id),
      },
      offline(),
    );
    const uberLeg = trip.legs.find((l) => l.toStopId === "top-of-the-rock")!;
    expect(uberLeg.mode).toBe("uber");
    const uber = trip.cost.lines.find((l) => l.payment === "uber")!;
    expect(uber.deepLinks[0].url).toMatch(/^https:\/\/m\.uber\.com\/ul\/\?action=setPickup/);
  });

  it("rejects impossible overrides (Citi Bike across the Hudson)", async () => {
    const first = await planTrip(DEMO_REQUEST, offline());
    const cross = first.legs.find((l) => l.mode === "path")!;
    const trip = await planTrip(
      {
        ...DEMO_REQUEST,
        overrides: { [legKey(cross.fromStopId, cross.toStopId)]: "citibike" },
        fixedOrder: first.schedule.slice(1, -1).map((s) => s.stop.id),
      },
      offline(),
    );
    const leg = trip.legs.find((l) => l.fromStopId === cross.fromStopId)!;
    expect(leg.mode).toBe("path");
    expect(leg.notes[0]).toMatch(/isn't practical/);
  });

  it("offers along-the-way suggestions that match interests", async () => {
    const trip = await planTrip(DEMO_REQUEST, offline());
    const all = trip.legs.flatMap((l) => l.suggestions);
    expect(all.length).toBeGreaterThan(0);
    for (const s of all) {
      expect(s.detourMin).toBeLessThanOrEqual(10);
      expect(s.matchedInterests.length).toBeGreaterThan(0);
    }
  });

  it("routes the Long Island variant over the LIRR", async () => {
    const trip = await planTrip(DEMO_LIRR_REQUEST, offline());
    expect(trip.legs.some((l) => l.mode === "lirr")).toBe(true);
    expect(trip.cost.lines.find((l) => l.payment === "mta-rail")).toBeTruthy();
  });
});

describe("time", () => {
  it("converts NYC wall time across DST", () => {
    expect(nycToDate("2026-07-01", hm(9)).toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(nycToDate("2026-12-01", hm(9)).toISOString()).toBe("2026-12-01T14:00:00.000Z");
  });

  it("notes the home timezone difference", () => {
    expect(timezoneNote("Europe/London", "2026-10-03", hm(9))).toMatch(/2:00 PM back home in London \(\+5 h\)/);
    expect(timezoneNote("America/New_York", "2026-10-03", hm(9))).toBeUndefined();
  });
});
