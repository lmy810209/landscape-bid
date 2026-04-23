// 백테스트 (Leave-One-Out 검증)
//
// 각 공고를 1건씩 검증 대상으로 떼어내고, 나머지로 추천 구간/전략을 산출한 뒤
// 실제 낙찰 결과와 비교해 도구의 안정성을 정량 평가한다.
//
// 원칙:
// - 검증 대상 공고는 절대 학습 데이터에 포함하지 않음 (id 기준 제외)
// - 단일 정답 예측 정확도가 아니라, 추천 구간/전략의 분포적 유용성을 평가
// - recommendation.ts와 strategy.ts를 그대로 재사용 (룰 일관성 보장)

import type { Bid } from "@/types/bid";
import { calcMyBidRatio, calcWinRatio } from "./calculations";
import { MIN_FOR_CONDITIONAL, computeRecommendation } from "./recommendation";
import { calculateBidStrategies, type BidStrategies } from "./strategy";

export type StrategyLabel = "공격형" | "균형형" | "보수형";

export type BacktestErrorBreakdown = {
  aggressive: number; // |공격형 rate - 실제 사정율|
  balanced: number;
  conservative: number;
  min: number; // 세 전략 중 최소 오차
  bestLabel: StrategyLabel;
};

export type BacktestRow = {
  bid: Bid;
  status: "evaluated" | "insufficient_data" | "no_actual_result";
  historicalSampleCount: number; // 자기 자신 제외 후 매칭된 표본 수
  actualWinRatio: number | null;
  range: { low: number; high: number } | null;
  included: boolean | null; // 실제 사정율이 추천 구간 안에 들어왔는지
  strategies: BidStrategies | null;
  errors: BacktestErrorBreakdown | null;
  myBidRatio: number | null;
  myError: number | null; // |내 투찰률 - 실제 사정율|
  improvement: number | null; // myError - errors.min (양수면 도구가 더 가까웠음)
  isRunnerUp: boolean; // 2등 공고 (도이접 케이스)
};

export type BacktestSummary = {
  totalBids: number;
  evaluatedCount: number;
  insufficientCount: number;
  noActualCount: number;

  // 추천 구간 포함률 (평가됨 기준)
  inclusionRate: number | null;

  // 전략별 평균 오차 (평가됨 기준, 절대값 평균 — 단위는 사정율 소수)
  meanError: {
    aggressive: number | null;
    balanced: number | null;
    conservative: number | null;
    bestOfThree: number | null; // 세 전략 중 최소를 매번 골랐을 때 (이론 상한)
  };

  // 사용자 실제 투찰 대비 비교
  meanMyError: number | null;
  myErrorComparedCount: number; // 내 투찰가가 있는 평가 건수
  improvedCount: number; // 도구의 최소 오차가 내 오차보다 작은 건수
  improvementRate: number | null;

  // 2등 공고 한정 도이접 케이스 — 도구를 따랐다면 더 가까웠을지
  runnerUpEvaluatedCount: number;
  runnerUpImprovedCount: number;
  runnerUpImprovementRate: number | null;
};

export type BacktestResult = {
  rows: BacktestRow[];
  summary: BacktestSummary;
};

export function runBacktest(bids: Bid[]): BacktestResult {
  const rows = bids.map((target) => evaluateOne(target, bids));
  const summary = aggregateSummary(rows);
  return { rows, summary };
}

function evaluateOne(target: Bid, allBids: Bid[]): BacktestRow {
  const actualWinRatio = calcWinRatio(target);
  const myBidRatio = calcMyBidRatio(target);
  const isRunnerUp = target.result_status === "2등";

  // 실제 낙찰 결과가 없는 공고는 검증 자체가 불가능
  if (actualWinRatio == null) {
    return {
      bid: target,
      status: "no_actual_result",
      historicalSampleCount: 0,
      actualWinRatio: null,
      range: null,
      included: null,
      strategies: null,
      errors: null,
      myBidRatio,
      myError: null,
      improvement: null,
      isRunnerUp,
    };
  }

  // 자기 자신 제외 + 같은 발주처/공종으로 매칭 (학습-테스트 분리)
  const historicalSubset = allBids.filter(
    (b) =>
      b.id !== target.id &&
      b.agency === target.agency &&
      b.work_type === target.work_type,
  );

  const rec = computeRecommendation(historicalSubset);

  // 추천 구간이 없거나 표본이 최소 임계 미만 → 검증 불가 (도구 한계)
  if (!rec.range || rec.sampleCount < MIN_FOR_CONDITIONAL) {
    return {
      bid: target,
      status: "insufficient_data",
      historicalSampleCount: rec.sampleCount,
      actualWinRatio,
      range: null,
      included: null,
      strategies: null,
      errors: null,
      myBidRatio,
      myError: null,
      improvement: null,
      isRunnerUp,
    };
  }

  const strategies = calculateBidStrategies({
    range: rec.range,
    baseAmount: target.base_amount,
    sampleCount: rec.sampleCount,
    myGapRateMean: rec.myGapRateMean,
    participantCount: target.participant_count,
  });

  const included = actualWinRatio >= rec.range.low && actualWinRatio <= rec.range.high;

  const errAgg = Math.abs(strategies.aggressive.rate - actualWinRatio);
  const errBal = Math.abs(strategies.balanced.rate - actualWinRatio);
  const errCon = Math.abs(strategies.conservative.rate - actualWinRatio);
  const minErr = Math.min(errAgg, errBal, errCon);
  const bestLabel: StrategyLabel =
    minErr === errAgg ? "공격형" : minErr === errBal ? "균형형" : "보수형";

  const myError = myBidRatio != null ? Math.abs(myBidRatio - actualWinRatio) : null;
  const improvement = myError != null ? myError - minErr : null;

  return {
    bid: target,
    status: "evaluated",
    historicalSampleCount: rec.sampleCount,
    actualWinRatio,
    range: rec.range,
    included,
    strategies,
    errors: {
      aggressive: errAgg,
      balanced: errBal,
      conservative: errCon,
      min: minErr,
      bestLabel,
    },
    myBidRatio,
    myError,
    improvement,
    isRunnerUp,
  };
}

function aggregateSummary(rows: BacktestRow[]): BacktestSummary {
  const totalBids = rows.length;
  const evaluated = rows.filter((r) => r.status === "evaluated");
  const insufficientCount = rows.filter((r) => r.status === "insufficient_data").length;
  const noActualCount = rows.filter((r) => r.status === "no_actual_result").length;
  const evaluatedCount = evaluated.length;

  if (evaluatedCount === 0) {
    return {
      totalBids,
      evaluatedCount: 0,
      insufficientCount,
      noActualCount,
      inclusionRate: null,
      meanError: {
        aggressive: null,
        balanced: null,
        conservative: null,
        bestOfThree: null,
      },
      meanMyError: null,
      myErrorComparedCount: 0,
      improvedCount: 0,
      improvementRate: null,
      runnerUpEvaluatedCount: 0,
      runnerUpImprovedCount: 0,
      runnerUpImprovementRate: null,
    };
  }

  const inclusionCount = evaluated.filter((r) => r.included).length;
  const inclusionRate = inclusionCount / evaluatedCount;

  const meanError = {
    aggressive: mean(evaluated.map((r) => r.errors!.aggressive)),
    balanced: mean(evaluated.map((r) => r.errors!.balanced)),
    conservative: mean(evaluated.map((r) => r.errors!.conservative)),
    bestOfThree: mean(evaluated.map((r) => r.errors!.min)),
  };

  // 사용자 실제 투찰가가 있는 평가 건수에 한해 개선 비교
  const withMyError = evaluated.filter((r) => r.myError != null);
  const meanMyError = withMyError.length > 0 ? mean(withMyError.map((r) => r.myError!)) : null;
  const improvedCount = withMyError.filter((r) => (r.improvement ?? 0) > 0).length;
  const improvementRate =
    withMyError.length > 0 ? improvedCount / withMyError.length : null;

  // 2등 공고 한정
  const runnerUpEvaluated = withMyError.filter((r) => r.isRunnerUp);
  const runnerUpImprovedCount = runnerUpEvaluated.filter(
    (r) => (r.improvement ?? 0) > 0,
  ).length;
  const runnerUpImprovementRate =
    runnerUpEvaluated.length > 0
      ? runnerUpImprovedCount / runnerUpEvaluated.length
      : null;

  return {
    totalBids,
    evaluatedCount,
    insufficientCount,
    noActualCount,
    inclusionRate,
    meanError,
    meanMyError,
    myErrorComparedCount: withMyError.length,
    improvedCount,
    improvementRate,
    runnerUpEvaluatedCount: runnerUpEvaluated.length,
    runnerUpImprovedCount,
    runnerUpImprovementRate,
  };
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
