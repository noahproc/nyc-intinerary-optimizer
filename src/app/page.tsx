"use client";

import { ArrowRight, Clock, CreditCard, Map, PencilRuler, Route, Sparkles, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ModeIcon } from "@/components/icons";
import { useTrip } from "@/components/TripProvider";
import { MODE_META } from "@/lib/modes";
import type { SegmentMode } from "@/lib/types";

const SYSTEMS: SegmentMode[] = ["subway", "bus", "path", "lirr", "metro-north", "citibike", "uber", "walk"];

const SAMPLE: { time: string; name: string; mode: SegmentMode; note: string }[] = [
  { time: "10:00", name: "The Met", mode: "subway", note: "Subway · 24 min" },
  { time: "2:06", name: "9/11 Memorial", mode: "subway", note: "Subway · 37 min" },
  { time: "3:37", name: "Exchange Place, JC", mode: "path", note: "PATH · 16 min" },
  { time: "5:00", name: "Dinner in Jersey City", mode: "walk", note: "Walk · 16 min" },
  { time: "8:30", name: "Top of the Rock", mode: "uber", note: "Uber · 51 min" },
];

function HeroLines() {
  // Stylized subway lines sweeping behind the headline.
  return (
    <svg className="hero-lines" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <g fill="none" strokeLinecap="round">
        <path d="M-40 520 C 240 520, 320 300, 560 300 S 900 120, 1260 120" stroke="#3d010e" strokeWidth="26" />
        <path d="M-40 560 C 260 560, 360 360, 600 360 S 940 200, 1260 200" stroke="#79021c" strokeWidth="14" />
        <path d="M-40 600 C 300 600, 420 420, 660 420 S 980 300, 1260 300" stroke="#b6042a" strokeWidth="6" />
        <path d="M700 -40 C 700 160, 820 260, 1260 260" stroke="#3d010e" strokeWidth="10" />
      </g>
      <g fill="#000" stroke="#f50538" strokeWidth="4">
        <circle cx="560" cy="300" r="9" />
        <circle cx="600" cy="360" r="7" />
        <circle cx="900" cy="164" r="7" />
      </g>
    </svg>
  );
}

export default function Home() {
  const { trip, recommendation, hydrated, loadSample, loading } = useTrip();
  const router = useRouter();

  const openSample = async () => {
    if (await loadSample()) router.push("/trip");
  };

  return (
    <main>
      <section className="hero">
        <HeroLines />
        <div className="hero-inner">
          <div>
            <div className="eyebrow">NYC trip planner for visitors</div>
            <h1 className="display">
              See New York.
              <br />
              <span className="red">Skip the</span> transit maze.
            </h1>
            <p className="lede">
              NYSee turns your wishlist into a door-to-door day across the subway, PATH, LIRR, Metro-North, Citi Bike and Uber,
              timed to opening hours, with one fare breakdown for the whole day.
            </p>
            <div className="row">
              <Link href="/ai" className="btn primary lg">
                <Sparkles size={18} /> Plan my day with AI
              </Link>
              <Link href="/plan" className="btn lg">
                <PencilRuler size={18} /> Build it myself
              </Link>
            </div>
            <div className="row small muted" style={{ marginTop: 16 }}>
              or
              <button className="linkish" style={{ fontSize: 14 }} onClick={openSample} disabled={loading}>
                open the sample family day <ArrowRight size={14} />
              </button>
            </div>
          </div>
          <div className="hero-art" aria-hidden>
            <div className="ticket">
              <div className="row" style={{ marginBottom: 10 }}>
                <span className="eyebrow">Saturday · 4 travelers</span>
                <span className="grow" />
                <span className="tag solid">$104.60 total</span>
              </div>
              {SAMPLE.map((s, i) => (
                <div className="ticket-row" key={s.name}>
                  <b style={{ fontVariantNumeric: "tabular-nums" }}>{s.time}</b>
                  <span className="bullet" style={{ background: i === SAMPLE.length - 1 ? "#000" : "var(--red)", border: i === SAMPLE.length - 1 ? "2px solid var(--red)" : 0 }}>
                    {i + 1}
                  </span>
                  <div>
                    <div style={{ fontWeight: 800 }}>{s.name}</div>
                    <div className="tiny row" style={{ gap: 6, color: MODE_META[s.mode].color }}>
                      <ModeIcon mode={s.mode} size={13} /> {s.note}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {hydrated && trip && (
        <section className="section" style={{ paddingTop: 32 }}>
          <Link href="/trip" className="card row" style={{ borderColor: "var(--red-3)" }}>
            <Route className="red" size={22} />
            <div className="grow">
              <div className="eyebrow">Pick up where you left off</div>
              <b style={{ fontSize: 18 }}>{recommendation?.title ?? "Your NYC day"}</b>
              <span className="muted"> · {trip.schedule.length - 2} stops · {trip.request.date}</span>
            </div>
            <ArrowRight />
          </Link>
        </section>
      )}

      <section className="section">
        <div className="eyebrow">Eight ways to move, one plan</div>
        <h2 className="display">Every system. One day.</h2>
        <div className="transit-strip">
          {SYSTEMS.map((m) => (
            <span className="transit-chip" key={m}>
              <span className="dot" style={{ background: MODE_META[m].color }}>
                <ModeIcon mode={m} size={15} />
              </span>
              {MODE_META[m].label}
            </span>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="eyebrow">Explore NYSee</div>
        <h2 className="display">Where to start</h2>
        <div className="feature-grid">
          <Link href="/ai" className="feature big">
            <span className="ico">
              <Sparkles size={22} />
            </span>
            <h3>AI trip planner</h3>
            <p>Answer six quick questions. NYSee picks the places, explains why, and builds the whole day.</p>
            <span className="go">
              Take the quiz <ArrowRight size={16} />
            </span>
          </Link>
          <Link href="/plan" className="feature">
            <span className="ico">
              <PencilRuler size={22} />
            </span>
            <h3>Trip builder</h3>
            <p>Already know your must-sees? Add them, set timed tickets, and let the optimizer order them.</p>
            <span className="go">
              Build a day <ArrowRight size={16} />
            </span>
          </Link>
          <Link href="/trip" className="feature">
            <span className="ico">
              <Map size={22} />
            </span>
            <h3>Live route map</h3>
            <p>Your day on a full-screen map. Swap any leg to Uber or Citi Bike and add stops along the way.</p>
            <span className="go">
              Open my day <ArrowRight size={16} />
            </span>
          </Link>
          <Link href="/fares" className="feature">
            <span className="ico">
              <Wallet size={22} />
            </span>
            <h3>Fare bundle</h3>
            <p>Every fare for the day in one place: what one tap covers, what needs its own app, with links.</p>
            <span className="go">
              See fares <ArrowRight size={16} />
            </span>
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="eyebrow">How it works</div>
        <h2 className="display">Three steps to the city</h2>
        <div className="steps">
          <div className="card stack">
            <span className="step-num">01</span>
            <b style={{ fontSize: 18 }}>Tell us what you love</b>
            <span className="muted">Food, art, skyline views, kids in tow. Take the AI quiz or pick places yourself.</span>
          </div>
          <div className="card stack">
            <span className="step-num">02</span>
            <b style={{ fontSize: 18 }}>We route every leg</b>
            <span className="muted">Stops are ordered around opening hours and timed tickets, then routed across every transit system.</span>
          </div>
          <div className="card stack">
            <span className="step-num">03</span>
            <b style={{ fontSize: 18 }}>Tap and go</b>
            <span className="muted">See which legs share one contactless tap, which need an app, and jump straight to Uber.</span>
          </div>
        </div>
        <div className="row small muted" style={{ marginTop: 20, gap: 20 }}>
          <span className="row" style={{ gap: 6 }}>
            <Clock size={16} className="red" /> All times in New York time, with a jet-lag note
          </span>
          <span className="row" style={{ gap: 6 }}>
            <CreditCard size={16} className="red" /> No tickets sold here: we hand off to each operator
          </span>
        </div>
      </section>

      <footer className="footer">
        <span>
          <b style={{ color: "var(--text)" }}>NYSee</b> · built for visitors who&apos;d rather see the city than the transit map.
        </span>
        <span>Fares are estimates. Map © OpenStreetMap, CARTO.</span>
      </footer>
    </main>
  );
}
