import { describe, expect, it } from "vitest";
import { optimize } from "./optimize";
import { simulate, type NodeSpec } from "./schedule";

const ALL_DAY = [{ start: 0, end: 24 * 60 }];
const node = (id: string, durationMin = 30, windows = ALL_DAY): NodeSpec => ({ id, durationMin, windows });

/** Points on a line; travel = 10 min per unit of distance. */
function lineProblem(positions: number[], nodes: NodeSpec[], dayStart = 540, dayEnd = 1320) {
  const travel = positions.map((a) => positions.map((b) => Math.abs(a - b) * 10));
  return { nodes, travel, dayStart, dayEnd };
}

describe("optimize", () => {
  it("orders stops to minimise travel", () => {
    // start 0, stops at 3, 1, 2, end 0 -> best is 1,2,3 (or reverse)
    const p = lineProblem([0, 3, 1, 2, 0], [node("s"), node("a"), node("b"), node("c"), node("e")]);
    const r = optimize({ ...p, score: [0, 10, 10, 10, 0], must: new Set([1, 2, 3]) });
    expect(r.dropped).toEqual([]);
    const sim = simulate(p, r.route);
    expect(sim.travel).toBe(60);
  });

  it("respects opening hours even when it costs travel", () => {
    // Stop 1 is nearest but only opens at 14:00; stop 2 closes at 12:00.
    const p = lineProblem(
      [0, 1, 5, 0],
      [node("s"), node("late", 30, [{ start: 840, end: 1000 }]), node("early", 30, [{ start: 540, end: 720 }]), node("e")],
    );
    const r = optimize({ ...p, score: [0, 10, 10, 0], must: new Set([1, 2]) });
    expect(r.route).toEqual([2, 1]);
    expect(simulate(p, r.route).late).toBe(0);
  });

  it("drops nice-to-haves before must-sees when time runs out", () => {
    const p = lineProblem([0, 1, 1, 0], [node("s"), node("must", 120), node("nice", 120), node("e")], 540, 540 + 180);
    const r = optimize({ ...p, score: [0, 100, 10, 0], must: new Set([1]) });
    expect(r.route).toEqual([1]);
    expect(r.dropped.map((d) => d.node)).toEqual([2]);
    expect(r.dropped[0].reason).toMatch(/Not enough time/);
  });

  it("explains stops that are closed", () => {
    const p = lineProblem([0, 1, 0], [node("s"), node("closed", 30, []), node("e")]);
    const r = optimize({ ...p, score: [0, 100, 0], must: new Set([1]) });
    expect(r.dropped[0].reason).toBe("Closed on this date.");
  });

  it("honours a fixed-time event", () => {
    const p = lineProblem([0, 1, 2, 0], [node("s"), node("show", 60, [{ start: 1200, end: 1260 }]), node("museum", 120), node("e")]);
    const r = optimize({ ...p, score: [0, 100, 100, 0], must: new Set([1, 2]) });
    const sim = simulate(p, r.route);
    expect(sim.late).toBe(0);
    expect(sim.visits.find((v) => v.node === 1)!.start).toBe(1200);
  });

  it("keeps a fixed order and only inserts missing stops", () => {
    const p = lineProblem([0, 3, 1, 2, 0], [node("s"), node("a"), node("b"), node("c"), node("e")]);
    const r = optimize({ ...p, score: [0, 10, 10, 10, 0], must: new Set([1, 2, 3]) }, [1, 2]);
    expect(r.route.filter((n) => n !== 3)).toEqual([1, 2]);
    expect(r.route).toContain(3);
  });
});

describe("simulate", () => {
  it("leaves later instead of waiting outside the first stop", () => {
    const p = lineProblem([0, 1, 0], [node("s"), node("museum", 60, [{ start: 600, end: 1000 }]), node("e")]);
    const sim = simulate(p, [1]);
    expect(sim.leaveAt).toBe(590);
    expect(sim.visits[0].wait).toBe(0);
  });
});
