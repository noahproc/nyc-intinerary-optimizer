"use client";

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CarTaxiFront,
  Coffee,
  Gauge,
  Heart,
  Info,
  Minus,
  Mountain,
  Plus,
  RotateCcw,
  Shuffle,
  Sparkles,
  TrainFront,
  TrainFrontTunnel,
  User,
  Users,
  Baby,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { INTEREST_ICON } from "@/components/icons";
import { useTrip } from "@/components/TripProvider";
import type { AiPlanResult } from "@/lib/ai/plan";
import type { Beyond, GettingAround, Pace, Party, QuizAnswers } from "@/lib/ai/types";
import { PLACES_BY_ID } from "@/lib/fixtures/places";
import { formatDuration, hm, parseClock, toClockInput } from "@/lib/time";
import { MAX_DAYS, type Interest } from "@/lib/types";

interface Opt<T> {
  value: T;
  label: string;
  hint: string;
  icon: LucideIcon;
}

const PARTY: Opt<Party>[] = [
  { value: "solo", label: "Just me", hint: "Go anywhere, any pace", icon: User },
  { value: "couple", label: "Two of us", hint: "Views and a good dinner", icon: Heart },
  { value: "family", label: "Family", hint: "Kids in tow", icon: Baby },
  { value: "friends", label: "Friends", hint: "A crew on the move", icon: Users },
];
const INTERESTS: { value: Interest; label: string; hint: string }[] = [
  { value: "food", label: "Food", hint: "Pizza, bagels, delis" },
  { value: "art", label: "Art", hint: "Museums and galleries" },
  { value: "views", label: "Views", hint: "Skyline and rooftops" },
  { value: "history", label: "History", hint: "Landmarks and stories" },
  { value: "parks", label: "Parks", hint: "Green space and walks" },
  { value: "shopping", label: "Shopping", hint: "Markets and stores" },
  { value: "kids", label: "Kid-friendly", hint: "Things kids love" },
];
const PACE: Opt<Pace>[] = [
  { value: "relaxed", label: "Relaxed", hint: "3–4 stops, long lunches", icon: Coffee },
  { value: "balanced", label: "Balanced", hint: "4–6 stops", icon: Gauge },
  { value: "packed", label: "Packed", hint: "See it all: 6–8 stops", icon: Zap },
];
const AROUND: Opt<GettingAround>[] = [
  { value: "transit", label: "Transit all the way", hint: "Subway, bus, PATH, rail", icon: TrainFront },
  { value: "mix", label: "Mix it up", hint: "Transit plus the odd Uber", icon: Shuffle },
  { value: "comfort", label: "Comfort first", hint: "Uber the long hauls", icon: CarTaxiFront },
];
const BEYOND: Opt<Beyond>[] = [
  { value: "manhattan", label: "Stay in Manhattan", hint: "Subway and walking", icon: Building2 },
  { value: "jersey", label: "Jersey City", hint: "Skyline views via PATH", icon: TrainFrontTunnel },
  { value: "long-island", label: "Long Island beach", hint: "Boardwalk via LIRR", icon: Waves },
  { value: "hudson", label: "Hudson Valley", hint: "Art upstate via Metro-North", icon: Mountain },
  { value: "surprise", label: "Surprise me", hint: "Your call, NYSee", icon: Sparkles },
];
const TIMEZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"];

const STEPS = ["Who", "Interests", "Pace", "Getting around", "Beyond Manhattan", "When"] as const;

function nextSaturday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

function Options<T extends string>({ options, value, onPick }: { options: Opt<T>[]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="options" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} className={`option${value === o.value ? " on" : ""}`} role="radio" aria-checked={value === o.value} onClick={() => onPick(o.value)}>
          <span className="ico">
            <o.icon size={20} />
          </span>
          <b>{o.label}</b>
          <span>{o.hint}</span>
        </button>
      ))}
    </div>
  );
}

const LOADING_LINES = ["Reading your answers", "Picking places you'll love", "Checking opening hours", "Routing every leg"];

export default function AiPlanner() {
  const router = useRouter();
  const { applyAi } = useTrip();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({
    party: "family",
    travelers: 4,
    interests: ["food", "views"],
    pace: "balanced",
    gettingAround: "mix",
    beyond: "jersey",
    date: "2026-10-03",
    days: 1,
    dayStart: hm(9),
    dayEnd: hm(21, 30),
    homeTimeZone: undefined,
    notes: "",
  });
  const [status, setStatus] = useState<"quiz" | "loading" | "done" | "error">("quiz");
  const [result, setResult] = useState<AiPlanResult | null>(null);
  const [error, setError] = useState("");
  const [line, setLine] = useState(0);

  useEffect(() => {
    // Defaults that depend on the browser.
    setAnswers((a) => ({ ...a, date: nextSaturday(), homeTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
  }, []);

  useEffect(() => {
    if (status !== "loading") return;
    const t = setInterval(() => setLine((l) => (l + 1) % LOADING_LINES.length), 1400);
    return () => clearInterval(t);
  }, [status]);

  const set = (patch: Partial<QuizAnswers>) => setAnswers((a) => ({ ...a, ...patch }));
  const last = step === STEPS.length - 1;
  const days = answers.days ?? 1;

  async function submit() {
    setStatus("loading");
    setLine(0);
    try {
      const res = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(answers) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      setResult(json as AiPlanResult);
      applyAi(json as AiPlanResult);
      setStatus("done");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  }

  if (status === "loading") {
    return (
      <main className="quiz" style={{ textAlign: "center" }} aria-live="polite">
        <div className="loading-orb">
          <Sparkles size={34} color="#fff" />
        </div>
        <h1 className="display">Building your {days > 1 ? "trip" : "day"}</h1>
        <p className="muted">{LOADING_LINES[line]}…</p>
      </main>
    );
  }

  if (status === "done" && result) {
    const { recommendation: rec, plan } = result;
    const multi = plan.days.length > 1;
    const dayOf = new Map(plan.days.flatMap((d, i) => d.schedule.slice(1, -1).map((s) => [s.stop.id, i] as const)));
    const stopCount = plan.days.reduce((n, d) => n + d.schedule.length - 2, 0);
    return (
      <main className="quiz">
        <div className="row">
          <span className={`tag ${rec.source === "claude" ? "solid" : ""}`}>
            <Sparkles size={12} /> {rec.source === "claude" ? "Curated by Claude" : "NYSee recommender"}
          </span>
          {multi && <span className="tag">{plan.days.length} days</span>}
          <span className="tag">{stopCount} stops</span>
          <span className="tag">{formatDuration(plan.totals.travelMin)} travel</span>
          <span className="tag red">${plan.cost.totalUsd.toFixed(2)} fares</span>
        </div>
        <h1 className="display">{rec.title}</h1>
        <p className="muted" style={{ fontSize: 17, marginTop: 0 }}>
          {rec.summary}
        </p>
        {rec.note && (
          <div className="alert info" style={{ marginBottom: 16 }}>
            <Info size={16} /> {rec.note}
          </div>
        )}
        <div className="stack">
          {rec.picks.map((p, i) => {
            const place = PLACES_BY_ID[p.placeId];
            const Icon = place.categories[0] ? INTEREST_ICON[place.categories[0]] : Sparkles;
            return (
              <div className="pick" key={p.placeId}>
                <span className="num">{i + 1}</span>
                <div>
                  <div className="row" style={{ gap: 8 }}>
                    <b style={{ fontSize: 16 }}>{place.name}</b>
                    {p.priority === "must" && <span className="tag red">Must-see</span>}
                    {multi && dayOf.has(p.placeId) && <span className="tag">Day {dayOf.get(p.placeId)! + 1}</span>}
                  </div>
                  <div className="muted small">{p.reason}</div>
                  {!dayOf.has(p.placeId) && <div className="tiny" style={{ color: "var(--amber)", marginTop: 4 }}>Didn&apos;t fit the schedule</div>}
                </div>
                <span className="row muted tiny" style={{ gap: 6 }}>
                  <Icon size={14} /> {formatDuration(p.durationMin)}
                </span>
              </div>
            );
          })}
        </div>
        {rec.tips.length > 0 && (
          <div className="card stack" style={{ marginTop: 20 }}>
            <div className="eyebrow">Good to know</div>
            {rec.tips.map((t) => (
              <div key={t} className="row small" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                <ArrowRight size={14} className="red" style={{ marginTop: 3, flex: "none" }} /> {t}
              </div>
            ))}
          </div>
        )}
        <div className="quiz-nav">
          <button className="btn ghost" onClick={() => { setStatus("quiz"); setStep(0); }}>
            <RotateCcw size={16} /> Start over
          </button>
          <button className="btn primary lg" onClick={() => router.push("/trip")}>
            Open my {multi ? "trip" : "day"} on the map <ArrowRight size={18} />
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="quiz">
      <div className="row tiny muted" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <span className="eyebrow">
          <Sparkles size={12} style={{ verticalAlign: -1 }} /> AI trip planner
        </span>
        <span>
          Step {step + 1} of {STEPS.length}
        </span>
      </div>
      <div className="progress">
        <div style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>

      {status === "error" && (
        <div className="alert warn" style={{ marginTop: 16 }}>
          <Info size={16} /> Couldn&apos;t build the plan: {error}
        </div>
      )}

      {step === 0 && (
        <>
          <h1 className="display">Who&apos;s coming?</h1>
          <p className="muted">We&apos;ll tune the pace, the picks and the fares to your group.</p>
          <Options options={PARTY} value={answers.party} onPick={(party) => set({ party, travelers: party === "solo" ? 1 : party === "couple" ? 2 : Math.max(answers.travelers, 3) })} />
          <div className="row" style={{ marginTop: 20 }}>
            <span className="muted small" style={{ fontWeight: 700 }}>
              Travelers
            </span>
            <span className="stepper">
              <button className="btn icon ghost" aria-label="Fewer travelers" onClick={() => set({ travelers: Math.max(1, answers.travelers - 1) })}>
                <Minus size={16} />
              </button>
              <b>{answers.travelers}</b>
              <button className="btn icon ghost" aria-label="More travelers" onClick={() => set({ travelers: Math.min(12, answers.travelers + 1) })}>
                <Plus size={16} />
              </button>
            </span>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h1 className="display">What are you into?</h1>
          <p className="muted">Pick as many as you like. These also shape the stops we suggest along the way.</p>
          <div className="options">
            {INTERESTS.map((o) => {
              const on = answers.interests.includes(o.value);
              const Icon = INTEREST_ICON[o.value];
              return (
                <button
                  key={o.value}
                  className={`option${on ? " on" : ""}`}
                  aria-pressed={on}
                  onClick={() => set({ interests: on ? answers.interests.filter((i) => i !== o.value) : [...answers.interests, o.value] })}
                >
                  <span className="ico">
                    <Icon size={20} />
                  </span>
                  <b>{o.label}</b>
                  <span>{o.hint}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="display">What&apos;s your pace?</h1>
          <p className="muted">How much do you want to squeeze into the day?</p>
          <Options options={PACE} value={answers.pace} onPick={(pace) => set({ pace })} />
        </>
      )}

      {step === 3 && (
        <>
          <h1 className="display">How do you get around?</h1>
          <p className="muted">You can switch any single leg later on the map.</p>
          <Options options={AROUND} value={answers.gettingAround} onPick={(gettingAround) => set({ gettingAround })} />
        </>
      )}

      {step === 4 && (
        <>
          <h1 className="display">Leave Manhattan?</h1>
          <p className="muted">Some of the best views of the city are from outside it.</p>
          <Options options={BEYOND} value={answers.beyond} onPick={(beyond) => set({ beyond })} />
        </>
      )}

      {step === 5 && (
        <>
          <h1 className="display">When are you going?</h1>
          <p className="muted">All times are New York time.</p>
          <div className="stack" style={{ marginTop: 20 }}>
            <div className="two">
              <label className="field">
                {days > 1 ? "First day" : "Date"}
                <input type="date" value={answers.date} onChange={(e) => set({ date: e.target.value })} />
              </label>
              <label className="field">
                Your home timezone
                <select value={answers.homeTimeZone ?? ""} onChange={(e) => set({ homeTimeZone: e.target.value || undefined })}>
                  {[...new Set([answers.homeTimeZone, ...TIMEZONES].filter(Boolean) as string[])].map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="row">
              <span className="muted small" style={{ fontWeight: 700 }}>
                How many days?
              </span>
              <span className="stepper">
                <button className="btn icon ghost" aria-label="Fewer days" onClick={() => set({ days: Math.max(1, days - 1) })}>
                  <Minus size={16} />
                </button>
                <b>{days}</b>
                <button className="btn icon ghost" aria-label="More days" onClick={() => set({ days: Math.min(MAX_DAYS, days + 1) })}>
                  <Plus size={16} />
                </button>
              </span>
            </div>
            <div className="two">
              <label className="field">
                {days > 1 ? "Start each day" : "Start"}
                <input type="time" value={toClockInput(answers.dayStart)} onChange={(e) => set({ dayStart: parseClock(e.target.value) })} />
              </label>
              <label className="field">
                Back at the hotel by
                <input type="time" value={toClockInput(answers.dayEnd)} onChange={(e) => set({ dayEnd: parseClock(e.target.value) })} />
              </label>
            </div>
            <label className="field">
              Anything else? (optional)
              <textarea
                placeholder="It's our anniversary. My daughter loves dinosaurs. We want one great pizza slice…"
                value={answers.notes}
                maxLength={600}
                onChange={(e) => set({ notes: e.target.value })}
              />
            </label>
          </div>
        </>
      )}

      <div className="quiz-nav">
        <button className="btn ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft size={16} /> Back
        </button>
        {last ? (
          <button className="btn primary lg" onClick={submit} disabled={answers.dayEnd <= answers.dayStart}>
            <Sparkles size={18} /> Build my {days > 1 ? "trip" : "day"}
          </button>
        ) : (
          <button className="btn primary lg" onClick={() => setStep((s) => s + 1)} disabled={step === 1 && answers.interests.length === 0}>
            Next <ArrowRight size={18} />
          </button>
        )}
      </div>
    </main>
  );
}
