import BidEntryWithUpload from "@/components/BidEntryWithUpload";
import { createClient } from "@/lib/supabase/server";
import type { Bid } from "@/types/bid";
import { uniqueValues } from "@/lib/analysis/filters";

export const dynamic = "force-dynamic";

export default async function NewBidPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("bids")
    .select("*")
    .order("bid_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  const bids = (data ?? []) as Bid[];
  const agencyOptions = uniqueValues(bids, "agency");
  const workTypeOptions = uniqueValues(bids, "work_type");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">입찰 등록</h1>
      <p className="text-sm text-slate-600">
        공고번호를 조회하거나 PDF를 업로드하면 자동으로 채워지고,
        같은 화면에 사정율 분포·매칭 공고 분석이 함께 표시됩니다.
      </p>
      <BidEntryWithUpload
        bids={bids}
        agencyOptions={agencyOptions}
        workTypeOptions={workTypeOptions}
      />
    </div>
  );
}
