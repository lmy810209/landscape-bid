"use client";

import type { TimelineTrend } from "@/lib/marketAnalysis/timeline";

export default function TimelineTrendCard({ trend }: { trend: TimelineTrend }) {
  if (trend.total_count < 5) return null;

  const valid = trend.buckets.filter((b) => b.count > 0);
  const allRates = valid.flatMap((b) =>
    [b.rate_p25, b.rate_median, b.rate_p75].filter((r): r is number => r != null),
  );
  const minRate = Math.floor(Math.min(...allRates) * 10) / 10;
  const maxRate = Math.ceil(Math.max(...allRates) * 10) / 10;
  const range = Math.max(maxRate - minRate, 0.01);

  const trendColor =
    trend.trend_label === "보수형 이동"
      ? "border-orange-300 bg-orange-50/40 text-orange-900"
      : trend.trend_label === "공격형 이동"
        ? "border-blue-300 bg-blue-50/40 text-blue-900"
        : "border-slate-300 bg-slate-50/40 text-slate-800";

  return (
    <div className={`rounded-lg border-2 p-3 ${trendColor}`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">📈 시장 시계열 추세</h3>
        <span className="rounded bg-white/60 px-2 py-0.5 text-xs font-bold">
          {trend.trend_label}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded bg-white/60 p-2">
          <div className="text-[11px] text-slate-500">최근 6개월 평균</div>
          <div className="text-lg font-bold">
            {trend.recent_mean != null ? trend.recent_mean.toFixed(2) + "%" : "—"}
          </div>
        </div>
        <div className="rounded bg-white/60 p-2">
          <div className="text-[11px] text-slate-500">5년 전체 평균</div>
          <div className="text-lg font-bold">
            {trend.overall_mean != null ? trend.overall_mean.toFixed(2) + "%" : "—"}
          </div>
        </div>
        <div className="rounded bg-white/60 p-2">
          <div className="text-[11px] text-slate-500">차이</div>
          <div
            className={`text-lg font-bold ${
              trend.trend_diff != null && trend.trend_diff > 0
                ? "text-orange-700"
                : trend.trend_diff != null && trend.trend_diff < 0
                  ? "text-blue-700"
                  : ""
            }`}
          >
            {trend.trend_diff != null
              ? (trend.trend_diff > 0 ? "+" : "") + trend.trend_diff.toFixed(2) + "%p"
              : "—"}
          </div>
        </div>
      </div>

      {/* Bar chart — bucket별 median */}
      <div className="rounded bg-white p-2">
        <div className="mb-1 flex items-end justify-between text-[10px] text-slate-500">
          <span>5년 전</span>
          <span>현재</span>
        </div>
        <div className="flex items-end gap-1" style={{ height: 80 }}>
          {trend.buckets.map((b, i) => {
            if (b.count === 0) {
              return (
                <div key={i} className="flex-1 text-center text-[9px] text-slate-300">
                  —
                </div>
              );
            }
            const med = b.rate_median ?? 0;
            const heightPct = ((med - minRate) / range) * 100;
            return (
              <div key={i} className="flex flex-1 flex-col items-center" title={`${b.label}: ${med.toFixed(2)}%`}>
                <div
                  className="w-full rounded-t bg-slate-600"
                  style={{ height: `${Math.max(heightPct, 5)}%` }}
                />
                <div className="mt-0.5 text-[9px] text-slate-500">{b.label.slice(2)}</div>
                <div className="text-[9px] tabular-nums text-slate-700">{med.toFixed(1)}</div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-2 text-[11px] text-slate-600">
        {trend.trend_label === "보수형 이동" && (
          <>⚠ 시장이 최근 사정율을 올리고 있음 (90%대 이동). 5년 평균보다 최근 트렌드 우선 검토.</>
        )}
        {trend.trend_label === "공격형 이동" && (
          <>📉 시장이 최근 사정율을 낮추고 있음 (88%대 이동).</>
        )}
        {trend.trend_label === "안정" && <>시장 안정. 5년 평균 신뢰 가능.</>}
      </p>
    </div>
  );
}
