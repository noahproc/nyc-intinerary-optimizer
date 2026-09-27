"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import CostPanel from "@/components/CostPanel";
import Itinerary from "@/components/Itinerary";
import TripForm from "@/components/TripForm";
import { DEMO_REQUEST } from "@/lib/fixtures/demo";
import { formatDuration } from "@/lib/time";
import { START_ID, legKey, type Leg, type ModeChoice, type Place, type Trip, type TripRequest } from "@/lib/types";

// Leaflet touches `window`, so the map only renders client-side.
const TripMap = dynamic(() => import("@/components/TripMap"), {
  ssr: false,
  loading: () => <div className="map" />,
});

const currentOrder = (trip: Trip) => trip.schedule.slice(1, -1).map((s) => s.stop.id);

export default function Home() {
  const [request, setRequest] = useState<TripRequest>(DEMO_REQUEST);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoverLeg, setHoverLeg] = useState<number | null>(null);
  const [surprises, setSurprises] = useState<Set<string>>(new Set());

  const plan = useCallback(async (req: TripRequest) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      setRequest(req);
      setTrip(json as Trip);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    plan(DEMO_REQUEST);
  }, [plan]);

  // A fresh plan from the form re-optimizes the order but keeps mode choices.
  const planFresh = () => plan({ ...request, fixedOrder: undefined });

  const override = (leg: Leg, choice: ModeChoice) => {
    if (!trip) return;
    const overrides = { ...(request.overrides ?? {}) };
    const key = legKey(leg.fromStopId, leg.toStopId);
    if (choice === "transit") delete overrides[key];
    else overrides[key] = choice;
    plan({ ...request, overrides, fixedOrder: currentOrder(trip) });
  };

  const addSuggestion = (leg: Leg, place: Place) => {
    if (!trip) return;
    const order = currentOrder(trip);
    const at = leg.fromStopId === START_ID ? 0 : order.indexOf(leg.fromStopId) + 1;
    order.splice(at, 0, place.id);
    setSurprises((s) => new Set(s).add(place.id));
    plan({
      ...request,
      stops: [...request.stops, { id: place.id, place, durationMin: place.suggestedDurationMin, priority: "nice" }],
      fixedOrder: order,
    });
  };

  return (
    <main className="app">
      <TripForm request={request} onChange={setRequest} onPlan={planFresh} loading={loading} />

      <section className="panel stack" aria-label="Itinerary" style={{ opacity: loading ? 0.6 : 1 }}>
        <div className="row">
          <h2 className="grow" style={{ margin: 0 }}>
            Your day
          </h2>
          {request.fixedOrder && (
            <button className="btn small" onClick={planFresh} disabled={loading}>
              ↻ Re-optimize order
            </button>
          )}
        </div>
        {error && <div className="warn">Couldn&apos;t plan: {error}</div>}
        {trip?.timeNote && <div className="note">🕘 {trip.timeNote}</div>}
        {trip?.warnings.map((w) => (
          <div key={w} className="warn">
            ⚠ {w}
          </div>
        ))}
        {trip?.unscheduled.map((u) => (
          <div key={u.stop.id} className="warn">
            <b>Didn&apos;t fit: {u.stop.place.name}.</b> {u.reason}
          </div>
        ))}
        {trip && (
          <div className="totals small">
            <div>
              <span className="muted">Sightseeing</span>
              <b>{formatDuration(trip.totals.visitMin)}</b>
            </div>
            <div>
              <span className="muted">Travel</span>
              <b>{formatDuration(trip.totals.travelMin)}</b>
            </div>
            <div>
              <span className="muted">Free time</span>
              <b>{formatDuration(trip.totals.waitMin)}</b>
            </div>
            <div>
              <span className="muted">Spare at end</span>
              <b>{formatDuration(trip.totals.slackMin)}</b>
            </div>
          </div>
        )}
        {trip && (
          <Itinerary trip={trip} surprises={surprises} onOverride={override} onAddSuggestion={addSuggestion} onHoverLeg={setHoverLeg} />
        )}
        {trip && (
          <div className="muted small">
            Data: routing {trip.providers.routing} · places {trip.providers.places} · bikes {trip.providers.bikes}
          </div>
        )}
      </section>

      <div className="right">
        <TripMap trip={trip} highlightLeg={hoverLeg} />
        {trip && <CostPanel trip={trip} />}
      </div>
    </main>
  );
}
