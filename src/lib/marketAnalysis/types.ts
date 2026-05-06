// 시장 분석 공통 타입.

export type PublicWin = {
  bidwinnr_bizno: string | null;
  bidwinnr_nm: string | null;
  bid_ntce_nm: string | null;
  dminstt_nm: string | null;
  sucsfbid_amt: number | null;
  sucsfbid_rate: number | null;
  rl_openg_dt: string | null;
  is_ansan: boolean;
  is_bangje: boolean;
};

export type NoticeContext = {
  notice_no: string;
  notice_title: string;
  agency: string;
  base_amount: number;
  sucsfbid_lwlt_rate: number;
  bid_method: string | null;
};

export type MarketType = "공격형 가능" | "안전형 필요" | "강자 회피" | "데이터 부족";
export type Strategy = "안전형" | "혼합형" | "공격형" | "회피";
export type GoStatus = "GO" | "조건부 GO" | "NO-GO";

export const KEYWORD_STRONG_THRESHOLD_COUNT = 5;
export const KEYWORD_STRONG_THRESHOLD_RATIO = 0.1;

export const MARKET_TYPE_THRESHOLDS = {
  AGGRESSIVE_MAX_MEDIAN: 89.0,
  SAFE_MIN_MEDIAN: 89.8,
  RECENT_AGGRESSIVE_COUNT: 3,
  RECENT_AGGRESSIVE_THRESHOLD: 89.0,
  RECENT_SAFE_COUNT: 3,
  RECENT_SAFE_THRESHOLD: 90.0,
  MIN_SAMPLE_SIZE: 5,
};

export function detectInsuranceDeduction(bidMethod: string | null): boolean {
  if (!bidMethod) return false;
  const hasSmall = bidMethod.includes("소액수의견적");
  const hasDeduction =
    bidMethod.includes("국민연금") ||
    bidMethod.includes("보험료") ||
    bidMethod.includes("감액") ||
    bidMethod.includes("합산액");
  return hasSmall && hasDeduction;
}

// 키워드 매칭 (단일 키워드 추출)
export const ANALYSIS_KEYWORDS = [
  "전정",
  "유지관리",
  "공원",
  "보수",
  "민원",
  "예초",
  "교체",
  "풀깎기",
  "식재",
  "시설",
  "정비",
  "조성",
];

export function extractKeywords(noticeName: string): string[] {
  return ANALYSIS_KEYWORDS.filter((k) => noticeName.includes(k));
}
