// 복수예비가격 추출값 정규화
//
// 원칙: 억지 보정 금지. 길이가 맞지 않거나 대응이 의심스러우면 null.

import type { RawPrepriceExtraction } from "./extract-preprice";

export type PrepriceFields = {
  notice_no: string | null;
  agency: string | null;
  base_amount: number | null;
  estimated_price: number | null;
  preprice_candidates: number[] | null;
  selected_numbers: number[] | null;
  selected_prices: number[] | null;
  note: string | null;
};

export const REQUIRED_SELECTED_COUNT = 4;

function normalizeString(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  return t === "" ? null : t;
}

function normalizeAmount(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return null;
  return Math.round(raw);
}

function normalizeAmountArray(raw: number[] | null | undefined): number[] | null {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return null;
  const out: number[] = [];
  for (const v of raw) {
    if (!Number.isFinite(v) || v <= 0) return null; // 불완전하면 전체 폐기
    out.push(Math.round(v));
  }
  return out;
}

function normalizeIntArray(raw: number[] | null | undefined): number[] | null {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return null;
  const out: number[] = [];
  for (const v of raw) {
    if (!Number.isFinite(v) || v < 0) return null;
    out.push(Math.floor(v));
  }
  return out;
}

// 추첨된 4개 번호/가격은 반드시 길이 4 + 짝이 맞아야 유효.
// 둘 중 하나라도 조건 불충족이면 둘 다 null.
function normalizeSelected(
  numbers: number[] | null | undefined,
  prices: number[] | null | undefined,
): { numbers: number[] | null; prices: number[] | null } {
  const nums = normalizeIntArray(numbers);
  const prs = normalizeAmountArray(prices);

  if (!nums || !prs) return { numbers: null, prices: null };
  if (nums.length !== REQUIRED_SELECTED_COUNT) return { numbers: null, prices: null };
  if (prs.length !== REQUIRED_SELECTED_COUNT) return { numbers: null, prices: null };

  return { numbers: nums, prices: prs };
}

export function normalizePrepriceExtraction(raw: RawPrepriceExtraction): PrepriceFields {
  const sel = normalizeSelected(raw.selected_numbers, raw.selected_prices);
  return {
    notice_no: normalizeString(raw.notice_no),
    agency: normalizeString(raw.agency),
    base_amount: normalizeAmount(raw.base_amount),
    estimated_price: normalizeAmount(raw.estimated_price),
    preprice_candidates: normalizeAmountArray(raw.preprice_candidates),
    selected_numbers: sel.numbers,
    selected_prices: sel.prices,
    note: normalizeString(raw.note),
  };
}
