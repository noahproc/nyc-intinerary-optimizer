import Anthropic from "@anthropic-ai/sdk";
import { HOTEL, PLACES_BY_ID } from "../fixtures/places";
import { planTrip } from "../planner";
import { legKey, type Trip, type TripRequest } from "../types";
import { claudeRecommend } from "./claude";
import { offlineRecommend } from "./offline";
import type { AiRecommendation, QuizAnswers } from "./types";

export interface AiPlanResult {
  recommendation: AiRecommendation;
  request: TripRequest;
  trip: Trip;
}

const hasCredentials = (env: Record<string, string | undefined>) =>
  !!(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) && env.AI_PROVIDER !== "offline";

async function recommend(a: QuizAnswers, env: Record<string, string | undefined>): Promise<AiRecommendation> {
  if (!hasCredentials(env)) return offlineRecommend(a);
  try {
    return await claudeRecommend(a);
  } catch (e) {
    const why =
      e instanceof Anthropic.AuthenticationError
        ? "the API key was rejected"
        : e instanceof Anthropic.RateLimitError
          ? "the API is rate limited"
          : e instanceof Anthropic.APIError
            ? `API error ${e.status}`
            : (e as Error).message;
    console.error("Claude recommendation failed:", e);
    return { ...offlineRecommend(a), note: `Used the built-in recommender because ${why}.` };
  }
}

export function requestFrom(a: QuizAnswers, rec: AiRecommendation): TripRequest {
  return {
    date: a.date,
    start: HOTEL,
    end: HOTEL,
    dayStart: a.dayStart,
    dayEnd: a.dayEnd,
    travelers: a.travelers,
    homeTimeZone: a.homeTimeZone,
    interests: a.interests,
    stops: rec.picks
      .filter((p) => PLACES_BY_ID[p.placeId])
      .map((p) => ({
        id: p.placeId,
        place: PLACES_BY_ID[p.placeId],
        durationMin: p.durationMin,
        priority: p.priority,
        window: p.window,
      })),
  };
}

/** Quiz answers -> recommendations -> optimized trip (with Ubers for "comfort first"). */
export async function aiPlan(a: QuizAnswers, env: Record<string, string | undefined> = process.env): Promise<AiPlanResult> {
  const recommendation = await recommend(a, env);
  let request = requestFrom(a, recommendation);
  let trip = await planTrip(request);

  if (a.gettingAround === "comfort") {
    const slow = trip.legs.filter(
      (l) => l.durationMin > 30 && l.availableChoices.includes("uber") && ["subway", "bus", "path"].includes(l.mode),
    );
    if (slow.length) {
      request = {
        ...request,
        overrides: Object.fromEntries(slow.map((l) => [legKey(l.fromStopId, l.toStopId), "uber" as const])),
        fixedOrder: trip.schedule.slice(1, -1).map((s) => s.stop.id),
      };
      trip = await planTrip(request);
    }
  }
  return { recommendation, request, trip };
}

