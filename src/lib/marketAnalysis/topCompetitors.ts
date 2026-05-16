// 상위업체 패턴 분석 (② 상위업체 패턴 카드).

import type { PublicWin } from "./types";
import { MY_BIZNO } from "@/lib/config/myCompany";

// 상위 5개 — 5년 안산∩비방제 데이터 기준 (2026-05 시점)
export const TOP5_COMPETITORS = [
  { bizno: "4078111745", name: "유한회사 에스디건설" },
  { bizno: "1058651768", name: "대동이앤씨주식회사" },
  { bizno: "1348125448", name: "안산조경건설(주)" },
  { bizno: "1348629134", name: "(주)경안스틸" },
  { bizno: "3228601242", name: "경인이엔지주식회사" },
];

export type CompetitorStats = {
  bizno: string;
  name: string;
  total_wins: number;
  ansan_wins: number;
  ansan_ratio: number;
  avg_rate: number | null;
  median_rate: number | null;
  p25_rate: number | null;
  p75_rate: number | null;
  top_agencies: Array<{ name: string; count: number }>;
  top_keywords: Array<{ name: string; count: number }>;
  monthly_distribution: number[]; // length 12
};

export type TopCompetitorsAnalysis = {
  competitors: CompetitorStats[];
  my_stats: CompetitorStats;
  comparison: string;
};

function median(rates: number[]): number | null {
  if (rates.length === 0) return null;
  const s = [...rates].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}
function percentile(rates: number[], p: number): number | null {
  if (rates.length === 0) return null;
  const s = [...rates].sort((a, b) => a - b);
  return s[Math.floor(s.length * p)] ?? null;
}

function statsForCompany(bizno: string, name: string, allWins: PublicWin[]): CompetitorStats {
  const myWins = allWins.filter((w) => w.bidwinnr_bizno === bizno);
  const ansan = myWins.filter((w) => w.is_ansan && !w.is_bangje);
  const rates = ansan.map((w) => Number(w.sucsfbid_rate)).filter((r) => !isNaN(r));

  const byAgency: Record<string, number> = {};
  ansan.forEach((w) => {
    if (w.dminstt_nm) byAgency[w.dminstt_nm] = (byAgency[w.dminstt_nm] ?? 0) + 1;
  });
  const top_agencies = Object.entries(byAgency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([n, c]) => ({ name: n, count: c }));

  const KEYWORDS = ["전정", "유지관리", "공원", "보수", "민원", "예초", "교체", "풀깎기", "식재", "시설"];
  const byKeyword: Record<string, number> = {};
  for (const kw of KEYWORDS) {
    const c = ansan.filter((w) => w.bid_ntce_nm?.includes(kw)).length;
    if (c > 0) byKeyword[kw] = c;
  }
  const top_keywords = Object.entries(byKeyword)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([n, c]) => ({ name: n, count: c }));

  const monthly = Array(12).fill(0);
  ansan.forEach((w) => {
    if (!w.rl_openg_dt) return;
    const m = new Date(w.rl_openg_dt).getMonth();
    if (!isNaN(m)) monthly[m]++;
  });

  return {
    bizno,
    name,
    total_wins: myWins.length,
    ansan_wins: ansan.length,
    ansan_ratio: myWins.length > 0 ? ansan.length / myWins.length : 0,
    avg_rate: rates.length > 0 ? rates.reduce((s, r) => s + r, 0) / rates.length : null,
    median_rate: median(rates),
    p25_rate: percentile(rates, 0.25),
    p75_rate: percentile(rates, 0.75),
    top_agencies,
    top_keywords,
    monthly_distribution: monthly,
  };
}

export function analyzeTopCompetitors(allWins: PublicWin[]): TopCompetitorsAnalysis {
  const competitors = TOP5_COMPETITORS.map(({ bizno, name }) => statsForCompany(bizno, name, allWins));
  const my_stats = statsForCompany(MY_BIZNO, "(주)새빛조경", allWins);

  // 비교 문구
  const top5AvgRate =
    competitors.filter((c) => c.avg_rate != null).reduce((s, c) => s + (c.avg_rate ?? 0), 0) /
    competitors.filter((c) => c.avg_rate != null).length;
  const myAvg = my_stats.avg_rate;

  let comparison: string;
  if (myAvg != null && !isNaN(top5AvgRate)) {
    const diff = myAvg - top5AvgRate;
    comparison =
      `새빛조경 평균 사정율은 ${myAvg.toFixed(2)}%이고, 상위 5개 업체 평균은 ${top5AvgRate.toFixed(2)}%입니다. ` +
      (diff > 1
        ? "현재 새빛은 안전형 구간에 치우쳐 있어 상위 낙찰 풀과 가격 전략이 다릅니다."
        : diff > 0
        ? "새빛은 상위 업체보다 약간 높은 사정율로 입찰합니다."
        : "새빛은 상위 업체와 비슷하거나 더 공격적인 사정율로 입찰합니다.");
  } else {
    comparison = `새빛조경 데이터가 부족합니다 (${my_stats.ansan_wins}건). 상위 5개 업체 평균은 ${top5AvgRate.toFixed(2)}%입니다.`;
  }

  return { competitors, my_stats, comparison };
}
