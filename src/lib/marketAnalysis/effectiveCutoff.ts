// 매칭 공고들의 op13 정상 참여자 데이터로 effective cutoff + 분포 추정.
//
// "정상 진입자 최저 사정율" = 그 공고에서 부적격 안 당하고 들어간 가장 공격적 사정율.
// 매칭 공고 여러 개의 분포를 합치면 본인이 어느 정도까지 공격해도 안전한지 추정.

export type ParticipantRow = {
  bid_ntce_no: string;
  prcbdr_bizno: string | null;
  bidprcrt: number | string | null;
  rmrk: string | null;
};

export type CutoffEstimate = {
  matched_notices: number;
  participants_count: number;
  min_rate: number | null;       // 정상 진입 최저 (개별 공고 cutoff)
  p10_rate: number | null;       // 매우 공격적 진입 위치
  p25_rate: number | null;
  p50_rate: number | null;
  p75_rate: number | null;
  // 공고별 cutoff 분포 (= 각 공고 min)
  per_notice_cutoffs: number[];
  per_notice_min: number | null;
  per_notice_p25: number | null;
  per_notice_median: number | null;
  // 공고별 cutoff 안정성 지표
  cutoff_stddev: number | null;  // 표준편차 — 작을수록 cutoff가 안정적
  cutoff_p75: number | null;     // 75분위 — 보수적 cutoff 기준
  cutoff_p90: number | null;     // 90분위 — 매우 보수적 cutoff 기준
  // 본인이 88.5% 진입했을 때 미달 비율 추정 (per-notice cutoff > 88.5% 인 공고 비율)
  miss_risk_at_88_5: number | null;
  miss_risk_at_88_0: number | null;
  miss_risk_at_89_0: number | null;
};

function stddev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function quantile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.min(Math.floor(sorted.length * p), sorted.length - 1)];
}

export function estimateEffectiveCutoff(
  matchedNoticeIds: string[],
  participants: ParticipantRow[],
): CutoffEstimate {
  const idSet = new Set(matchedNoticeIds);
  const relevant = participants.filter(
    (p) => p.rmrk === "정상" && p.bid_ntce_no && idSet.has(p.bid_ntce_no),
  );
  const rates = relevant
    .map((p) => Number(p.bidprcrt))
    .filter((r) => !isNaN(r) && r > 0)
    .sort((a, b) => a - b);

  // 공고별 cutoff (per_notice min)
  const byNotice: Record<string, number[]> = {};
  for (const p of relevant) {
    const r = Number(p.bidprcrt);
    if (isNaN(r) || r <= 0) continue;
    if (!byNotice[p.bid_ntce_no]) byNotice[p.bid_ntce_no] = [];
    byNotice[p.bid_ntce_no].push(r);
  }
  const perNoticeCutoffs = Object.values(byNotice)
    .map((arr) => Math.min(...arr))
    .sort((a, b) => a - b);

  function missRiskAt(threshold: number): number | null {
    if (perNoticeCutoffs.length === 0) return null;
    const above = perNoticeCutoffs.filter((c) => c > threshold).length;
    return above / perNoticeCutoffs.length;
  }

  return {
    matched_notices: matchedNoticeIds.length,
    participants_count: rates.length,
    min_rate: rates[0] ?? null,
    p10_rate: quantile(rates, 0.1),
    p25_rate: quantile(rates, 0.25),
    p50_rate: quantile(rates, 0.5),
    p75_rate: quantile(rates, 0.75),
    per_notice_cutoffs: perNoticeCutoffs,
    per_notice_min: perNoticeCutoffs[0] ?? null,
    per_notice_p25: quantile(perNoticeCutoffs, 0.25),
    per_notice_median: quantile(perNoticeCutoffs, 0.5),
    cutoff_stddev: stddev(perNoticeCutoffs),
    cutoff_p75: quantile(perNoticeCutoffs, 0.75),
    cutoff_p90: quantile(perNoticeCutoffs, 0.9),
    miss_risk_at_88_5: missRiskAt(88.5),
    miss_risk_at_88_0: missRiskAt(88.0),
    miss_risk_at_89_0: missRiskAt(89.0),
  };
}

// "공격형 안전권" 판정
// 새빛이 88.5% 사정율로 시도해도 미달 위험이 낮은 영역.
export function isSurvivableAggressive(c: CutoffEstimate): boolean {
  if (c.matched_notices < 5) return false;
  if (c.miss_risk_at_88_5 == null) return false;
  // 매칭 공고의 50% 이상이 88.5% 이하 cutoff = 88.5% 시도해도 절반은 정상
  return c.miss_risk_at_88_5 <= 0.5 && (c.per_notice_median ?? 100) <= 88.5;
}
