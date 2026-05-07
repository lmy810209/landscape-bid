// data/notice-methods.json 캐시 로더.
// 공고별 sucsfbidMthdNm + 보험료 감액 적용 여부 제공.
//
// 서버 전용. 빌드 시 1회 로드 후 메모리 캐시.

import fs from "node:fs";
import path from "node:path";

let _cache: Record<string, NoticeMethodInfo> | null = null;

export type NoticeMethodInfo = {
  sucsfbid_method: string | null;
  bid_method: string | null;
  sucsfbid_lwlt_rate: string | null;
};

export function loadNoticeMethods(): Record<string, NoticeMethodInfo> {
  if (_cache) return _cache;
  try {
    const p = path.join(process.cwd(), "data", "notice-methods.json");
    const raw = fs.readFileSync(p, "utf8");
    _cache = JSON.parse(raw);
    return _cache!;
  } catch {
    _cache = {};
    return _cache;
  }
}

export function isInsuranceNotice(bidNtceNo: string): boolean {
  const cache = loadNoticeMethods();
  const m = cache[bidNtceNo]?.sucsfbid_method;
  if (!m) return false;
  return (
    m.includes("소액수의견적") &&
    (m.includes("국민연금") || m.includes("감액") || m.includes("보험료") || m.includes("합산액"))
  );
}

// 발주처별 일반/감액 비율 집계 (한 번만 계산해서 캐시)
let _agencyRatioCache: Record<string, AgencyRatio> | null = null;

export type AgencyRatio = {
  total: number;
  insurance: number;
  normal: number;
  normal_ratio: number; // 0~1
};

export function getAgencyRatios(noticeIdToAgency: Record<string, string>): Record<string, AgencyRatio> {
  if (_agencyRatioCache) return _agencyRatioCache;
  const cache = loadNoticeMethods();
  const result: Record<string, AgencyRatio> = {};
  for (const [noticeId, agency] of Object.entries(noticeIdToAgency)) {
    if (!agency) continue;
    if (!result[agency]) result[agency] = { total: 0, insurance: 0, normal: 0, normal_ratio: 0 };
    result[agency].total++;
    if (isInsuranceNotice(noticeId)) result[agency].insurance++;
    else result[agency].normal++;
  }
  for (const a of Object.values(result)) {
    a.normal_ratio = a.total > 0 ? a.normal / a.total : 0;
  }
  _agencyRatioCache = result;
  return result;
}
