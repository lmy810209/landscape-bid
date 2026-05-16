// 발주처별 예정가격-기초금액 편차 분석.
//
// public_preprices의 plnprc(예정가격) / bssamt(기초금액) - 1 로
// 과거 공고들의 예가 변동율을 계산.
//
// 활용: 실질 안전 투찰가 = 기초금액 × (목표사정율 + recommendedBuffer)
//       → 예정가격이 위로 튀더라도 미달 방지.

export type PrepricRow = {
  bid_ntce_no: string;
  bssamt: number | string | null; // 기초금액
  plnprc: number | string | null; // 예정가격 (drwt 4개 평균, 동일 공고 내 모든 행 동일값)
};

export type PriceDeviationStats = {
  sample_count: number;
  mean_deviation_pct: number | null;    // 평균 편차 (예정가/기초금액 - 1) × 100
  stddev_pct: number | null;            // 표준편차
  p25_pct: number | null;              // 하위 25% (예정가 낮게 뽑힐 때)
  p75_pct: number | null;              // 상위 75% (예정가 높게 뽑힐 때)
  max_upward_pct: number | null;        // 최대 상향 편차 (가장 위험한 케이스)
  recommended_buffer_pct: number;       // 안전 버퍼 (p75 기준, 최소 0)
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

export function computeEstimatedPriceDeviation(
  preprices: PrepricRow[],
): PriceDeviationStats {
  // 공고별 중복 제거 (plnprc, bssamt는 동일 공고 15행 전부 동일값)
  const seen = new Set<string>();
  const deviations: number[] = [];

  for (const r of preprices) {
    if (seen.has(r.bid_ntce_no)) continue;
    seen.add(r.bid_ntce_no);

    const bss = Number(r.bssamt);
    const pln = Number(r.plnprc);
    if (!bss || !pln || isNaN(bss) || isNaN(pln) || bss <= 0) continue;

    const dev = (pln / bss - 1) * 100; // % 단위
    deviations.push(dev);
  }

  if (deviations.length === 0) {
    return {
      sample_count: 0,
      mean_deviation_pct: null,
      stddev_pct: null,
      p25_pct: null,
      p75_pct: null,
      max_upward_pct: null,
      recommended_buffer_pct: 0,
    };
  }

  const sorted = [...deviations].sort((a, b) => a - b);
  const mean = deviations.reduce((a, b) => a + b, 0) / deviations.length;
  const p75 = quantile(sorted, 0.75) ?? 0;
  const maxUp = sorted[sorted.length - 1];

  return {
    sample_count: deviations.length,
    mean_deviation_pct: mean,
    stddev_pct: stddev(deviations),
    p25_pct: quantile(sorted, 0.25),
    p75_pct: p75,
    max_upward_pct: maxUp,
    // 예정가격이 기초금액보다 p75만큼 높게 뽑힐 수 있으므로
    // 투찰 목표 사정율에 이 값만큼 추가해야 안전.
    // 음수(예정가격이 낮게 뽑히는 경향)면 버퍼 불필요 → 0.
    recommended_buffer_pct: Math.max(0, p75),
  };
}
