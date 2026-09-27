import type { Interest, Minutes, Priority } from "../types";

export type Party = "solo" | "couple" | "family" | "friends";
export type Pace = "relaxed" | "balanced" | "packed";
export type GettingAround = "transit" | "mix" | "comfort";
export type Beyond = "manhattan" | "jersey" | "long-island" | "hudson" | "surprise";

/** What the "Plan with AI" quiz collects. */
export interface QuizAnswers {
  party: Party;
  travelers: number;
  interests: Interest[];
  pace: Pace;
  gettingAround: GettingAround;
  beyond: Beyond;
  /** YYYY-MM-DD */
  date: string;
  dayStart: Minutes;
  dayEnd: Minutes;
  homeTimeZone?: string;
  /** Free text: "It's our anniversary", "my son loves dinosaurs"... */
  notes: string;
}

export interface AiPick {
  placeId: string;
  priority: Priority;
  durationMin: Minutes;
  reason: string;
  /** Optional preferred visit window (e.g. dinner). */
  window?: { start: Minutes; end: Minutes };
}

export interface AiRecommendation {
  title: string;
  summary: string;
  picks: AiPick[];
  tips: string[];
  /** "claude" when the model produced it; "offline" for the built-in recommender. */
  source: "claude" | "offline";
  note?: string;
}
