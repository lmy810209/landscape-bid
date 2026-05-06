"use client";

import type { TopCompetitorsAnalysis, CompetitorStats } from "@/lib/marketAnalysis/topCompetitors";

const MONTHS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

function fmtPct(n: number | null, digits = 2): string {
  return n == null ? "—" : `${n.toFixed(digits)}%`;
}

export default function TopCompetitorsCard({ analysis }: { analysis: TopCompetitorsAnalysis }) {
  return (
    <div className="rounded-lg border-2 border-purple-300 bg-purple-50/30 p-3">
      <h3 className="mb-2 text-sm font-semibold text-purple-900">🏢 상위업체 패턴 (5년)</h3>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-slate-600">
              <th className="px-2 py-1">업체</th>
              <th className="px-2 py-1 text-right">총 낙찰</th>
              <th className="px-2 py-1 text-right">안산비율</th>
              <th className="px-2 py-1 text-right">평균</th>
              <th className="px-2 py-1 text-right">중앙값</th>
              <th className="px-2 py-1 text-right">P25~P75</th>
              <th className="px-2 py-1">주력 발주처</th>
              <th className="px-2 py-1">주력 키워드</th>
            </tr>
          </thead>
          <tbody>
            {analysis.competitors.map((c) => (
              <tr key={c.bizno} className="border-b text-slate-800">
                <td className="px-2 py-1 font-medium">{c.name}</td>
                <td className="px-2 py-1 text-right tabular-nums">{c.total_wins}</td>
                <td className="px-2 py-1 text-right tabular-nums">{(c.ansan_ratio * 100).toFixed(0)}%</td>
                <td className="px-2 py-1 text-right tabular-nums">{fmtPct(c.avg_rate)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{fmtPct(c.median_rate)}</td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {fmtPct(c.p25_rate)} ~ {fmtPct(c.p75_rate)}
                </td>
                <td className="px-2 py-1 text-[11px]">
                  {c.top_agencies.slice(0, 2).map((a) => `${a.name.split(" ").pop()} ${a.count}`).join(" / ")}
                </td>
                <td className="px-2 py-1 text-[11px]">
                  {c.top_keywords.slice(0, 3).map((k) => `${k.name} ${k.count}`).join(" / ")}
                </td>
              </tr>
            ))}
            <tr className="bg-blue-50 font-semibold text-slate-800">
              <td className="px-2 py-1">{analysis.my_stats.name} (본인)</td>
              <td className="px-2 py-1 text-right tabular-nums">{analysis.my_stats.total_wins}</td>
              <td className="px-2 py-1 text-right tabular-nums">{(analysis.my_stats.ansan_ratio * 100).toFixed(0)}%</td>
              <td className="px-2 py-1 text-right tabular-nums">{fmtPct(analysis.my_stats.avg_rate)}</td>
              <td className="px-2 py-1 text-right tabular-nums">{fmtPct(analysis.my_stats.median_rate)}</td>
              <td className="px-2 py-1 text-right tabular-nums">
                {fmtPct(analysis.my_stats.p25_rate)} ~ {fmtPct(analysis.my_stats.p75_rate)}
              </td>
              <td className="px-2 py-1 text-[11px]">
                {analysis.my_stats.top_agencies.slice(0, 2).map((a) => `${a.name.split(" ").pop()} ${a.count}`).join(" / ") || "—"}
              </td>
              <td className="px-2 py-1 text-[11px]">
                {analysis.my_stats.top_keywords.slice(0, 3).map((k) => `${k.name} ${k.count}`).join(" / ") || "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-3 rounded bg-white/70 p-2 text-xs">
        <span className="font-semibold text-slate-700">📌 비교: </span>
        <span className="text-slate-800">{analysis.comparison}</span>
      </div>

      <div className="mt-2 text-[11px] text-slate-600">
        <div className="mb-1 font-semibold">월별 낙찰 집중도 (안산∩비방제)</div>
        <div className="space-y-0.5">
          {analysis.competitors.map((c) => (
            <MonthlyBar key={c.bizno} name={c.name} months={c.monthly_distribution} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthlyBar({ name, months }: { name: string; months: number[] }) {
  const max = Math.max(...months, 1);
  return (
    <div className="flex items-center gap-1">
      <span className="w-28 truncate text-right text-slate-700">{name}</span>
      <div className="flex flex-1 gap-px">
        {months.map((m, i) => (
          <div
            key={i}
            className="relative flex-1 rounded-sm bg-purple-200/60"
            style={{ height: 14 }}
            title={`${MONTHS[i]}월: ${m}건`}
          >
            <div
              className="absolute bottom-0 left-0 right-0 rounded-sm bg-purple-600"
              style={{ height: `${(m / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <span className="ml-1 w-8 text-right tabular-nums text-slate-500">{months.reduce((s, x) => s + x, 0)}</span>
    </div>
  );
}
