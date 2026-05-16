// 공고별 최종 판단 (④ 최종 판단 박스).
//
// 입력: marketType + aggressiveScenarios 결과
// 출력: GO/조건부/NO-GO + 가격 전략 + 한 줄 사유 + 한 줄 주의

import type { GoStatus, Strategy } from "./types";
import type { MarketTypeResult } from "./marketType";
import type { AggressiveScenariosResult, QualificationFloor } from "./aggressiveScenarios";

export type FinalJudgment = {
  go_status: GoStatus;
  strategy: Strategy;
  reason: string;
  caution: string;
  warnings: string[]; // 최고 우선순위 경고 (순공사비 하한 등)
};

export function judge(
  marketType: MarketTypeResult,
  aggressive: AggressiveScenariosResult,
  qualFloor: QualificationFloor | null = null,
): FinalJudgment {
  // 0순위: 순공사비 부적격 하한 — 어떤 룰보다 먼저 처리
  const warnings: string[] = [];
  if (qualFloor && aggressive.scenarios.some((s) => s.floor_capped)) {
    warnings.push(
      `⚠ 순공사비 부적격 제한선 미달 위험 — 시뮬레이션 금액이 순공사비 ${qualFloor.purcost_floor_pct}% 기준선(${Math.ceil(qualFloor.floor_price).toLocaleString()}원)에 걸려 올림 처리됨.`,
    );
  }
  // 순공사비 하한 발동 시 go_status 강제 하향 (GO → 조건부 GO)
  const floorTriggered = warnings.length > 0;

  // 1순위: 보험료 감액 → 안전형 강제
  if (aggressive.insurance_deduction) {
    const cutoff = aggressive.effective_cutoff_estimate ?? 90.20;
    return {
      go_status: "조건부 GO",
      strategy: "안전형",
      reason: `보험료 감액 공고 — 실측 미달선 ${cutoff.toFixed(2)}%. 89.745% 기준 투찰 시 미달 위험 매우 높음.`,
      caution: "90%대 이상 사정율 필수. 88%대 공격형 시도 금지.",
      warnings,
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
      warnings,
    };
  }

  // 3순위: 데이터 부족
  if (marketType.type === "데이터 부족") {
    return {
      go_status: "조건부 GO",
      strategy: "안전형",
      reason: `유사 공고 ${marketType.reasons.sample_size}건으로 데이터 부족.`,
      caution: "통계 신뢰도 낮음. 공고 원문 직접 검토 권장.",
      warnings,
    };
  }

  // 4순위: 안전형 필요
  if (marketType.type === "안전형 필요") {
    return {
      go_status: floorTriggered ? "조건부 GO" : "GO",
      strategy: "안전형",
      reason: `최근 유사 공고 사정율 90%대로 형성 (중앙값 ${(marketType.reasons.agency_median ?? 0).toFixed(2)}%).`,
      caution: "공격형 시도 시 미달 위험 큼.",
      warnings,
    };
  }

  // 5순위: 공격형 안전권
  if (marketType.type === "공격형 안전권") {
    const c = marketType.reasons.cutoff;
    const missRisk = c?.miss_risk_at_88_5 ?? 0.5;
    return {
      go_status: floorTriggered ? "조건부 GO" : "GO",
      strategy: "공격형",
      reason: `참고 시나리오 — 유사 공고 ${c?.matched_notices ?? 0}건 중 정상 진입 cutoff 중앙값 ${(c?.per_notice_median ?? 0).toFixed(2)}%. 88.5% 시도 시 미달 위험 추정 ${(missRisk * 100).toFixed(0)}%.`,
      caution: "낙찰 가능 X / 시도 참고 O. 공고별 차이 있어 미달 위험은 항상 동반.",
      warnings,
    };
  }

  // 6순위: 공격형 가능
  if (marketType.type === "공격형 가능") {
    const aggressiveLowRisk =
      aggressive.scenarios.filter((s) => s.risk_level === "낮음").length >= 2;
    return {
      go_status: floorTriggered ? "조건부 GO" : "GO",
      strategy: aggressiveLowRisk ? "혼합형" : "안전형",
      reason: `유사 공고 사정율 88%대 반복 (중앙값 ${(marketType.reasons.agency_median ?? 0).toFixed(2)}%).`,
      caution: "공격형 시도 가능. 단, 미달 위험 항상 동반.",
      warnings,
    };
  }

  return {
    go_status: "조건부 GO",
    strategy: "안전형",
    reason: "분류 결과 모호.",
    caution: "공고 원문 검토 필요.",
    warnings,
  };
}
