import { HOTEL, PLACES } from "../fixtures/places";
import { haversineKm, regionOf } from "../geo";
import { hm, windowsOn } from "../time";
import type { Interest, Place } from "../types";
import type { AiPick, AiRecommendation, Beyond, QuizAnswers } from "./types";

// Rule-based stand-in for the Claude recommender, used when no API key is set or
// the API call fails. Deterministic, so the demo behaves the same every time.

const STOPS_BY_PACE = { relaxed: 4, balanced: 5, packed: 7 } as const;

const INTEREST_WORDS: Record<Interest, string> = {
  food: "food",
  art: "art",
  views: "big views",
  shopping: "shopping",
  history: "history",
  parks: "green space",
  kids: "keeping the kids happy",
};

export function areaOf(place: Place): Exclude<Beyond, "surprise"> {
  const r = regionOf(place.location);
  if (r === "nj-hudson") return "jersey";
  if (r === "long-island") return "long-island";
  if (r === "north") return "hudson";
  return "manhattan";
}

export function allowedAreas(beyond: Beyond): Set<string> {
  if (beyond === "surprise") return new Set(["manhattan", "jersey"]);
  return new Set(["manhattan", beyond]);
}

/** Somewhere you sit down and eat, as opposed to a food-themed outing. */
const REASONS = [
  (w: string) => `Picked for your love of ${w}.`,
  (w: string) => `A must if ${w} is why you came.`,
  (w: string) => `Strong on ${w}, and it fits neatly into the route.`,
  (w: string) => `Another hit for ${w}, close to your other stops.`,
];

const isMeal = (p: Place) => p.categories.includes("food") && !!p.hours && p.suggestedDurationMin <= 90;

export function offlineRecommend(a: QuizAnswers): AiRecommendation {
  const areas = allowedAreas(a.beyond);
  const open = PLACES.filter((p) => areas.has(areaOf(p)) && windowsOn(p, a.date).length > 0);
  const wantKids = a.party === "family";

  const score = (p: Place) => {
    const matches = p.categories.filter((c) => a.interests.includes(c)).length;
    let s = matches * 2 + (p.popularity ?? 0.5) * 1.5;
    if (wantKids && p.categories.includes("kids")) s += 1.5;
    if (a.beyond !== "manhattan" && areaOf(p) !== "manhattan") s += 1; // they asked for it
    if (p.suggestedDurationMin <= 25) s -= 1; // quick hits make better "along the way" stops
    if (a.pace === "relaxed" && p.suggestedDurationMin >= 180) s -= 1;
    // Far-flung city stops cost a lot of the day in transit.
    if (areaOf(p) === "manhattan") s -= haversineKm(HOTEL.location, p.location) / 8;
    return s;
  };

  const chosen: Place[] = [];
  const ranked = open.filter((p) => !isMeal(p)).sort((x, y) => score(y) - score(x));
  // Two picks a few hundred meters apart are usually the same outing (ferry + Statue).
  const overlaps = (p: Place) => chosen.some((c) => haversineKm(c.location, p.location) < 0.45);
  const count = STOPS_BY_PACE[a.pace];
  // Make sure the trip actually goes where they said it would.
  if (a.beyond !== "manhattan") {
    const out = ranked.find((p) => areaOf(p) !== "manhattan");
    if (out) chosen.push(out);
  }
  // One outing across the river is plenty; the rest of the day stays central.
  const outside = () => chosen.filter((c) => areaOf(c) !== "manhattan").length;
  for (const p of ranked) {
    if (chosen.length >= count - 1) break;
    if (chosen.includes(p) || overlaps(p)) continue;
    if (areaOf(p) !== "manhattan" && outside() >= 2) continue;
    chosen.push(p);
  }

  const picks: AiPick[] = chosen.map((p, i) => {
    const matched = p.categories.filter((c) => a.interests.includes(c));
    const why = matched.length
      ? REASONS[i % REASONS.length](matched.map((m) => INTEREST_WORDS[m]).join(" and "))
      : "A classic first-timer stop that fits the day.";
    return {
      placeId: p.id,
      priority: i < 3 ? "must" : "nice",
      durationMin: a.pace === "packed" ? Math.round(p.suggestedDurationMin * 0.8) : p.suggestedDurationMin,
      reason: p.blurb ? `${why} ${p.blurb}` : why,
    };
  });

  // Always plan a proper meal, near the far end of the day if they left Manhattan.
  const food = open
    .filter(isMeal)
    .sort((x, y) => {
      const bonus = (p: Place) => (a.beyond !== "manhattan" && areaOf(p) !== "manhattan" ? 2 : 0);
      return score(y) + bonus(y) - (score(x) + bonus(x));
    })[0];
  if (food) {
    picks.push({
      placeId: food.id,
      priority: "nice",
      durationMin: Math.max(45, food.suggestedDurationMin),
      reason: a.interests.includes("food") ? "Dinner stop for the food lovers." : "A sit-down meal so nobody runs on empty.",
      window: { start: hm(17), end: hm(20, 30) },
    });
  }

  const partyWord = { solo: "Solo", couple: "Two-person", family: "Family", friends: "Crew" }[a.party];
  const counts = a.interests.map((i) => [i, picks.filter((p) => PLACES.find((x) => x.id === p.placeId)?.categories.includes(i)).length] as const);
  const top = [...counts].sort((x, y) => y[1] - x[1])[0];
  const lead = top ? INTEREST_WORDS[top[0]] : "the classics";
  return {
    title: `${partyWord} day of ${lead}`,
    summary: `${picks.length} stops tuned to a ${a.pace} pace${a.beyond !== "manhattan" ? ", with a hop outside Manhattan" : ""}. Your route is optimized around opening hours and the fastest way between each stop.`,
    picks,
    tips: [
      "Tap the same contactless card or phone for subway, bus and PATH; each traveler needs their own.",
      a.gettingAround === "comfort"
        ? "Long transit legs are swapped for Uber. Switch any leg back on the trip page."
        : "Switch any leg to Uber or Citi Bike on the trip page; the schedule re-times itself.",
      wantKids ? 'Kids under 44" ride the subway, bus and PATH free.' : "Keep 10–15 minutes of slack: NYC doors and lines are unpredictable.",
    ],
    source: "offline",
  };
}
