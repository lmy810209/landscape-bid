import { WORK_TYPES, type WorkType } from "@/types/bid";
import type { RawExtraction } from "./extract";

// Gemini는 [유지관리, 식재, 조경시설물, 기타] 4종 분류로 응답하고, 여기서 기존 WORK_TYPES로 매핑한다.
// 이렇게 분리해야 추출 모델 프롬프트(분류 안정성)와 DB 스키마(기존 선택값) 둘 다 깨지 않는다.
const WORK_TYPE_MAP: Record<string, WorkType> = {
  유지관리: "유지관리",
  식재: "조경식재",
  조경시설물: "조경시설물",
  기타: "기타",
};

export type ExtractedFields = {
  title: string | null;
  agency: string | null;
  work_type: WorkType | null;
  region: string | null;
  base_amount: number | null;
  bid_date: string | null; // YYYY-MM-DD
  participant_count: number | null;
  qualification_limit: string | null;
  bid_method: string | null;
  estimated_price: number | null;
  note: string | null;
};

function mapWorkType(raw: string | null | undefined): WorkType | null {
  if (!raw) return null;
  const mapped = WORK_TYPE_MAP[raw.trim()];
  if (mapped) return mapped;
  // 알 수 없는 값이 들어오면 폴백: 기존 WORK_TYPES에 직접 매칭되는 경우 그대로
  if ((WORK_TYPES as readonly string[]).includes(raw.trim())) {
    return raw.trim() as WorkType;
  }
  return "기타";
}

function normalizeAmount(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return null;
  return Math.round(raw);
}

function normalizeInteger(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw) || raw < 0) return null;
  return Math.floor(raw);
}

function normalizeString(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  return t === "" ? null : t;
}

// Claude는 "YYYY-MM-DD"를 요청받지만 다른 포맷이 섞여 들어올 수 있어 방어적으로 정규화한다.
function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;

  // ISO 정확 매치 (시각 부분이 붙어있어도 날짜만 추출)
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // YYYY.M.D / YYYY/M/D / YYYY-M-D
  const sep = t.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (sep) return `${sep[1]}-${sep[2].padStart(2, "0")}-${sep[3].padStart(2, "0")}`;

  // 한국어: 2026년 4월 23일
  const ko = t.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (ko) return `${ko[1]}-${ko[2].padStart(2, "0")}-${ko[3].padStart(2, "0")}`;

  return null;
}

export function normalizeExtraction(raw: RawExtraction): ExtractedFields {
  return {
    title: normalizeString(raw.title),
    agency: normalizeString(raw.agency),
    work_type: mapWorkType(raw.work_type),
    region: normalizeString(raw.region),
    base_amount: normalizeAmount(raw.base_amount),
    bid_date: normalizeDate(raw.bid_date),
    participant_count: normalizeInteger(raw.participant_count),
    qualification_limit: normalizeString(raw.qualification_limit),
    bid_method: normalizeString(raw.bid_method),
    estimated_price: normalizeAmount(raw.estimated_price),
    note: normalizeString(raw.note),
  };
}
