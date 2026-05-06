// 복수예비가격 기반 낙찰하한율 정밀 계산
//
// 목적:
// - 추첨된 4개 예비가격 평균으로 예정가격을 복원한다.
// - A값 = 예정가격 - 기초금액.
// - 낙찰하한 금액은 외부에서 규칙(rate)이 주입될 때만 계산한다.
//   공고마다 적용 룰이 다르므로 절대 자동 추정하지 않는다.
//
// 이 모듈은 "예측"이 아니다. 산술 복원만 수행하며, 입력이 불완전하면 calculable=false로 반환.

export type EstimatedPriceSource = "document" | "selected_prices_average" | "none";

export type LowerBoundInput = {
  baseAmount: number | null;
  estimatedPrice: number | null; // 문서에 직접 표기된 값 (있으면 우선)
  selectedPrices: number[] | null; // 추첨된 4개 (정규화 후)
  selectedNumbers: number[] | null;
  // 예정가격에 곱해 낙찰하한금액을 얻는 비율. 공고/계약 유형에 따라 다름.
  // 주입되지 않으면 lowerBoundAmount는 null 반환.
  lowerBoundRateRule: number | null;
};

export type LowerBoundResult = {
  calculable: boolean; // 예정가격 + A값이 복원 가능한가?
  estimatedPrice: number | null;
  estimatedPriceSource: EstimatedPriceSource;
  aValue: number | null; // estimatedPrice - baseAmount
  selectedPriceAverage: number | null; // 문서값과 대조용
  selectedNumbers: number[] | null;
  selectedPrices: number[] | null;
  lowerBoundRateRule: number | null;
  lowerBoundAmount: number | null;
  note: string; // 계산 경로 설명 (UI에 그대로 표시)
  warnings: string[];
};

export function computeLowerBound(input: LowerBoundInput): LowerBoundResult {
  const warnings: string[] = [];

  // 1) 추첨된 4개 평균 (sanity + fallback)
  const selectedPriceAverage = computeAverage(input.selectedPrices);

  // 2) 예정가격 결정: 문서 값 우선, 없으면 추첨 4개 평균으로 대체
  let estimatedPrice: number | null = null;
  let estimatedPriceSource: EstimatedPriceSource = "none";
  if (input.estimatedPrice != null && input.estimatedPrice > 0) {
    estimatedPrice = input.estimatedPrice;
    estimatedPriceSource = "document";
    if (
      selectedPriceAverage != null &&
      Math.abs(selectedPriceAverage - input.estimatedPrice) / input.estimatedPrice > 0.001
    ) {
      // 0.1% 이상 어긋나면 경고. 추첨값 오탈자 가능.
      warnings.push(
        `문서 예정가격과 추첨 4개 평균이 0.1% 이상 차이납니다. 추출값 확인이 필요합니다.`,
      );
    }
  } else if (selectedPriceAverage != null) {
    estimatedPrice = Math.round(selectedPriceAverage);
    estimatedPriceSource = "selected_prices_average";
  }

  // 3) A값
  const aValue =
    estimatedPrice != null && input.baseAmount != null && input.baseAmount > 0
      ? estimatedPrice - input.baseAmount
      : null;

  if (estimatedPrice == null) {
    warnings.push("예정가격을 복원하지 못했습니다. 예정가격 또는 추첨 4개 가격 중 하나가 필요합니다.");
  }
  if (input.baseAmount == null) {
    warnings.push("기초금액이 없어 A값을 계산할 수 없습니다.");
  }

  // 4) 낙찰하한금액 — 규칙이 주입된 경우에만
  let lowerBoundAmount: number | null = null;
  if (estimatedPrice != null && input.lowerBoundRateRule != null && input.lowerBoundRateRule > 0) {
    lowerBoundAmount = Math.round(estimatedPrice * input.lowerBoundRateRule);
  }

  const calculable = estimatedPrice != null && aValue != null;

  return {
    calculable,
    estimatedPrice,
    estimatedPriceSource,
    aValue,
    selectedPriceAverage: selectedPriceAverage != null ? Math.round(selectedPriceAverage) : null,
    selectedNumbers: input.selectedNumbers,
    selectedPrices: input.selectedPrices,
    lowerBoundRateRule: input.lowerBoundRateRule,
    lowerBoundAmount,
    note: buildNote(estimatedPriceSource, calculable, input),
    warnings,
  };
}

// === utilities ===

function computeAverage(xs: number[] | null): number | null {
  if (!xs || xs.length === 0) return null;
  const sum = xs.reduce((a, b) => a + b, 0);
  return sum / xs.length;
}

function buildNote(
  source: EstimatedPriceSource,
  calculable: boolean,
  input: LowerBoundInput,
): string {
  if (!calculable) {
    if (input.baseAmount == null) return "기초금액이 없어 A값 계산 불가. 공고 기초금액을 먼저 입력하세요.";
    return "예정가격 복원 불가. 추첨된 4개 예비가격 또는 문서 내 예정가격이 필요합니다.";
  }
  if (source === "document") return "예정가격은 문서에 직접 표기된 값을 사용했습니다.";
  if (source === "selected_prices_average") return "예정가격은 추첨된 4개 예비가격의 산술 평균으로 복원했습니다.";
  return "";
}
