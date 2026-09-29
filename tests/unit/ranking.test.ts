import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  rankSubjects,
  recencyWeight,
  scoreSubject,
  DEFAULT_RANKING_PARAMS,
  RANKING_ALGORITHM_VERSION,
  type RatingInput,
} from "../../src/domain/ranking/ranking.ts";

const NOW = new Date("2026-09-28T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const many = (n: number, score: number, extra: Partial<RatingInput> = {}): RatingInput[] =>
  Array.from({ length: n }, (_, i) => ({ score, ratedAt: daysAgo(i % 60), ...extra }));

describe("ranking engine", () => {
  it("one perfect rating does not outrank a thousand consistent excellent ratings", () => {
    const { ranked, unranked } = rankSubjects(
      [
        { subjectId: "one-hit-wonder", ratings: [{ score: 10, ratedAt: daysAgo(1) }] },
        { subjectId: "hot-honey-wings", ratings: many(1000, 9.4) },
        { subjectId: "ok-wings", ratings: many(40, 7.2) },
      ],
      NOW,
    );
    assert.equal(ranked[0]?.subjectId, "hot-honey-wings");
    assert.ok(unranked.some((u) => u.subjectId === "one-hit-wonder"), "single rating is below eligibility");
  });

  it("even when eligible, a few perfect scores are pulled toward the category mean", () => {
    const { ranked } = rankSubjects(
      [
        { subjectId: "few-perfect", ratings: many(10, 10) },
        { subjectId: "many-great", ratings: many(800, 9.3) },
        { subjectId: "filler", ratings: many(200, 7) },
      ],
      NOW,
    );
    assert.equal(ranked[0]?.subjectId, "many-great");
    const few = ranked.find((r) => r.subjectId === "few-perfect")!;
    assert.ok(few.score < 9.3 && few.weightedMean === 10);
    assert.ok(few.confidence < 0.5);
  });

  it("recent ratings weigh more than old ones, with a floor", () => {
    const p = DEFAULT_RANKING_PARAMS;
    assert.equal(recencyWeight(NOW, NOW, p), 1);
    const yearOld = recencyWeight(daysAgo(365), NOW, p);
    assert.ok(Math.abs(yearOld - (p.recencyFloor + (1 - p.recencyFloor) * 0.5)) < 1e-9);
    assert.ok(recencyWeight(daysAgo(5000), NOW, p) >= p.recencyFloor);
  });

  it("a place that got worse recently ranks below one that is consistently good", () => {
    const declining = [...many(200, 9.6).map((r) => ({ ...r, ratedAt: daysAgo(900) })), ...many(100, 7.5)];
    const steady = many(300, 8.9);
    const { ranked } = rankSubjects(
      [
        { subjectId: "declining", ratings: declining },
        { subjectId: "steady", ratings: steady },
      ],
      NOW,
    );
    assert.equal(ranked[0]?.subjectId, "steady");
  });

  it("suspicious ratings are down-weighted or excluded", () => {
    const honest = many(50, 8.5);
    const stuffed = [...many(50, 8.5), ...many(500, 10, { suspicion: 0.95 })];
    const a = scoreSubject({ subjectId: "honest", ratings: honest }, NOW, { ...DEFAULT_RANKING_PARAMS, priorMean: 7 });
    const b = scoreSubject({ subjectId: "stuffed", ratings: stuffed }, NOW, { ...DEFAULT_RANKING_PARAMS, priorMean: 7 });
    assert.equal(b.excludedCount, 500);
    assert.equal(a.score, b.score, "review-bombing with fake 10s changes nothing");
  });

  it("low-credibility ratings count less", () => {
    const params = { ...DEFAULT_RANKING_PARAMS, priorMean: 7 };
    const verified = scoreSubject({ subjectId: "v", ratings: many(30, 9.5) }, NOW, params);
    const unverified = scoreSubject({ subjectId: "u", ratings: many(30, 9.5, { credibility: 0.2 }) }, NOW, params);
    assert.ok(verified.score > unverified.score);
    assert.ok(verified.effectiveRatings > unverified.effectiveRatings);
  });

  it("invalid scores are ignored", () => {
    const s = scoreSubject(
      { subjectId: "x", ratings: [{ score: 11, ratedAt: NOW }, { score: Number.NaN, ratedAt: NOW }, { score: -1, ratedAt: NOW }] },
      NOW,
    );
    assert.equal(s.ratingCount, 0);
    assert.equal(s.excludedCount, 3);
    assert.equal(s.eligible, false);
  });

  it("explains itself and reports its version", () => {
    const { ranked, version } = rankSubjects([{ subjectId: "a", ratings: many(20, 9) }], NOW);
    assert.equal(version, RANKING_ALGORITHM_VERSION);
    assert.ok(ranked[0]!.explanation.some((line) => line.includes("20 ratings counted")));
  });

  it("is deterministic with stable tie-breaking", () => {
    const input = [
      { subjectId: "b", ratings: many(20, 9) },
      { subjectId: "a", ratings: many(20, 9) },
    ];
    const first = rankSubjects(input, NOW).ranked.map((r) => r.subjectId);
    const second = rankSubjects([...input].reverse(), NOW).ranked.map((r) => r.subjectId);
    assert.deepEqual(first, ["a", "b"]);
    assert.deepEqual(second, first);
  });
});
