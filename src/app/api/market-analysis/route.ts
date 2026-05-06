import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyMarketType, type MarketTypeResult } from "@/lib/marketAnalysis/marketType";
import { analyzeTopCompetitors, type TopCompetitorsAnalysis } from "@/lib/marketAnalysis/topCompetitors";
import { buildAggressiveScenarios, type AggressiveScenariosResult } from "@/lib/marketAnalysis/aggressiveScenarios";
import { judge, type FinalJudgment } from "@/lib/marketAnalysis/finalJudgment";
import type { NoticeContext, PublicWin } from "@/lib/marketAnalysis/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type MarketAnalysisResponse = {
  notice_context: NoticeContext;
  market_type: MarketTypeResult;
  top_competitors: TopCompetitorsAnalysis;
  aggressive: AggressiveScenariosResult;
  final_judgment: FinalJudgment;
};

export async function POST(req: Request) {
  let body: Partial<NoticeContext> = {};
  try {
    body = (await req.json()) as Partial<NoticeContext>;
  } catch {
    return NextResponse.json({ error: "JSON 본문 필요" }, { status: 400 });
  }

  const ctx: NoticeContext = {
    notice_no: body.notice_no?.trim() ?? "",
    notice_title: body.notice_title?.trim() ?? "",
    agency: body.agency?.trim() ?? "",
    base_amount: Number(body.base_amount ?? 0),
    sucsfbid_lwlt_rate: Number(body.sucsfbid_lwlt_rate ?? 89.745),
    bid_method: body.bid_method ?? null,
  };

  if (!ctx.notice_no || !ctx.agency || !ctx.base_amount) {
    return NextResponse.json(
      { error: "notice_no, agency, base_amount 필수" },
      { status: 400 },
    );
  }

  const supabase = createClient();
  // 안산∩비방제 풀 전체 + 상위 5명 비안산 데이터까지 (전체 ratio 계산용)
  // 페이지네이션
  const allWins: PublicWin[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("public_wins")
      .select(
        "bidwinnr_bizno,bidwinnr_nm,bid_ntce_nm,dminstt_nm,sucsfbid_amt,sucsfbid_rate,rl_openg_dt,is_ansan,is_bangje",
      )
      .order("rl_openg_dt", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json(
        { error: `데이터 조회 실패: ${error.message}` },
        { status: 500 },
      );
    }
    if (!data || data.length === 0) break;
    allWins.push(...(data as PublicWin[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const market_type = classifyMarketType(ctx.agency, ctx.notice_title, allWins);
  const top_competitors = analyzeTopCompetitors(allWins);
  const aggressive = buildAggressiveScenarios(ctx, allWins);
  const final_judgment = judge(market_type, aggressive);

  return NextResponse.json({
    notice_context: ctx,
    market_type,
    top_competitors,
    aggressive,
    final_judgment,
  } satisfies MarketAnalysisResponse);
}
