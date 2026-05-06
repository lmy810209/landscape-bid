// 공통 분석 필터
//
// recommendation / strategy / backtest / analyze 화면이 공통으로 재사용한다.
// 룰 일관성을 위해 필터 조건은 반드시 이 모듈을 통해서만 적용한다.

import type { Bid, ResultStatus } from "@/types/bid";
import {
  ANALYSIS_DEFAULTS,
  INCLUDE_UNDER_THRESHOLD_IN_PERSONAL_ADJUSTMENT,
  isParticipated,
} from "@/lib/config/analysis";

export type ParticipationMode = "all" | "participated" | "not_participated";

export type FilterCriteria = {
  agency?: string | null; // 정확 일치 (사용자가 select에서 고른 경우)
  agencyKeyword?: string | null; // 부분 일치 (기본값 적용 시)
  workType?: string | null;
  participation?: ParticipationMode;
};

export type PersonalAdjustmentOptions = {
  includeUnderThreshold?: boolean;
};

// 시장 분포용 기본 필터
export function filterBids(bids: Bid[], criteria: FilterCriteria): Bid[] {
  return bids.filter((b) => {
    if (criteria.agency && b.agency !== criteria.agency) return false;
    if (criteria.agencyKeyword && !b.agency.includes(criteria.agencyKeyword)) return false;
    if (criteria.workType && b.work_type !== criteria.workType) return false;
    const mode = criteria.participation ?? "all";
    if (mode === "participated" && !isParticipated(b.result_status)) return false;
    if (mode === "not_participated" && isParticipated(b.result_status)) return false;
    return true;
  });
}

// 개인 보정 전용 필터 — 참여 데이터만
// result_status !== '미참여' 이면 참여로 간주. 옵션으로 '낙찰하한선미달' 배제 가능.
export function filterForPersonalAdjustment(
  bids: Bid[],
  opts: PersonalAdjustmentOptions = {},
): Bid[] {
  const include = opts.includeUnderThreshold ?? INCLUDE_UNDER_THRESHOLD_IN_PERSONAL_ADJUSTMENT;
  return bids.filter((b) => {
    if (!isParticipated(b.result_status)) return false;
    if (!include && b.result_status === "낙찰하한선미달") return false;
    return true;
  });
}

// 분석 페이지용 필터 해석기
//
// URL 파라미터를 읽어 분석에 쓸 FilterCriteria를 만든다.
// 규칙:
//   - scope=all → 어떤 기본값도 적용하지 않음 (사용자가 "전체 데이터"를 명시적으로 요청)
//   - agency 또는 work_type 둘 중 하나라도 지정 → 지정된 값만 사용 (기본 무시)
//   - 둘 다 비어있고 scope=all도 아니면 → config 기본값 적용
export type AnalyzeSearchParams = {
  agency?: string;
  work_type?: string;
  participation?: string;
  scope?: string;
};

export function resolveAnalysisFilter(sp: AnalyzeSearchParams): FilterCriteria {
  const participation = normalizeParticipation(sp.participation);

  if (sp.scope === "all") {
    return {
      agency: sp.agency?.trim() || null,
      workType: sp.work_type?.trim() || null,
      participation,
    };
  }

  const explicit = (sp.agency && sp.agency.trim()) || (sp.work_type && sp.work_type.trim());
  if (explicit) {
    return {
      agency: sp.agency?.trim() || null,
      workType: sp.work_type?.trim() || null,
      participation,
    };
  }

  return {
    agencyKeyword: ANALYSIS_DEFAULTS.agencyKeyword,
    workType: ANALYSIS_DEFAULTS.workType,
    participation,
  };
}

export function normalizeParticipation(v?: string): ParticipationMode {
  if (v === "participated" || v === "not_participated") return v;
  return "all";
}

// UI 표시용 한 줄 설명
export function describeFilter(criteria: FilterCriteria): string {
  const parts: string[] = [];
  if (criteria.agency) parts.push(criteria.agency);
  else if (criteria.agencyKeyword) parts.push(`"${criteria.agencyKeyword}" 포함`);
  else parts.push("전체 발주처");

  if (criteria.workType) parts.push(criteria.workType);
  else parts.push("전체 공종");

  const pLabel: Record<ParticipationMode, string> = {
    all: "전체 참여여부",
    participated: "참여만",
    not_participated: "미참여만",
  };
  parts.push(pLabel[criteria.participation ?? "all"]);

  return parts.join(" / ");
}

// 기본값이 적용 중인지 (UI 배지용)
export function isDefaultApplied(criteria: FilterCriteria): boolean {
  return !!criteria.agencyKeyword;
}

// 참여 여부 단일 판정 (외부에서 쓸 때 편의용 재노출)
export { isParticipated };

// 빈 Bid 필드에서 유니크 값 추출 (기존 recommendation.ts에서 이동)
export function uniqueValues<K extends keyof Bid>(bids: Bid[], key: K): string[] {
  const set = new Set<string>();
  for (const b of bids) {
    const v = b[key];
    if (typeof v === "string" && v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ko"));
}

// 참여 상태 집합 (UI에서 옵션 생성용)
export const PARTICIPATION_OPTIONS: { value: ParticipationMode; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "participated", label: "참여" },
  { value: "not_participated", label: "미참여" },
];

// 타입 재노출 편의
export type { ResultStatus };
