# NYC Day Planner (nyc-itinerary-optimizer)

A NYC trip planner for visitors (e.g., family in town for a few days) that turns a wishlist of sights into an
optimized, door-to-door itinerary across fragmented transit: MTA subway/bus, LIRR, Metro-North, PATH, Citi Bike,
walking, plus user-added Uber/driving segments.

**Hackathon track problem:** commuters and visitors juggle multiple independent transit systems with no unified
routing or payment experience.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000, loads the demo trip on open
npm test             # optimizer + planner tests (offline)
npm run demo         # prints the demo itinerary in the terminal
npm run demo -- uber # ...with the Uber override applied
npm run demo -- lirr # LIRR/Long Island variant
```

No API keys are needed. Every provider falls back to fixtures, so the demo works on bad venue Wi-Fi.
Map tiles (CARTO/OpenStreetMap) are the only thing that needs internet; offline, the routes and markers
still draw on a blank background.

Copy `.env.example` to `.env.local` to turn on real data. See [API keys](#api-keys--free-tiers).

## What's built (MVP features, in priority order)

| # | Feature | Where |
|---|---------|-------|
| 1 | **Itinerary optimizer**: orienteering with time windows (opening hours, timed events, "dinner 5–8 PM" preferences), must-see vs nice-to-have, flags what doesn't fit and why | `src/lib/optimizer/` |
| 2 | **Multimodal legs**: every leg has segments (walk → subway → PATH → walk…), duration, and cost. Change any leg's mode and the schedule recalculates, keeping your order | `src/lib/providers/mock/router.ts`, `src/lib/planner.ts` |
| 3 | **Along-the-way suggestions**: places within a ≤10 min detour that match your interests and still fit the schedule; one-click "Add" inserts them as a ✨ surprise stop | `planner.ts` → `addSuggestions` |
| 4 | **Trip cost bundle**: fares grouped by how you pay (OMNY tap, PATH via TAPP, LIRR/MNR via TrainTime, Citi Bike, Uber, car), per-rider vs per-vehicle, with deep links (Uber pickup/drop-off prefilled). No ticket purchasing | `src/lib/cost.ts`, `src/lib/deeplinks.ts` |
| 5 | **Time awareness**: everything in America/New_York (DST-safe), plus a jet-lag note from the visitor's home timezone | `src/lib/time.ts` |

## Architecture

```
 Browser (Next.js page, React, Leaflet)
   TripForm ─┐   Itinerary (mode dropdowns, suggestions)   TripMap   CostPanel
             └──── POST /api/plan  (TripRequest → Trip) ─────────────────────┐
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
| **Citi Bike GBFS** | Live dock/bike counts on Citi Bike legs | none | Free public feed (`gbfs.citibikenyc.com`) |
| **Map tiles**: CARTO Voyager / OpenStreetMap via Leaflet | Base map | none | Free for low-volume/non-commercial use with attribution. Swap to Mapbox or Google tiles if needed. |
| Uber | Deep links only (`m.uber.com/ul/?action=setPickup…`) | none | The Uber price estimate API needs partner approval, so the app uses its own fare model. |

For the Google key, enable **Routes API** and **Places API (New)** in one Cloud project, restrict the key to
those two APIs, and set budget alerts. Then set `ROUTING_PROVIDER=google` and `PLACES_PROVIDER=google`.

## Demo script (~3 min)

The page loads the demo trip: a family of **4 from London** on **Sat Oct 3, 2026**, based at a Midtown hotel,
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
4. **Surprise stop.** On the first leg, click **Add** on "NY Public Library – Rose Main Reading Room" (+6 min
   detour). It's inserted with a ✨ badge and the rest of the day re-times. Also try The Oculus on the PATH leg,
   which is practically on the way.
5. **The bundle.** Total for 4 riders: which legs are one contactless tap (OMNY, PATH/TAPP), which need their
   own app (Uber, TrainTime), and a note that kids under 44" ride free.
6. *(Optional)* Change "Travelers", or run `npm run demo -- lirr` to show a Long Island afternoon over the LIRR
   with a TrainTime ticket.

## Assumptions & known limits (hackathon scope)

- **Fares** are 2026 estimates in `src/lib/fares.ts` (subway/bus $3.00, PATH $3.00, LIRR/MNR distance-based
  estimate, Citi Bike $4.99/ride, Uber fare model). Verify before relying on them.
- **The offline transit model** is geographic, not schedule-based: it uses average speeds, a real PATH station and
  line list, and a few key LIRR/Metro-North stations. It's good for ordering and demos; Google/OTP provide the real times.
- **Fixture opening hours** are representative, not live. Google Places supplies real hours when enabled.
- A trip is a single day. Multi-day trips would call `planTrip` per day, splitting the wishlist first.
- The Google adapters follow the documented Routes/Places (New) request shapes but **haven't been run against
  live keys** in this repo yet, because the build environment had no network access to Google. Expect small
  field-mapping fixes on the first real run.
- Deep links for PATH/TrainTime/Citi Bike point to the operators' info pages. Only Uber supports a prefilled trip.
