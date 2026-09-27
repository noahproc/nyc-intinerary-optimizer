import { describe, expect, it } from "vitest";
import { DEMO_REQUEST } from "./fixtures/demo";
import { HOTEL, PLACES_BY_ID } from "./fixtures/places";
import { combineCosts } from "./cost";
import { assignDays, planDays } from "./multiday";
import { planTrip } from "./planner";
import { getProviders } from "./providers";
import { hm } from "./time";
import type { Stop, Trip, TripRequest } from "./types";

const offline = () => getProviders({ BIKE_PROVIDER: "mock" });

const stop = (id: string, extra: Partial<Stop> = {}): Stop => ({
  id,
  place: PLACES_BY_ID[id],
  priority: "must",
  durationMin: PLACES_BY_ID[id].suggestedDurationMin,
  ...extra,
});

// Saturday 2026-10-03 through Monday 2026-10-05.
const THREE_DAYS: TripRequest = {
  date: "2026-10-03",
  days: 3,
  start: HOTEL,
  end: HOTEL,
  dayStart: hm(9),
  dayEnd: hm(21),
  travelers: 2,
  interests: ["art", "views"],
  stops: [
    stop("met"),
    stop("moma"),
    stop("chelsea-galleries"), // closed Sun + Mon
    stop("the-frick"), // closed Mon + Tue
    stop("high-line"),
    stop("memorial-911"),
    stop("brooklyn-bridge"),
    stop("dumbo"),
    stop("top-of-the-rock"),
    stop("central-park", { priority: "nice" }),
  ],
};

describe("assignDays", () => {
  it("puts every stop on exactly one day and uses every day", () => {
    const days = assignDays(THREE_DAYS);
    expect(days).toHaveLength(3);
    expect(days.flat().sort()).toEqual(THREE_DAYS.stops.map((s) => s.id).sort());
    for (const d of days) expect(d.length).toBeGreaterThan(0);
  });

  it("avoids days a place is closed", () => {
    const days = assignDays(THREE_DAYS);
    expect(days[0]).toContain("chelsea-galleries");
    expect(days[2]).not.toContain("the-frick");
  });

  it("keeps close neighbors together instead of spreading thin", () => {
    // The Met and Central Park over four days: one outing, three free days.
    const days = assignDays({ ...DEMO_REQUEST, days: 4, stops: DEMO_REQUEST.stops.slice(0, 2) });
    expect(days.filter((d) => d.length)).toEqual([expect.arrayContaining(["met", "central-park"])]);
    // Both Jersey City stops share a day (one PATH round trip, not two).
    const demo = assignDays({ ...DEMO_REQUEST, days: 3 });
    expect(demo.findIndex((d) => d.includes("exchange-place"))).toBe(demo.findIndex((d) => d.includes("porta-jc")));
  });

  it("evens out a packed wishlist", () => {
    const counts = assignDays({ ...DEMO_REQUEST, days: 2 }).map((d) => d.length);
    expect(counts).toEqual([3, 3]);
  });

  it("honors a day pin", () => {
    const req = { ...THREE_DAYS, stops: THREE_DAYS.stops.map((s) => (s.id === "met" ? { ...s, day: 2 } : s)) };
    expect(assignDays(req)[2]).toContain("met");
  });

  it("keeps an earlier split when given fixedDays", () => {
    const fixedDays = [["met", "central-park"], ["moma", "top-of-the-rock"], ["memorial-911", "brooklyn-bridge", "dumbo"]];
    const req = { ...THREE_DAYS, stops: THREE_DAYS.stops.filter((s) => fixedDays.flat().includes(s.id)), fixedDays };
    expect(assignDays(req)).toEqual(fixedDays);
  });
});

describe("planDays", () => {
  it("plans each day on its own date and schedules all must-sees", async () => {
    const plan = await planDays(THREE_DAYS, offline());
    expect(plan.days.map((d) => d.request.date)).toEqual(["2026-10-03", "2026-10-04", "2026-10-05"]);
    const scheduled = plan.days.flatMap((d) => d.schedule.map((s) => s.stop.id));
    for (const s of THREE_DAYS.stops.filter((x) => x.priority === "must")) expect(scheduled).toContain(s.id);
    expect(plan.totals.visitMin).toBe(plan.days.reduce((t, d) => t + d.totals.visitMin, 0));
  });

  it("matches the single-day planner for a one-day trip", async () => {
    const [plan, trip] = await Promise.all([planDays(DEMO_REQUEST, offline()), planTrip(DEMO_REQUEST, offline())]);
    expect(plan.days).toHaveLength(1);
    expect(plan.days[0].schedule.map((s) => s.stop.id)).toEqual(trip.schedule.map((s) => s.stop.id));
    expect(plan.cost.totalUsd).toBe(trip.cost.totalUsd);
  });

  it("combines fares across days with a Day N label on each leg", async () => {
    const plan = await planDays(THREE_DAYS, offline());
    const perDay = plan.days.reduce((t, d) => t + d.cost.totalUsd, 0);
    expect(plan.cost.totalUsd).toBeCloseTo(perDay, 2);
    for (const line of plan.cost.lines) expect(line.legs.every((l) => /^Day \d: /.test(l.label))).toBe(true);
  });
});

describe("combineCosts", () => {
  // Just enough of a Trip for the fare merge: `rides` OMNY legs at $3 each.
  const day = (rides: number, travelers = 1) =>
    ({
      cost: {
        totalUsd: 3 * rides * travelers,
        notes: [],
        lines: [
          {
            payment: "omny",
            title: "OMNY",
            totalUsd: 3 * rides * travelers,
            howToPay: "",
            deepLinks: [{ label: "How OMNY works", url: "https://omny.info" }],
            legs: Array.from({ length: rides }, (_, k) => ({ fromStopId: `a${k}`, toStopId: `b${k}`, label: `Ride ${k + 1}`, costUsd: 3 * travelers })),
          },
        ],
      },
    }) as unknown as Trip;

  it("makes rides after the 12th in a week free", () => {
    const cost = combineCosts([day(5), day(5), day(5)], 1);
    const omny = cost.lines[0];
    expect(omny.legs).toHaveLength(15);
    expect(omny.legs.filter((l) => l.costUsd > 0)).toHaveLength(12);
    expect(cost.totalUsd).toBe(36);
    expect(cost.notes[0]).toMatch(/fare cap.*\$9\.00/);
    expect(omny.deepLinks).toHaveLength(1);
  });

  it("starts a new cap week on day 8", () => {
    const week = Array.from({ length: 7 }, () => day(2, 2));
    const cost = combineCosts([...week, day(2, 2)], 2);
    // 14 rides in week one (2 free), 2 paid in week two; 2 travelers.
    expect(cost.totalUsd).toBe((12 + 2) * 3 * 2);
  });
});
