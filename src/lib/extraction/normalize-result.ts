// 개찰결과 추출 결과를 BidInput-shape으로 정규화하고, 내 회사 매칭 → result_status 결정.
//
// 정의:
//   match.found && rank == 1 → "낙찰"
//   match.found && rank == 2 → "2등"
//   match.found && rank >= 3 → "순위권밖"
//   match.found == false       → "미참여"

import { type ResultStatus, type WorkType } from "@/types/bid";
import type { RawResultExtraction } from "./extract-result";

const WORK_TYPE_MAP: Record<string, WorkType> = {
  유지관리: "유지관리",
  식재: "조경식재",
  조경시설물: "조경시설물",
  기타: "기타",
};

function mapWorkType(raw: string | null): WorkType {
  if (!raw) return "기타";
  return WORK_TYPE_MAP[raw.trim()] ?? "기타";
}

function normalizeAmount(raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return null;
  return Math.round(raw);
}

function normalizeInteger(raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw) || raw < 0) return null;
  return Math.floor(raw);
}

function normalizeString(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  return t || null;
}

function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const sep = t.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (sep) return `${sep[1]}-${sep[2].padStart(2, "0")}-${sep[3].padStart(2, "0")}`;
  const ko = t.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (ko) return `${ko[1]}-${ko[2].padStart(2, "0")}-${ko[3].padStart(2, "0")}`;
  return null;
}

// 비고 컬럼에 부적격/낙찰하한선 미달 신호가 있는지 정규식으로 판정.
// 표현 다양성 대비: "낙찰하한선 미달" / "낙찰하한율 미달" / "사정율 미달" / "사정률 미달" / "부적격" / "적격심사 부적격" 등
const UNDER_THRESHOLD_PATTERN = /낙찰하한|사정\s*[율률]\s*미달|부적격/;

function isNoteUnderThreshold(note: string | null): boolean {
  if (!note) return false;
  return UNDER_THRESHOLD_PATTERN.test(note);
}

// 우선순위:
//  1) 본문에 회사 미발견 → 미참여
//  2) 비고에 부적격/낙찰하한선 미달 신호 → 낙찰하한선미달 (rank보다 우선)
//  3) rank == 1 → 낙찰
//  4) rank == 2 → 2등
//  5) 그 외(rank ≥ 3 또는 rank null but no signal) → 순위권밖
function deriveResultStatus(myMatch: RawResultExtraction["my_match"]): ResultStatus {
  if (!myMatch.found) return "미참여";
  if (isNoteUnderThreshold(myMatch.note)) return "낙찰하한선미달";
  if (myMatch.rank === 1) return "낙찰";
  if (myMatch.rank === 2) return "2등";
  return "순위권밖";
}

// BidForm prefill에 바로 매핑할 수 있도록 모든 값을 nullable한 BidInput 유사 형태로 반환.
export type ResultPrefill = {
  notice_no: string | null;
  notice_title: string | null;
  agency: string | null;
  work_type: WorkType;
  region: string | null;
  base_amount: number | null;
  estimated_price: number | null;
  bid_date: string | null;
  bid_method: string | null;
  qualification_limit: string | null; // 개찰결과 PDF에는 없음
  participant_count: number | null;
  my_bid_amount: number | null;
  winning_amount: number | null;
  second_amount: number | null;
  result_status: ResultStatus;
  note: string | null;
};

export type ResultMyMatchSummary = {
  found: boolean;
  rank: number | null;
  matchedName: string | null;
};

export type NormalizedResult = {
  prefill: ResultPrefill;
  myMatch: ResultMyMatchSummary;
};

export function normalizeResultExtraction(raw: RawResultExtraction): NormalizedResult {
  return {
    prefill: {
      notice_no: normalizeString(raw.notice_no),
      notice_title: normalizeString(raw.notice_title),
      agency: normalizeString(raw.agency),
      work_type: mapWorkType(raw.work_type),
      region: normalizeString(raw.region),
      base_amount: normalizeAmount(raw.base_amount),
      estimated_price: normalizeAmount(raw.estimated_price),
      bid_date: normalizeDate(raw.bid_date),
      bid_method: normalizeString(raw.bid_method),
      qualification_limit: null,
      participant_count: normalizeInteger(raw.participant_count),
      my_bid_amount: normalizeAmount(raw.my_match.bid_amount),
      winning_amount: normalizeAmount(raw.winning_amount),
      second_amount: normalizeAmount(raw.second_amount),
      result_status: deriveResultStatus(raw.my_match),
      // 매칭 행의 "비고" 컬럼 값(예: "낙찰하한선 미달")을 note로 자동 채움.
      // 이건 분석 시 부적격/유효 구분에 매우 중요한 신호이므로 반드시 보존.
      note: normalizeString(raw.my_match.note),
    },
    myMatch: {
      found: raw.my_match.found,
      rank: raw.my_match.rank,
      matchedName: normalizeString(raw.my_match.matched_company_name),
    },
  };
}
