// 입찰공고정보서비스에서 최근 등록된 공사 입찰공고 조회.
// API 단일 호출 1 calendar month 제약. 30일은 1 호출로 가능.
// 결과는 30분 메모리 캐시 (data.go.kr 응답이 70초+ 걸림).

const BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";
const TTL_MS = 30 * 60 * 1000;
const g = globalThis as unknown as { __recentCnstwkCache?: Map<number, { data: RecentNoticeRaw[]; expiresAt: number }> };
if (!g.__recentCnstwkCache) g.__recentCnstwkCache = new Map();

export type RecentNoticeRaw = {
  bidNtceNo: string;
  bidNtceOrd: string;
  bidNtceNm: string;
  bidNtceDt: string;
  ntceInsttNm: string;
  dminsttNm: string;
  bdgtAmt: string;
  presmptPrce: string;
  bidClseDt: string;
  opengDt: string;
  cnstrtsiteRgnNm: string;
  mainCnsttyNm: string;
  prtcptLmtRgnNm?: string;
  cnstrtnAbltyEvlAmtList?: string;
  sucsfbidLwltRate: string;
  sucsfbidMthdNm: string;
  rgstDt: string;
  bidNtceUrl: string;
};

function fmtDate(d: Date, suffix: string) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}${suffix}`;
}

export async function fetchRecentCnstwk(daysBack: number): Promise<RecentNoticeRaw[]> {
  // 30분 캐시
  const now = Date.now();
  const cached = g.__recentCnstwkCache!.get(daysBack);
  if (cached && cached.expiresAt > now) return cached.data;

  const apiKeyEnv = process.env.NARA_API_KEY;
  if (!apiKeyEnv) throw new Error("NARA_API_KEY 미설정");
  const apiKey: string = apiKeyEnv;

  const end = new Date();
  const start = new Date(end.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const inqryBgnDt = fmtDate(start, "0000");
  const inqryEndDt = fmtDate(end, "2359");

  // 1페이지 먼저 호출해서 totalCount 확인 → 나머지 페이지 병렬 호출
  async function fetchPage(page: number, numOfRows: number) {
    const qs = new URLSearchParams({
      ServiceKey: apiKey,
      type: "json",
      inqryDiv: "1",
      inqryBgnDt,
      inqryEndDt,
      pageNo: String(page),
      numOfRows: String(numOfRows),
    });
    const res = await fetch(`${BASE}/getBidPblancListInfoCnstwk?${qs.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const header = json?.response?.header ?? json?.["nkoneps.com.response.ResponseError"]?.header;
    if (header?.resultCode !== "00") {
      throw new Error(`API ${header?.resultCode} ${header?.resultMsg}`);
    }
    const body = json.response.body;
    const items = body?.items ?? [];
    const arr = Array.isArray(items)
      ? items
      : items?.item
        ? Array.isArray(items.item)
          ? items.item
          : [items.item]
        : [];
    return { items: arr as RecentNoticeRaw[], total: Number(body.totalCount) };
  }

  const PER_PAGE = 999;
  const first = await fetchPage(1, PER_PAGE);
  const all: RecentNoticeRaw[] = [...first.items];
  if (first.total > all.length) {
    const totalPages = Math.ceil(first.total / PER_PAGE);
    // 2~N 페이지 병렬 (429 대비 동시성 5로 제한)
    const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    const CONCURRENCY = 5;
    for (let i = 0; i < pages.length; i += CONCURRENCY) {
      const batch = pages.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map((p) => fetchPage(p, PER_PAGE)));
      for (const r of results) all.push(...r.items);
    }
  }
  g.__recentCnstwkCache!.set(daysBack, { data: all, expiresAt: now + TTL_MS });
  return all;
}
