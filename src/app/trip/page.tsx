"use client";

import { Clock, Loader2, Map as MapIcon, Pencil, PencilRuler, RotateCcw, Sparkles, TriangleAlert, Wallet } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import Itinerary from "@/components/Itinerary";
import { ModeIcon } from "@/components/icons";
import { useTrip } from "@/components/TripProvider";
import { MODE_META } from "@/lib/modes";
import { formatDuration, weekday } from "@/lib/time";
import type { SegmentMode } from "@/lib/types";

const TripMap = dynamic(() => import("@/components/TripMap"), {
  ssr: false,
  loading: () => <div style={{ width: "100%", height: "100%", background: "#0b0b0c" }} />,
});

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const prettyDate = (d: string, short = false) => {
  const [, m, day] = d.split("-").map(Number);
  const name = DAYS[weekday(d)];
  return `${short ? name.slice(0, 3) : name}, ${MONTHS[m - 1]} ${day}`;
};

export default function TripPage() {
  const t = useTrip();
  const [hoverLeg, setHoverLeg] = useState<number | null>(null);
  const [selectedStop, setSelectedStop] = useState<string | null>(null);
  const [dayPick, setDayPick] = useState(0);
  const { plan } = t;

  if (!t.hydrated) return null;

  if (!plan) {
    return (
      <main className="empty">
        <MapIcon size={40} className="red" />
        <h1 className="display">No trip planned yet</h1>
        <p className="muted">Let NYSee pick the places, build your own list, or open a sample family day to look around.</p>
        <div className="row" style={{ justifyContent: "center", marginTop: 20 }}>
          <Link href="/ai" className="btn primary">
            <Sparkles size={16} /> Plan with AI
          </Link>
          <Link href="/plan" className="btn">
            <PencilRuler size={16} /> Build it myself
          </Link>
          <button className="btn ghost" onClick={() => t.loadSample()} disabled={t.loading}>
            {t.loading ? <Loader2 size={16} className="spin" /> : null} Sample day
          </button>
        </div>
      </main>
    );
  }

  const multi = plan.days.length > 1;
  const day = Math.min(dayPick, plan.days.length - 1);
  const trip = plan.days[day];
  const freeDay = trip.schedule.length === 2;
  const showDay = (d: number) => {
    setDayPick(d);
    setSelectedStop(null);
    setHoverLeg(null);
  };
  const moveStop = (stopId: string, to: number) => {
    t.moveStop(stopId, to);
    showDay(to);
  };
  const modes = [...new Set(trip.legs.flatMap((l) => l.segments.map((s) => s.mode)))] as SegmentMode[];

  return (
    <main className="trip">
      <div className="trip-map">
        <TripMap trip={freeDay ? null : trip} highlightLeg={hoverLeg} selectedStop={selectedStop} onSelectStop={setSelectedStop} />
      </div>

      <div className="trip-stats">
        <div className="stat">
          <div className="k">Sightseeing</div>
          <div className="v">{formatDuration(trip.totals.visitMin)}</div>
        </div>
        <div className="stat">
          <div className="k">Travel</div>
          <div className="v">{formatDuration(trip.totals.travelMin)}</div>
        </div>
        <div className="stat">
          <div className="k">Free time</div>
          <div className="v">{formatDuration(trip.totals.waitMin)}</div>
        </div>
        <Link href="/fares" className="stat money">
          <div className="k">
            <Wallet size={12} /> {multi ? "Trip fares" : "Fares"}
          </div>
          <div className="v">${plan.cost.totalUsd.toFixed(2)}</div>
        </Link>
      </div>

      <div className="legend" aria-label="Map legend">
        {modes.map((m) => (
          <div key={m} className="row" style={{ gap: 0 }}>
            <span className="sw" style={{ background: MODE_META[m].color, opacity: m === "walk" ? 0.6 : 1 }} />
            <ModeIcon mode={m} size={13} />
            <span style={{ marginLeft: 6 }}>{MODE_META[m].label}</span>
          </div>
        ))}
        <div className="row" style={{ gap: 0 }}>
          <span className="sw" style={{ background: "#ffb547", width: 10, height: 10, borderRadius: "50%", marginLeft: 6, marginRight: 14 }} />
          Along the way
        </div>
      </div>

      <aside className="trip-panel" style={{ opacity: t.loading ? 0.75 : 1 }}>
        <div className="trip-panel-head">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="eyebrow">
              {multi ? `Day ${day + 1} of ${plan.days.length} · ` : ""}
              {prettyDate(trip.request.date)}
            </span>
            <span className="row" style={{ gap: 6 }}>
              {t.loading && <Loader2 size={16} className="spin red" />}
              {(t.request.fixedDays || t.request.fixedOrder) && (
                <button className="btn sm" onClick={() => t.planFresh()} disabled={t.loading} title="Let NYSee reorder the stops">
                  <RotateCcw size={14} /> Re-optimize
                </button>
              )}
              <Link href="/plan" className="btn sm ghost" aria-label="Edit stops">
                <Pencil size={14} /> Edit
              </Link>
            </span>
          </div>
          <h1 className="display">{t.recommendation?.title ?? (multi ? "Your NYC trip" : "Your NYC day")}</h1>
          <div className="small muted">
            {trip.schedule.length - 2} stops · {trip.request.travelers ?? 1} traveler{(trip.request.travelers ?? 1) > 1 ? "s" : ""} ·{" "}
            {formatDuration(trip.totals.slackMin)} to spare
          </div>
          {multi && (
            <div className="day-tabs" role="tablist" aria-label="Trip days">
              {plan.days.map((d, i) => (
                <button key={d.request.date} role="tab" aria-selected={i === day} className={`chip${i === day ? " on" : ""}`} onClick={() => showDay(i)}>
                  Day {i + 1} · {prettyDate(d.request.date, true)}
                  <span style={{ opacity: 0.7 }}>· {d.schedule.length - 2}</span>
                </button>
              ))}
            </div>
          )}
          {trip.timeNote && (
            <div className="alert info" style={{ marginTop: 10 }}>
              <Clock size={14} /> {trip.timeNote}
            </div>
          )}
        </div>
        <div className="trip-panel-body">
          {t.error && (
            <div className="alert warn" style={{ marginBottom: 10 }}>
              <TriangleAlert size={14} /> {t.error}
            </div>
          )}
          {[...new Set([...plan.warnings, ...trip.warnings])].map((w) => (
            <div key={w} className="alert warn" style={{ marginBottom: 8 }}>
              <TriangleAlert size={14} /> {w}
            </div>
          ))}
          {trip.unscheduled.map((u) => (
            <div key={u.stop.id} className="alert warn" style={{ marginBottom: 8 }}>
              <TriangleAlert size={14} />
              <span>
                <b>Didn&apos;t fit: {u.stop.place.name}.</b> {u.reason}
              </span>
            </div>
          ))}
          {freeDay ? (
            <div className="muted small" style={{ padding: "12px 4px" }}>
              Nothing planned: a free day. Move a stop here from another day, or add more places in the builder.
            </div>
          ) : (
            <Itinerary
              trip={trip}
              surprises={t.surprises}
              selectedStop={selectedStop}
              onSelectStop={setSelectedStop}
              onOverride={t.override}
              onAddSuggestion={(leg, place) => t.addSuggestion(day, leg, place)}
              onHoverLeg={setHoverLeg}
              dayLabels={multi ? plan.days.map((d, i) => `Day ${i + 1} · ${prettyDate(d.request.date, true)}`) : undefined}
              day={day}
              onMoveStop={moveStop}
            />
          )}
          <div className="tiny faint" style={{ marginTop: 12 }}>
            Routing: {trip.providers.routing} · Places: {trip.providers.places} · Bikes: {trip.providers.bikes}
          </div>
        </div>
      </aside>
    </main>
  );
}
