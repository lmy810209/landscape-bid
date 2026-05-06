"use client";

// 발주처별 추첨번호 추천 카드.
// lookup 성공 후 agency가 결정되면 자동 조회.
//
// 시뮬레이션: 발주처별 Top 4 중 2개 선택 시 적중률 0.594 → 0.781 (+32%).

import { useEffect, useState } from "react";

type Recommendation = {
  no: string;
  count: number;
  weight: number;
};

type Props = {
  agency: string | null;
};

export default function DrwtRecommend({ agency }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    recommendations: Recommendation[];
    sampleCount: number;
    totalDraws: number;
    strategy: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agency) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/recommend-drwt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agency }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.error) setError(j.error);
        else setData(j);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [agency]);

  if (!agency) return null;

  return (
    <div className="mt-3 rounded border border-purple-300 bg-purple-50/50 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">🎯 추첨번호 추천 — {agency}</h3>
        {data && data.sampleCount > 0 && (
          <span className="text-[11px] text-slate-500">
            과거 {data.sampleCount}건 / 추첨 {data.totalDraws}회 학습
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-600">
        같은 발주처에서 가장 자주 추첨된 예비가격 번호. 본인 추첨번호 2개 선택 시 이 중에서 고르세요.
      </p>

      {loading && <div className="mt-2 text-xs text-slate-500">조회 중...</div>}
      {error && <div className="mt-2 text-xs text-red-700">❌ {error}</div>}

      {data && data.recommendations.length === 0 && (
        <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          데이터 부족 ({data.sampleCount}건) — 안산도시공사·대부해양본부처럼 표본이 작은 발주처. 균등 가정으로 자유 선택.
        </div>
      )}

      {data && data.recommendations.length > 0 && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {data.recommendations.map((r, i) => (
              <div
                key={r.no}
                className={`rounded border p-3 text-center ${
                  i < 2
                    ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-300"
                    : "border-slate-300 bg-white"
                }`}
              >
                <div className="text-[10px] font-medium text-slate-600">#{i + 1} 추천</div>
                <div className="font-mono text-2xl font-bold text-slate-900">{r.no}</div>
                <div className="text-[10px] text-slate-500">
                  {(r.weight * 100).toFixed(1)}% 빈도
                </div>
                {i < 2 && <div className="mt-1 text-[10px] font-medium text-emerald-700">★ 권장 선택</div>}
              </div>
            ))}
          </div>
          <div className="mt-2 rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-600">
            <strong className="text-slate-800">시뮬레이션 (본인 32회 LOO):</strong> 본인 자연 적중률{" "}
            <strong>0.594</strong> → 발주처별 Top 2 따를 시 <strong className="text-emerald-700">0.781 (+32%)</strong>.
            상위 업체들(에스디·뉴그린 등) 적중률 0.74~0.97과 일치하는 패턴.
            <br />
            ※ 단, n=32라 통계 유의성은 약함. 시간 들여 본인 데이터로 검증 필요.
          </div>
        </>
      )}
    </div>
  );
}
