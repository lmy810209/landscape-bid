// 투찰 전략 3종 계산기 (공격형 / 균형형 / 보수형)
//
// 원칙:
// - 단일 정답값 예측 금지. 추천 구간 안에서의 "위치 옵션"만 제시.
// - 모든 보정값은 설명 가능한 상수로 명시.
// - 추천 구간을 절대 벗어나지 않음 (clamp).
//
// 라벨 정의 (실무 직관 기준):
//   하단 = 공격형 (더 낮게 → 1등 적극 노림)
//   중앙 = 균형형
//   상단 = 보수형 (과도한 저가 회피)

// === 정책 상수 ===

// 표본 수에 따른 위치 비율. 표본 적을수록 좁게, 많을수록 점진적으로 벌림.
// 2026-04 재튜닝:
//   v1(초기): scarce 0.40/0.50/0.60, moderate 0.35/0.50/0.65, rich 0.30/0.50/0.70
//   v2(중앙집중): scarce 0.45/0.50/0.55, moderate 0.42/0.50/0.58, rich 0.40/0.50/0.60
//     → 보수형 방어 상실(부적격 회피율 0%)로 폐기
//   v3(현재): 공격형은 v2 근처로 유지(중앙 근처), 보수형은 v1보다 더 상향해 하한선 방어 강화.
const POSITION_RATIOS = {
  scarce: { aggressive: 0.42, balanced: 0.5, conservative: 0.68 }, // sample <= 4
  moderate: { aggressive: 0.38, balanced: 0.5, conservative: 0.7 }, // 5 ~ 9
  rich: { aggressive: 0.35, balanced: 0.5, conservative: 0.72 }, // >= 10
} as const;

// my_gap_rate 보정 강도: 과거 평균 차이의 30%, 단 ±0.0003 이내.
const GAP_ADJUSTMENT_FACTOR = 0.3;
const GAP_ADJUSTMENT_CAP = 0.0003;

// 경쟁 강도 보정 (균형형만 미세 하향).
const COMPETITION_TIERS = [
  { min: 150, shift: -0.0003 },
  { min: 100, shift: -0.0002 },
  { min: 50, shift: -0.0001 },
] as const;

// === 타입 ===

export type StrategyOption = {
  rate: number; // 사정율 (소수, 예: 0.8745)
  bidAmount: number | null; // 예상 투찰금액 (원, 정수)
  label: "공격형" | "균형형" | "보수형";
  description: string;
};

export type BidStrategies = {
  aggressive: StrategyOption;
  balanced: StrategyOption;
  conservative: StrategyOption;
  meta: {
    low: number;
    high: number;
    width: number;
    sampleCount: number;
    participantCount: number | null;
    gapAdjustmentApplied: number; // 모든 전략에 동일 적용된 미세 보정
    competitionAdjustmentApplied: number; // 균형형에만 적용된 경쟁 보정
  };
};

export type StrategyInput = {
  range: { low: number; high: number };
  baseAmount: number | null;
  sampleCount: number;
  myGapRateMean: number | null;
  participantCount: number | null;
};

const DESCRIPTIONS = {
  aggressive:
    "참고 구간 하단 쪽에 배치한 위치 옵션입니다. 더 낮은 위치를 선택해 1등 가능성을 적극적으로 노리는 참고값입니다.",
  balanced:
    "참고 구간의 중심값을 기준으로 한 기본 위치 옵션입니다. 과도한 치우침 없이 가장 일반적으로 검토할 수 있는 참고값입니다.",
  conservative:
    "참고 구간 상단 쪽에 배치한 위치 옵션입니다. 과도한 저가를 피하고 비교적 안정적으로 접근하는 참고값입니다.",
} as const;

// === 내부 유틸 ===

function getRatios(sampleCount: number) {
  if (sampleCount <= 4) return POSITION_RATIOS.scarce;
  if (sampleCount <= 9) return POSITION_RATIOS.moderate;
  return POSITION_RATIOS.rich;
}

function getCompetitionShift(participantCount: number | null): number {
  if (participantCount == null) return 0;
  for (const tier of COMPETITION_TIERS) {
    if (participantCount >= tier.min) return tier.shift;
  }
  return 0;
}

// my_gap_rate 정의: (낙찰가 - 내 투찰가) / 기초금액
//   gap > 0 → 과거에 내가 낙찰가보다 더 낮게 씀 → 다음엔 상향(+) 보정
//   gap < 0 → 과거에 내가 낙찰가보다 더 높게 씀 → 다음엔 하향(-) 보정
function getGapAdjustment(myGapRateMean: number | null): number {
  if (myGapRateMean == null || !Number.isFinite(myGapRateMean) || myGapRateMean === 0) {
    return 0;
  }
  const sign = myGapRateMean > 0 ? 1 : -1;
  const magnitude = Math.min(Math.abs(myGapRateMean) * GAP_ADJUSTMENT_FACTOR, GAP_ADJUSTMENT_CAP);
  return sign * magnitude;
}

function clampToRange(rate: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, rate));
}

function computeBidAmount(rate: number, baseAmount: number | null): number | null {
  if (baseAmount == null || !Number.isFinite(baseAmount) || baseAmount <= 0) return null;
  return Math.round(baseAmount * rate);
}

// === 메인 ===

export function calculateBidStrategies(input: StrategyInput): BidStrategies {
  const { range, baseAmount, sampleCount, myGapRateMean, participantCount } = input;
  const { low, high } = range;
  const width = high - low;

  const ratios = getRatios(sampleCount);
  const gapShift = getGapAdjustment(myGapRateMean);
  const compShift = getCompetitionShift(participantCount);

  // 1) 기본 위치 + 공통 보정(gapShift) + 균형형만 추가 보정(compShift)
  const aggressiveRaw = low + width * ratios.aggressive + gapShift;
  const balancedRaw = low + width * ratios.balanced + gapShift + compShift;
  const conservativeRaw = low + width * ratios.conservative + gapShift;

  // 2) 추천 구간 밖으로 절대 못 나감
  const aggressiveRate = clampToRange(aggressiveRaw, low, high);
  const balancedRate = clampToRange(balancedRaw, low, high);
  const conservativeRate = clampToRange(conservativeRaw, low, high);

  return {
    aggressive: {
      rate: aggressiveRate,
      bidAmount: computeBidAmount(aggressiveRate, baseAmount),
      label: "공격형",
      description: DESCRIPTIONS.aggressive,
    },
    balanced: {
      rate: balancedRate,
      bidAmount: computeBidAmount(balancedRate, baseAmount),
      label: "균형형",
      description: DESCRIPTIONS.balanced,
    },
    conservative: {
      rate: conservativeRate,
      bidAmount: computeBidAmount(conservativeRate, baseAmount),
      label: "보수형",
      description: DESCRIPTIONS.conservative,
    },
    meta: {
      low,
      high,
      width,
      sampleCount,
      participantCount,
      gapAdjustmentApplied: gapShift,
      competitionAdjustmentApplied: compShift,
    },
  };
}
