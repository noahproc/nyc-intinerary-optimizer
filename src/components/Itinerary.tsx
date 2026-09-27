"use client";

import { googleMapsDirections } from "@/lib/deeplinks";
import { CHOICE_LABEL, MODE_META } from "@/lib/modes";
import { formatClock, formatDuration } from "@/lib/time";
import { END_ID, START_ID, type Leg, type ModeChoice, type Place, type Trip } from "@/lib/types";

interface Props {
  trip: Trip;
  surprises: Set<string>;
  onOverride: (leg: Leg, choice: ModeChoice) => void;
  onAddSuggestion: (leg: Leg, place: Place) => void;
  onHoverLeg: (i: number | null) => void;
}

const gmapsMode = (leg: Leg) =>
  leg.choice === "walk" ? "walking" : leg.choice === "citibike" ? "bicycling" : leg.choice === "uber" || leg.choice === "drive" ? "driving" : "transit";

export default function Itinerary({ trip, surprises, onOverride, onAddSuggestion, onHoverLeg }: Props) {
  let n = 0;
  return (
    <div className="timeline">
      {trip.schedule.map((s, i) => {
        const endpoint = s.stop.id === START_ID || s.stop.id === END_ID;
        const leg = trip.legs[i];
        const nextWait = trip.schedule[i + 1]?.waitMin ?? 0;
        const isStart = s.stop.id === START_ID;
        return (
          <div key={s.stop.id}>
            <div className="stop">
              <div className="time">{formatClock(isStart ? s.depart : s.start)}</div>
              <div className={`dot${endpoint ? " endpoint" : ""}`}>{endpoint ? (isStart ? "▶" : "■") : ++n}</div>
              <div className="body">
                <div className="row">
                  <b>{s.stop.place.name}</b>
                  {s.stop.priority === "must" && !endpoint && <span className="pill must">must-see</span>}
                  {surprises.has(s.stop.id) && <span className="pill spark">✨ surprise stop</span>}
                  {s.stop.event && <span className="pill">🎟 timed {formatClock(s.stop.event.start)}</span>}
                </div>
                <div className="muted small">
                  {isStart
                    ? s.depart > s.start
                      ? `Leave at ${formatClock(s.depart)} so you arrive right at opening.`
                      : "Start of your day"
                    : s.stop.id === END_ID
                      ? `Done for the day · ${formatDuration(trip.totals.slackMin)} to spare`
                      : `${formatClock(s.start)} – ${formatClock(s.depart)} · ${formatDuration(s.depart - s.start)}`}
                </div>
                {s.stop.place.blurb && !endpoint && <div className="muted small">{s.stop.place.blurb}</div>}
              </div>
            </div>
            {leg && (
              <div className="leg" onMouseEnter={() => onHoverLeg(i)} onMouseLeave={() => onHoverLeg(null)}>
                <div className="muted small" style={{ textAlign: "right", paddingTop: 12 }}>
                  {formatDuration(leg.durationMin)}
                </div>
                <div className="rail">
                  <span style={{ background: MODE_META[leg.mode].color }} />
                </div>
                <div className="card">
                  <div className="row">
                    <b>
                      {MODE_META[leg.mode].icon} {MODE_META[leg.mode].label}
                    </b>
                    <span className="muted small">
                      {leg.costUsd > 0 ? `$${leg.costUsd.toFixed(2)}${leg.mode === "uber" || leg.mode === "drive" ? "" : " pp"}` : "free"}
                    </span>
                    <span className="grow" />
                    <select
                      aria-label="Change mode for this leg"
                      value={leg.choice}
                      onChange={(e) => onOverride(leg, e.target.value as ModeChoice)}
                    >
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
                        <span
                          key={j}
                          className={`seg ${x.mode === "walk" ? "walk" : ""}`}
                          style={x.mode === "walk" ? undefined : { background: MODE_META[x.mode].color }}
                          title={x.label}
                        >
                          {MODE_META[x.mode].icon} {x.mode === "walk" ? "" : `${x.label ?? MODE_META[x.mode].label} `}
                          {x.durationMin}m
                        </span>
                      ))}
                  </div>
                  {leg.bike && (
                    <div className="small muted">
                      🚲 {leg.bike.bikesAvailable} bikes ({leg.bike.ebikesAvailable} e-bikes) at {leg.bike.pickupStation} ·{" "}
                      {leg.bike.docksAvailable} docks at {leg.bike.dropoffStation}
                      {leg.bike.live ? " · live" : " · sample data"}
                    </div>
                  )}
                  {leg.notes.map((note) => (
                    <div key={note} className="small warn">
                      {note}
                    </div>
                  ))}
                  <div className="row small">
                    <a
                      href={googleMapsDirections(
                        trip.schedule[i].stop.place.location,
                        trip.schedule[i + 1].stop.place.location,
                        gmapsMode(leg),
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Directions ↗
                    </a>
                    {nextWait >= 10 && (
                      <span className="free">☕ {formatDuration(nextWait)} free before the next stop</span>
                    )}
                  </div>
                  {leg.suggestions.map((sg) => (
                    <div className="suggest" key={sg.place.id}>
                      <span>✨</span>
                      <div className="grow">
                        <b>{sg.place.name}</b> · {formatDuration(sg.place.suggestedDurationMin)}
                        <div className="muted">
                          {sg.reason} {sg.matchedInterests.length > 0 && `Matches: ${sg.matchedInterests.join(", ")}.`}
                        </div>
                      </div>
                      <button className="btn small" onClick={() => onAddSuggestion(leg, sg.place)}>
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
