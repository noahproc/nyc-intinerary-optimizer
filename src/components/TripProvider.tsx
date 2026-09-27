"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AiPlanResult } from "@/lib/ai/plan";
import type { AiRecommendation } from "@/lib/ai/types";
import { DEMO_REQUEST } from "@/lib/fixtures/demo";
import { START_ID, legKey, type Leg, type ModeChoice, type Place, type Trip, type TripRequest } from "@/lib/types";

// One trip, shared by every page (builder, trip map, fares) and kept in
// localStorage so a refresh or a new tab doesn't lose the plan.

const STORAGE_KEY = "nysee:trip:v1";

interface Persisted {
  request: TripRequest;
  trip: Trip | null;
  surprises: string[];
  recommendation: AiRecommendation | null;
}

interface TripContextValue extends Persisted {
  hydrated: boolean;
  loading: boolean;
  error: string | null;
  setRequest: (r: TripRequest) => void;
  plan: (r: TripRequest) => Promise<Trip | null>;
  planFresh: () => Promise<Trip | null>;
  override: (leg: Leg, choice: ModeChoice) => void;
  addSuggestion: (leg: Leg, place: Place) => void;
  loadSample: () => Promise<Trip | null>;
  applyAi: (result: AiPlanResult) => void;
}

const TripContext = createContext<TripContextValue | null>(null);

const currentOrder = (trip: Trip) => trip.schedule.slice(1, -1).map((s) => s.stop.id);

export function TripProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>({ request: DEMO_REQUEST, trip: null, surprises: [], recommendation: null });
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState(JSON.parse(raw) as Persisted);
    } catch {
      /* storage unavailable or corrupt: start fresh */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* quota or privacy mode: the in-memory trip still works */
    }
  }, [state, hydrated]);

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
      setState((s) => ({ ...s, request: req, trip: json as Trip }));
      return json as Trip;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo<TripContextValue>(
    () => ({
      ...state,
      hydrated,
      loading,
      error,
      setRequest: (request) => setState((s) => ({ ...s, request })),
      plan,
      planFresh: () => plan({ ...stateRef.current.request, fixedOrder: undefined }),
      override: (leg, choice) => {
        const { request, trip } = stateRef.current;
        if (!trip) return;
        const overrides = { ...(request.overrides ?? {}) };
        const key = legKey(leg.fromStopId, leg.toStopId);
        if (choice === "transit") delete overrides[key];
        else overrides[key] = choice;
        plan({ ...request, overrides, fixedOrder: currentOrder(trip) });
      },
      addSuggestion: (leg, place) => {
        const { request, trip } = stateRef.current;
        if (!trip) return;
        const order = currentOrder(trip);
        order.splice(leg.fromStopId === START_ID ? 0 : order.indexOf(leg.fromStopId) + 1, 0, place.id);
        setState((s) => ({ ...s, surprises: [...s.surprises, place.id] }));
        plan({
          ...request,
          stops: [...request.stops, { id: place.id, place, durationMin: place.suggestedDurationMin, priority: "nice" }],
          fixedOrder: order,
        });
      },
      loadSample: () => {
        setState((s) => ({ ...s, surprises: [], recommendation: null }));
        return plan(DEMO_REQUEST);
      },
      applyAi: (r) => setState({ request: r.request, trip: r.trip, surprises: [], recommendation: r.recommendation }),
    }),
    [state, hydrated, loading, error, plan],
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip(): TripContextValue {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error("useTrip must be used inside <TripProvider>");
  return ctx;
}
