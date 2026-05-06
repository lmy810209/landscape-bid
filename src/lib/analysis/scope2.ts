// 스코프 2 안산 비방제 풀 집계 함수.

import type { PublicParticipant, PublicWin } from "@/types/scope2";

export type CompetitorSummary = {
  bizno: string;
  name: string;
  wins: number;
  rateMedian: number;
  rateMean: number;
  rateMin: number;
  rateMax: number;
  rateP25: number;
  rateP75: number;
  topAgencies: { agency: string; count: number }[];
  yearCounts: Record<string, number>;
};

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function summarizeCompetitors(wins: PublicWin[]): CompetitorSummary[] {
  const byBizno = new Map<string, PublicWin[]>();
  for (const w of wins) {
    const k = w.bidwinnr_bizno;
    if (!k) continue;
    if (!byBizno.has(k)) byBizno.set(k, []);
    byBizno.get(k)!.push(w);
  }

  const out: CompetitorSummary[] = [];
  for (const [bizno, items] of byBizno.entries()) {
    const rates = items
      .map((x) => Number(x.sucsfbid_rate))
      .filter((x) => !Number.isNaN(x) && x > 0)
      .sort((a, b) => a - b);
    if (rates.length === 0) continue;

    const agencies = new Map<string, number>();
    const years = new Map<string, number>();
    for (const it of items) {
      if (it.dminstt_nm) agencies.set(it.dminstt_nm, (agencies.get(it.dminstt_nm) ?? 0) + 1);
      const y = (it.rl_openg_dt ?? "").slice(0, 4);
      if (y) years.set(y, (years.get(y) ?? 0) + 1);
    }
    const topAgencies = [...agencies.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([agency, count]) => ({ agency, count }));

    const yearCounts: Record<string, number> = {};
    for (const [y, n] of years.entries()) yearCounts[y] = n;

    out.push({
      bizno,
      name: items[0].bidwinnr_nm ?? bizno,
      wins: items.length,
      rateMedian: quantile(rates, 0.5),
      rateMean: rates.reduce((s, x) => s + x, 0) / rates.length,
      rateMin: rates[0],
      rateMax: rates[rates.length - 1],
      rateP25: quantile(rates, 0.25),
      rateP75: quantile(rates, 0.75),
      topAgencies,
      yearCounts,
    });
  }

  out.sort((a, b) => b.wins - a.wins);
  return out;
}

export type RateHistogramBin = {
  rangeStart: number;
  rangeEnd: number;
  count: number;
};

// 0.5%p 단위 히스토그램 (예: 87.0~87.5, 87.5~88.0, ...)
export function buildRateHistogram(rates: number[], binSize = 0.5): RateHistogramBin[] {
  if (rates.length === 0) return [];
  const min = Math.floor(Math.min(...rates) / binSize) * binSize;
  const max = Math.ceil(Math.max(...rates) / binSize) * binSize;
  const bins: RateHistogramBin[] = [];
  for (let s = min; s < max; s += binSize) {
    bins.push({ rangeStart: s, rangeEnd: s + binSize, count: 0 });
  }
  for (const r of rates) {
    const idx = Math.min(bins.length - 1, Math.floor((r - min) / binSize));
    if (idx >= 0) bins[idx].count++;
  }
  return bins;
}

// 이중 봉우리 분류 임계값. 89.0~89.5%는 갭(거의 없음).
// → 공격형 = rate < 89.0, 안전형 = rate ≥ 89.5
export const AGGRESSIVE_MAX = 89.0;
export const SAFE_MIN = 89.5;

// 도메인 키워드 — 공고명에서 자주 등장하는 의미 있는 단어들.
// 본인이 자주 보는 분야 + 분포 차이 가능성 있는 단어 우선 선정.
export const DOMAIN_KEYWORDS = [
  "민원처리",
  "가로수",
  "전정",
  "수목",
  "녹지",
  "정비",
  "조성",
  "교체",
  "관리",
  "잔디",
  "꽃",
  "어린이공원",
  "공원",
  "보식",
  "유지관리",
  "보도",
  "도로",
  "포장",
  "사면",
  "시설물",
];

// 본인이 진입 안 한 공고 분석.
// missedWins = wins 중 본인 bizno로 정상 참여한 적 없는 공고들.
// 안전형 키워드 비중이 높은데 안 들어간 공고를 찾는 게 핵심.
export type MissedClassification = {
  poolType: PoolType;
  safePct: number;       // 매칭된 키워드의 안전 % 가중 평균
  matchedKeywords: string[];
};

export function classifyNoticeByKeywords(
  noticeName: string,
  keywordSummaries: KeywordSummary[],
): MissedClassification {
  const matched = keywordSummaries.filter((k) => noticeName.includes(k.keyword));
  if (matched.length === 0) {
    return { poolType: "데이터부족", safePct: 0, matchedKeywords: [] };
  }
  let totalWeight = 0;
  let safeWeighted = 0;
  let aggressiveWeighted = 0;
  for (const k of matched) {
    const w = k.total;
    totalWeight += w;
    safeWeighted += k.safePct * w;
    aggressiveWeighted += k.aggressivePct * w;
  }
  const safePct = totalWeight ? safeWeighted / totalWeight : 0;
  const aggressivePct = totalWeight ? aggressiveWeighted / totalWeight : 0;
  let poolType: PoolType = "혼합";
  if (matched.length === 0) poolType = "데이터부족";
  else if (safePct >= 0.55) poolType = "안전형";
  else if (aggressivePct >= 0.55) poolType = "공격형";
  return {
    poolType,
    safePct,
    matchedKeywords: matched.map((m) => m.keyword),
  };
}

export type KeywordSummary = {
  keyword: string;
  total: number;
  aggressive: number;
  safe: number;
  gap: number;
  aggressivePct: number;
  safePct: number;
  poolType: PoolType;
  rateMedian: number;
  sampleNames: string[];
};

export type PoolType = "공격형" | "안전형" | "혼합" | "데이터부족";

export type AgencySummary = {
  agency: string;
  total: number;
  aggressive: number;        // rate < 89.0
  safe: number;              // rate ≥ 89.5
  gap: number;               // 89.0 ≤ rate < 89.5
  aggressivePct: number;
  safePct: number;
  poolType: PoolType;
  topWinners: { name: string; count: number; bizno: string }[];
  rateMedian: number;
};

function classifyPool(total: number, aggressive: number, safe: number): PoolType {
  if (total < 5) return "데이터부족";
  const aPct = aggressive / total;
  const sPct = safe / total;
  if (sPct >= 0.6) return "안전형";
  if (aPct >= 0.6) return "공격형";
  return "혼합";
}

// 참여자 기반 키워드별 풀 분류 — 모든 정상 참여자(5,299명)의 투찰률로 집계.
// 표본이 25배 크고 투찰 행동의 진짜 분포를 반영하므로 낙찰자 only보다 훨씬 정확함.
export function summarizeByKeywordParticipants(
  wins: PublicWin[],
  participants: PublicParticipant[],
  keywords: string[] = DOMAIN_KEYWORDS,
): KeywordSummary[] {
  // 공고번호 → 참여자(정상만)
  const byNotice = new Map<string, PublicParticipant[]>();
  for (const p of participants) {
    if (!p.is_qualified) continue;
    const k = p.bid_ntce_no;
    if (!byNotice.has(k)) byNotice.set(k, []);
    byNotice.get(k)!.push(p);
  }

  // 공고번호 → 공고명
  const ntceNm = new Map<string, string>();
  for (const w of wins) ntceNm.set(w.bid_ntce_no, w.bid_ntce_nm);

  return keywords
    .map((kw) => {
      const matchedNotices = wins.filter((w) => (w.bid_ntce_nm ?? "").includes(kw));
      const matchedParticipants = matchedNotices.flatMap((w) => byNotice.get(w.bid_ntce_no) ?? []);
      let aggressive = 0;
      let safe = 0;
      let gap = 0;
      const rates: number[] = [];
      const sampleNames: string[] = [];
      const seenNames = new Set<string>();
      for (const p of matchedParticipants) {
        const r = Number(p.bidprcrt);
        if (Number.isNaN(r) || r <= 0) continue;
        rates.push(r);
        if (r < AGGRESSIVE_MAX) aggressive++;
        else if (r >= SAFE_MIN) safe++;
        else gap++;
        const nm = ntceNm.get(p.bid_ntce_no);
        if (nm && !seenNames.has(nm) && sampleNames.length < 3) {
          sampleNames.push(nm);
          seenNames.add(nm);
        }
      }
      rates.sort((a, b) => a - b);
      const median = rates.length ? rates[Math.floor(rates.length / 2)] : NaN;
      const total = rates.length;
      return {
        keyword: kw,
        total,
        aggressive,
        safe,
        gap,
        aggressivePct: total ? aggressive / total : 0,
        safePct: total ? safe / total : 0,
        poolType: classifyPool(total, aggressive, safe),
        rateMedian: median,
        sampleNames,
      };
    })
    .filter((r) => r.total >= 5)
    .sort((a, b) => b.safePct - a.safePct);
}

export function summarizeByKeyword(
  wins: PublicWin[],
  keywords: string[] = DOMAIN_KEYWORDS,
): KeywordSummary[] {
  return keywords
    .map((kw) => {
      const matched = wins.filter((w) => (w.bid_ntce_nm ?? "").includes(kw));
      let aggressive = 0;
      let safe = 0;
      let gap = 0;
      const rates: number[] = [];
      const sampleNames: string[] = [];
      for (const w of matched) {
        const r = Number(w.sucsfbid_rate);
        if (Number.isNaN(r) || r <= 0) continue;
        rates.push(r);
        if (r < AGGRESSIVE_MAX) aggressive++;
        else if (r >= SAFE_MIN) safe++;
        else gap++;
        if (sampleNames.length < 3) sampleNames.push(w.bid_ntce_nm ?? "");
      }
      rates.sort((a, b) => a - b);
      const median = rates.length ? rates[Math.floor(rates.length / 2)] : NaN;
      const total = rates.length;
      return {
        keyword: kw,
        total,
        aggressive,
        safe,
        gap,
        aggressivePct: total ? aggressive / total : 0,
        safePct: total ? safe / total : 0,
        poolType: classifyPool(total, aggressive, safe),
        rateMedian: median,
        sampleNames,
      };
    })
    .filter((r) => r.total >= 3)
    .sort((a, b) => b.safePct - a.safePct);
}

export function summarizeAgencies(wins: PublicWin[]): AgencySummary[] {
  const byAgency = new Map<string, PublicWin[]>();
  for (const w of wins) {
    if (!w.dminstt_nm) continue;
    if (!byAgency.has(w.dminstt_nm)) byAgency.set(w.dminstt_nm, []);
    byAgency.get(w.dminstt_nm)!.push(w);
  }
  const rows: AgencySummary[] = [...byAgency.entries()].map(([agency, items]) => {
    const winnerCounts = new Map<string, { name: string; count: number; bizno: string }>();
    let aggressive = 0;
    let safe = 0;
    let gap = 0;
    const rates: number[] = [];
    for (const it of items) {
      const k = it.bidwinnr_bizno;
      if (k) {
        if (!winnerCounts.has(k)) {
          winnerCounts.set(k, { name: it.bidwinnr_nm ?? k, count: 0, bizno: k });
        }
        winnerCounts.get(k)!.count++;
      }
      const r = Number(it.sucsfbid_rate);
      if (!Number.isNaN(r) && r > 0) {
        rates.push(r);
        if (r < AGGRESSIVE_MAX) aggressive++;
        else if (r >= SAFE_MIN) safe++;
        else gap++;
      }
    }
    rates.sort((a, b) => a - b);
    const median = rates.length ? rates[Math.floor(rates.length / 2)] : NaN;
    const total = rates.length;
    const topWinners = [...winnerCounts.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    return {
      agency,
      total,
      aggressive,
      safe,
      gap,
      aggressivePct: total ? aggressive / total : 0,
      safePct: total ? safe / total : 0,
      poolType: classifyPool(total, aggressive, safe),
      topWinners,
      rateMedian: median,
    };
  });
  rows.sort((a, b) => b.total - a.total);
  return rows;
}
