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
import {
  bootstrapCI,
  calibrationTone,
  mean,
  quantiles,
  stddev,
  wilsonCI,
  type BootstrapCI,
  type CalibrationTone,
  type WilsonCI,
} from "./stats";

// 정규분포 가정 하의 구간 폭 배율.
// 50% 구간 = 평균 ± 0.6745σ → 폭 1.349σ
// 80% 구간 = 평균 ± 1.2816σ → 폭 2.563σ
const HALFWIDTH_50 = 1.349;
const HALFWIDTH_80 = 2.563;

// 이론 하한값 (concept-note.md §2.3, 균등 ±2.5% 가정 기반)
// - SD(낙찰하한금액/기초) ≈ 0.58%
// - 50% 구간 이론 폭 = 1.349 × 0.58% ≈ 0.78%
// - 80% 구간 이론 폭 = 2.563 × 0.58% ≈ 1.49%
export const SHARPNESS_LOWER_BOUND_50 = 0.0078;
export const SHARPNESS_LOWER_BOUND_80 = 0.0149;

export type StrategyLabel = "공격형" | "균형형" | "보수형";

export type BacktestErrorBreakdown = {
  aggressive: number; // |공격형 rate - 실제 사정율|
  balanced: number;
  conservative: number;
  min: number; // 세 전략 중 최소 오차
  bestLabel: StrategyLabel;
};

export type QuantileBand = {
  low: number;
  high: number;
  width: number;
  includedActual: boolean | null;
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
  isUnderThreshold: boolean; // result_status === '낙찰하한선미달'
  // 부적격 케이스에 한해: 보수형 rate >= actualWinRatio 인지.
  // true이면 도구의 보수형을 따랐을 때 1등보다도 위에 있었으므로 낙찰하한선 미달을 거의 확실히 회피했을 것.
  // 부적격이 아니거나 strategies 미산출 시 null.
  underThresholdAvoidable: boolean | null;

  // P1 신규: Quantile 기반 신뢰구간 (기존 expandRange 구간과 병행).
  // 목표 커버리지 50% (Q25~Q75), 80% (Q10~Q90). 과거 win_ratio 분포에서 직접 산출.
  // null: historicalSampleCount가 quantile 계산에 부족하거나 actualWinRatio 없음.
  quantile50: QuantileBand | null;
  quantile80: QuantileBand | null;
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

  // 낙찰하한선미달(부적격) 한정 — 도구의 보수형을 따랐다면 회피 가능했을지
  underThresholdTotal: number;
  underThresholdAvoidableCount: number;
  underThresholdAvoidableRate: number | null;

  // P1 신규 지표 (concept-note v2.1 §3)
  // Calibration: 목표 커버리지 대비 실측 포함률 (Wilson CI 병기)
  // Sharpness: 구간 평균 폭 (Bootstrap CI 병기)
  // improvementCI: 개선률의 Wilson CI (기존 improvementRate는 점 추정만)
  // vsUserMaeRatio: 도구 최소 오차 평균 / 사용자 오차 평균 (< 1 이어야 의미)
  calibration50: {
    ci: WilsonCI;
    target: number;
    tone: CalibrationTone;
    n: number;
  } | null;
  calibration80: {
    ci: WilsonCI;
    target: number;
    tone: CalibrationTone;
    n: number;
  } | null;
  sharpness50: {
    ci: BootstrapCI; // 단위: 사정율 소수 (예: 0.0078 = 0.78%p)
    theoreticalLowerBound: number; // 추첨만 고려한 이론 하한 (σ_draw 기반)
    empiricalLowerBound: number | null; // 실측 σ_total 기반 하한 (null = 표본 부족)
    n: number;
  } | null;
  sharpness80: {
    ci: BootstrapCI;
    theoreticalLowerBound: number;
    empiricalLowerBound: number | null;
    n: number;
  } | null;
  // 전체 평가 대상의 win_ratio 표준편차. Sharpness 실측 하한 계산의 기준.
  empiricalSigma: number | null;
  improvementCI: WilsonCI | null;
  vsUserMaeRatio: number | null;
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
  const isUnderThreshold = target.result_status === "낙찰하한선미달";

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
      isUnderThreshold,
      underThresholdAvoidable: null,
      quantile50: null,
      quantile80: null,
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

  // Quantile 기반 구간 계산 (기존 expandRange와 병행, 학습 데이터가 작은 환경에서
  // 안정성이 더 높을 것으로 기대. concept-note §3 참조).
  // 과거 win_ratio 집합에서 직접 quantile 추출. 계산 가능한 건만 사용.
  const historicalWinRatios = historicalSubset
    .map(calcWinRatio)
    .filter((x): x is number => x != null);

  // quantile 계산은 기술적으로 n>=2부터 가능하지만, 의미 있는 50/80 구간은 n>=4 권장.
  const QUANTILE_MIN_N = 4;
  const qBand = (p1: number, p2: number): QuantileBand | null => {
    if (historicalWinRatios.length < QUANTILE_MIN_N) return null;
    const [lo, hi] = quantiles(historicalWinRatios, [p1, p2]);
    if (lo == null || hi == null) return null;
    return {
      low: lo,
      high: hi,
      width: hi - lo,
      includedActual: actualWinRatio >= lo && actualWinRatio <= hi,
    };
  };
  const quantile50 = qBand(0.25, 0.75);
  const quantile80 = qBand(0.1, 0.9);

  // 추천 구간이 없거나 표본이 최소 임계 미만 → 기존 지표 검증 불가.
  // 단 quantile 구간은 이미 위에서 계산됨 (따로 보관).
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
      isUnderThreshold,
      underThresholdAvoidable: null,
      quantile50,
      quantile80,
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

  // 부적격 회피 가능 판정: 보수형 rate >= 1등 사정율이면 1등보다 위에서 형성됨
  // → 1등이 하한선을 통과한 케이스이므로 그 위는 거의 확실히 하한선 통과.
  const underThresholdAvoidable = isUnderThreshold
    ? strategies.conservative.rate >= actualWinRatio
    : null;

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
    isUnderThreshold,
    underThresholdAvoidable,
    quantile50,
    quantile80,
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
      underThresholdTotal: 0,
      underThresholdAvoidableCount: 0,
      underThresholdAvoidableRate: null,
      calibration50: null,
      calibration80: null,
      sharpness50: null,
      sharpness80: null,
      empiricalSigma: null,
      improvementCI: null,
      vsUserMaeRatio: null,
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

  // 부적격(낙찰하한선미달) 한정 — 도구의 보수형을 따랐다면 회피 가능했을 비율
  const underThresholdRows = evaluated.filter((r) => r.isUnderThreshold);
  const underThresholdTotal = underThresholdRows.length;
  const underThresholdAvoidableCount = underThresholdRows.filter(
    (r) => r.underThresholdAvoidable === true,
  ).length;
  const underThresholdAvoidableRate =
    underThresholdTotal > 0 ? underThresholdAvoidableCount / underThresholdTotal : null;

  // === P1 신규 지표 ===
  // Calibration: Quantile 구간에 실제 사정율이 들어왔는지
  const q50Rows = [...evaluated, ...rows.filter((r) => r.status === "insufficient_data")]
    .filter((r) => r.quantile50 != null && r.quantile50.includedActual != null);
  const q80Rows = [...evaluated, ...rows.filter((r) => r.status === "insufficient_data")]
    .filter((r) => r.quantile80 != null && r.quantile80.includedActual != null);

  const calibration50 =
    q50Rows.length > 0
      ? (() => {
          const k = q50Rows.filter((r) => r.quantile50!.includedActual === true).length;
          const ci = wilsonCI(k, q50Rows.length, 0.95);
          return {
            ci,
            target: 0.5,
            tone: calibrationTone(ci.point, 0.5),
            n: q50Rows.length,
          };
        })()
      : null;

  const calibration80 =
    q80Rows.length > 0
      ? (() => {
          const k = q80Rows.filter((r) => r.quantile80!.includedActual === true).length;
          const ci = wilsonCI(k, q80Rows.length, 0.95);
          return {
            ci,
            target: 0.8,
            tone: calibrationTone(ci.point, 0.8),
            n: q80Rows.length,
          };
        })()
      : null;

  // Sharpness: Quantile 구간의 평균 폭 (Bootstrap CI 병기)
  const widths50 = q50Rows.map((r) => r.quantile50!.width);
  const widths80 = q80Rows.map((r) => r.quantile80!.width);

  // 실측 σ_total 계산 (평가된 모든 win_ratio의 표본 표준편차).
  // concept-note §2.4에서 "σ_total = √(σ_draw² + σ_bias²)"로 분해.
  // 이 값을 기반으로 Sharpness의 "실측 이론 하한"을 산출.
  const allActualRatios = rows
    .filter((r) => r.actualWinRatio != null)
    .map((r) => r.actualWinRatio as number);
  const empiricalSigma = allActualRatios.length >= 2 ? stddev(allActualRatios) : null;
  const empLB50 = empiricalSigma != null ? HALFWIDTH_50 * empiricalSigma : null;
  const empLB80 = empiricalSigma != null ? HALFWIDTH_80 * empiricalSigma : null;

  const sharpness50 =
    widths50.length > 0
      ? {
          ci: bootstrapCI(widths50, mean, { iters: 1000, level: 0.95 }),
          theoreticalLowerBound: SHARPNESS_LOWER_BOUND_50,
          empiricalLowerBound: empLB50,
          n: widths50.length,
        }
      : null;

  const sharpness80 =
    widths80.length > 0
      ? {
          ci: bootstrapCI(widths80, mean, { iters: 1000, level: 0.95 }),
          theoreticalLowerBound: SHARPNESS_LOWER_BOUND_80,
          empiricalLowerBound: empLB80,
          n: widths80.length,
        }
      : null;

  // 개선률 Wilson CI (기존 improvementRate는 점 추정)
  const improvementCI =
    withMyError.length > 0 ? wilsonCI(improvedCount, withMyError.length, 0.95) : null;

  // 도구 MAE / 사용자 MAE — 1 미만이어야 의미 있음
  const meanBest = meanError.bestOfThree ?? 0;
  const vsUserMaeRatio =
    meanMyError != null && meanMyError > 0 ? meanBest / meanMyError : null;

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
    underThresholdTotal,
    underThresholdAvoidableCount,
    underThresholdAvoidableRate,
    calibration50,
    calibration80,
    sharpness50,
    sharpness80,
    empiricalSigma,
    improvementCI,
    vsUserMaeRatio,
  };
}
