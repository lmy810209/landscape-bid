import type { Bid } from "@/types/bid";
import { calcMyGapRate, calcRunnerUpGapRate, calcWinRatio, formatPercent } from "./calculations";

// === 정책 상수 (모든 값은 설명 가능하도록 명시) ===
export const BIN_SIZE = 0.005; // 0.5% 단위 히스토그램 bin
export const RECENT_COUNT = 3; // 최근 N건에 가중치 부여
export const RECENT_WEIGHT = 2.0; // 최근 N건의 가중치
export const BASE_WEIGHT = 1.0; // 그 외 가중치
export const RANGE_EXPAND_THRESHOLD = 0.8; // 인접 bin 흡수 기준 (최고 bin의 80% 이상)

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

export function filterBids(
  bids: Bid[],
  filters: { agency?: string | null; workType?: string | null },
): Bid[] {
  return bids.filter((b) => {
    if (filters.agency && b.agency !== filters.agency) return false;
    if (filters.workType && b.work_type !== filters.workType) return false;
    return true;
  });
}

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

export function computeRecommendation(bids: Bid[]): RecommendationResult {
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

  // my_gap_rate 평균
  const myGaps = bids.map(calcMyGapRate).filter((x): x is number => x != null);
  const myGapRateMean = myGaps.length === 0 ? null : myGaps.reduce((a, b) => a + b, 0) / myGaps.length;

  // runner_up_gap_rate 평균 (second_amount 없는 경우 null)
  const runnerGaps = bids.map(calcRunnerUpGapRate).filter((x): x is number => x != null);
  const runnerUpGapRateMean =
    runnerGaps.length === 0 ? null : runnerGaps.reduce((a, b) => a + b, 0) / runnerGaps.length;

  let status: ParticipationStatus;
  let reason: string;
  if (sampleCount >= MIN_FOR_RECOMMEND) {
    status = "recommended";
    reason = `유효 데이터 ${sampleCount}건. 추천 구간 신뢰도 양호.`;
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

// === 단건 공고 분석 ===

export type NoticeAnalysisInput = {
  agency: string;
  work_type: string;
  region: string | null;
  base_amount: number | null;
  bid_date: string | null;
  qualification_limit: string | null;
  bid_method: string | null;
  participant_count: number | null;
};

export type RiskLevel = "critical" | "warning" | "info";

export type Risk = {
  level: RiskLevel;
  label: string;
  detail: string;
};

export type NoticeAnalysisResult = RecommendationResult & {
  risks: Risk[];
  summary: string;
  matchedAgency: boolean;
  matchedWorkType: boolean;
};

export function analyzeNotice(
  input: NoticeAnalysisInput,
  allBids: Bid[],
): NoticeAnalysisResult {
  const matched = filterBids(allBids, {
    agency: input.agency || null,
    workType: input.work_type || null,
  });
  const rec = computeRecommendation(matched);

  const risks = evaluateRisks(input, rec);
  const summary = buildSummary(input, rec, risks);

  return {
    ...rec,
    risks,
    summary,
    matchedAgency: !!input.agency,
    matchedWorkType: !!input.work_type,
  };
}

function evaluateRisks(input: NoticeAnalysisInput, rec: RecommendationResult): Risk[] {
  const risks: Risk[] = [];

  // 매칭 데이터 표본 (가장 비중이 큰 리스크)
  if (rec.sampleCount <= 1) {
    risks.push({
      level: "critical",
      label: "데이터 부족",
      detail: `동일 발주처/공종 매칭 데이터가 ${rec.sampleCount}건입니다. 추천 구간 신뢰도가 매우 낮습니다.`,
    });
  } else if (rec.sampleCount < MIN_FOR_RECOMMEND) {
    risks.push({
      level: "warning",
      label: "표본 부족",
      detail: `매칭 표본이 ${rec.sampleCount}건으로 권장(${MIN_FOR_RECOMMEND}건)에 미달합니다. 참고 수준으로만 사용하세요.`,
    });
  }

  // 경쟁 강도 미반영
  if (input.participant_count == null) {
    risks.push({
      level: "warning",
      label: "경쟁 강도 반영 제한",
      detail: "참가 업체 수 미입력. 경쟁 강도 보정이 적용되지 않습니다.",
    });
  }

  // 자격 정보 누락
  if (!input.qualification_limit || !input.qualification_limit.trim()) {
    risks.push({
      level: "warning",
      label: "자격 수동 확인 필요",
      detail: "등급/면허 제한이 비어있습니다. 공고 원문에서 자격 요건을 직접 확인하세요.",
    });
  }

  // 입찰 방식 미입력 (정보성)
  if (!input.bid_method || !input.bid_method.trim()) {
    risks.push({
      level: "info",
      label: "입찰 방식 미확인",
      detail: "입찰 방식이 미입력입니다. 적격심사/종합심사 등에 따라 추천 적용 방식이 달라질 수 있습니다.",
    });
  }

  // 우선순위(critical → warning → info) 정렬 후 상위 3개
  const order: Record<RiskLevel, number> = { critical: 0, warning: 1, info: 2 };
  return risks.sort((a, b) => order[a.level] - order[b.level]).slice(0, 3);
}

function buildSummary(
  input: NoticeAnalysisInput,
  rec: RecommendationResult,
  risks: Risk[],
): string {
  const filterDesc = `발주처 "${input.agency || "전체"}" / 공종 "${input.work_type || "전체"}"`;
  const rangeStr = rec.range
    ? `${formatPercent(rec.range.low)}~${formatPercent(rec.range.high)}`
    : "도출 불가";

  const sentences: string[] = [];

  if (rec.status === "recommended" && rec.range) {
    sentences.push(
      `${filterDesc} 매칭 ${rec.sampleCount}건(최근 ${rec.recentSampleCount}건 ×${RECENT_WEIGHT.toFixed(1)} 가중) 기준, ` +
        `추천 사정율 구간은 ${rangeStr}입니다.`,
    );
  } else if (rec.status === "conditional" && rec.range) {
    sentences.push(
      `${filterDesc} 매칭이 ${rec.sampleCount}건으로 적습니다. ` +
        `참고 구간은 ${rangeStr}이며, 최종 결정 전에 추가 데이터 확인을 권장합니다.`,
    );
  } else {
    sentences.push(
      `${filterDesc} 매칭 데이터가 ${rec.sampleCount}건뿐이라 추천 구간 도출이 어렵습니다. ` +
        `유사 공고 데이터를 더 축적한 뒤 분석하세요.`,
    );
  }

  if (rec.myGapRateMean != null) {
    sentences.push(
      `과거 매칭 공고의 my_gap_rate 평균은 ${formatPercent(rec.myGapRateMean)} (${rec.myGapSampleCount}건 기준)입니다.`,
    );
  }
  if (rec.runnerUpGapRateMean != null) {
    sentences.push(
      `runner_up_gap_rate 평균은 ${formatPercent(rec.runnerUpGapRateMean)} (${rec.runnerUpGapSampleCount}건 기준) — 미세 조정 참고치.`,
    );
  }

  const critical = risks.find((r) => r.level === "critical");
  if (critical) sentences.push(`주의: ${critical.detail}`);

  return sentences.join(" ");
}

// === 공통 유틸 ===

export function uniqueValues<K extends keyof Bid>(bids: Bid[], key: K): string[] {
  const set = new Set<string>();
  for (const b of bids) {
    const v = b[key];
    if (typeof v === "string" && v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ko"));
}
