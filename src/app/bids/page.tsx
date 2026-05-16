import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Bid } from "@/types/bid";
import {
  calcMyBidRatio,
  calcMyGapRate,
  calcWinRatio,
  formatKRW,
  formatPercent,
} from "@/lib/analysis/calculations";
import BidRowActions from "@/components/BidRowActions";
import { MY_BIZNO } from "@/lib/config/myCompany";

export const dynamic = "force-dynamic";

const normalizeNo = (no: string) => (no ?? "").replace(/-\d+$/, "");

export default async function BidListPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("bids")
    .select("*")
    .order("bid_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const bids = (data ?? []) as Bid[];

  // 1등 정보 조인 (public_wins.bidwinnr_nm, sucsfbid_rate)
  const noticeNos = [...new Set(bids.map((b) => normalizeNo(b.notice_no)))];
  const { data: winsData } = await supabase
    .from("public_wins")
    .select("bid_ntce_no,bidwinnr_nm,bidwinnr_bizno,sucsfbid_amt,sucsfbid_rate")
    .in("bid_ntce_no", noticeNos);
  const winnerByNotice = Object.fromEntries(
    (winsData ?? []).map((w) => [w.bid_ntce_no, w]),
  );
  // 본인 등수 + 추첨번호 + 총 정상 참여자수 조회 (public_participants)
  const { data: myParts } = await supabase
    .from("public_participants")
    .select("bid_ntce_no,openg_rank,drwt_no_1,drwt_no_2")
    .eq("prcbdr_bizno", MY_BIZNO)
    .in("bid_ntce_no", noticeNos);
  const myRankByNotice = Object.fromEntries(
    (myParts ?? []).map((p) => [p.bid_ntce_no, p.openg_rank as number]),
  );
  const myDrwtByNotice = Object.fromEntries(
    (myParts ?? []).map((p) => [
      p.bid_ntce_no,
      [p.drwt_no_1, p.drwt_no_2].filter((n): n is string => !!n),
    ]),
  );

  // 1등 추첨번호 조회 (rank=1)
  const { data: winnerParts } = await supabase
    .from("public_participants")
    .select("bid_ntce_no,drwt_no_1,drwt_no_2")
    .eq("openg_rank", 1)
    .in("bid_ntce_no", noticeNos);
  const winnerDrwtByNotice = Object.fromEntries(
    (winnerParts ?? []).map((p) => [
      p.bid_ntce_no,
      [p.drwt_no_1, p.drwt_no_2].filter((n): n is string => !!n),
    ]),
  );
  const totalByNotice: Record<string, number> = {};
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: page } = await supabase
      .from("public_participants")
      .select("bid_ntce_no")
      .in("bid_ntce_no", noticeNos)
      .range(from, from + PAGE - 1);
    if (!page || page.length === 0) break;
    for (const r of page) {
      totalByNotice[r.bid_ntce_no] = (totalByNotice[r.bid_ntce_no] ?? 0) + 1;
    }
    if (page.length < PAGE) break;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">입찰 목록</h1>
        <Link
          href="/bids/new"
          className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
        >
          + 새 입찰 등록
        </Link>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          데이터를 불러오지 못했습니다: {error.message}
        </div>
      )}

      {bids.length === 0 ? (
        <div className="rounded border bg-white p-8 text-center text-sm text-slate-500">
          등록된 입찰이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-2 py-2 sm:px-3">공고</th>
                <th className="hidden px-3 py-2 sm:table-cell">개찰일</th>
                <th className="hidden px-3 py-2 text-right md:table-cell">기초금액</th>
                <th className="hidden px-3 py-2 text-right sm:table-cell">내 투찰률</th>
                <th className="px-2 py-2 text-center sm:px-3">결과</th>
                <th className="px-2 py-2 sm:px-3">사유 (1등 vs 본인)</th>
                <th className="hidden px-3 py-2 text-center sm:table-cell">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {bids.map((b) => {
                const myRatio = calcMyBidRatio(b);
                const key = normalizeNo(b.notice_no);
                const winnerRow = winnerByNotice[key];
                const winnerRate = winnerRow?.sucsfbid_rate ? Number(winnerRow.sucsfbid_rate) / 100 : null;
                const isMyWin = winnerRow?.bidwinnr_bizno === MY_BIZNO;
                const myRank = myRankByNotice[key] ?? null;
                const totalParts = totalByNotice[key] ?? null;
                const myDrwt = myDrwtByNotice[key] ?? [];
                const winnerDrwt = winnerDrwtByNotice[key] ?? [];
                return (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="px-2 py-2 sm:px-3">
                      <Link href={`/bids/${b.id}`} className="font-medium hover:underline">
                        {b.notice_title}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {b.agency} · {b.work_type}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400 sm:hidden">
                        {b.bid_date ?? "—"} · {formatPercent(myRatio)}
                      </div>
                    </td>
                    <td className="hidden px-3 py-2 text-xs text-slate-600 sm:table-cell">{b.bid_date ?? "—"}</td>
                    <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">
                      {formatKRW(b.base_amount)}
                    </td>
                    <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">
                      {formatPercent(myRatio)}
                    </td>
                    <td className="px-2 py-2 text-center sm:px-3">
                      <ResultBadge status={b.result_status} />
                    </td>
                    <td className="px-2 py-2 text-xs sm:px-3">
                      <ReasonCell
                        status={b.result_status}
                        winnerName={winnerRow?.bidwinnr_nm ?? null}
                        winnerRate={winnerRate}
                        myRatio={myRatio}
                        isMyWin={isMyWin}
                        myRank={myRank}
                        totalParts={totalParts}
                        myDrwt={myDrwt}
                        winnerDrwt={winnerDrwt}
                        sucsfbidLwltHint={null}
                      />
                    </td>
                    <td className="hidden px-3 py-2 text-center sm:table-cell">
                      <BidRowActions bidId={b.id} noticeTitle={b.notice_title} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ResultBadge({ status }: { status: string }) {
  const cls =
    status === "낙찰"
      ? "bg-green-100 text-green-700"
      : status === "2등"
        ? "bg-blue-100 text-blue-700"
        : status === "낙찰하한선미달"
          ? "bg-red-100 text-red-700"
          : status === "유찰"
            ? "bg-amber-100 text-amber-700"
            : "bg-slate-100 text-slate-600";
  return <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>{status}</span>;
}

function ReasonCell({
  status,
  winnerName,
  winnerRate,
  myRatio,
  isMyWin,
  myRank,
  totalParts,
  myDrwt,
  winnerDrwt,
}: {
  status: string;
  winnerName: string | null;
  winnerRate: number | null; // 0~1
  myRatio: number | null; // 0~1
  isMyWin: boolean;
  myRank: number | null;
  totalParts: number | null;
  myDrwt: string[];
  winnerDrwt: string[];
  sucsfbidLwltHint: number | null;
}) {
  const drwtLine =
    myDrwt.length > 0 || winnerDrwt.length > 0 ? (
      <div className="text-[11px] text-slate-500">
        {myDrwt.length > 0 && <span>본인 추첨 {myDrwt.join(",")}</span>}
        {myDrwt.length > 0 && winnerDrwt.length > 0 && <span> · </span>}
        {winnerDrwt.length > 0 && <span>1등 추첨 {winnerDrwt.join(",")}</span>}
      </div>
    ) : null;
  const rankLabel =
    myRank != null
      ? totalParts != null
        ? `본인 ${myRank}/${totalParts}등`
        : `본인 ${myRank}등`
      : null;
  if (status === "낙찰") {
    return (
      <div>
        <div className="text-emerald-700 font-medium">
          ★ 본인 1등{totalParts != null && <span className="ml-1 text-slate-500 font-normal">/ {totalParts}명 중</span>}
        </div>
        {drwtLine}
      </div>
    );
  }
  if (status === "낙찰하한선미달") {
    return (
      <div>
        <div className="text-red-700">
          🚫 부적격
          {myRatio != null && (
            <span className="ml-1 text-slate-500">
              (본인 {(myRatio * 100).toFixed(2)}%, cutoff 미달)
            </span>
          )}
        </div>
        {drwtLine}
      </div>
    );
  }
  if (status === "유찰") {
    return <span className="text-slate-500">유찰 (낙찰자 없음)</span>;
  }
  // 2등 / 순위권밖
  if (!winnerName || winnerRate == null) {
    return <span className="text-slate-400">—</span>;
  }
  if (isMyWin) {
    return <span className="text-emerald-700">★ 본인 (DB 동기화 중)</span>;
  }
  const gapPp = myRatio != null ? (myRatio - winnerRate) * 100 : null;
  return (
    <div>
      <div className="text-slate-700">
        1등 <span className="font-medium">{winnerName}</span>
        {rankLabel && <span className="ml-2 text-xs text-slate-500">({rankLabel})</span>}
      </div>
      <div className="text-[11px] text-slate-500">
        1등 사정율 {(winnerRate * 100).toFixed(2)}%
        {gapPp != null && (
          <span className={gapPp > 0 ? " text-red-600" : " text-emerald-600"}>
            {" · "}본인 {gapPp > 0 ? "+" : ""}
            {gapPp.toFixed(2)}%p {gapPp > 0 ? "비쌌음" : "낮았음"}
          </span>
        )}
      </div>
      {drwtLine}
    </div>
  );
}
