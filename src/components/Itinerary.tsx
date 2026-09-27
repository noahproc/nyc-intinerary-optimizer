"use client";

import { ChevronDown, Coffee, ExternalLink, Plus, Sparkles, Ticket, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { googleMapsDirections } from "@/lib/deeplinks";
import { CHOICE_LABEL, MODE_META } from "@/lib/modes";
import { formatClock, formatDuration } from "@/lib/time";
import { END_ID, START_ID, type Leg, type ModeChoice, type Place, type Trip } from "@/lib/types";
import { ModeIcon } from "./icons";

interface Props {
  trip: Trip;
  surprises: string[];
  selectedStop: string | null;
  onSelectStop: (id: string) => void;
  onOverride: (leg: Leg, choice: ModeChoice) => void;
  onAddSuggestion: (leg: Leg, place: Place) => void;
  onHoverLeg: (i: number | null) => void;
  /** One label per trip day; omitted for single-day trips (no "move to day" menu). */
  dayLabels?: string[];
  day?: number;
  onMoveStop?: (stopId: string, toDay: number) => void;
}

const gmapsMode = (leg: Leg) =>
  leg.choice === "walk" ? "walking" : leg.choice === "citibike" ? "bicycling" : leg.choice === "uber" || leg.choice === "drive" ? "driving" : "transit";

const clockParts = (min: number) => {
  const [t, ampm] = formatClock(min).split(" ");
  return { t, ampm };
};

function LegCard({ trip, i, onOverride, onAddSuggestion }: { trip: Trip; i: number } & Pick<Props, "onOverride" | "onAddSuggestion">) {
  const leg = trip.legs[i];
  const [open, setOpen] = useState(false);
  const meta = MODE_META[leg.mode];
  const nextWait = trip.schedule[i + 1]?.waitMin ?? 0;
  const perVehicle = leg.mode === "uber" || leg.mode === "drive";
  return (
    <div className="leg-card">
      <div className="leg-head">
        <span className="mode-badge" style={{ background: meta.color }}>
          <ModeIcon mode={leg.mode} /> {meta.label}
        </span>
        <span className="small muted" style={{ fontWeight: 700 }}>
          {leg.costUsd > 0 ? `$${leg.costUsd.toFixed(2)}${perVehicle ? "" : " pp"}` : "Free"}
        </span>
        <select className="leg-select" aria-label="Change how you travel this leg" value={leg.choice} onChange={(e) => onOverride(leg, e.target.value as ModeChoice)}>
          {leg.availableChoices.map((c) => (
            <option key={c} value={c}>
              {CHOICE_LABEL[c]}
            </option>
          ))}
        </select>
      </div>
      <div className="segs">
        {leg.segments
          .filter((x) => x.durationMin > 0)
          .map((x, j) => (
            <span key={j} className={`seg${x.mode === "walk" ? " walk" : ""}`} style={x.mode === "walk" ? undefined : { background: MODE_META[x.mode].color }} title={x.label}>
              <ModeIcon mode={x.mode} /> {x.mode === "walk" ? "" : `${x.label ?? MODE_META[x.mode].label} · `}
              {x.durationMin}m
            </span>
          ))}
      </div>
      {leg.bike && (
        <div className="tiny muted">
          {leg.bike.bikesAvailable} bikes ({leg.bike.ebikesAvailable} e-bikes) at {leg.bike.pickupStation} · {leg.bike.docksAvailable} open docks at{" "}
          {leg.bike.dropoffStation}
          {leg.bike.live ? " · live" : " · sample data"}
        </div>
      )}
      {leg.notes.map((note) => (
        <div key={note} className="alert warn">
          <TriangleAlert size={14} /> {note}
        </div>
      ))}
      <div className="leg-foot">
        <a
          className="linkish"
          href={googleMapsDirections(trip.schedule[i].stop.place.location, trip.schedule[i + 1].stop.place.location, gmapsMode(leg))}
          target="_blank"
          rel="noreferrer"
        >
          Directions <ExternalLink size={12} />
        </a>
        {nextWait >= 10 && (
          <span className="free">
            <Coffee size={13} /> {formatDuration(nextWait)} free
          </span>
        )}
        {leg.suggestions.length > 0 && (
          <button className="linkish accent" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <Sparkles size={13} /> {leg.suggestions.length} along the way
            <ChevronDown size={13} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .2s" }} />
          </button>
        )}
      </div>
      {open &&
        leg.suggestions.map((sg) => (
          <div className="suggest" key={sg.place.id}>
            <div>
              <b>{sg.place.name}</b> <span className="muted">· {formatDuration(sg.place.suggestedDurationMin)}</span>
              <div className="muted tiny">{sg.reason}</div>
            </div>
            <button className="btn sm" onClick={() => onAddSuggestion(leg, sg.place)}>
              <Plus size={14} /> Add
            </button>
          </div>
        ))}
    </div>
  );
}

export default function Itinerary(props: Props) {
  const { trip, surprises, selectedStop, onSelectStop, onHoverLeg, dayLabels, day, onMoveStop } = props;
  let n = 0;
  return (
    <div>
      {trip.schedule.map((s, i) => {
        const isStart = s.stop.id === START_ID;
        const isEnd = s.stop.id === END_ID;
        const endpoint = isStart || isEnd;
        const leg = trip.legs[i];
        const { t, ampm } = clockParts(isStart ? s.depart : s.start);
        return (
          <div key={s.stop.id}>
            <div className={`tl-stop${selectedStop === s.stop.id ? " sel" : ""}`} onClick={() => onSelectStop(s.stop.id)}>
              <div className="tl-time">
                {t}
                <small>{ampm}</small>
              </div>
              <div className={`tl-dot${endpoint ? " end" : ""}`}>{endpoint ? (isStart ? "A" : "B") : ++n}</div>
              <div>
                <div className="tl-name">{s.stop.place.name}</div>
                <div className="row" style={{ gap: 6, marginTop: 4 }}>
                  {s.stop.priority === "must" && !endpoint && <span className="tag red">Must-see</span>}
                  {surprises.includes(s.stop.id) && (
                    <span className="tag amber">
                      <Sparkles size={11} /> Surprise stop
                    </span>
                  )}
                  {s.stop.event && (
                    <span className="tag">
                      <Ticket size={11} /> {formatClock(s.stop.event.start)}
                    </span>
                  )}
                  {dayLabels && onMoveStop && !endpoint && (
                    <select
                      className="move-day"
                      aria-label={`Move ${s.stop.place.name} to another day`}
                      value=""
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onMoveStop(s.stop.id, Number(e.target.value))}
                    >
                      <option value="" disabled>
                        Move to…
                      </option>
                      {dayLabels.map((label, d) =>
                        d === day ? null : (
                          <option key={d} value={d}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  )}
                </div>
                <div className="tl-sub" style={{ marginTop: 4 }}>
                  {isStart
                    ? s.depart > s.start
                      ? `Leave at ${formatClock(s.depart)} to arrive right at opening`
                      : "Start of your day"
                    : isEnd
                      ? `Back at ${formatClock(s.arrive)} · ${formatDuration(trip.totals.slackMin)} to spare`
                      : `${formatClock(s.start)} – ${formatClock(s.depart)} · ${formatDuration(s.depart - s.start)}`}
                </div>
              </div>
            </div>
            {leg && (
              <div className="tl-leg" onMouseEnter={() => onHoverLeg(i)} onMouseLeave={() => onHoverLeg(null)}>
                <div className="dur">{formatDuration(leg.durationMin)}</div>
                <div className="tl-rail">
                  <span style={{ background: MODE_META[leg.mode].color, opacity: leg.mode === "walk" ? 0.4 : 1 }} />
                </div>
                <LegCard trip={trip} i={i} onOverride={props.onOverride} onAddSuggestion={props.onAddSuggestion} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
