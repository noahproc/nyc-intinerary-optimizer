import { NextResponse } from "next/server";
import { aiPlan } from "@/lib/ai/plan";
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
    return NextResponse.json(await aiPlan({ ...body, travelers: Math.max(1, Math.min(12, body.travelers || 1)) }));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
