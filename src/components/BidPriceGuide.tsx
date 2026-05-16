"use client";

// 투찰 판단 보조 시나리오 카드 — lookup 성공 후 표시.
// 절대 "추천 가격" 아님. 부적격 회피 + 시장 위치 파악용 참고.
//
// 표시 내용:
//   1) 부적격 경계 (낙찰하한율) — 이하 가면 부적격
//   2) 하한 + 완충값 (참고) — +0.3 / +0.5는 검증된 공식 아님
//   3) 트렌드 보정 (선택적) — 시장 median이 더 높으면 그걸로 대체
//   4) 본인 평소 median, 시장 median (윈도우별)
//
// 추첨 운에 좌우. 어떤 가격이든 낙찰 보장은 없음.

import { useEffect, useState } from "react";

type Props = {
  baseAmount: number;
  sucsfbidLwltRate: number | null; // 89.745 같은 % 값
  onApplyBid: (amount: number) => void;
};

type WindowStats = { label: string; days: number; median: number | null; n: number };
type MarketStats = {
  primary: WindowStats;
  recent_6m: WindowStats;
  recent_12m: WindowStats;
  all_5y: WindowStats;
  computed_at: string;
};

const ROUND = (n: number) => Math.round(n / 1000) * 1000;

export default function BidPriceGuide({ baseAmount, sucsfbidLwltRate, onApplyBid }: Props) {
  const [stats, setStats] = useState<MarketStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/market-stats")
      .then((r) => r.json())
      .then((d: MarketStats) => {
        if (!cancelled) setStats(d);
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const threshold = sucsfbidLwltRate;
  const primary = stats?.primary;
  const primaryMedian = primary?.median ?? null;

  const scenarios: { label: string; ratio: number; color: string; note: string }[] = [];

  if (threshold != null) {
    scenarios.push({
      label: "부적격 경계",
      ratio: threshold,
      color: "red",
      note: "이 이하 가면 자동 탈락",
    });
    scenarios.push({
      label: "완충 +0.3%p (참고)",
      ratio: threshold + 0.3,
      color: "amber",
      note: "임의 완충값. 검증된 공식 아님",
    });
    const cutoffPlus = threshold + 0.5;
    const trendAware = primaryMedian != null ? Math.max(cutoffPlus, primaryMedian) : cutoffPlus;
    const usedTrend = primaryMedian != null && trendAware > cutoffPlus + 0.01;
    scenarios.push({
      label: usedTrend ? "트렌드 보정 (시장 median)" : "완충 +0.5%p (참고)",
      ratio: trendAware,
      color: "emerald",
      note: usedTrend
        ? `${primary?.label} median ${primaryMedian.toFixed(2)}% (n=${primary?.n}) 반영`
        : "임의 완충값. 검증된 공식 아님",
    });
  }
  scenarios.push({
    label: "본인 평소 median",
    ratio: 90.33,
    color: "blue",
    note: "scope 2 32회 기준 (작은 표본)",
  });
  if (stats?.recent_6m.median != null) {
    scenarios.push({
      label: "최근 6개월 시장 median",
      ratio: stats.recent_6m.median,
      color: "blue",
      note: `안산∩비방제 n=${stats.recent_6m.n}`,
    });
  }
  if (stats?.all_5y.median != null) {
    scenarios.push({
      label: "5년 시장 median",
      ratio: stats.all_5y.median,
      color: "slate",
      note: `안산∩비방제 n=${stats.all_5y.n} (옛 평균, 트렌드 보정 필요)`,
    });
  }

  const colorMap: Record<string, string> = {
    red: "border-red-300 bg-red-50",
    amber: "border-amber-300 bg-amber-50",
    emerald: "border-emerald-300 bg-emerald-50",
    blue: "border-blue-300 bg-blue-50",
    slate: "border-slate-300 bg-slate-50",
  };

  return (
    <div className="mt-3 rounded border border-indigo-200 bg-indigo-50/50 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">📊 투찰 판단 보조 시나리오</h3>
        <span className="text-[11px] text-slate-500">
          기초금액 {baseAmount.toLocaleString()}원 기준
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        클릭하면 "나의 투찰가" 폼에 입력. ※ 어떤 가격이든 낙찰 보장 없음 — 추첨번호 운으로 결정.
        +0.3/+0.5%p는 임의 완충값이지 검증된 공식 아님.
      </p>

      {loading && (
        <p className="mt-2 text-xs text-slate-500">시장 데이터 불러오는 중…</p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
        {scenarios.map((s) => {
          const amount = ROUND(baseAmount * (s.ratio / 100));
          const isPrimary = s.color === "emerald";
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => onApplyBid(amount)}
              className={`group rounded border p-3 text-left transition-shadow hover:shadow-md ${colorMap[s.color]} ${
                isPrimary ? "ring-2 ring-emerald-400" : ""
              }`}
            >
              <div className="flex items-baseline justify-between">
                <div className="text-xs font-medium text-slate-700">{s.label}</div>
                <div className="font-mono text-xs text-slate-600">{s.ratio.toFixed(2)}%</div>
              </div>
              <div className="mt-1 font-mono text-base font-semibold text-slate-900">
                {amount.toLocaleString()}원
              </div>
              <div className="mt-0.5 text-[11px] text-slate-600">{s.note}</div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-600">
        <strong className="text-slate-800">정직한 한계</strong> — 본인 32회 분석:
        가격이 1위와 0.5%p 이내였던 경우 37.5%지만 평균 순위 24위.
        실제 낙찰은 가격이 아닌 추첨번호 운으로 결정. 이 카드는 부적격 회피 + 시장 위치 파악용 참고일 뿐
        "정답 가격"이 아님.
        {stats && (
          <>
            {" "}데이터: {primary?.label} 사용 (n={primary?.n}). 6m={stats.recent_6m.n} / 12m={stats.recent_12m.n} / 5y={stats.all_5y.n}.
          </>
        )}
      </div>
    </div>
  );
}
