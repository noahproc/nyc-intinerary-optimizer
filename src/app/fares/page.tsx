"use client";

import { ArrowRight, CreditCard, ExternalLink, Info, Map as MapIcon, Sparkles, Wallet } from "lucide-react";
import Link from "next/link";
import { PAYMENT_ICON } from "@/components/icons";
import { useTrip } from "@/components/TripProvider";
import { PAYMENT_META } from "@/lib/modes";
import { formatClock } from "@/lib/time";
import type { PaymentChannel } from "@/lib/types";

const usd = (n: number) => `$${n.toFixed(2)}`;

export default function FaresPage() {
  const { trip, hydrated } = useTrip();
  if (!hydrated) return null;

  if (!trip) {
    return (
      <main className="empty">
        <Wallet size={40} className="red" />
        <h1 className="display">No fares yet</h1>
        <p className="muted">Plan a day first and NYSee will add up every fare, and show which ones one tap covers.</p>
        <div className="row" style={{ justifyContent: "center", marginTop: 20 }}>
          <Link href="/ai" className="btn primary">
            <Sparkles size={16} /> Plan with AI
          </Link>
          <Link href="/plan" className="btn">
            Build it myself
          </Link>
        </div>
      </main>
    );
  }

  const { cost } = trip;
  const travelers = trip.request.travelers ?? 1;
  const tapLines = cost.lines.filter((l) => l.payment === "omny" || l.payment === "tapp");
  const tapTotal = tapLines.reduce((t, l) => t + l.totalUsd, 0);
  const names = Object.fromEntries(trip.schedule.map((s) => [s.stop.id, s.stop.place.name]));
  const departs = Object.fromEntries(trip.schedule.map((s) => [s.stop.id, s.depart]));

  // Every paid leg in time order: "your taps today".
  const taps = trip.legs.flatMap((leg) => {
    const channels = [...new Set(leg.segments.map((s) => s.payment).filter((p) => p !== "free"))] as PaymentChannel[];
    return channels.map((payment) => ({
      key: `${leg.fromStopId}>${leg.toStopId}>${payment}`,
      at: departs[leg.fromStopId],
      label: `${names[leg.fromStopId]} → ${names[leg.toStopId]}`,
      payment,
      cost: cost.lines.find((l) => l.payment === payment)?.legs.find((x) => x.fromStopId === leg.fromStopId && x.toStopId === leg.toStopId)?.costUsd ?? 0,
    }));
  });

  return (
    <main className="page stack" style={{ gap: 28 }}>
      <div>
        <div className="eyebrow">Fare bundle</div>
        <h1 className="display" style={{ fontSize: "clamp(44px, 7vw, 76px)", margin: "8px 0 0" }}>
          One day. Every fare.
        </h1>
      </div>

      <div className="fares-hero">
        <div className="total-card stack" style={{ gap: 6 }}>
          <span className="eyebrow" style={{ color: "#ffd0da" }}>
            Estimated total
          </span>
          <span className="big">{usd(cost.totalUsd)}</span>
          <span style={{ color: "#ffd0da" }}>
            for {travelers} traveler{travelers > 1 ? "s" : ""} · {taps.length} payments
          </span>
        </div>
        <div className="card stack">
          <div className="row">
            <span className="pay-card">
              <span className="ico" style={{ background: "var(--red-4)", color: "var(--red)", width: 44, height: 44, borderRadius: 12, display: "grid", placeItems: "center" }}>
                <CreditCard size={22} />
              </span>
            </span>
            <div className="grow">
              <b style={{ fontSize: 18 }}>One card covers {usd(tapTotal)}</b>
              <div className="muted small">Subway, bus and PATH all take the same contactless card or phone.</div>
            </div>
          </div>
          <div className="muted small">
            PATH bills separately from the MTA, so there&apos;s no free transfer between them.
            {cost.lines.some((l) => l.payment === "mta-rail") && " LIRR and Metro-North need a TrainTime ticket bought before you board."}
            {cost.lines.some((l) => l.payment === "uber") && " Uber rides are booked in the Uber app; links below open with pickup and drop-off already filled in."}
          </div>
          <Link href="/trip" className="linkish" style={{ fontSize: 14 }}>
            <MapIcon size={14} /> Back to the map <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      <section className="stack">
        <h2 className="display" style={{ fontSize: 34, margin: 0 }}>
          How you&apos;ll pay
        </h2>
        <div className="pay-grid">
          {cost.lines.map((line) => {
            const meta = PAYMENT_META[line.payment];
            const Icon = PAYMENT_ICON[line.payment];
            return (
              <div className="card pay-card" key={line.payment}>
                <div className="head">
                  <span className="ico" style={{ background: meta.color, color: "#000" }}>
                    <Icon size={20} />
                  </span>
                  <b style={{ fontSize: 16 }}>{line.title}</b>
                  <span className="amt">{usd(line.totalUsd)}</span>
                </div>
                <div className="muted small">{line.howToPay}</div>
                <ul>
                  {line.legs.map((l) => (
                    <li key={`${l.fromStopId}>${l.toStopId}`}>
                      <span>{l.label}</span>
                      <b style={{ color: "var(--text)" }}>{usd(l.costUsd)}</b>
                    </li>
                  ))}
                </ul>
                {line.deepLinks.length > 0 && (
                  <div className="links">
                    {line.deepLinks.map((d) => (
                      <a key={d.url} href={d.url} target="_blank" rel="noreferrer" className={`btn sm${line.payment === "uber" ? " primary" : ""}`}>
                        {d.label} <ExternalLink size={13} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="stack">
        <h2 className="display" style={{ fontSize: 34, margin: 0 }}>
          Your payments, in order
        </h2>
        <div className="taps">
          {taps.map((tap) => {
            const meta = PAYMENT_META[tap.payment];
            return (
              <div className="tap" key={tap.key}>
                <b style={{ fontVariantNumeric: "tabular-nums" }}>{formatClock(tap.at)}</b>
                <span>{tap.label}</span>
                <span className="pay-pill" style={{ background: meta.color, color: "#000" }}>
                  {meta.short}
                </span>
                <b>{usd(tap.cost)}</b>
              </div>
            );
          })}
        </div>
      </section>

      <div className="stack small muted">
        {cost.notes.map((n) => (
          <div key={n} className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
            <Info size={14} style={{ flex: "none", marginTop: 3 }} /> {n}
          </div>
        ))}
      </div>
    </main>
  );
}
