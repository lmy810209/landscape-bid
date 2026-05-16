"use client";

import type { FinalJudgment } from "@/lib/marketAnalysis/finalJudgment";

export default function FinalJudgmentBox({ judgment }: { judgment: FinalJudgment }) {
  const goColor =
    judgment.go_status === "GO"
      ? "bg-emerald-100 text-emerald-900 border-emerald-400"
      : judgment.go_status === "조건부 GO"
      ? "bg-yellow-100 text-yellow-900 border-yellow-400"
      : "bg-red-100 text-red-900 border-red-400";
  const stratColor =
    judgment.strategy === "공격형"
      ? "bg-orange-50 text-orange-900 border-orange-300"
      : judgment.strategy === "혼합형"
      ? "bg-blue-50 text-blue-900 border-blue-300"
      : judgment.strategy === "회피"
      ? "bg-slate-100 text-slate-700 border-slate-300"
      : "bg-emerald-50 text-emerald-900 border-emerald-300";

  return (
    <div className="rounded-lg border-2 border-slate-300 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-base font-bold text-slate-800">📋 최종 판단</h2>
      <div className="space-y-2">
        <div className={`rounded border-2 px-4 py-3 ${goColor}`}>
          <div className="text-xs font-semibold opacity-70">① 참여 판단 (먼저 결정)</div>
          <div className="text-3xl font-bold">{judgment.go_status}</div>
        </div>
        <div className={`rounded border px-3 py-2 ${stratColor}`}>
          <div className="text-[11px] font-medium opacity-70">② 가격 전략</div>
          <div className="text-lg font-semibold">{judgment.strategy}</div>
        </div>
      </div>
      {judgment.warnings.length > 0 && (
        <div className="mt-3 space-y-1">
          {judgment.warnings.map((w, i) => (
            <div key={i} className="rounded border border-red-400 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
              {w}
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 space-y-1 text-sm">
        <div>
          <span className="font-semibold text-slate-600">추천 이유: </span>
          <span className="text-slate-800">{judgment.reason}</span>
        </div>
        <div>
          <span className="font-semibold text-amber-700">⚠ 주의: </span>
          <span className="text-slate-800">{judgment.caution}</span>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        ※ 참고 시나리오일 뿐 낙찰을 단정하지 않습니다. 최종 판단은 사용자가 합니다.
      </p>
    </div>
  );
}
