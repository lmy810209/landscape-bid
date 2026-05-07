"use client";

// 시장 분석 패널 — 4개 카드 (최종 판단 / 시장 유형 / 상위업체 / 공격 시뮬) 통합.
// 공고번호 lookup 성공 후 자동 호출.

import { useEffect, useState } from "react";
import type { MarketAnalysisResponse } from "@/app/api/market-analysis/route";
import type { NoticeContext } from "@/lib/marketAnalysis/types";
import FinalJudgmentBox from "./FinalJudgmentBox";
import MarketTypeCard from "./MarketTypeCard";
import TopCompetitorsCard from "./TopCompetitorsCard";
import AggressiveScenariosCard from "./AggressiveScenariosCard";
import TimelineTrendCard from "./TimelineTrendCard";

type Props = {
  ctx: NoticeContext | null;
};

export default function MarketAnalysisPanel({ ctx }: Props) {
  const [data, setData] = useState<MarketAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ctx || !ctx.notice_no || !ctx.agency || !ctx.base_amount) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/market-analysis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ctx),
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
  }, [ctx?.notice_no, ctx?.agency, ctx?.base_amount, ctx?.bid_method]);

  if (!ctx) return null;
  if (loading) {
    return (
      <div className="rounded border-2 border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        시장 분석 중...
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded border-2 border-red-200 bg-red-50 p-3 text-sm text-red-800">
        분석 실패: {error}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-3">
      <FinalJudgmentBox judgment={data.final_judgment} />
      <MarketTypeCard result={data.market_type} />
      <TimelineTrendCard trend={data.timeline} />
      <AggressiveScenariosCard result={data.aggressive} ctx={data.notice_context} />
      <TopCompetitorsCard analysis={data.top_competitors} />
    </div>
  );
}
