"use client";

import type { AggressiveScenariosResult } from "@/lib/marketAnalysis/aggressiveScenarios";
import type { NoticeContext } from "@/lib/marketAnalysis/types";

function fmtKRW(n: number): string {
  return new Intl.NumberFormat("ko-KR").format(n) + "원";
}

export default function AggressiveScenariosCard({
  result,
  ctx,
}: {
  result: AggressiveScenariosResult;
  ctx: NoticeContext;
}) {
  return (
    <div className="rounded-lg border-2 border-orange-300 bg-orange-50/30 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-orange-900">🔥 공격형 시뮬레이션</h3>
        <span className="text-xs text-slate-500">유사 공고 {result.sample_size}건 기반</span>
      </div>

      {result.insurance_warning && (
        <div className="mb-2 rounded border border-amber-300 bg-amber-100/70 px-2 py-1.5 text-xs text-amber-900">
          ⚠ {result.insurance_warning}
          {result.effective_cutoff_estimate != null && (
            <div className="mt-1">
              추정 effective cutoff: <strong>{result.effective_cutoff_estimate.toFixed(2)}%</strong>
              {result.effective_cutoff_amount != null && (
                <> ({fmtKRW(Math.round(result.effective_cutoff_amount))})</>
              )}
            </div>
          )}
        </div>
      )}

      {result.scenarios.length === 0 && (
        <div className="rounded bg-white/60 px-2 py-1 text-xs text-slate-600">
          유사 공고 데이터 부족 — 공격형 시뮬 불가.
        </div>
      )}

      <div className="space-y-2">
        {result.scenarios.map((s) => {
          const riskColor =
            s.risk_level === "낮음"
              ? "bg-emerald-100 text-emerald-900"
              : s.risk_level === "중간"
              ? "bg-yellow-100 text-yellow-900"
              : "bg-red-100 text-red-900";
          const posColor =
            s.position === "공격권"
              ? "bg-orange-100 text-orange-900"
              : s.position === "정상권"
              ? "bg-blue-100 text-blue-900"
              : "bg-red-100 text-red-900";
          return (
            <div key={s.label} className="rounded border bg-white px-3 py-2 text-sm">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-bold text-orange-900">{s.label}</span>
                <span className="text-xs text-slate-500">— {s.description}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span>
                  사정율: <strong>{s.rate.toFixed(3)}%</strong>
                </span>
                <span>
                  투찰가: <strong className="font-mono">{fmtKRW(s.bid_amount)}</strong>
                </span>
                <span className="text-xs text-slate-600">
                  하한선 대비:{" "}
                  <span className={s.margin_to_lower_bound >= 0 ? "text-emerald-700" : "text-red-700"}>
                    {s.margin_to_lower_bound >= 0 ? "+" : ""}
                    {fmtKRW(Math.round(s.margin_to_lower_bound))} ({s.margin_pct >= 0 ? "+" : ""}
                    {s.margin_pct.toFixed(2)}%p)
                  </span>
                </span>
              </div>
              <div className="mt-1 flex gap-2 text-xs">
                <span className={`rounded px-2 py-0.5 ${riskColor}`}>미달 위험: {s.risk_level}</span>
                <span className={`rounded px-2 py-0.5 ${posColor}`}>{s.position}</span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] text-slate-500">
        ※ 공격형 시뮬은 참고 시나리오. 실제 미달 여부는 추첨번호와 보험료 룰에 따라 달라짐.
      </p>
    </div>
  );
}
