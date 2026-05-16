import type { Bid } from "@/types/bid";
import { calcMyGapRate, calcRunnerUpGapRate, calcWinRatio, formatPercent } from "./calculations";
import {
  filterBids as filterBidsShared,
  filterForPersonalAdjustment,
  uniqueValues as uniqueValuesShared,
  type FilterCriteria,
  type PersonalAdjustmentOptions,
} from "./filters";

// === 정책 상수 (모든 값은 설명 가능하도록 명시) ===
export const BIN_SIZE = 0.003; // 0.3% 단위 히스토그램 bin (2026-04 재튜닝: 0.005 → 0.002 악화 → 0.003 중간값)
export const RECENT_COUNT = 8; // 최근 N건에 가중치 부여 (2026-05: 3→8, 2026년 시계열 이동 반영)
export const RECENT_WEIGHT = 5.0; // 최근 N건의 가중치 (2026-05: 2.0→5.0, 88%대→90%대 트렌드 극단 가중)
export const BASE_WEIGHT = 1.0; // 그 외 가중치
export const RANGE_EXPAND_THRESHOLD = 0.55; // 인접 bin 흡수 기준 (2026-04 v3: 0.8 → 0.6 → 0.55, 포함률만 소폭 개선)

// 참여 권장 임계 (유효 표본 = 사정율 계산 가능한 행 수)
export const MIN_FOR_RECOMMEND = 5;
export const MIN_FOR_CONDITIONAL = 2;

export type ParticipationStatus = "recommended" | "conditional" | "not_recommended";

export type WeightedSample = {
  bid: Bid;
  ratio: number;
  weight: number;
};

export type Bin = {
  low: number;
  high: number;
  weight: number;
  count: number;
};

export type RecommendationResult = {
  status: ParticipationStatus;
  reason: string;
  range: { low: number; high: number } | null; // 단일 값 금지 — 항상 범위
  weightedMean: number | null;
  sampleCount: number;
  totalCount: number;
  recentSampleCount: number;
  myGapRateMean: number | null;
  myGapSampleCount: number;
  runnerUpGapRateMean: number | null;
  runnerUpGapSampleCount: number;
  bins: Bin[];
};

// === 필터 / 정렬 / 가중치 ===

// filterBids / uniqueValues는 filters.ts가 정본. 호환을 위해 재노출.
export const filterBids = filterBidsShared;
export const uniqueValues = uniqueValuesShared;

export function buildWeightedSamples(bids: Bid[]): WeightedSample[] {
  const sorted = [...bids].sort((a, b) => {
    const da = a.bid_date ?? "";
    const db = b.bid_date ?? "";
    if (db !== da) return db.localeCompare(da);
    return b.created_at.localeCompare(a.created_at);
  });

  const samples: WeightedSample[] = [];
  for (const bid of sorted) {
    const r = calcWinRatio(bid);
    if (r == null) continue;
    const weight = samples.length < RECENT_COUNT ? RECENT_WEIGHT : BASE_WEIGHT;
    samples.push({ bid, ratio: r, weight });
  }
  return samples;
}

// === 추천 구간 (인접 bin 흡수 확장) ===

export function expandRange(
  bins: Bin[],
  threshold = RANGE_EXPAND_THRESHOLD,
): { low: number; high: number } | null {
  if (bins.length === 0) return null;
  const sorted = [...bins].sort((a, b) => a.low - b.low);

  let topIdx = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].weight > sorted[topIdx].weight) topIdx = i;
  }

  const cutoff = sorted[topIdx].weight * threshold;
  let start = topIdx;
  let end = topIdx;

  // 인접성: 이웃 bin의 low가 현재 bin의 high와 거의 같아야 함 (sparse 대응)
  const isAdjacent = (a: Bin, b: Bin) => Math.abs(b.low - a.high) < 1e-9;

  while (start - 1 >= 0 && sorted[start - 1].weight >= cutoff && isAdjacent(sorted[start - 1], sorted[start])) {
    start--;
  }
  while (end + 1 < sorted.length && sorted[end + 1].weight >= cutoff && isAdjacent(sorted[end], sorted[end + 1])) {
    end++;
  }

  return { low: sorted[start].low, high: sorted[end].high };
}

// === 메인 추천 계산 ===

export type RecommendationOptions = {
  personalAdjustment?: PersonalAdjustmentOptions;
};

export function computeRecommendation(
  bids: Bid[],
  opts: RecommendationOptions = {},
): RecommendationResult {
  const samples = buildWeightedSamples(bids);
  const sampleCount = samples.length;
  const totalWeight = samples.reduce((s, w) => s + w.weight, 0);

  const weightedMean =
    sampleCount === 0 ? null : samples.reduce((s, w) => s + w.ratio * w.weight, 0) / totalWeight;

  const binMap = new Map<number, { weight: number; count: number }>();
  for (const s of samples) {
    const idx = Math.floor(s.ratio / BIN_SIZE);
    const cur = binMap.get(idx) ?? { weight: 0, count: 0 };
    binMap.set(idx, { weight: cur.weight + s.weight, count: cur.count + 1 });
  }
  const bins: Bin[] = [...binMap.entries()]
    .map(([idx, v]) => ({
      low: idx * BIN_SIZE,
      high: (idx + 1) * BIN_SIZE,
      weight: v.weight,
      count: v.count,
    }))
    .sort((a, b) => a.low - b.low);

  const range = expandRange(bins);

  // 개인 보정(my_gap_rate): 참여 데이터만 사용 (미참여 제외).
  // INCLUDE_UNDER_THRESHOLD_IN_PERSONAL_ADJUSTMENT 기본 true — 낙찰하한선미달도 포함.
  const personalBids = filterForPersonalAdjustment(bids, opts.personalAdjustment);
  const myGaps = personalBids.map(calcMyGapRate).filter((x): x is number => x != null);
  const myGapRateMean =
    myGaps.length === 0 ? null : myGaps.reduce((a, b) => a + b, 0) / myGaps.length;

  // 시장 신호(runner_up_gap_rate): 전체 데이터 사용 (낙찰가-2등가는 내 데이터 아님).
  const runnerGaps = bids.map(calcRunnerUpGapRate).filter((x): x is number => x != null);
  const runnerUpGapRateMean =
    runnerGaps.length === 0 ? null : runnerGaps.reduce((a, b) => a + b, 0) / runnerGaps.length;

  let status: ParticipationStatus;
  let reason: string;
  if (sampleCount >= MIN_FOR_RECOMMEND) {
    status = "recommended";
    reason = `유효 데이터 ${sampleCount}건. 참고 구간 신뢰도 양호.`;
  } else if (sampleCount >= MIN_FOR_CONDITIONAL) {
    status = "conditional";
    reason = `유효 데이터 ${sampleCount}건으로 적습니다. 참고 수준으로만 활용하세요.`;
  } else {
    status = "not_recommended";
    reason = `유효 데이터가 ${sampleCount}건뿐입니다. 분석에 부족합니다 (최소 ${MIN_FOR_CONDITIONAL}건 필요).`;
  }

  return {
    status,
    reason,
    range,
    weightedMean,
    sampleCount,
    totalCount: bids.length,
    recentSampleCount: Math.min(sampleCount, RECENT_COUNT),
    myGapRateMean,
    myGapSampleCount: myGaps.length,
    runnerUpGapRateMean,
    runnerUpGapSampleCount: runnerGaps.length,
    bins,
  };
}

// v2.2 (2026-04-24): analyzeNotice, NoticeAnalysisInput, NoticeAnalysisResult,
// Risk/RiskLevel, evaluateRisks, buildSummary 전부 제거.
// 근거: 옵션 2(예측 도구) → 옵션 1(기록/복기) 전환. UI에서 이 함수들을 부르는 지점이
// 모두 사라짐. computeRecommendation은 /backtest가 여전히 쓰므로 유지.

// uniqueValues는 파일 상단에서 filters.ts로부터 재노출됨.
