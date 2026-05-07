// 매칭 풀의 시계열 트렌드 — 분기별 사정율 변화.
// 4/30 빗나감 같은 케이스 방지: "5년 평균 vs 최근" 차이 사용자에게 보여줌.

import type { PublicWin } from "./types";

export type TimelineBucket = {
  label: string; // "2024 H1" / "2024 H2" / ...
  start: Date;
  end: Date;
  count: number;
  rate_mean: number | null;
  rate_median: number | null;
  rate_p25: number | null;
  rate_p75: number | null;
};

export type TimelineTrend = {
  buckets: TimelineBucket[]; // 시간순
  total_count: number;
  recent_mean: number | null; // 최근 6개월 평균
  overall_mean: number | null; // 5년 전체 평균
  trend_diff: number | null; // 최근 - 전체 (양수 = 시장이 더 보수형으로 이동)
  trend_label: "안정" | "공격형 이동" | "보수형 이동";
};

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function quantile(arr: number[], p: number): number | null {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(Math.floor(s.length * p), s.length - 1)];
}
function mean(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

export function buildTimeline(matched: PublicWin[]): TimelineTrend {
  // 6개월 단위 bucket. 최근 6개월부터 거꾸로.
  const now = new Date();
  const buckets: TimelineBucket[] = [];

  // 5년 전부터 6개월씩 — 10개 bucket
  for (let i = 9; i >= 0; i--) {
    const end = new Date(now);
    end.setMonth(end.getMonth() - i * 6);
    const start = new Date(end);
    start.setMonth(start.getMonth() - 6);
    const half = end.getMonth() < 6 ? "H1" : "H2";
    const label = `${end.getFullYear()} ${half}`;

    const inBucket = matched.filter((m) => {
      if (!m.rl_openg_dt) return false;
      const t = new Date(m.rl_openg_dt).getTime();
      return t >= start.getTime() && t < end.getTime();
    });
    const rates = inBucket.map((m) => Number(m.sucsfbid_rate)).filter((r) => !isNaN(r));
    buckets.push({
      label,
      start,
      end,
      count: rates.length,
      rate_mean: mean(rates),
      rate_median: median(rates),
      rate_p25: quantile(rates, 0.25),
      rate_p75: quantile(rates, 0.75),
    });
  }

  // 최근 6개월 평균 (가장 마지막 bucket)
  const recent = buckets[buckets.length - 1];
  const recent_mean = recent.rate_mean;

  // 5년 전체 평균
  const allRates = matched.map((m) => Number(m.sucsfbid_rate)).filter((r) => !isNaN(r));
  const overall_mean = mean(allRates);

  let trend_diff: number | null = null;
  let trend_label: TimelineTrend["trend_label"] = "안정";
  if (recent_mean != null && overall_mean != null) {
    trend_diff = recent_mean - overall_mean;
    if (trend_diff > 0.5) trend_label = "보수형 이동";
    else if (trend_diff < -0.5) trend_label = "공격형 이동";
  }

  return {
    buckets,
    total_count: matched.length,
    recent_mean,
    overall_mean,
    trend_diff,
    trend_label,
  };
}
