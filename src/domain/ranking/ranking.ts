/**
 * VYBR8 Charts ranking engine.
 *
 * Pure, deterministic, framework-free. Consumed by the scheduled ranking job
 * (src/server/ranking) which reads raw ratings and writes ranking_entries.
 *
 * Score = Bayesian (confidence-weighted) mean of weighted ratings, pulled toward the
 * category prior until an item has enough credible ratings to stand on its own.
 *   bayes = (C · m + Σ wᵢ·xᵢ) / (C + Σ wᵢ)
 * where m = category prior mean, C = prior strength (in "effective ratings"),
 * wᵢ = recency × credibility × (1 − suspicion) for each rating.
 *
 * So one perfect 10 cannot outrank a thousand consistent 9.4s.
 * Paid promotion is NOT an input here, by design.
 */

export const RANKING_ALGORITHM_VERSION = "ranking-v1.0.0";

export type RatingInput = {
  /** Overall score on the 0–10 scale. */
  score: number;
  /** When the rating was made. */
  ratedAt: Date;
  /** 0–1. Verified visits and established accounts weigh more. Defaults to 1. */
  credibility?: number;
  /** 0–1 suspicion from fraud signals (burst ratings, self-dealing, etc.). Defaults to 0. */
  suspicion?: number;
};

export type RankingParams = {
  /** Category-wide prior mean (e.g. average of all wing ratings in scope). */
  priorMean: number;
  /** Strength of the prior, in effective ratings. Higher = more ratings needed to move away from the mean. */
  priorStrength: number;
  /** Half-life for recency decay, in days. */
  recencyHalfLifeDays: number;
  /** Floor on the recency weight, so old ratings still count a little. */
  recencyFloor: number;
  /** Minimum count of non-suspicious ratings to be listed at all. */
  minRatings: number;
  /** Minimum effective (weighted) rating mass to be listed. */
  minEffectiveRatings: number;
  /** Ratings with suspicion at or above this are excluded entirely. */
  suspicionCutoff: number;
};

export const DEFAULT_RANKING_PARAMS: RankingParams = {
  priorMean: 7.0,
  priorStrength: 25,
  recencyHalfLifeDays: 365,
  recencyFloor: 0.25,
  minRatings: 10,
  minEffectiveRatings: 5,
  suspicionCutoff: 0.8,
};

export type SubjectRatings = {
  subjectId: string;
  ratings: readonly RatingInput[];
};

export type Ineligibility = "too_few_ratings" | "too_little_credible_activity";

export type ScoredSubject = {
  subjectId: string;
  /** Final ranking score, 0–10, rounded to 2 decimals. */
  score: number;
  /** Plain weighted mean of included ratings (what users would call "the average"). */
  weightedMean: number;
  ratingCount: number;
  excludedCount: number;
  effectiveRatings: number;
  /** 0–1: how much the score reflects this subject's own ratings vs the prior. */
  confidence: number;
  eligible: boolean;
  ineligibleReasons: Ineligibility[];
  explanation: string[];
};

export type RankedSubject = ScoredSubject & { rank: number };

const DAY_MS = 86_400_000;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

export function recencyWeight(ratedAt: Date, now: Date, params: Pick<RankingParams, "recencyHalfLifeDays" | "recencyFloor">): number {
  const ageDays = Math.max(0, (now.getTime() - ratedAt.getTime()) / DAY_MS);
  const decay = Math.pow(0.5, ageDays / params.recencyHalfLifeDays);
  return params.recencyFloor + (1 - params.recencyFloor) * decay;
}

export function scoreSubject(
  subject: SubjectRatings,
  now: Date,
  params: RankingParams = DEFAULT_RANKING_PARAMS,
): ScoredSubject {
  let weightSum = 0;
  let weightedScoreSum = 0;
  let included = 0;
  let excluded = 0;

  for (const r of subject.ratings) {
    if (!Number.isFinite(r.score) || r.score < 0 || r.score > 10) {
      excluded++;
      continue;
    }
    const suspicion = clamp(r.suspicion ?? 0, 0, 1);
    if (suspicion >= params.suspicionCutoff) {
      excluded++;
      continue;
    }
    const w = recencyWeight(r.ratedAt, now, params) * clamp(r.credibility ?? 1, 0, 1) * (1 - suspicion);
    if (w <= 0) {
      excluded++;
      continue;
    }
    weightSum += w;
    weightedScoreSum += w * r.score;
    included++;
  }

  const weightedMean = weightSum > 0 ? weightedScoreSum / weightSum : 0;
  const bayes = (params.priorStrength * params.priorMean + weightedScoreSum) / (params.priorStrength + weightSum);
  const confidence = weightSum / (weightSum + params.priorStrength);

  const ineligibleReasons: Ineligibility[] = [];
  if (included < params.minRatings) ineligibleReasons.push("too_few_ratings");
  if (weightSum < params.minEffectiveRatings) ineligibleReasons.push("too_little_credible_activity");

  const explanation = [
    `${included} rating${included === 1 ? "" : "s"} counted` + (excluded ? `, ${excluded} excluded as invalid or suspicious` : ""),
    `Weighted average ${round(weightedMean, 1)} (recent and verified ratings count more)`,
    `Confidence ${Math.round(confidence * 100)}%: blended with the category average of ${round(params.priorMean, 1)} until there are enough ratings`,
  ];
  if (ineligibleReasons.includes("too_few_ratings")) {
    explanation.push(`Needs at least ${params.minRatings} ratings to be ranked`);
  }

  return {
    subjectId: subject.subjectId,
    score: round(bayes),
    weightedMean: round(weightedMean),
    ratingCount: included,
    excludedCount: excluded,
    effectiveRatings: round(weightSum),
    confidence: round(confidence, 3),
    eligible: ineligibleReasons.length === 0,
    ineligibleReasons,
    explanation,
  };
}

/** Mean of all valid scores across subjects: a sensible default prior for a category. */
export function categoryPriorMean(subjects: readonly SubjectRatings[], fallback = DEFAULT_RANKING_PARAMS.priorMean): number {
  let sum = 0;
  let n = 0;
  for (const s of subjects) {
    for (const r of s.ratings) {
      if (Number.isFinite(r.score) && r.score >= 0 && r.score <= 10) {
        sum += r.score;
        n++;
      }
    }
  }
  return n ? sum / n : fallback;
}

/**
 * Rank eligible subjects. Ties break on confidence, then rating count, then id for stability.
 * Ineligible subjects are returned separately so the UI can explain why they are unranked.
 */
export function rankSubjects(
  subjects: readonly SubjectRatings[],
  now: Date,
  overrides: Partial<RankingParams> = {},
): { ranked: RankedSubject[]; unranked: ScoredSubject[]; params: RankingParams; version: string } {
  const params: RankingParams = {
    ...DEFAULT_RANKING_PARAMS,
    priorMean: categoryPriorMean(subjects),
    ...overrides,
  };
  const scored = subjects.map((s) => scoreSubject(s, now, params));
  const eligible = scored
    .filter((s) => s.eligible)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.confidence - a.confidence ||
        b.ratingCount - a.ratingCount ||
        a.subjectId.localeCompare(b.subjectId),
    );
  return {
    ranked: eligible.map((s, i) => ({ ...s, rank: i + 1 })),
    unranked: scored.filter((s) => !s.eligible),
    params,
    version: RANKING_ALGORITHM_VERSION,
  };
}
