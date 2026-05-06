import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Bid, WorkType, ResultStatus } from "@/types/bid";
import { WORK_TYPES, RESULT_STATUSES } from "@/types/bid";
import BidForm from "@/components/BidForm";

export const dynamic = "force-dynamic";

export default async function EditBidPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("bids")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !data) notFound();
  const bid = data as Bid;

  const initial = {
    notice_no: bid.notice_no,
    notice_title: bid.notice_title,
    agency: bid.agency,
    work_type: (WORK_TYPES as readonly string[]).includes(bid.work_type)
      ? (bid.work_type as WorkType)
      : ("" as const),
    region: bid.region ?? "",
    base_amount: String(bid.base_amount),
    estimated_price: bid.estimated_price != null ? String(bid.estimated_price) : "",
    bid_date: bid.bid_date ?? "",
    bid_method: bid.bid_method ?? "",
    qualification_limit: bid.qualification_limit ?? "",
    participant_count:
      bid.participant_count != null ? String(bid.participant_count) : "",
    my_bid_amount: bid.my_bid_amount != null ? String(bid.my_bid_amount) : "",
    winning_amount: bid.winning_amount != null ? String(bid.winning_amount) : "",
    second_amount: bid.second_amount != null ? String(bid.second_amount) : "",
    result_status: (RESULT_STATUSES as readonly string[]).includes(bid.result_status)
      ? (bid.result_status as ResultStatus)
      : ("" as const),
    note: bid.note ?? "",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-500">공고번호 {bid.notice_no}</div>
          <h1 className="text-2xl font-semibold">입찰 수정</h1>
        </div>
        <Link href={`/bids/${bid.id}`} className="text-sm text-blue-600 hover:underline">
          ← 상세로 돌아가기
        </Link>
      </div>
      <BidForm mode="edit" bidId={bid.id} initial={initial} />
    </div>
  );
}
