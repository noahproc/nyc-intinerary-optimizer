# NYSee

**See New York. Skip the transit maze.** NYSee is a NYC trip planner for visitors (e.g., a family in town for a few
days). It turns a wishlist of sights into an optimized, door-to-door itinerary across fragmented transit: MTA
subway/bus, LIRR, Metro-North, PATH, Citi Bike, walking, plus user-added Uber/driving segments.

**Hackathon track problem:** commuters and visitors juggle multiple independent transit systems with no unified
routing or payment experience.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # optimizer, planner and AI recommender tests (offline)
npm run demo         # prints the demo itinerary in the terminal
npm run demo -- uber # ...with the Uber override applied
npm run demo -- lirr # LIRR/Long Island variant
```

No API keys are needed. Every provider falls back to built-in data, including the AI planner, so the demo works
on bad venue Wi-Fi. Map tiles (CARTO dark / OpenStreetMap) are the only thing that needs internet.

Copy `.env.example` to `.env.local` to turn on real data. See [API keys](#api-keys--free-tiers).

## Pages

| Route | What it's for |
|---|---|
| `/` | Homepage: what NYSee does, entry points to every feature, "continue your day" card |
| `/ai` | **AI trip planner**: a 6-step quiz (who's coming, interests, pace, getting around, leave Manhattan?, when + free-text notes). Claude picks the places and explains each pick, then the optimizer builds and routes the day |
| `/plan` | Trip builder: pick places yourself, set must-see vs nice-to-have, visit length, timed tickets |
| `/trip` | Full-screen dark map with a floating itinerary panel: switch any leg's mode, add "along the way" stops, click a stop to fly to it |
| `/fares` | Fare bundle: total, what one contactless tap covers, per-app breakdown with deep links, and every payment in time order |

The trip is shared across pages through a React context (`src/components/TripProvider.tsx`) and saved in
`localStorage`, so refreshing or switching pages keeps your plan.

**Design:** black plus the NYSee reds (`#f50538`, `#b6042a`, `#79021c`, `#3d010e`). Body text is Fustat and
headlines are Anton, both self-hosted via Fontsource so they work offline. Icons are Lucide, with no emoji.
Tokens live at the top of `src/app/globals.css`.

## AI trip planner

`POST /api/ai` takes the quiz answers (`src/lib/ai/types.ts`) and returns `{recommendation, request, trip}`.

- **With `ANTHROPIC_API_KEY` set:** `src/lib/ai/claude.ts` calls **Claude Opus 5** (`claude-opus-5`) with
  **structured outputs**: a Zod schema where `placeId` is an enum of the catalog IDs, so Claude can't invent
  places. The catalog and instructions are a cached system prompt. It runs at `effort: "medium"` to keep the
  quiz fast, and uses Anthropic's server-side refusal fallback (`fallbacks: "default"`). Picks are validated
  again: they must be in an allowed area and open that day.
- **Without a key, or on any API error:** `src/lib/ai/offline.ts` is a deterministic recommender. It scores places
  by interests, party type, pace and distance, avoids near-duplicates, caps out-of-town stops, and always adds a
  meal with a dinner window. The UI shows which one produced the plan.
- **After the picks:** the optimizer orders and routes them. If the traveler chose "comfort first", transit legs
  over 30 minutes are re-planned as Uber.

## What's built (MVP features, in priority order)

| # | Feature | Where |
|---|---------|-------|
| 1 | **Itinerary optimizer**: orienteering with time windows (opening hours, timed events, "dinner 5–8 PM" preferences), must-see vs nice-to-have, flags what doesn't fit and why | `src/lib/optimizer/` |
| 2 | **Multimodal legs**: every leg has segments (walk → subway → PATH → walk…), duration, and cost. Change any leg's mode and the schedule recalculates, keeping your order | `src/lib/providers/mock/router.ts`, `src/lib/planner.ts` |
| 3 | **Along-the-way suggestions**: places within a ≤10 min detour that match your interests and still fit the schedule; one-click "Add" inserts them as a surprise stop | `planner.ts` → `addSuggestions` |
| 4 | **Trip cost bundle**: fares grouped by how you pay (OMNY tap, PATH via TAPP, LIRR/MNR via TrainTime, Citi Bike, Uber, car), per-rider vs per-vehicle, with deep links (Uber pickup/drop-off prefilled). No ticket purchasing | `src/lib/cost.ts`, `/fares` |
| 5 | **Multi-day trips**: set how many days; the wishlist is split across days by opening hours (closed-Monday museums land elsewhere), geography (nearby stops share a day), and how full each day is. Pin any stop to a day or move it from the trip page; the OMNY 7-day fare cap is applied across the whole trip | `src/lib/multiday.ts`, `combineCosts` in `src/lib/cost.ts` |
| 6 | **Time awareness**: everything in America/New_York (DST-safe), plus a jet-lag note from the visitor's home timezone | `src/lib/time.ts` |
| + | **AI planner**: quiz → Claude recommendations → routed trip | `src/lib/ai/`, `/ai` |

## Architecture

```
 Browser (Next.js pages: / /ai /plan /trip /fares, shared TripProvider state)
   /ai quiz ── POST /api/ai (QuizAnswers → Claude picks → planTrip) ───────┐
   /plan, /trip ── POST /api/plan  (TripRequest → TripPlan, one Trip/day) ┤
                                                                             │
 Server: planTrip()  src/lib/planner.ts                                       │
   1. estimate matrix ── mock/router.estimateMinutes (fast, local, per-mode) │
   2. optimize order ─── optimizer/optimize.ts (greedy insert + 2-opt/relocate)
   3. route chosen legs ─ RoutingProvider.route()  ← Google Routes | mock     │
   4. repair ─────────── drop lowest-value nice-to-have if real times broke it
   5. suggestions ────── PlacesProvider.nearby() + feasibility re-simulation  │
   6. cost bundle ────── cost.ts (fare table in fares.ts)                    │
   BikeProvider (Citi Bike GBFS live | mock) for Citi Bike legs ─────────────┘
```

**Key decision: two-tier routing.** The optimizer evaluates thousands of candidate orders, so it uses a fast
local travel-time model (`estimateMinutes`). Only the ~6–10 legs of the final plan go to the real router, departing
at their scheduled times. That keeps API calls (and cost) to about one per leg per re-plan, and it makes
**OpenTripPlanner a drop-in**: implement `RoutingProvider.route()` against OTP's GTFS-backed API (MTA subway/bus,
LIRR, Metro-North, PATH feeds) and register it in `providers/index.ts`.

Every real provider is wrapped in a fallback: on error, timeout, or quota, the request uses the fixture
provider and shows a warning instead of failing.

### Data model (`src/lib/types.ts`)

All clock times are **minutes after midnight, NYC local time, on the trip date**, so the optimizer never
does timezone math. Conversions happen only at the edges (`time.ts`).

- **Place**: name, lat/lng, interest categories, weekly opening hours, typical visit length, popularity
- **Stop**: a wishlist entry: `place` + `durationMin` + `priority` (`must` | `nice`) + optional `event`
  (fixed start time) + optional `window` (user preference)
- **TimeWindow**: `{start, end}`: the visit must start ≥ `start` and finish ≤ `end`
- **Leg**: between two stops: `choice` (what the user picked: transit/bus/citibike/walk/uber/drive), `segments[]`
  (concrete vehicles with duration, cost, payment channel, polyline), `availableChoices`, `suggestions[]`, bike availability
- **Suggestion**: place + detour minutes + matched interests + why it fits
- **Trip**: request + `schedule[]` (arrive/start/depart/wait per stop) + `legs[]` + `unscheduled[]` (with reasons)
  + cost summary + totals + warnings

### Optimizer

Orienteering problem with time windows, solved heuristically (fast enough for ~15 stops, in milliseconds):

1. Greedy insertion, must-sees first, then nice-to-haves ranked by score ÷ added time; only feasible insertions.
2. Local search with 2-opt and single-stop relocate (relocate handles time windows better than 2-opt).
3. Retry leftovers; if a must-see still doesn't fit, try swapping out a nice-to-have.
4. Objective: travel + idle waiting (+ tiny tiebreak for finishing early). The first stop never has an idle wait:
   you just leave the hotel later.

Unscheduled stops get a reason: closed that day, window outside your hours, or "about N min short".

## API keys & free tiers

| Service | Needed for | Key? | Free tier (verify on the pricing page; these change) |
|---|---|---|---|
| **Google Routes API** (`computeRoutes`) | Real transit/driving/walking/bike durations and polylines | `GOOGLE_MAPS_API_KEY` | Since March 2025 Google gives free monthly calls per SKU instead of the old $200 credit: roughly 10k (Essentials), 5k (Pro), 1k (Enterprise). Transit and traffic-aware routes bill as Pro. One re-plan ≈ 6–10 calls. |
| **Google Places API (New)**: Text Search, Nearby Search | Resolving arbitrary places, live opening hours, suggestion candidates | same key | Asking for `regularOpeningHours` puts requests in the Pro/Enterprise tiers (~5k/1k free per month). The field mask in `providers/google/places.ts` is deliberately small. |
| **Anthropic API** (Claude Opus 5) | AI trip planner recommendations | `ANTHROPIC_API_KEY` | Pay-as-you-go ($5 / $25 per million input/output tokens). One quiz ≈ 4k input + ~1k output tokens, about 5 cents; the cached catalog prompt makes repeats cheaper. Without a key the built-in recommender is used. |
| **Citi Bike GBFS** | Live dock/bike counts on Citi Bike legs | none | Free public feed (`gbfs.citibikenyc.com`) |
| **Map tiles**: CARTO dark / OpenStreetMap via Leaflet | Base map | `NEXT_PUBLIC_CARTO_API_KEY` | Free CARTO Basemaps key; without it raster tiles show an "API key required" watermark. Free up to 5M tile requests/month non-commercial (1M commercial). Restrict the key to your site's domains in the CARTO dashboard; it ships to the browser. |
| Uber | Deep links only (`m.uber.com/ul/?action=setPickup…`) | none | The Uber price estimate API needs partner approval, so the app uses its own fare model. |

For the Google key, enable **Routes API** and **Places API (New)** in one Cloud project, restrict the key to
those two APIs, and set budget alerts. Then set `ROUTING_PROVIDER=google` and `PLACES_PROVIDER=google`.

## Demo script (~3 min)

0. **Homepage → AI planner.** Click *Plan my day with AI*, answer the six questions (e.g. Two of us · Art + Views ·
   Balanced · Comfort first · Jersey City), and add a note like "it's our anniversary". NYSee shows the picks with a
   reason for each, then *Open my day on the map*.

For the scripted walkthrough, use *open the sample family day* on the homepage. It loads: a family of **4 from London** on **Sat Oct 3, 2026**, based at a Midtown hotel,
9:00 AM to 10:30 PM. Interests: food, views, art.

1. **Jet lag + the plan.** Point at the note: "your 9:00 AM start is 2:00 PM in London." The optimizer ordered
   Met → Central Park → 9/11 Memorial → **PATH to Jersey City** (Exchange Place skyline) → dinner at Porta
   (window 5–8 PM) → back for a **timed 8:30 PM Top of the Rock** slot. It leaves the hotel at 9:36 because the Met
   opens at 10.
2. **Fragmented transit, one view.** Walk the legs: subway (OMNY), a PATH leg (WTC → Exchange Place), and the
   return: PATH + subway on the same card but billed as two systems.
3. **"We'll be exhausted after dinner. Uber this one."** Change the Porta → Top of the Rock leg to *Uber*.
   The schedule recalculates in place, and the cost panel gains an Uber line with a prefilled deep link. The
   Holland Tunnel toll and Manhattan surcharge are included.
4. **Surprise stop.** On the first leg, open "along the way" and click **Add** on "NY Public Library – Rose Main
   Reading Room" (+6 min detour). It's inserted with a *Surprise stop* tag and the rest of the day re-times. Also try The Oculus on the PATH leg,
   which is practically on the way.
5. **The bundle.** Open **Fares** in the nav: the total for 4 riders: which legs are one contactless tap (OMNY, PATH/TAPP), which need their
   own app (Uber, TrainTime), and a note that kids under 44" ride free.
6. *(Optional)* Change "Travelers", or run `npm run demo -- lirr` to show a Long Island afternoon over the LIRR
   with a TrainTime ticket.

## Assumptions & known limits (hackathon scope)

- **Fares** are 2026 estimates in `src/lib/fares.ts` (subway/bus $3.00, PATH $3.00, LIRR/MNR distance-based
  estimate, Citi Bike $4.99/ride, Uber fare model). Verify before relying on them.
- **The offline transit model** is geographic, not schedule-based: it uses average speeds, a real PATH station and
  line list, and a few key LIRR/Metro-North stations. It's good for ordering and demos; Google/OTP provide the real times.
- **Fixture opening hours** are representative, not live. Google Places supplies real hours when enabled.
- Every day of a multi-day trip shares the same hotel and start/end times. Day assignment uses the offline
  travel estimates; each day is then routed for real. Up to 14 days.
- The Google adapters follow the documented Routes/Places (New) request shapes but **haven't been run against
  live keys** in this repo yet, because the build environment had no network access to Google. Expect small
  field-mapping fixes on the first real run.
- Deep links for PATH/TrainTime/Citi Bike point to the operators' info pages. Only Uber supports a prefilled trip.
