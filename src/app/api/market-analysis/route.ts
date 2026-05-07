import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyMarketType, type MarketTypeResult } from "@/lib/marketAnalysis/marketType";
import { analyzeTopCompetitors, type TopCompetitorsAnalysis } from "@/lib/marketAnalysis/topCompetitors";
import { buildAggressiveScenarios, type AggressiveScenariosResult } from "@/lib/marketAnalysis/aggressiveScenarios";
import { judge, type FinalJudgment } from "@/lib/marketAnalysis/finalJudgment";
import { buildTimeline, type TimelineTrend } from "@/lib/marketAnalysis/timeline";
import { extractKeywords } from "@/lib/marketAnalysis/types";
import type { NoticeContext, PublicWin } from "@/lib/marketAnalysis/types";
import type { ParticipantRow } from "@/lib/marketAnalysis/effectiveCutoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type MarketAnalysisResponse = {
  notice_context: NoticeContext;
  market_type: MarketTypeResult;
  top_competitors: TopCompetitorsAnalysis;
  aggressive: AggressiveScenariosResult;
  final_judgment: FinalJudgment;
  timeline: TimelineTrend;
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
  const allWins: PublicWin[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("public_wins")
      .select(
        "bid_ntce_no,bidwinnr_bizno,bidwinnr_nm,bid_ntce_nm,dminstt_nm,sucsfbid_amt,sucsfbid_rate,rl_openg_dt,is_ansan,is_bangje",
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

  // op13 정상 참여자 — 안산∩비방제 공고 ID로 한정 fetch
  const ansanNoticeIds = allWins
    .filter((w) => w.is_ansan && !w.is_bangje && (w as { bid_ntce_no?: string }).bid_ntce_no)
    .map((w) => (w as unknown as { bid_ntce_no: string }).bid_ntce_no);

  const allParticipants: ParticipantRow[] = [];
  // chunked fetch (URL 길이 제약 고려, 100씩)
  for (let i = 0; i < ansanNoticeIds.length; i += 100) {
    const chunk = ansanNoticeIds.slice(i, i + 100);
    let pageFrom = 0;
    while (true) {
      const { data, error } = await supabase
        .from("public_participants")
        .select("bid_ntce_no,prcbdr_bizno,bidprcrt,rmrk")
        .in("bid_ntce_no", chunk)
        .range(pageFrom, pageFrom + PAGE - 1);
      if (error) break;
      if (!data || data.length === 0) break;
      allParticipants.push(...(data as ParticipantRow[]));
      if (data.length < PAGE) break;
      pageFrom += PAGE;
    }
  }

  const aggressive = buildAggressiveScenarios(ctx, allWins, allParticipants);
  const market_type = classifyMarketType(
    ctx.agency,
    ctx.notice_title,
    allWins,
    allParticipants,
    aggressive.insurance_deduction,
  );
  const top_competitors = analyzeTopCompetitors(allWins);
  const final_judgment = judge(market_type, aggressive);

  // 시계열: 매칭 풀 (발주처 + 키워드)
  const noticeKeywords = extractKeywords(ctx.notice_title);
  const timelineMatched = allWins.filter((w) => {
    if (!w.is_ansan || w.is_bangje) return false;
    const ag =
      w.dminstt_nm === ctx.agency ||
      (w.dminstt_nm && (w.dminstt_nm.includes(ctx.agency) || ctx.agency.includes(w.dminstt_nm)));
    if (!ag) return false;
    if (noticeKeywords.length === 0) return true;
    return noticeKeywords.some((k) => w.bid_ntce_nm?.includes(k));
  });
  const matchedForTimeline = timelineMatched.length >= 5
    ? timelineMatched
    : allWins.filter((w) => {
        if (!w.is_ansan || w.is_bangje) return false;
        return (
          w.dminstt_nm === ctx.agency ||
          (w.dminstt_nm && (w.dminstt_nm.includes(ctx.agency) || ctx.agency.includes(w.dminstt_nm)))
        );
      });
  const timeline = buildTimeline(matchedForTimeline);

  return NextResponse.json({
    notice_context: ctx,
    market_type,
    top_competitors,
    aggressive,
    final_judgment,
    timeline,
  } satisfies MarketAnalysisResponse);
}
