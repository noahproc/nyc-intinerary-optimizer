import { NextResponse } from "next/server";
import { planDays } from "@/lib/multiday";
import { MAX_DAYS, type TripRequest } from "@/lib/types";

export async function POST(request: Request) {
  let body: TripRequest;
  try {
    body = (await request.json()) as TripRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body?.date || !body.start?.location || !body.end?.location || !Array.isArray(body.stops)) {
    return NextResponse.json({ error: "date, start, end and stops are required" }, { status: 400 });
  }
  if (body.dayEnd <= body.dayStart) {
    return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
  }
  if (body.days != null && !(Number.isInteger(body.days) && body.days >= 1 && body.days <= MAX_DAYS)) {
    return NextResponse.json({ error: `days must be a whole number from 1 to ${MAX_DAYS}` }, { status: 400 });
  }
  try {
    return NextResponse.json(await planDays(body));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
