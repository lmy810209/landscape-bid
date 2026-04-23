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

export const dynamic = "force-dynamic";

export default async function BidListPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("bids")
    .select("*")
    .order("bid_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const bids = (data ?? []) as Bid[];

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
                <th className="px-3 py-2">공고</th>
                <th className="px-3 py-2">발주처/공종</th>
                <th className="px-3 py-2">개찰일</th>
                <th className="px-3 py-2 text-right">기초금액</th>
                <th className="px-3 py-2 text-right">사정율</th>
                <th className="px-3 py-2 text-right">내 투찰률</th>
                <th className="px-3 py-2 text-right">내 차이값</th>
                <th className="px-3 py-2 text-center">결과</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {bids.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Link href={`/bids/${b.id}`} className="font-medium hover:underline">
                      {b.notice_title}
                    </Link>
                    <div className="text-xs text-slate-500">{b.notice_no}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div>{b.agency}</div>
                    <div className="text-xs text-slate-500">{b.work_type}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{b.bid_date ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatKRW(b.base_amount)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatPercent(calcWinRatio(b))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatPercent(calcMyBidRatio(b))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatPercent(calcMyGapRate(b))}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <ResultBadge status={b.result_status} />
                  </td>
                </tr>
              ))}
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
