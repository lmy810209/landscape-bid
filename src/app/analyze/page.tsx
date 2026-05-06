import { createClient } from "@/lib/supabase/server";
import type { Bid, WorkType } from "@/types/bid";
import { WORK_TYPES } from "@/types/bid";
import { uniqueValues } from "@/lib/analysis/filters";
import { ANALYSIS_DEFAULTS } from "@/lib/config/analysis";
import AnalyzeWithUpload from "@/components/AnalyzeWithUpload";

export const dynamic = "force-dynamic";

type SearchParams = { from?: string };

export default async function AnalyzePage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("bids")
    .select("*")
    .order("bid_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const bids = (data ?? []) as Bid[];
  const agencyOptions = uniqueValues(bids, "agency");
  const workTypeOptions = uniqueValues(bids, "work_type");

  // ?from=:bidId가 있으면 해당 공고로 prefill, 없으면 기본 분석 기준(공종 기본값)만 반영.
  // 발주처는 자유입력이라 기본값을 못 강요 → 폼에서 비워두고 사용자가 입력.
  const defaultWorkType: WorkType | "" = (WORK_TYPES as readonly string[]).includes(
    ANALYSIS_DEFAULTS.workType,
  )
    ? (ANALYSIS_DEFAULTS.workType as WorkType)
    : "";

  let initial: {
    agency?: string;
    work_type?: WorkType | "";
    region?: string;
    base_amount?: string;
    bid_date?: string;
    qualification_limit?: string;
    bid_method?: string;
    participant_count?: string;
  } = { work_type: defaultWorkType };
  let prefilledFromBid = false;

  if (searchParams.from) {
    const src = bids.find((b) => b.id === searchParams.from);
    if (src) {
      prefilledFromBid = true;
      initial = {
        agency: src.agency,
        work_type: (WORK_TYPES as readonly string[]).includes(src.work_type)
          ? (src.work_type as WorkType)
          : "",
        region: src.region ?? "",
        base_amount: String(src.base_amount),
        bid_date: src.bid_date ?? "",
        qualification_limit: src.qualification_limit ?? "",
        bid_method: src.bid_method ?? "",
        participant_count:
          src.participant_count != null ? String(src.participant_count) : "",
      };
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">공고 단건 분석</h1>
        <p className="mt-1 text-sm text-slate-600">
          PDF를 업로드해 자동으로 입력하거나, 공고 속성을 직접 입력하세요.
          동일 발주처/공종 데이터로 참고 사정율 구간과 리스크를 즉시 산출합니다.
          결과는 항상 <strong>구간</strong>으로만 제시됩니다.
        </p>
        {!prefilledFromBid && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-slate-600">기본 분석 기준:</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">
              발주처 "{ANALYSIS_DEFAULTS.agencyKeyword}" 포함 / 공종 "{ANALYSIS_DEFAULTS.workType}"
            </span>
            <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-700">기본값 적용 중</span>
            <span className="text-slate-500">
              공종은 폼에 미리 선택됨. 발주처는 직접 입력/선택하세요.
            </span>
          </div>
        )}
      </header>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          데이터를 불러오지 못했습니다: {error.message}
        </div>
      )}

      <AnalyzeWithUpload
        bids={bids}
        agencyOptions={agencyOptions}
        workTypeOptions={workTypeOptions}
        initial={initial}
      />
    </div>
  );
}
