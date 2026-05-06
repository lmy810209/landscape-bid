// 공고별 최종 판단 (④ 최종 판단 박스).
//
// 입력: marketType + aggressiveScenarios 결과
// 출력: GO/조건부/NO-GO + 가격 전략 + 한 줄 사유 + 한 줄 주의

import type { GoStatus, Strategy } from "./types";
import type { MarketTypeResult } from "./marketType";
import type { AggressiveScenariosResult } from "./aggressiveScenarios";

export type FinalJudgment = {
  go_status: GoStatus;
  strategy: Strategy;
  reason: string;
  caution: string;
};

export function judge(
  marketType: MarketTypeResult,
  aggressive: AggressiveScenariosResult,
): FinalJudgment {
  // 1순위: 보험료 감액 → 안전형 강제
  if (aggressive.insurance_deduction) {
    return {
      go_status: marketType.type === "데이터 부족" ? "조건부 GO" : "조건부 GO",
      strategy: "안전형",
      reason: "보험료 감액 적용 공고로 단순 하한율 기준 미달 위험.",
      caution: "공격형 시도 시 effective cutoff 추정 필수. 검증 데이터 부족하면 안전형 권장.",
    };
  }

  // 2순위: 강자 회피
  if (marketType.type === "강자 회피") {
    const top = marketType.reasons.strong_companies[0];
    const aggressiveAllSafe =
      aggressive.scenarios.length > 0 &&
      aggressive.scenarios.every((s) => s.risk_level !== "높음");
    return {
      go_status: aggressiveAllSafe ? "조건부 GO" : "NO-GO",
      strategy: aggressiveAllSafe ? "공격형" : "회피",
      reason: `${top?.keyword ?? "이 키워드"} 강자 ${top?.name ?? "특정 업체"} (5년 ${top?.count ?? 0}건)`,
      caution: "강자 영역. 공격형 아니면 실익 낮음.",
    };
  }

  // 3순위: 데이터 부족
  if (marketType.type === "데이터 부족") {
    return {
      go_status: "조건부 GO",
      strategy: "안전형",
      reason: `유사 공고 ${marketType.reasons.sample_size}건으로 데이터 부족.`,
      caution: "통계 신뢰도 낮음. 공고 원문 직접 검토 권장.",
    };
  }

  // 4순위: 안전형 필요
  if (marketType.type === "안전형 필요") {
    return {
      go_status: "GO",
      strategy: "안전형",
      reason: `최근 유사 공고 사정율 90%대로 형성 (중앙값 ${(marketType.reasons.agency_median ?? 0).toFixed(2)}%).`,
      caution: "공격형 시도 시 미달 위험 큼.",
    };
  }

  // 5순위: 공격형 가능
  if (marketType.type === "공격형 가능") {
    const aggressiveLowRisk =
      aggressive.scenarios.filter((s) => s.risk_level === "낮음").length >= 2;
    return {
      go_status: "GO",
      strategy: aggressiveLowRisk ? "혼합형" : "안전형",
      reason: `유사 공고 사정율 88%대 반복 (중앙값 ${(marketType.reasons.agency_median ?? 0).toFixed(2)}%).`,
      caution: "공격형 시도 가능. 단, 미달 위험 항상 동반.",
    };
  }

  // 기본
  return {
    go_status: "조건부 GO",
    strategy: "안전형",
    reason: "분류 결과 모호.",
    caution: "공고 원문 검토 필요.",
  };
}
