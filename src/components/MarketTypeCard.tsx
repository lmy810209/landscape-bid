"use client";

import type { MarketTypeResult } from "@/lib/marketAnalysis/marketType";

export default function MarketTypeCard({ result }: { result: MarketTypeResult }) {
  const color =
    result.type === "공격형 가능"
      ? "border-orange-300 bg-orange-50/40"
      : result.type === "안전형 필요"
      ? "border-emerald-300 bg-emerald-50/40"
      : result.type === "강자 회피"
      ? "border-rose-300 bg-rose-50/40"
      : "border-slate-300 bg-slate-50/40";
  const badge =
    result.type === "공격형 가능"
      ? "bg-orange-200 text-orange-900"
      : result.type === "안전형 필요"
      ? "bg-emerald-200 text-emerald-900"
      : result.type === "강자 회피"
      ? "bg-rose-200 text-rose-900"
      : "bg-slate-200 text-slate-800";

  const r = result.reasons;
  return (
    <div className={`rounded-lg border-2 p-3 ${color}`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">📊 시장 유형</h3>
        <span className={`rounded px-2 py-0.5 text-sm font-bold ${badge}`}>{result.type}</span>
      </div>

      <div className="space-y-1 text-xs text-slate-700">
        <div>
          <span className="font-semibold">[판단 근거]</span>
        </div>
        <ul className="ml-3 list-disc space-y-0.5">
          <li>매칭 공고 수: {r.sample_size}건</li>
          <li>
            발주처 과거 낙찰 사정율 중앙값: {r.agency_median != null ? `${r.agency_median.toFixed(2)}%` : "—"}
          </li>
          <li>
            유사 키워드 과거 낙찰 사정율 중앙값:{" "}
            {r.keyword_median != null ? `${r.keyword_median.toFixed(2)}%` : "—"}
          </li>
          <li>
            최근 5건 낙찰 사정율:{" "}
            {r.recent5_rates.length > 0
              ? r.recent5_rates.map((x) => `${x.toFixed(2)}%`).join(", ")
              : "—"}
          </li>
          {r.strong_companies.length > 0 && (
            <li>
              강자 업체:{" "}
              {r.strong_companies
                .map((s) => `${s.name} (${s.keyword} ${s.count}건, 점유 ${(s.share * 100).toFixed(0)}%)`)
                .join(" / ")}
            </li>
          )}
        </ul>
      </div>

      <div className="mt-2 rounded bg-white/60 px-2 py-1 text-xs">
        <span className="font-semibold text-slate-700">[권장 판단]</span> {result.recommendation}
      </div>
    </div>
  );
}
