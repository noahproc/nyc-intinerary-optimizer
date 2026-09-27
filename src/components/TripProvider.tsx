"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AiPlanResult } from "@/lib/ai/plan";
import type { AiRecommendation } from "@/lib/ai/types";
import { DEMO_REQUEST } from "@/lib/fixtures/demo";
import { START_ID, legKey, type Leg, type ModeChoice, type Place, type Trip, type TripPlan, type TripRequest } from "@/lib/types";

// One trip (one or more days), shared by every page (builder, trip map, fares)
// and kept in localStorage so a refresh or a new tab doesn't lose the plan.

const STORAGE_KEY = "nysee:trip:v2";
/** Single-day format; read once so an existing plan survives the upgrade. */
const LEGACY_KEY = "nysee:trip:v1";

interface Persisted {
  request: TripRequest;
  plan: TripPlan | null;
  surprises: string[];
  recommendation: AiRecommendation | null;
}

interface TripContextValue extends Persisted {
  hydrated: boolean;
  loading: boolean;
  error: string | null;
  setRequest: (r: TripRequest) => void;
  planTrip: (r: TripRequest) => Promise<TripPlan | null>;
  planFresh: () => Promise<TripPlan | null>;
  override: (leg: Leg, choice: ModeChoice) => void;
  addSuggestion: (day: number, leg: Leg, place: Place) => void;
  moveStop: (stopId: string, toDay: number) => void;
  loadSample: () => Promise<TripPlan | null>;
  applyAi: (result: AiPlanResult) => void;
}

const TripContext = createContext<TripContextValue | null>(null);

/** Stop ids per day as currently scheduled; sent back as `fixedDays` so small edits don't reshuffle the trip. */
const currentDays = (plan: TripPlan) => plan.days.map((d) => d.schedule.slice(1, -1).map((s) => s.stop.id));

function fromLegacy(raw: string): Persisted {
  const old = JSON.parse(raw) as Omit<Persisted, "plan"> & { trip: Trip | null };
  const { trip, ...rest } = old;
  return {
    ...rest,
    plan: trip ? { request: trip.request, days: [trip], cost: trip.cost, totals: trip.totals, warnings: [] } : null,
  };
}

export function TripProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>({ request: DEMO_REQUEST, plan: null, surprises: [], recommendation: null });
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const legacy = raw ? null : localStorage.getItem(LEGACY_KEY);
      if (raw) setState(JSON.parse(raw) as Persisted);
      else if (legacy) setState(fromLegacy(legacy));
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

  const requestPlan = useCallback(async (req: TripRequest) => {
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
      setState((s) => ({ ...s, request: req, plan: json as TripPlan }));
      return json as TripPlan;
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
      planTrip: requestPlan,
      planFresh: () => requestPlan({ ...stateRef.current.request, fixedOrder: undefined, fixedDays: undefined }),
      override: (leg, choice) => {
        const { request, plan: current } = stateRef.current;
        if (!current) return;
        const overrides = { ...(request.overrides ?? {}) };
        const key = legKey(leg.fromStopId, leg.toStopId);
        if (choice === "transit") delete overrides[key];
        else overrides[key] = choice;
        requestPlan({ ...request, overrides, fixedOrder: undefined, fixedDays: currentDays(current) });
      },
      addSuggestion: (day, leg, place) => {
        const { request, plan: current } = stateRef.current;
        if (!current) return;
        const days = currentDays(current);
        const order = days[day];
        order.splice(leg.fromStopId === START_ID ? 0 : order.indexOf(leg.fromStopId) + 1, 0, place.id);
        setState((s) => ({ ...s, surprises: [...s.surprises, place.id] }));
        requestPlan({
          ...request,
          stops: [...request.stops, { id: place.id, place, durationMin: place.suggestedDurationMin, priority: "nice" }],
          fixedOrder: undefined,
          fixedDays: days,
        });
      },
      moveStop: (stopId, toDay) => {
        const { request, plan: current } = stateRef.current;
        if (!current) return;
        // Pin it so re-optimizing keeps it there; the planner picks its slot in the new day.
        requestPlan({
          ...request,
          stops: request.stops.map((s) => (s.id === stopId ? { ...s, day: toDay } : s)),
          fixedOrder: undefined,
          fixedDays: currentDays(current).map((ids) => ids.filter((id) => id !== stopId)),
        });
      },
      loadSample: () => {
        setState((s) => ({ ...s, surprises: [], recommendation: null }));
        return requestPlan(DEMO_REQUEST);
      },
      applyAi: (r) => setState({ request: r.request, plan: r.plan, surprises: [], recommendation: r.recommendation }),
    }),
    [state, hydrated, loading, error, requestPlan],
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip(): TripContextValue {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error("useTrip must be used inside <TripProvider>");
  return ctx;
}
