"use client";

import { useEffect, useState } from "react";
import { HOTEL, PLACES } from "@/lib/fixtures/places";
import { formatClock, parseClock, toClockInput } from "@/lib/time";
import type { Interest, Place, Stop, TripRequest } from "@/lib/types";

const INTERESTS: Interest[] = ["food", "art", "views", "shopping", "history", "parks", "kids"];
const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
];
const ENDPOINTS = [HOTEL, ...PLACES];

interface Props {
  request: TripRequest;
  onChange: (r: TripRequest) => void;
  onPlan: () => void;
  loading: boolean;
}

export default function TripForm({ request: r, onChange, onPlan, loading }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/places?q=${encodeURIComponent(query)}`, { signal: ctl.signal })
        .then((res) => res.json())
        .then((j) => setResults(j.results ?? []))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [query]);

  const set = (patch: Partial<TripRequest>) => onChange({ ...r, ...patch });
  const setStop = (id: string, patch: Partial<Stop>) =>
    set({ stops: r.stops.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const addPlace = (place: Place) => {
    if (r.stops.some((s) => s.place.id === place.id)) return;
    set({ stops: [...r.stops, { id: place.id, place, durationMin: place.suggestedDurationMin, priority: "must" }] });
    setQuery("");
  };
  const endpoint = (id: string) => ENDPOINTS.find((p) => p.id === id) ?? HOTEL;

  return (
    <aside className="panel stack" aria-label="Trip settings">
      <div>
        <h1>🗽 NYC Day Planner</h1>
        <div className="muted small">Wishlist in, door-to-door day out: subway, PATH, LIRR, Metro-North, Citi Bike and Uber.</div>
      </div>

      <div className="row">
        <label className="field grow">
          Date
          <input type="date" value={r.date} onChange={(e) => set({ date: e.target.value })} />
        </label>
        <label className="field">
          Travelers
          <input
            type="number"
            min={1}
            max={12}
            value={r.travelers ?? 1}
            onChange={(e) => set({ travelers: Math.max(1, Number(e.target.value)) })}
          />
        </label>
      </div>
      <div className="row">
        <label className="field grow">
          Start
          <input type="time" value={toClockInput(r.dayStart)} onChange={(e) => set({ dayStart: parseClock(e.target.value) })} />
        </label>
        <label className="field grow">
          Back by
          <input type="time" value={toClockInput(r.dayEnd)} onChange={(e) => set({ dayEnd: parseClock(e.target.value) })} />
        </label>
      </div>
      <label className="field">
        Start from
        <select value={r.start.id} onChange={(e) => set({ start: endpoint(e.target.value) })}>
          {ENDPOINTS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        End at
        <select value={r.end.id} onChange={(e) => set({ end: endpoint(e.target.value) })}>
          {ENDPOINTS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Home timezone (for jet lag)
        <input list="tz-list" value={r.homeTimeZone ?? ""} onChange={(e) => set({ homeTimeZone: e.target.value || undefined })} />
        <datalist id="tz-list">
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz} />
          ))}
        </datalist>
      </label>

      <div className="stack" style={{ gap: 6 }}>
        <h3>Interests</h3>
        <div className="row">
          {INTERESTS.map((i) => {
            const on = r.interests.includes(i);
            return (
              <button
                key={i}
                className={`chip${on ? " on" : ""}`}
                aria-pressed={on}
                onClick={() => set({ interests: on ? r.interests.filter((x) => x !== i) : [...r.interests, i] })}
              >
                {i}
              </button>
            );
          })}
        </div>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <h3>Wishlist</h3>
        {r.stops.map((s) => (
          <div className="wish" key={s.id}>
            <div className="row">
              <span className="name grow">{s.place.name}</span>
              <button className="btn small" aria-label={`Remove ${s.place.name}`} onClick={() => set({ stops: r.stops.filter((x) => x.id !== s.id) })}>
                ✕
              </button>
            </div>
            <div className="row small">
              <select value={s.priority} onChange={(e) => setStop(s.id, { priority: e.target.value as Stop["priority"] })}>
                <option value="must">Must-see</option>
                <option value="nice">Nice to have</option>
              </select>
              <input
                type="number"
                min={5}
                step={5}
                aria-label="Minutes"
                value={s.durationMin}
                onChange={(e) => setStop(s.id, { durationMin: Number(e.target.value) })}
              />
              <span className="muted">min</span>
              <label className="row muted" title="Timed ticket or event start">
                🎟
                <input
                  type="time"
                  value={s.event ? toClockInput(s.event.start) : ""}
                  onChange={(e) => setStop(s.id, { event: e.target.value ? { start: parseClock(e.target.value) } : undefined })}
                />
              </label>
            </div>
            {s.window && (
              <div className="muted small">
                Visit between {formatClock(s.window.start)} and {formatClock(s.window.end)}
              </div>
            )}
          </div>
        ))}
        <input placeholder="Add a place: try “Guggenheim” or “food”" value={query} onChange={(e) => setQuery(e.target.value)} />
        {results.length > 0 && (
          <div className="stack" style={{ gap: 4 }}>
            {results
              .filter((p) => !r.stops.some((s) => s.place.id === p.id))
              .slice(0, 6)
              .map((p) => (
                <button key={p.id} className="btn small" style={{ textAlign: "left" }} onClick={() => addPlace(p)}>
                  + {p.name} <span className="muted">· {p.categories.join(", ")}</span>
                </button>
              ))}
          </div>
        )}
      </div>

      <button className="btn primary" onClick={onPlan} disabled={loading || r.stops.length === 0}>
        {loading ? "Planning…" : "Plan my day"}
      </button>
    </aside>
  );
}
