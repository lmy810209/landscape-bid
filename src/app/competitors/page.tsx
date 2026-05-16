import { createClient } from "@/lib/supabase/server";
import type { Bid } from "@/types/bid";
import type { PublicParticipant, PublicWin } from "@/types/scope2";
import {
  summarizeCompetitors,
  buildRateHistogram,
  summarizeAgencies,
  summarizeByKeyword,
  summarizeByKeywordParticipants,
  classifyNoticeByKeywords,
} from "@/lib/analysis/scope2";
import PoolPredictor from "@/components/PoolPredictor";
import { MY_BIZNO } from "@/lib/config/myCompany";
import { buildHeadToHead } from "@/lib/marketAnalysis/headToHead";
import { TOP5_COMPETITORS } from "@/lib/marketAnalysis/topCompetitors";

export const dynamic = "force-dynamic";

export default async function CompetitorsPage() {
  const supabase = createClient();

  const [{ data: winsData }, { data: bidsData }, { data: ansanWinIds }] = await Promise.all([
    supabase
      .from("public_wins")
      .select("*")
      .eq("is_ansan", true)
      .eq("is_bangje", false)
      .order("rl_openg_dt", { ascending: false }),
    supabase.from("bids").select("*"),
    supabase
      .from("public_wins")
      .select("bid_ntce_no")
      .eq("is_ansan", true)
      .eq("is_bangje", false),
  ]);

  // 안산∩비방제 공고 참여자 전부 가져오기 (Supabase 기본 1000 row 제한 우회 — range 페이지네이션)
  const ansanNoticeNos = (ansanWinIds ?? []).map((r) => r.bid_ntce_no);
  const participants: PublicParticipant[] = [];
  if (ansanNoticeNos.length > 0) {
    const PAGE_SIZE = 1000;
    let from = 0;
    while (true) {
      const { data: pData } = await supabase
        .from("public_participants")
        .select("*")
        .in("bid_ntce_no", ansanNoticeNos)
        .order("openg_rank")
        .range(from, from + PAGE_SIZE - 1);
      const rows = (pData ?? []) as PublicParticipant[];
      participants.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
      if (from > 50000) break; // safety
    }
  }

  const wins = (winsData ?? []) as PublicWin[];
  const bids = (bidsData ?? []) as Bid[];

  const competitors = summarizeCompetitors(wins);
  const rates = wins.map((w) => Number(w.sucsfbid_rate)).filter((x) => x > 0);
  const histogram = buildRateHistogram(rates, 0.5);
  const agencies = summarizeAgencies(wins);
  // 키워드별 풀 분류: 참여자 기반(우선) vs 낙찰자 기반(레거시 비교용)
  const keywords = summarizeByKeywordParticipants(wins, participants);
  const keywordsLegacy = summarizeByKeyword(wins);

  // 모든 정상 참여자의 투찰률 분포 (낙찰자만이 아닌 전체)
  const partRates = participants
    .filter((p) => p.is_qualified)
    .map((p) => Number(p.bidprcrt))
    .filter((x) => x > 0);
  const partHistogram = buildRateHistogram(partRates, 0.5);
  const myParticipantRows = participants.filter((p) => p.prcbdr_bizno === MY_BIZNO);
  const myParticipantRates = myParticipantRows.map((p) => Number(p.bidprcrt)).filter((x) => x > 0);
  const myPartMedian =
    myParticipantRates.length > 0
      ? [...myParticipantRates].sort((a, b) => a - b)[Math.floor(myParticipantRates.length / 2)]
      : null;

  // 본인 18건의 my_bid 사정율 (vs 기초금액)
  const myBidRates = bids
    .filter((b) => b.my_bid_amount && b.base_amount)
    .map((b) => (Number(b.my_bid_amount) / Number(b.base_amount)) * 100);
  const myMedian =
    myBidRates.length > 0
      ? [...myBidRates].sort((a, b) => a - b)[Math.floor(myBidRates.length / 2)]
      : null;

  // 본인 vs 상위 5명 직접 매칭 (같은 공고 둘 다 정상 진입)
  const h2hSummaries = TOP5_COMPETITORS.map((c) =>
    buildHeadToHead(
      participants.map((p) => ({
        bid_ntce_no: p.bid_ntce_no,
        prcbdr_bizno: p.prcbdr_bizno ?? "",
        openg_rank: p.openg_rank ?? null,
        bidprcrt: p.bidprcrt != null ? Number(p.bidprcrt) : null,
      })),
      MY_BIZNO,
      c.bizno,
      c.name,
    ),
  ).filter((h) => h.total_overlap > 0);

  // 풀 통계
  const myCompetitor = competitors.find((c) => c.bizno === MY_BIZNO);
  const totalWins = wins.length;
  const competitorCount = competitors.length;
  const poolMedian =
    rates.length > 0
      ? [...rates].sort((a, b) => a - b)[Math.floor(rates.length / 2)]
      : 0;
  const maxBin = Math.max(...histogram.map((b) => b.count), 1);

  // 어제 공고 R26BK01294519 결과 매핑 (정상/미달 표시용)
  const YESTERDAY_RANK_MAP: Record<string, { rank: number; status: string; rate: number }> = {
    "4958603422": { rank: 1, status: "정상", rate: 90.327 },
    "1342875415": { rank: 2, status: "정상", rate: 90.329 },
    "4748703489": { rank: 3, status: "정상", rate: 90.378 },
    "1058651768": { rank: 4, status: "정상", rate: 90.378 },
    "1342271760": { rank: 5, status: "정상", rate: 90.481 },
    "4032106590": { rank: 6, status: "정상", rate: 90.506 },
    "8508803021": { rank: 7, status: "정상", rate: 90.556 },
    "1408172761": { rank: 8, status: "정상", rate: 90.576 },
    "1408147374": { rank: 9, status: "정상", rate: 90.605 },
    "1248602216": { rank: 10, status: "정상", rate: 90.65 },
    "8965100645": { rank: 11, status: "정상", rate: 90.655 },
    "3128702542": { rank: 12, status: "정상", rate: 90.681 },
    "7888603023": { rank: 13, status: "정상", rate: 90.709 },
    "1348629134": { rank: 14, status: "정상", rate: 90.786 },
    "1340369716": { rank: 15, status: "정상", rate: 90.809 },
    "6548802894": { rank: 16, status: "정상", rate: 90.834 },
    "3178700480": { rank: 17, status: "정상", rate: 90.84 },
    "7648800359": { rank: 18, status: "정상", rate: 90.848 },
    "8658803095": { rank: 19, status: "정상", rate: 90.911 },
    "2158743771": { rank: 20, status: "정상", rate: 91.033 },
    "1400716186": { rank: 21, status: "정상", rate: 91.071 },
    "3754400359": { rank: 22, status: "정상", rate: 91.117 },
    "1348611992": { rank: 23, status: "정상", rate: 91.221 },
    "1348649862": { rank: 24, status: "정상", rate: 91.235 },
    "4140199674": { rank: 25, status: "정상", rate: 91.683 },
    "1348172941": { rank: 26, status: "정상", rate: 93.336 },
    "4078111745": { rank: 27, status: "미달", rate: 88.861 },
  };

  // 본인 미참여 분석: 199 공고 - 본인 32 정상 참여 - 본인 19건 DB 매칭
  const myParticipatedNoticeNos = new Set(myParticipantRows.map((p) => p.bid_ntce_no));
  const myDbNoticeNos = new Set(
    bids.map((b) => (b.notice_no ?? "").replace(/-\d+$/, "")).filter(Boolean),
  );
  // 본인이 어떤 식으로든(API 정상 + DB) 참여한 공고
  const myAnyTouchedNoticeNos = new Set([...myParticipatedNoticeNos, ...myDbNoticeNos]);
  const missedWins = wins.filter((w) => !myAnyTouchedNoticeNos.has(w.bid_ntce_no));

  // 미참여 공고를 키워드로 분류
  const missedClassified = missedWins.map((w) => ({
    win: w,
    classification: classifyNoticeByKeywords(w.bid_ntce_nm, keywords),
  }));
  const missedSafe = missedClassified.filter((x) => x.classification.poolType === "안전형");
  const missedMixed = missedClassified.filter((x) => x.classification.poolType === "혼합");
  const missedAggressive = missedClassified.filter((x) => x.classification.poolType === "공격형");

  // 미참여 발주처별 집계
  const missedByAgency = new Map<string, number>();
  for (const m of missedWins) {
    const k = m.dminstt_nm ?? "?";
    missedByAgency.set(k, (missedByAgency.get(k) ?? 0) + 1);
  }
  const missedAgencyRows = [...missedByAgency.entries()]
    .map(([agency, count]) => ({ agency, count }))
    .sort((a, b) => b.count - a.count);

  // 시기별 집계 (연-월)
  const missedByMonth = new Map<string, number>();
  for (const m of missedWins) {
    const ym = (m.rl_openg_dt ?? "").slice(0, 7);
    if (!ym) continue;
    missedByMonth.set(ym, (missedByMonth.get(ym) ?? 0) + 1);
  }
  const missedMonthRows = [...missedByMonth.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));

  // 본인 19건 중 미달 4건 패턴
  const myUnderThreshold = bids.filter((b) => b.result_status === "낙찰하한선미달");

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold">안산 비방제 경쟁 풀 분석</h1>
        <p className="mt-1 text-sm text-slate-600">
          공공데이터포털 낙찰정보서비스로 수집한 <strong>5년치 안산 비방제 공사 낙찰 {totalWins}건</strong>{" "}
          ({competitorCount}개 업체). 본인 회사가 이 풀의 어디에 위치하는지, 누가 반복 경쟁자인지 파악합니다.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          ※ 5년 누적 (2021~2026).
        </p>
      </section>

      <PoolPredictor keywords={keywords} />

      {/* 본인 32건 정상 투찰 분포 (scope 2 API 데이터) */}
      {myParticipantRates.length > 0 && (
        <section className="rounded border border-emerald-200 bg-emerald-50/50 p-4">
          <h2 className="text-base font-semibold">본인(새빛조경) 정상 투찰 패턴</h2>
          <p className="mt-1 text-xs text-slate-600">
            scope 2 API에서 추출한 본인의 정상 투찰 {myParticipantRates.length}건 (5년).
            본인 DB 19건과 별개 — DB는 미달·순위권밖 편중 표본이라 분포가 좁아 보임. 실제 본인은 더 광범위하게 시도 중.
          </p>
          {(() => {
            const myBins: { range: string; count: number }[] = [];
            for (let s = 88.5; s < 92; s += 0.5) {
              const c = myParticipantRates.filter((r) => r >= s && r < s + 0.5).length;
              myBins.push({ range: `${s.toFixed(1)}~${(s + 0.5).toFixed(1)}%`, count: c });
            }
            const max = Math.max(...myBins.map((b) => b.count), 1);
            return (
              <div className="mt-3 space-y-1 rounded border border-slate-200 bg-white p-3">
                {myBins.map((b) => (
                  <div key={b.range} className="flex items-center gap-2 text-xs">
                    <div className="w-20 shrink-0 text-right font-mono text-slate-600">{b.range}</div>
                    <div className="relative h-4 flex-1 rounded bg-slate-50">
                      <div
                        className="h-full rounded bg-emerald-500"
                        style={{ width: `${(b.count / max) * 100}%` }}
                      />
                    </div>
                    <div className="w-10 text-right font-mono text-slate-700">{b.count}</div>
                  </div>
                ))}
              </div>
            );
          })()}
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
            <div className="rounded border border-emerald-200 bg-white p-2">
              <div className="text-slate-600">최저 투찰률</div>
              <div className="font-mono text-base">{Math.min(...myParticipantRates).toFixed(2)}%</div>
            </div>
            <div className="rounded border border-emerald-200 bg-white p-2">
              <div className="text-slate-600">최고 투찰률</div>
              <div className="font-mono text-base">{Math.max(...myParticipantRates).toFixed(2)}%</div>
            </div>
            <div className="rounded border border-emerald-200 bg-white p-2">
              <div className="text-slate-600">median</div>
              <div className="font-mono text-base">
                {myPartMedian != null ? myPartMedian.toFixed(2) : "n/a"}%
              </div>
            </div>
            <div className="rounded border border-emerald-200 bg-white p-2">
              <div className="text-slate-600">88.5~89.0% 시도</div>
              <div className="font-mono text-base">
                {myParticipantRates.filter((r) => r >= 88.5 && r < 89).length}회
              </div>
            </div>
          </div>

          {/* 본인 32회 매트릭스 — 공고별 입력 + 결과 */}
          {(() => {
            const winsByNo = new Map<string, PublicWin>();
            for (const w of wins) winsByNo.set(w.bid_ntce_no, w);
            const partsByNo = new Map<string, PublicParticipant[]>();
            for (const p of participants) {
              if (!partsByNo.has(p.bid_ntce_no)) partsByNo.set(p.bid_ntce_no, []);
              partsByNo.get(p.bid_ntce_no)!.push(p);
            }
            const myRows = myParticipantRows
              .map((p) => {
                const win = winsByNo.get(p.bid_ntce_no);
                const allParts = partsByNo.get(p.bid_ntce_no) ?? [];
                const top = allParts.find((x) => x.openg_rank === 1) ?? null;
                const myRate = Number(p.bidprcrt);
                const winRate = top ? Number(top.bidprcrt) : null;
                const gap = winRate != null ? +(myRate - winRate).toFixed(3) : null;
                return {
                  bid_ntce_no: p.bid_ntce_no,
                  bid_ntce_nm: win?.bid_ntce_nm ?? "?",
                  agency: win?.dminstt_nm ?? "?",
                  bid_date: p.bidprc_dt ?? win?.rl_openg_dt ?? "",
                  my_rate: myRate,
                  my_rank: p.openg_rank,
                  total_qualified: allParts.filter((x) => x.is_qualified).length,
                  win_rate: winRate,
                  win_name: top?.prcbdr_nm ?? "",
                  win_bizno: top?.prcbdr_bizno ?? "",
                  gap,
                  is_won: top?.prcbdr_bizno === MY_BIZNO,
                };
              })
              .sort((a, b) => (b.bid_date > a.bid_date ? 1 : -1));

            // 발주처별 본인 진입 vs 낙찰
            const byAgency = new Map<string, { tries: number; wins: number; ranks: number[] }>();
            for (const r of myRows) {
              const k = r.agency;
              if (!byAgency.has(k)) byAgency.set(k, { tries: 0, wins: 0, ranks: [] });
              const e = byAgency.get(k)!;
              e.tries++;
              if (r.is_won) e.wins++;
              e.ranks.push(r.my_rank);
            }
            const agencyRows = [...byAgency.entries()]
              .map(([agency, v]) => ({
                agency,
                tries: v.tries,
                wins: v.wins,
                avgRank: v.ranks.reduce((s, x) => s + x, 0) / v.ranks.length,
                bestRank: Math.min(...v.ranks),
              }))
              .sort((a, b) => b.tries - a.tries);

            return (
              <>
                <h3 className="mt-5 text-sm font-medium">발주처별 본인 진입·낙찰</h3>
                <div className="mt-2 overflow-x-auto rounded border border-slate-200 bg-white">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="px-2 py-1.5 text-left">발주처</th>
                        <th className="px-2 py-1.5 text-right">시도</th>
                        <th className="px-2 py-1.5 text-right">낙찰</th>
                        <th className="px-2 py-1.5 text-right">평균 순위</th>
                        <th className="px-2 py-1.5 text-right">최고 순위</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agencyRows.map((r) => (
                        <tr key={r.agency} className="border-t even:bg-slate-50">
                          <td className="px-2 py-1.5">{r.agency}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{r.tries}</td>
                          <td className="px-2 py-1.5 text-right font-mono">
                            {r.wins > 0 ? <span className="font-bold text-emerald-700">{r.wins}</span> : "-"}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-slate-600">
                            {r.avgRank.toFixed(1)}위
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">{r.bestRank}위</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h3 className="mt-5 text-sm font-medium">본인 32회 입력 매트릭스 (최신순)</h3>
                <div className="mt-2 overflow-x-auto rounded border border-slate-200 bg-white">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="px-2 py-1.5 text-left">개찰일</th>
                        <th className="px-2 py-1.5 text-left">공고명</th>
                        <th className="px-2 py-1.5 text-right">내 투찰률</th>
                        <th className="px-2 py-1.5 text-center">내 순위</th>
                        <th className="px-2 py-1.5 text-right">1위 투찰률</th>
                        <th className="px-2 py-1.5 text-right">격차</th>
                        <th className="px-2 py-1.5 text-left">낙찰자</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myRows.map((r) => {
                        const isClose = r.gap != null && Math.abs(r.gap) < 0.5;
                        return (
                          <tr key={r.bid_ntce_no} className={`border-t ${r.is_won ? "bg-emerald-50 font-medium" : "even:bg-slate-50"}`}>
                            <td className="px-2 py-1.5 font-mono text-slate-600">
                              {r.bid_date.slice(0, 10)}
                            </td>
                            <td className="px-2 py-1.5">
                              {r.bid_ntce_nm.length > 36 ? r.bid_ntce_nm.slice(0, 36) + "…" : r.bid_ntce_nm}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono">{r.my_rate.toFixed(2)}%</td>
                            <td className="px-2 py-1.5 text-center">
                              <span
                                className={`rounded px-1.5 py-0.5 text-xs ${
                                  r.my_rank === 1
                                    ? "bg-emerald-200 text-emerald-900"
                                    : r.my_rank <= 5
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {r.my_rank}/{r.total_qualified}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono text-slate-600">
                              {r.win_rate != null ? `${r.win_rate.toFixed(2)}%` : "-"}
                            </td>
                            <td className={`px-2 py-1.5 text-right font-mono ${isClose ? "text-amber-700 font-medium" : "text-slate-500"}`}>
                              {r.gap != null ? (r.gap > 0 ? `+${r.gap.toFixed(2)}` : r.gap.toFixed(2)) : "-"}
                            </td>
                            <td className="px-2 py-1.5 text-xs text-slate-600">
                              {r.win_name.length > 14 ? r.win_name.slice(0, 14) + "…" : r.win_name}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 text-[11px] text-slate-500">
                  ※ 격차 = 본인 투찰률 − 1위 투찰률. 양수일수록 본인이 높게 썼다는 뜻 (낙찰 못 함).
                  음수면 본인이 더 낮게 썼는데 다른 평가요소(추첨번호 등)로 1위 안 됨.
                </div>
              </>
            );
          })()}
        </section>
      )}

      {/* 본인 미참여 공고 분석 */}
      {missedWins.length > 0 && (
        <section className="rounded border border-rose-200 bg-rose-50/40 p-4">
          <h2 className="text-base font-semibold">본인 미참여 공고 분석 (놓친 기회)</h2>
          <p className="mt-1 text-xs text-slate-600">
            안산∩비방제 652건 중 본인이 안 들어간 공고. 본인 시도 빈도 증가가 가장 큰 개선 여지 — 아래 분류로 우선 타겟 도출.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card label="미참여 총" value={`${missedWins.length}건`} sub={`전체 ${wins.length}건 중`} />
            <Card label="안전형" value={`${missedSafe.length}건`} sub="우선 타겟" highlight="green" />
            <Card label="혼합" value={`${missedMixed.length}건`} sub="조건부 검토" />
            <Card label="공격형" value={`${missedAggressive.length}건`} sub="패스 추천" />
          </div>

          {/* 안전형 미참여 공고 — 본인이 노렸어야 할 곳 */}
          <h3 className="mt-5 text-sm font-medium text-emerald-800">
            🟢 안전형 미참여 ({missedSafe.length}건) — 본인이 노렸어야 할 공고
          </h3>
          <p className="text-xs text-slate-500">
            키워드 매칭 안전 % ≥ 55%. 본인 평소 90%대 투찰로 충분히 경쟁 가능했던 공고들.
          </p>
          <div className="mt-2 max-h-96 overflow-y-auto rounded border border-slate-200 bg-white">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-2 py-1.5 text-left">개찰일</th>
                  <th className="px-2 py-1.5 text-left">공고명</th>
                  <th className="px-2 py-1.5 text-left">발주처</th>
                  <th className="px-2 py-1.5 text-right">낙찰률</th>
                  <th className="px-2 py-1.5 text-right">참여수</th>
                  <th className="px-2 py-1.5 text-left">매칭 키워드</th>
                </tr>
              </thead>
              <tbody>
                {missedSafe
                  .sort(
                    (a, b) =>
                      (b.win.rl_openg_dt ?? "") > (a.win.rl_openg_dt ?? "") ? 1 : -1,
                  )
                  .map((m) => (
                    <tr key={m.win.id} className="border-t even:bg-slate-50">
                      <td className="px-2 py-1.5 font-mono text-slate-600">
                        {(m.win.rl_openg_dt ?? "").slice(0, 10)}
                      </td>
                      <td className="px-2 py-1.5">
                        {m.win.bid_ntce_nm.length > 30
                          ? m.win.bid_ntce_nm.slice(0, 30) + "…"
                          : m.win.bid_ntce_nm}
                      </td>
                      <td className="px-2 py-1.5 text-slate-600">
                        {(m.win.dminstt_nm ?? "").replace("경기도 ", "").replace("경기도교육청 ", "")}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {m.win.sucsfbid_rate}%
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {m.win.prtcpt_cnum ?? "-"}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-slate-500">
                        {m.classification.matchedKeywords.slice(0, 3).join(", ")}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* 미참여 발주처별 분포 */}
          <h3 className="mt-5 text-sm font-medium">미참여 발주처별 분포</h3>
          <p className="text-xs text-slate-500">발주처별 모니터링 부재 또는 자격 미달 가능성 식별.</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {missedAgencyRows.map((r) => (
              <div
                key={r.agency}
                className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-1.5 text-xs"
              >
                <span>{r.agency}</span>
                <span className="font-mono text-slate-700">
                  {r.count}건 ({((r.count / missedWins.length) * 100).toFixed(0)}%)
                </span>
              </div>
            ))}
          </div>

          {/* 시기별 미참여 — 일정 충돌 패턴 */}
          <h3 className="mt-5 text-sm font-medium">월별 미참여 추이</h3>
          <p className="text-xs text-slate-500">
            특정 시기에 미참여 집중 = 일정 충돌 / 모니터링 부재 가능성. 이 패턴이 있으면 그 시기 알림 자동화 가치.
          </p>
          <div className="mt-2 max-h-64 overflow-y-auto rounded border border-slate-200 bg-white p-2">
            {(() => {
              const max = Math.max(...missedMonthRows.map(([, n]) => n), 1);
              return missedMonthRows.map(([ym, n]) => (
                <div key={ym} className="flex items-center gap-2 text-xs">
                  <div className="w-16 shrink-0 font-mono text-slate-600">{ym}</div>
                  <div className="relative h-4 flex-1 rounded bg-slate-50">
                    <div
                      className="h-full rounded bg-rose-400"
                      style={{ width: `${(n / max) * 100}%` }}
                    />
                  </div>
                  <div className="w-8 text-right font-mono text-slate-700">{n}</div>
                </div>
              ));
            })()}
          </div>

          {/* 본인 미달 4건 패턴 (DB 기반) */}
          {myUnderThreshold.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-medium text-rose-800">
                🔴 본인 낙찰하한선미달 {myUnderThreshold.length}건 — 피해야 했던 공고
              </h3>
              <p className="text-xs text-slate-500">
                본인 DB에 기록된 미달 케이스. 같은 패턴(발주처/공고 종류)이 반복되면 진입 자제 신호.
              </p>
              <div className="mt-2 rounded border border-slate-200 bg-white">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-2 py-1.5 text-left">개찰일</th>
                      <th className="px-2 py-1.5 text-left">공고명</th>
                      <th className="px-2 py-1.5 text-left">발주처</th>
                      <th className="px-2 py-1.5 text-right">내 투찰률</th>
                      <th className="px-2 py-1.5 text-right">사정율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myUnderThreshold.map((b) => {
                      const myRate = b.my_bid_amount && b.base_amount
                        ? (Number(b.my_bid_amount) / Number(b.base_amount)) * 100
                        : null;
                      const winRate = b.winning_amount && b.base_amount
                        ? (Number(b.winning_amount) / Number(b.base_amount)) * 100
                        : null;
                      return (
                        <tr key={b.id} className="border-t even:bg-slate-50">
                          <td className="px-2 py-1.5 font-mono text-slate-600">
                            {(b.bid_date ?? "").slice(0, 10)}
                          </td>
                          <td className="px-2 py-1.5">
                            {b.notice_title.length > 28
                              ? b.notice_title.slice(0, 28) + "…"
                              : b.notice_title}
                          </td>
                          <td className="px-2 py-1.5 text-slate-600">{b.agency}</td>
                          <td className="px-2 py-1.5 text-right font-mono">
                            {myRate != null ? myRate.toFixed(2) + "%" : "-"}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-slate-600">
                            {winRate != null ? winRate.toFixed(2) + "%" : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            <div className="font-medium">행동 가이드</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>
                <strong>안전형 미참여 {missedSafe.length}건</strong> 중 발주처·시기 패턴을 보고 본인이 놓친 공고 유형 파악
              </li>
              <li>본인 미참여 공고 발주처 Top 3 = <strong>{missedAgencyRows.slice(0, 3).map((r) => r.agency).join(", ")}</strong>: 모니터링 강화</li>
              <li>월별 미참여 집중 시기 = 일정 시스템 검토</li>
              <li>미달 패턴 반복되면 그 발주처/공고 유형 진입 자제</li>
            </ul>
          </div>
        </section>
      )}

      {/* 참여자 데이터 요약 (op13에서 수집된 정상 참여자) */}
      {participants.length > 0 && (
        <section className="rounded border border-purple-200 bg-purple-50/50 p-4">
          <h2 className="text-base font-semibold">정상 참여자 데이터 (op13 수집)</h2>
          <p className="mt-1 text-xs text-slate-600">
            낙찰자 외에도 모든 정상 투찰자 정보 추가 수집됨. 이중 봉우리 분포가 더 정확해집니다.
            <br />
            <span className="text-slate-400">※ 낙찰하한선미달은 API 미제공으로 누락</span>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card label="총 정상 참여자" value={`${partRates.length}명`} sub={`${ansanNoticeNos.length} 공고 × 평균 ${(partRates.length / Math.max(1, ansanNoticeNos.length)).toFixed(1)}명`} />
            <Card label="새빛조경 정상 투찰" value={`${myParticipantRates.length}회`} sub="5년 누적" highlight="green" />
            <Card
              label="본인 median 투찰률"
              value={myPartMedian != null ? `${myPartMedian.toFixed(2)}%` : "n/a"}
              sub="공공데이터 기준 (vs 예정가격)"
              highlight="green"
            />
            <Card
              label="모든 참여자 median"
              value={
                partRates.length
                  ? `${[...partRates].sort((a, b) => a - b)[Math.floor(partRates.length / 2)].toFixed(2)}%`
                  : "n/a"
              }
              sub="vs 예정가격"
              highlight="blue"
            />
          </div>

          <h3 className="mt-4 text-sm font-medium">모든 정상 참여자 투찰률 분포</h3>
          <p className="text-xs text-slate-500">
            낙찰자(Top1)뿐만 아니라 정상 투찰한 모든 순위 포함. 표본 약{" "}
            {partRates.length}건 (낙찰자 단독 분포보다 약 {(partRates.length / Math.max(1, rates.length)).toFixed(1)}배).
          </p>
          <div className="mt-2 space-y-1 rounded border border-slate-200 bg-white p-3">
            {partHistogram.map((b) => {
              const max = Math.max(...partHistogram.map((x) => x.count), 1);
              return (
                <div key={b.rangeStart} className="flex items-center gap-2 text-xs">
                  <div className="w-20 shrink-0 text-right font-mono text-slate-600">
                    {b.rangeStart.toFixed(1)}~{b.rangeEnd.toFixed(1)}%
                  </div>
                  <div className="relative h-4 flex-1 rounded bg-slate-50">
                    <div
                      className="h-full rounded bg-purple-500"
                      style={{ width: `${(b.count / max) * 100}%` }}
                    />
                  </div>
                  <div className="w-12 text-right font-mono text-slate-700">{b.count}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 요약 카드 */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="풀 크기" value={`${totalWins}건`} sub={`연 ${(totalWins / 3).toFixed(0)}건`} />
        <Card label="고유 낙찰자" value={`${competitorCount}명`} sub="5년 누적" />
        <Card
          label="풀 median 낙찰률"
          value={`${poolMedian.toFixed(2)}%`}
          sub="vs 예정가격"
          highlight="blue"
        />
        <Card
          label="본인 median 투찰률"
          value={myMedian != null ? `${myMedian.toFixed(2)}%` : "n/a"}
          sub={`내 ${myBidRates.length}건 (vs 기초금액)`}
          highlight="green"
        />
      </section>

      {/* 본인 위치 알림 */}
      {myCompetitor && (
        <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm">
          <div className="font-medium text-amber-900">본인 회사 (새빛조경) 위치</div>
          <div className="mt-2 space-y-1 text-amber-800">
            <div>
              · 5년 안산 비방제 낙찰: <strong>{myCompetitor.wins}건</strong>{" "}
              ({competitors.findIndex((c) => c.bizno === MY_BIZNO) + 1}위 / {competitorCount}명)
            </div>
            <div>
              · 평균 낙찰률 <strong>{myCompetitor.rateMean.toFixed(2)}%</strong> — 풀 median {poolMedian.toFixed(2)}%보다 {(myCompetitor.rateMean - poolMedian).toFixed(2)}%p {myCompetitor.rateMean > poolMedian ? "높음" : "낮음"}
            </div>
            {myMedian != null && (
              <div>
                · 본인 평소 투찰률 median {myMedian.toFixed(2)}% (vs 기초금액). 풀 낙찰률 분포는 vs 예정가격이라 직접 비교는 주의 필요.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 낙찰률 히스토그램 */}
      <section>
        <h2 className="text-lg font-semibold">낙찰률 분포 (예정가격 대비)</h2>
        <p className="mt-1 text-xs text-slate-500">5년치 {totalWins}건. 0.5%p 단위 bin.</p>
        <div className="mt-3 space-y-1 rounded border border-slate-200 bg-slate-50 p-3">
          {histogram.map((b) => (
            <div key={b.rangeStart} className="flex items-center gap-2 text-xs">
              <div className="w-20 shrink-0 text-right font-mono text-slate-600">
                {b.rangeStart.toFixed(1)}~{b.rangeEnd.toFixed(1)}%
              </div>
              <div className="relative h-4 flex-1 rounded bg-white">
                <div
                  className="h-full rounded bg-blue-500"
                  style={{ width: `${(b.count / maxBin) * 100}%` }}
                />
              </div>
              <div className="w-10 text-right font-mono text-slate-700">{b.count}</div>
            </div>
          ))}
        </div>
      </section>


      {/* 본인 vs 상위 5명 직접 매칭 */}
      {h2hSummaries.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">⚔️ 본인 vs 상위 5명 — 같은 공고 직접 매칭</h2>
          <p className="mt-1 text-xs text-slate-500">
            같은 공고에 둘 다 정상 진입한 케이스만. 평균 차이가 마이너스면 본인이 더 공격적으로 (낮게) 썼다는 뜻.
          </p>
          <div className="mt-3 overflow-x-auto rounded border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-xs text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">경쟁자</th>
                  <th className="px-3 py-2 text-right">겹친 공고</th>
                  <th className="px-3 py-2 text-right">본인 평균</th>
                  <th className="px-3 py-2 text-right">상대 평균</th>
                  <th className="px-3 py-2 text-right">평균 차이</th>
                  <th className="hidden px-3 py-2 text-center sm:table-cell">본인 더 낮음</th>
                  <th className="hidden px-3 py-2 text-center sm:table-cell">상대 더 낮음</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {h2hSummaries.map((h) => (
                  <tr key={h.opp_bizno}>
                    <td className="px-3 py-2 font-medium">{h.opp_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{h.total_overlap}건</td>
                    <td className="px-3 py-2 text-right tabular-nums">{h.avg_my_rate?.toFixed(2)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">{h.avg_opp_rate?.toFixed(2)}%</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${
                      (h.avg_gap_pp ?? 0) > 0 ? "text-red-600" : "text-emerald-600"
                    }`}>
                      {(h.avg_gap_pp ?? 0) > 0 ? "+" : ""}{h.avg_gap_pp?.toFixed(2)}%p
                    </td>
                    <td className="hidden px-3 py-2 text-center tabular-nums text-emerald-700 sm:table-cell">
                      {h.my_lower_count}
                    </td>
                    <td className="hidden px-3 py-2 text-center tabular-nums text-red-700 sm:table-cell">
                      {h.opp_lower_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            ※ 같은 공고에 둘 다 정상 진입한 케이스만. 미달은 op13 데이터에 안 잡혀 제외됨.
          </p>
        </section>
      )}

      {/* 반복 경쟁자 Top 20 */}
      <section>
        <h2 className="text-lg font-semibold">반복 경쟁자 Top 20</h2>
        <p className="mt-1 text-xs text-slate-500">
          5년 안산 비방제 낙찰 건수 기준. 어제 공고 등수 표시.
        </p>
        <div className="mt-3 overflow-x-auto rounded border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2 text-right">#</th>
                <th className="px-3 py-2 text-left">업체</th>
                <th className="px-3 py-2 text-right">5년 낙찰</th>
                <th className="px-3 py-2 text-right">연 환산</th>
                <th className="px-3 py-2 text-right">낙찰률 median</th>
                <th className="px-3 py-2 text-right">낙찰률 범위 (P25~P75)</th>
                <th className="px-3 py-2 text-center">어제 등수</th>
                <th className="px-3 py-2 text-left">주요 발주처</th>
              </tr>
            </thead>
            <tbody>
              {competitors.slice(0, 20).map((c, i) => {
                const yesterday = YESTERDAY_RANK_MAP[c.bizno];
                const isMe = c.bizno === MY_BIZNO;
                return (
                  <tr
                    key={c.bizno}
                    className={`border-t ${isMe ? "bg-emerald-50 font-medium" : "even:bg-slate-50"}`}
                  >
                    <td className="px-3 py-2 text-right text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2">
                      {c.name}
                      {isMe && <span className="ml-1 rounded bg-emerald-200 px-1 text-xs">본인</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{c.wins}건</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-500">
                      {(c.wins / 3).toFixed(1)}건/년
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{c.rateMedian.toFixed(2)}%</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600">
                      {c.rateP25.toFixed(2)} ~ {c.rateP75.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {yesterday ? (
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs ${
                            yesterday.status === "정상"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {yesterday.rank}위 {yesterday.status}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">미참여</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {c.topAgencies
                        .slice(0, 2)
                        .map((a) => `${a.agency.replace("경기도 ", "").replace("경기도교육청 ", "")} ${a.count}`)
                        .join(", ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 공고명 키워드별 풀 분류 — 도구화의 핵심 */}
      <section>
        <h2 className="text-lg font-semibold">공고명 키워드별 풀 분류 — 본인 진입 가능성 (핵심)</h2>
        <p className="mt-1 text-xs text-slate-500">
          공고명에 특정 키워드 포함된 낙찰들의 88%/90% 봉우리 비율. 새 공고 마주쳤을 때
          이 표를 보고 "이 공고는 안전형 풀일 확률 높음/낮음" 즉시 판단.
          안전형 비율 높은 키워드 순 정렬.
        </p>
        <div className="mt-3 overflow-x-auto rounded border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">키워드</th>
                <th className="px-3 py-2 text-center">분류</th>
                <th className="px-3 py-2 text-right">총</th>
                <th className="px-3 py-2 text-right">공격형</th>
                <th className="px-3 py-2 text-right">갭</th>
                <th className="px-3 py-2 text-right">안전형</th>
                <th className="px-3 py-2 text-right">median</th>
                <th className="px-3 py-2 text-left">예시 공고명</th>
              </tr>
            </thead>
            <tbody>
              {keywords.map((kw) => {
                const badge =
                  kw.poolType === "안전형"
                    ? "bg-emerald-100 text-emerald-800"
                    : kw.poolType === "공격형"
                      ? "bg-red-100 text-red-800"
                      : kw.poolType === "혼합"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-slate-600";
                return (
                  <tr key={kw.keyword} className="border-t even:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{kw.keyword}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`rounded px-2 py-0.5 text-xs ${badge}`}>{kw.poolType}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{kw.total}</td>
                    <td className="px-3 py-2 text-right font-mono text-red-600">
                      {kw.aggressive} ({(kw.aggressivePct * 100).toFixed(0)}%)
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-500">{kw.gap}</td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-700">
                      {kw.safe} ({(kw.safePct * 100).toFixed(0)}%)
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{kw.rateMedian.toFixed(2)}%</td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {kw.sampleNames[0] ?? ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          ※ 키워드는 사전 정의된 도메인 단어 기준. 키워드 추가/조정은 <code>src/lib/analysis/scope2.ts</code>의{" "}
          <code>DOMAIN_KEYWORDS</code> 배열 수정.
        </div>
      </section>

      {/* 발주처별 풀 분류 (이중 봉우리 비율) */}
      <section>
        <h2 className="text-lg font-semibold">발주처별 풀 분류 — 본인 진입 가능성</h2>
        <p className="mt-1 text-xs text-slate-500">
          88% 공격형 vs 90% 안전형 비율로 발주처 분류. 안전형 비중이 높은 발주처가
          본인(평균 90.33%)에게 유리.
          <br />
          <span className="text-slate-400">기준: 공격형 &lt; 89.0% / 안전형 ≥ 89.5% / 60% 이상이면 dominant</span>
        </p>
        <div className="mt-3 overflow-x-auto rounded border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">발주처</th>
                <th className="px-3 py-2 text-center">분류</th>
                <th className="px-3 py-2 text-right">총</th>
                <th className="px-3 py-2 text-right">공격형</th>
                <th className="px-3 py-2 text-right">갭</th>
                <th className="px-3 py-2 text-right">안전형</th>
                <th className="px-3 py-2 text-right">median</th>
                <th className="px-3 py-2 text-left">Top 낙찰자</th>
              </tr>
            </thead>
            <tbody>
              {agencies.filter((a) => a.total >= 3).map((ag) => {
                const badge =
                  ag.poolType === "안전형"
                    ? "bg-emerald-100 text-emerald-800"
                    : ag.poolType === "공격형"
                      ? "bg-red-100 text-red-800"
                      : ag.poolType === "혼합"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-slate-600";
                return (
                  <tr key={ag.agency} className="border-t even:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{ag.agency}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`rounded px-2 py-0.5 text-xs ${badge}`}>
                        {ag.poolType}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{ag.total}</td>
                    <td className="px-3 py-2 text-right font-mono text-red-600">
                      {ag.aggressive} ({(ag.aggressivePct * 100).toFixed(0)}%)
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-500">{ag.gap}</td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-700">
                      {ag.safe} ({(ag.safePct * 100).toFixed(0)}%)
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{ag.rateMedian.toFixed(2)}%</td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {ag.topWinners
                        .slice(0, 3)
                        .map((w) =>
                          `${w.name.replace(/주식회사\s*|^\(주\)|\s*주식회사$/g, "")}${w.bizno === MY_BIZNO ? "(본인)" : ""} ${w.count}`,
                        )
                        .join(", ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
          <div className="font-medium">읽는 법</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>
              <strong>안전형</strong> 발주처 — 본인 평소 투찰률(90% 부근)로 충분히 경쟁 가능. 우선 노릴 곳.
            </li>
            <li>
              <strong>공격형</strong> 발주처 — 88% 미만 저가 투찰이 보통. 본인이 거기 들어가면 부적격 위험.
              참여하더라도 낙찰 어려움.
            </li>
            <li>
              <strong>혼합</strong> 발주처 — 공고마다 다름. 같은 발주처라도 건별 공고 조건(예산·자격) 봐야 함.
            </li>
          </ul>
        </div>
      </section>

      {/* 발주처별 Top 5 (참고용) */}
      <section>
        <h2 className="text-lg font-semibold">발주처별 자주 낙찰하는 업체 Top 5 (참고)</h2>
        <p className="mt-1 text-xs text-slate-500">5년 낙찰 건수 기준.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {agencies.slice(0, 8).map((ag) => (
            <div key={ag.agency} className="rounded border border-slate-200 p-3 text-sm">
              <div className="flex items-baseline justify-between">
                <div className="font-medium">{ag.agency}</div>
                <div className="text-xs text-slate-500">총 {ag.total}건</div>
              </div>
              <ol className="mt-2 space-y-1">
                {ag.topWinners.map((w, i) => (
                  <li
                    key={w.bizno}
                    className={`flex justify-between text-xs ${
                      w.bizno === MY_BIZNO ? "font-medium text-emerald-700" : "text-slate-700"
                    }`}
                  >
                    <span>
                      {i + 1}. {w.name}
                      {w.bizno === MY_BIZNO && " (본인)"}
                    </span>
                    <span className="font-mono">{w.count}건</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Card({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: "blue" | "green";
}) {
  const ring =
    highlight === "blue"
      ? "border-blue-200 bg-blue-50"
      : highlight === "green"
        ? "border-emerald-200 bg-emerald-50"
        : "border-slate-200 bg-white";
  return (
    <div className={`rounded border p-3 ${ring}`}>
      <div className="text-xs text-slate-600">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
