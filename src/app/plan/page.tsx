"use client";

import { ArrowRight, Loader2, MapPin, Plus, Search, Sparkles, Ticket, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { INTEREST_ICON } from "@/components/icons";
import { useTrip } from "@/components/TripProvider";
import { HOTEL, PLACES } from "@/lib/fixtures/places";
import { addDays, formatClock, parseClock, toClockInput, weekday } from "@/lib/time";
import { MAX_DAYS, type Interest, type Place, type Stop, type TripRequest } from "@/lib/types";

const INTERESTS: Interest[] = ["food", "art", "views", "history", "parks", "shopping", "kids"];
const ENDPOINTS = [HOTEL, ...PLACES];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TIMEZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"];

export default function PlanPage() {
  const router = useRouter();
  const t = useTrip();
  const r = t.request;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);

  useEffect(() => {
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/places?q=${encodeURIComponent(query)}`, { signal: ctl.signal })
        .then((res) => res.json())
        .then((j) => setResults(j.results ?? []))
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [query]);

  if (!t.hydrated) return null;

  const set = (patch: Partial<TripRequest>) => t.setRequest({ ...r, ...patch });
  const setStop = (id: string, patch: Partial<Stop>) => set({ stops: r.stops.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const addPlace = (place: Place) => {
    if (r.stops.some((s) => s.place.id === place.id)) return;
    set({ stops: [...r.stops, { id: place.id, place, durationMin: place.suggestedDurationMin, priority: "must" }] });
  };
  const endpoint = (id: string) => ENDPOINTS.find((p) => p.id === id) ?? HOTEL;
  const days = r.days ?? 1;
  const suggestions = results.filter((p) => !r.stops.some((s) => s.place.id === p.id)).slice(0, query ? 8 : 6);

  async function go() {
    const plan = await t.planTrip({ ...r, fixedOrder: undefined, fixedDays: undefined });
    if (plan) router.push("/trip");
  }

  return (
    <main className="page">
      <div className="row" style={{ alignItems: "flex-end", marginBottom: 24 }}>
        <div className="grow">
          <div className="eyebrow">Trip builder</div>
          <h1 className="display" style={{ fontSize: "clamp(44px, 7vw, 72px)", margin: "8px 0 0" }}>
            Build your trip
          </h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Add the places you want to see. NYSee splits them across your days, orders them around opening hours and routes every leg.
          </p>
        </div>
        <Link href="/ai" className="btn">
          <Sparkles size={16} /> Let AI pick instead
        </Link>
      </div>

      <div className="builder">
        <section className="card stack" aria-label="Trip settings">
          <div className="eyebrow">The basics</div>
          <div className="two">
            <label className="field">
              {days > 1 ? "First day" : "Date"}
              <input type="date" value={r.date} onChange={(e) => set({ date: e.target.value })} />
            </label>
            <label className="field">
              Days
              <input
                type="number"
                min={1}
                max={MAX_DAYS}
                value={days}
                onChange={(e) => set({ days: Math.min(MAX_DAYS, Math.max(1, Math.floor(Number(e.target.value) || 1))) })}
              />
            </label>
          </div>
          <label className="field">
            Travelers
            <input type="number" min={1} max={12} value={r.travelers ?? 1} onChange={(e) => set({ travelers: Math.max(1, Number(e.target.value)) })} />
          </label>
          <div className="two">
            <label className="field">
              {days > 1 ? "Start each day" : "Start"}
              <input type="time" value={toClockInput(r.dayStart)} onChange={(e) => set({ dayStart: parseClock(e.target.value) })} />
            </label>
            <label className="field">
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
            Home timezone
            <select value={r.homeTimeZone ?? "America/New_York"} onChange={(e) => set({ homeTimeZone: e.target.value })}>
              {[...new Set([r.homeTimeZone, ...TIMEZONES].filter(Boolean) as string[])].map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <div className="stack" style={{ gap: 8 }}>
            <span className="field">Interests (for stops along the way)</span>
            <div className="row" style={{ gap: 6 }}>
              {INTERESTS.map((i) => {
                const on = r.interests.includes(i);
                const Icon = INTEREST_ICON[i];
                return (
                  <button key={i} className={`chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => set({ interests: on ? r.interests.filter((x) => x !== i) : [...r.interests, i] })}>
                    <Icon size={14} /> {i}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="stack">
          <div className="card stack">
            <div className="row">
              <div className="eyebrow grow">Your wishlist · {r.stops.length}</div>
            </div>
            {r.stops.length === 0 && <div className="muted small">Nothing yet. Search below or tap a suggestion.</div>}
            {r.stops.map((s) => {
              const Icon = s.place.categories[0] ? INTEREST_ICON[s.place.categories[0]] : MapPin;
              return (
                <div className="wish" key={s.id}>
                  <span className="ico">
                    <Icon size={18} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <b>{s.place.name}</b>
                    <div className="wish-controls">
                      {days > 1 && (
                        <select
                          aria-label="Day"
                          value={s.day !== undefined && s.day < days ? s.day : ""}
                          onChange={(e) => setStop(s.id, { day: e.target.value === "" ? undefined : Number(e.target.value) })}
                        >
                          <option value="">Any day</option>
                          {Array.from({ length: days }, (_, d) => (
                            <option key={d} value={d}>
                              Day {d + 1} · {WEEKDAYS[weekday(addDays(r.date, d))]}
                            </option>
                          ))}
                        </select>
                      )}
                      <select aria-label="Priority" value={s.priority} onChange={(e) => setStop(s.id, { priority: e.target.value as Stop["priority"] })}>
                        <option value="must">Must-see</option>
                        <option value="nice">Nice to have</option>
                      </select>
                      <input type="number" min={5} step={5} aria-label="Minutes to spend" value={s.durationMin} onChange={(e) => setStop(s.id, { durationMin: Number(e.target.value) })} />
                      <span className="muted tiny">min</span>
                      <label className="row tiny muted" style={{ gap: 4 }} title="Timed ticket or event start">
                        <Ticket size={14} />
                        <input
                          type="time"
                          aria-label="Timed ticket"
                          value={s.event ? toClockInput(s.event.start) : ""}
                          onChange={(e) => setStop(s.id, { event: e.target.value ? { start: parseClock(e.target.value) } : undefined })}
                        />
                      </label>
                    </div>
                    {s.window && (
                      <div className="tiny muted" style={{ marginTop: 4 }}>
                        Visit between {formatClock(s.window.start)} and {formatClock(s.window.end)}
                      </div>
                    )}
                  </div>
                  <button className="btn icon ghost" aria-label={`Remove ${s.place.name}`} onClick={() => set({ stops: r.stops.filter((x) => x.id !== s.id) })}>
                    <X size={16} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="card stack">
            <label className="row" style={{ gap: 8, background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 10, padding: "4px 12px" }}>
              <Search size={16} className="muted" />
              <input
                className="grow"
                style={{ background: "transparent", border: 0, padding: "8px 0", outline: "none" }}
                placeholder="Search places: “Guggenheim”, “pizza”, “views”…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="eyebrow">{query ? "Results" : "Popular picks"}</div>
            <div className="results">
              {suggestions.map((p) => (
                <button key={p.id} className="result-btn" onClick={() => addPlace(p)}>
                  <Plus size={16} className="red" />
                  <span className="grow">
                    <b>{p.name}</b> <span className="muted small">· {p.categories.join(", ")}</span>
                  </span>
                </button>
              ))}
              {query && suggestions.length === 0 && <div className="muted small">No matches in the catalog.</div>}
            </div>
          </div>

          {t.error && (
            <div className="alert warn">
              <TriangleAlert size={14} /> {t.error}
            </div>
          )}
          <button className="btn primary lg" onClick={go} disabled={t.loading || r.stops.length === 0}>
            {t.loading ? <Loader2 size={18} className="spin" /> : null}
            {t.loading ? "Planning…" : days > 1 ? `Plan my ${days} days` : "Plan my day"} {!t.loading && <ArrowRight size={18} />}
          </button>
        </section>
      </div>
    </main>
  );
}
