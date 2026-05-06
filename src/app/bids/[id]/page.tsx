import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Bid } from "@/types/bid";
import {
  calcMyBidRatio,
  calcMyGapRate,
  calcRunnerUpGapRate,
  calcWinRatio,
  formatKRW,
  formatPercent,
} from "@/lib/analysis/calculations";
import BidRowActions from "@/components/BidRowActions";

export const dynamic = "force-dynamic";

export default async function BidDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("bids")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !data) notFound();
  const bid = data as Bid;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-500">공고번호 {bid.notice_no}</div>
          <h1 className="text-xl font-semibold">{bid.notice_title}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/analyze?from=${bid.id}`}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
          >
            이 공고로 분석하기
          </Link>
          <BidRowActions
            bidId={bid.id}
            noticeTitle={bid.notice_title}
            redirectTo="/bids"
          />
          <Link href="/bids" className="text-sm text-blue-600 hover:underline">
            ← 목록으로
          </Link>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="사정율" value={formatPercent(calcWinRatio(bid))} />
        <Card label="내 투찰률" value={formatPercent(calcMyBidRatio(bid))} />
        <Card label="my_gap_rate" value={formatPercent(calcMyGapRate(bid))} />
        <Card label="runner_up_gap_rate" value={formatPercent(calcRunnerUpGapRate(bid))} />
      </section>

      <section className="rounded border bg-white">
        <h2 className="border-b px-4 py-2 text-sm font-semibold">공고 정보</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-2">
          <Row label="발주처" value={bid.agency} />
          <Row label="공종" value={bid.work_type} />
          <Row label="지역" value={bid.region ?? "—"} />
          <Row label="개찰일" value={bid.bid_date ?? "—"} />
          <Row label="기초금액" value={formatKRW(bid.base_amount)} />
          <Row label="예정가격" value={formatKRW(bid.estimated_price)} />
          <Row label="입찰 방식" value={bid.bid_method ?? "—"} />
          <Row label="등급/면허 제한" value={bid.qualification_limit ?? "—"} />
          <Row
            label="참가 업체 수"
            value={bid.participant_count != null ? `${bid.participant_count}개` : "—"}
          />
        </dl>
      </section>

      <section className="rounded border bg-white">
        <h2 className="border-b px-4 py-2 text-sm font-semibold">투찰 / 결과</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-2">
          <Row label="결과 상태" value={bid.result_status} />
          <Row label="나의 투찰가" value={formatKRW(bid.my_bid_amount)} />
          <Row label="낙찰가" value={formatKRW(bid.winning_amount)} />
          <Row label="2등 금액" value={formatKRW(bid.second_amount)} />
        </dl>
      </section>

      {bid.note && (
        <section className="rounded border bg-white">
          <h2 className="border-b px-4 py-2 text-sm font-semibold">특이사항</h2>
          <div className="whitespace-pre-wrap p-4 text-sm">{bid.note}</div>
        </section>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-1 last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}
