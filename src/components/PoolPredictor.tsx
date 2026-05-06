"use client";

// 공고명 입력 → 키워드 매칭 → 안산 풀 예측.
//
// 동작:
//   1) 입력된 공고명에서 DOMAIN_KEYWORDS와 매칭되는 단어 추출
//   2) 매칭된 키워드 각각의 safe% 와 표본 수를 가중 평균 (표본 큰 키워드에 더 가중)
//   3) 평균 safe% 로 풀 분류 + 본인(평균 90.33%) 진입 가능성 텍스트
//
// 한계: 키워드 단순 포함 매칭. "수목 전정"과 "수목 교체"가 다른데 "수목"만 잡으면 같이 묶임.
//       향후 N-gram 또는 GBM 분류기로 개선 가능. 지금은 휴리스틱.

import { useMemo, useState } from "react";
import type { KeywordSummary } from "@/lib/analysis/scope2";

type Props = {
  keywords: KeywordSummary[];
};

export default function PoolPredictor({ keywords }: Props) {
  const [name, setName] = useState("");

  const result = useMemo(() => {
    if (!name.trim()) return null;
    const matched = keywords
      .filter((k) => name.includes(k.keyword))
      .sort((a, b) => b.total - a.total);

    if (matched.length === 0) {
      return {
        matched: [] as KeywordSummary[],
        weightedSafePct: null,
        weightedAggressivePct: null,
        verdict: "매칭 키워드 없음 — 도메인 키워드 사전에 없는 공고. 일반 풀(전체 평균 ~30% 안전형)로 추정.",
        verdictColor: "slate" as const,
      };
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
    const safePct = safeWeighted / totalWeight;
    const aggressivePct = aggressiveWeighted / totalWeight;

    let verdict: string;
    let color: "emerald" | "amber" | "red";
    if (safePct >= 0.55) {
      verdict = "🟢 안전형 풀 가능성 높음 — 본인 평소 90%대 투찰로 충분히 경쟁 가능";
      color = "emerald";
    } else if (safePct >= 0.4) {
      verdict = "🟡 혼합 풀 — 공고별 조건(예산, 규모, 자격제한)에 따라 갈림. 보수적 진입 검토";
      color = "amber";
    } else {
      verdict = "🔴 공격형 풀 가능성 높음 — 88% 미만 저가 투찰자가 다수 들어옴. 본인이 들어가도 낙찰 어려움";
      color = "red";
    }

    return { matched, weightedSafePct: safePct, weightedAggressivePct: aggressivePct, verdict, verdictColor: color };
  }, [name, keywords]);

  const colorClasses: Record<string, string> = {
    emerald: "border-emerald-300 bg-emerald-50 text-emerald-900",
    amber: "border-amber-300 bg-amber-50 text-amber-900",
    red: "border-red-300 bg-red-50 text-red-900",
    slate: "border-slate-300 bg-slate-50 text-slate-700",
  };

  return (
    <section className="rounded border border-blue-200 bg-blue-50/40 p-4">
      <h2 className="text-lg font-semibold">새 공고 풀 예측</h2>
      <p className="mt-1 text-xs text-slate-600">
        공고명을 입력하면 도메인 키워드 매칭으로 안산 풀(공격형/혼합/안전형) 가능성을 추정합니다.
        본인 평균 투찰률 90.33% 기준 진입 가능성도 함께 표시.
      </p>

      <div className="mt-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 2026년 상반기 상록구 가로수 민원처리공사"
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
        />
      </div>

      {result && (
        <div className="mt-3 space-y-3">
          <div className={`rounded border px-3 py-2 text-sm ${colorClasses[result.verdictColor]}`}>
            <div className="font-medium">{result.verdict}</div>
            {result.weightedSafePct != null && (
              <div className="mt-1 text-xs">
                매칭 키워드 가중 평균: 안전형 {(result.weightedSafePct * 100).toFixed(0)}% / 공격형{" "}
                {(result.weightedAggressivePct! * 100).toFixed(0)}%
              </div>
            )}
          </div>

          {result.matched.length > 0 && (
            <div className="rounded border border-slate-200 bg-white p-3">
              <div className="text-xs font-medium text-slate-700">매칭 키워드 ({result.matched.length}개)</div>
              <table className="mt-2 w-full text-xs">
                <thead>
                  <tr className="text-slate-500">
                    <th className="pb-1 text-left">키워드</th>
                    <th className="pb-1 text-right">표본</th>
                    <th className="pb-1 text-right">안전 %</th>
                    <th className="pb-1 text-right">공격 %</th>
                    <th className="pb-1 text-center">분류</th>
                  </tr>
                </thead>
                <tbody>
                  {result.matched.map((k) => (
                    <tr key={k.keyword} className="border-t border-slate-100">
                      <td className="py-1 font-medium">{k.keyword}</td>
                      <td className="py-1 text-right font-mono text-slate-700">{k.total}</td>
                      <td className="py-1 text-right font-mono text-emerald-700">
                        {(k.safePct * 100).toFixed(0)}%
                      </td>
                      <td className="py-1 text-right font-mono text-red-700">
                        {(k.aggressivePct * 100).toFixed(0)}%
                      </td>
                      <td className="py-1 text-center text-slate-600">{k.poolType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="text-xs text-slate-500">
            ※ 키워드 단순 포함 매칭 휴리스틱. 표본 큰 키워드에 가중치. 결과는 참고값이며
            발주처·예산·자격제한 등 다른 요인도 함께 고려해야 합니다.
          </div>
        </div>
      )}
    </section>
  );
}
