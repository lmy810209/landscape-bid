// 분석 기본값 설정
//
// 앱 전반의 "분석 대상 범위"를 하드코딩하지 않고 여기서 관리한다.
// 회사/지역이 바뀌면 이 파일만 수정하면 된다.
//
// 기본값은 분석 페이지(/, /analyze, /backtest)에만 적용된다.
// /bids 목록 페이지는 전체 기록 확인용이므로 기본 필터를 걸지 않는다.

import type { ResultStatus } from "@/types/bid";

export const ANALYSIS_DEFAULTS = {
  // 발주처 부분 일치 키워드 (예: "안산" → "경기도 안산시 단원구" 등 매칭)
  agencyKeyword: "안산",
  // 공종 정확 일치
  workType: "유지관리",
} as const;

// 참여 정의 — result_status !== '미참여' 이면 참여로 간주
// 유찰도 기술적으로 '미참여'가 아니므로 여기 포함. 필요 시 isParticipated 함수를 오버라이드.
export const PARTICIPATED_STATUSES: readonly ResultStatus[] = [
  "낙찰",
  "2등",
  "순위권밖",
  "낙찰하한선미달",
  "유찰",
];

// 개인 보정 시 '낙찰하한선미달' 포함 여부.
// 기본 true — 내 투찰가는 실재하므로 gap_rate 평균에 반영됨.
// 추후 실험을 위해 false로 꺼서 재계산할 수 있도록 옵션으로 열어둠.
export const INCLUDE_UNDER_THRESHOLD_IN_PERSONAL_ADJUSTMENT = true;

export function isParticipated(status: ResultStatus): boolean {
  return status !== "미참여";
}
