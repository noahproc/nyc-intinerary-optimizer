import { NextResponse } from "next/server";
import { getProviders } from "@/lib/providers";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const { places, warnings } = getProviders();
  const results = await places.search(q);
  return NextResponse.json({ results: results.slice(0, 20), provider: places.name, warnings });
}
