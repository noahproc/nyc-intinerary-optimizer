import { describe, expect, it } from "vitest";
import { PLACES_BY_ID } from "../fixtures/places";
import { hm, windowsOn } from "../time";
import { areaOf, offlineRecommend } from "./offline";
import { aiPlan } from "./plan";
import type { QuizAnswers } from "./types";

const base: QuizAnswers = {
  party: "family",
  travelers: 4,
  interests: ["food", "views"],
  pace: "balanced",
  gettingAround: "mix",
  beyond: "jersey",
  date: "2026-10-03",
  dayStart: hm(9),
  dayEnd: hm(21, 30),
  notes: "",
};

describe("offline recommender", () => {
  it("picks open, in-area places plus a meal with a dinner window", () => {
    const rec = offlineRecommend(base);
    expect(rec.source).toBe("offline");
    for (const p of rec.picks) {
      const place = PLACES_BY_ID[p.placeId];
      expect(["manhattan", "jersey"]).toContain(areaOf(place));
      expect(windowsOn(place, base.date).length).toBeGreaterThan(0);
    }
    expect(rec.picks.some((p) => areaOf(PLACES_BY_ID[p.placeId]) === "jersey")).toBe(true);
    expect(rec.picks.some((p) => p.window)).toBe(true);
  });

  it("scales stop count with pace", () => {
    const relaxed = offlineRecommend({ ...base, pace: "relaxed" }).picks.length;
    const packed = offlineRecommend({ ...base, pace: "packed" }).picks.length;
    expect(packed).toBeGreaterThan(relaxed);
  });

  it("stays in Manhattan when asked", () => {
    const rec = offlineRecommend({ ...base, beyond: "manhattan" });
    expect(rec.picks.every((p) => areaOf(PLACES_BY_ID[p.placeId]) === "manhattan")).toBe(true);
  });
});

describe("aiPlan without an API key", () => {
  it("falls back offline and returns a routed trip", async () => {
    const r = await aiPlan(base, { BIKE_PROVIDER: "mock" });
    expect(r.recommendation.source).toBe("offline");
    expect(r.trip.schedule.length).toBeGreaterThan(3);
    expect(r.trip.legs.some((l) => l.mode === "path")).toBe(true);
  });

  it('swaps long transit legs for Uber when "comfort first"', async () => {
    const r = await aiPlan({ ...base, gettingAround: "comfort" }, { BIKE_PROVIDER: "mock" });
    expect(r.trip.legs.some((l) => l.mode === "uber")).toBe(true);
    expect(r.request.fixedOrder).toBeDefined();
  });
});
