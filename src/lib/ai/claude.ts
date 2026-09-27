import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { PLACES, PLACES_BY_ID } from "../fixtures/places";
import { addDays, formatClock, parseClock, weekday } from "../time";
import { allowedAreas, areaOf, openDuringTrip } from "./offline";
import type { AiRecommendation, QuizAnswers } from "./types";

// Claude picks stops from our catalog (so every pick has coordinates and
// hours the optimizer can use); the optimizer then does the ordering/routing.

const MODEL = "claude-opus-5";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const ids = PLACES.map((p) => p.id) as [string, ...string[]];

const RecommendationSchema = z.object({
  title: z.string().describe("Catchy trip name, at most 6 words, no emoji"),
  summary: z.string().describe("Two sentences, second person, describing the trip's arc"),
  picks: z.array(
    z.object({
      placeId: z.enum(ids),
      priority: z.enum(["must", "nice"]),
      durationMin: z.number().int().describe("Minutes to spend there"),
      reason: z.string().describe("One sentence, second person, tied to what the traveler said"),
      visitAfter: z.string().describe('Optional "HH:MM" earliest visit start (e.g. dinner); empty string if none'),
      visitBefore: z.string().describe('Optional "HH:MM" latest visit end; empty string if none'),
    }),
  ),
  tips: z.array(z.string()).describe("2-3 short practical tips (transit, payment, timing). No emoji."),
});

// Stable prefix (instructions + catalog) goes first so it can be cached.
const SYSTEM = `You are NYSee's trip curator. Visitors answer a short quiz and you choose which places they should see on a trip of one or more days in the New York area.

Rules:
- Only choose places from the catalog below, by id. Never invent places.
- Per day, choose 3-4 stops for a relaxed pace, 4-6 for balanced, 6-8 for packed, including one sit-down meal. Multiply by the number of days.
- Mark 2-4 picks per day as "must"; the rest "nice" (the optimizer drops "nice" stops first if time runs short).
- Skip places closed on every day of the trip. Respect the areas the traveler allowed.
- The optimizer splits picks into days and orders them; favor picks that form geographic clusters, since a scattered set wastes days in transit.
- Families: prefer kid-friendly places and shorter visits. Couples: a view or a memorable dinner.
- Give a meal a visit window (e.g. dinner 17:00-20:30). Leave other windows empty unless they matter.
- Reasons must reference what the traveler told you. Keep them to one sentence. No emoji.

Catalog (id | name | area | categories | typical minutes | weekly hours):
${PLACES.map((p) => {
  const hours = p.hours
    ? p.hours.map((d, i) => `${DAYS[i].slice(0, 3)} ${d.length ? d.map((w) => `${formatClock(w.start)}-${formatClock(w.end)}`).join(",") : "closed"}`).join("; ")
    : "always open";
  return `${p.id} | ${p.name} | ${areaOf(p)} | ${p.categories.join(",")} | ${p.suggestedDurationMin} | ${hours}${p.blurb ? ` | ${p.blurb}` : ""}`;
}).join("\n")}`;

const AREA_LABEL: Record<string, string> = {
  manhattan: "Manhattan only",
  jersey: "Manhattan plus Jersey City/Hoboken (PATH)",
  "long-island": "Manhattan plus a Long Island beach (LIRR)",
  hudson: "Manhattan plus the Hudson Valley (Metro-North)",
  surprise: "Manhattan plus a hop across the Hudson if it's worth it",
};

function tripDates(a: QuizAnswers): string {
  const days = a.days ?? 1;
  const label = (d: string) => `${d} (${DAYS[weekday(d)]})`;
  return days > 1 ? `Trip: ${days} days, ${label(a.date)} to ${label(addDays(a.date, days - 1))}` : `Trip date: ${label(a.date)}`;
}

function userPrompt(a: QuizAnswers): string {
  return [
    tripDates(a) + `, ${formatClock(a.dayStart)} to ${formatClock(a.dayEnd)} each day, based at a hotel near Bryant Park.`,
    `Who: ${a.party}, ${a.travelers} traveler${a.travelers > 1 ? "s" : ""}.`,
    `Interests: ${a.interests.join(", ") || "no strong preference"}.`,
    `Pace: ${a.pace}. Getting around: ${a.gettingAround === "comfort" ? "happy to take Ubers" : a.gettingAround === "mix" ? "mostly transit, the odd Uber" : "public transit only"}.`,
    `Areas allowed: ${AREA_LABEL[a.beyond]}.`,
    a.notes.trim() ? `In their own words: """${a.notes.trim().slice(0, 600)}"""` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function claudeRecommend(a: QuizAnswers): Promise<AiRecommendation> {
  const client = new Anthropic({ timeout: 60_000, maxRetries: 1 });
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // Picking ~6 places from a 45-item list doesn't need deep reasoning; keep the quiz snappy.
    output_config: { effort: "medium", format: betaZodOutputFormat(RecommendationSchema) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt(a) }],
  });

  if (response.stop_reason === "refusal") throw new Error("The model declined this request.");
  const out = response.parsed_output;
  if (!out) throw new Error(`No structured output (stop_reason: ${response.stop_reason}).`);

  const areas = allowedAreas(a.beyond);
  const seen = new Set<string>();
  const picks = out.picks
    .filter((p) => {
      const place = PLACES_BY_ID[p.placeId];
      if (!place || seen.has(p.placeId)) return false;
      seen.add(p.placeId);
      return areas.has(areaOf(place)) && openDuringTrip(place, a);
    })
    .map((p) => {
      const clock = (s: string) => (/^\d{1,2}:\d{2}$/.test(s) ? parseClock(s) : undefined);
      const start = clock(p.visitAfter);
      const end = clock(p.visitBefore);
      return {
        placeId: p.placeId,
        priority: p.priority,
        durationMin: Math.min(300, Math.max(10, Math.round(p.durationMin))),
        reason: p.reason,
        window: start !== undefined || end !== undefined ? { start: start ?? 0, end: end ?? 24 * 60 } : undefined,
      };
    });
  if (!picks.length) throw new Error("The model returned no usable picks.");

  return { title: out.title, summary: out.summary, picks, tips: out.tips.slice(0, 3), source: "claude" };
}
