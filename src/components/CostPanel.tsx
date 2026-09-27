"use client";

import type { Trip } from "@/lib/types";

const usd = (n: number) => `$${n.toFixed(2)}`;

export default function CostPanel({ trip }: { trip: Trip }) {
  const { cost } = trip;
  const travelers = trip.request.travelers ?? 1;
  const oneTap = cost.lines.filter((l) => l.payment === "omny" || l.payment === "tapp");
  return (
    <section className="panel stack" aria-label="Trip cost">
      <div className="row">
        <div className="grow">
          <h2>Your day&apos;s travel bundle</h2>
          <div className="cost-total">{usd(cost.totalUsd)}</div>
          <div className="muted small">
            estimated for {travelers} traveler{travelers > 1 ? "s" : ""}
          </div>
        </div>
      </div>
      {oneTap.length > 0 && (
        <div className="note">
          <b>One card does most of it:</b> the same contactless card or phone pays{" "}
          {oneTap.map((l) => l.title.split(" — ")[0]).join(" and ")}
          {oneTap.length > 1 ? " (billed as separate systems)" : ""}.
          {cost.lines.some((l) => l.payment === "mta-rail") && " LIRR/Metro-North need a separate TrainTime ticket."}
        </div>
      )}
      {cost.lines.map((line) => (
        <div className="cost-line" key={line.payment}>
          <div className="head">
            <span>{line.title}</span>
            <span>{usd(line.totalUsd)}</span>
          </div>
          <div className="muted small">{line.howToPay}</div>
          <ul>
            {line.legs.map((l) => (
              <li key={`${l.fromStopId}>${l.toStopId}`}>
                {l.label}: {usd(l.costUsd)}
              </li>
            ))}
          </ul>
          {line.deepLinks.length > 0 && (
            <div className="links">
              {line.deepLinks.map((d) => (
                <a key={d.url} href={d.url} target="_blank" rel="noreferrer">
                  {d.label} ↗
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
      {cost.notes.map((n) => (
        <div key={n} className="muted small">
          {n}
        </div>
      ))}
    </section>
  );
}
