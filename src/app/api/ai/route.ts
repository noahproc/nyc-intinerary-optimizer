import { NextResponse } from "next/server";
import { aiPlan } from "@/lib/ai/plan";
import { MAX_DAYS } from "@/lib/types";
import type { QuizAnswers } from "@/lib/ai/types";

export const maxDuration = 60;

export async function POST(request: Request) {
  let body: QuizAnswers;
  try {
    body = (await request.json()) as QuizAnswers;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body?.date || !Array.isArray(body.interests) || !(body.dayEnd > body.dayStart)) {
    return NextResponse.json({ error: "date, interests and a valid time range are required" }, { status: 400 });
  }
  try {
    const travelers = Math.max(1, Math.min(12, body.travelers || 1));
    const days = Math.max(1, Math.min(MAX_DAYS, Math.floor(body.days || 1)));
    return NextResponse.json(await aiPlan({ ...body, travelers, days }));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
