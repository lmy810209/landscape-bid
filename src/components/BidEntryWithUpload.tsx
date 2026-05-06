"use client";

import { useState } from "react";
import type { Bid, ResultStatus, WorkType } from "@/types/bid";
import { WORK_TYPES } from "@/types/bid";
import type { ResultPrefill } from "@/lib/extraction/normalize-result";
import BidForm from "./BidForm";
import BidLookup from "./BidLookup";
import ResultPdfUploader from "./ResultPdfUploader";
import AnalyzePanel from "./AnalyzePanel";
import QualificationCheck from "./QualificationCheck";
import MarketAnalysisPanel from "./MarketAnalysisPanel";
import type { NoticeContext } from "@/lib/marketAnalysis/types";

type BidFormSeed = {
  notice_no?: string;
  notice_title?: string;
  agency?: string;
  work_type?: WorkType | "";
  region?: string;
  base_amount?: string;
  estimated_price?: string;
  bid_date?: string;
  bid_method?: string;
  qualification_limit?: string;
  participant_count?: string;
  my_bid_amount?: string;
  winning_amount?: string;
  second_amount?: string;
  result_status?: ResultStatus | "";
  note?: string;
};

type AnalyzeSeed = {
  agency?: string;
  work_type?: WorkType | "";
  region?: string;
  base_amount?: string;
  bid_date?: string;
  qualification_limit?: string;
  bid_method?: string;
  participant_count?: string;
};

type Props = {
  bids: Bid[];
  agencyOptions: string[];
  workTypeOptions: string[];
};

function toPrefill(data: ResultPrefill): BidFormSeed {
  return {
    notice_no: data.notice_no ?? "",
    notice_title: data.notice_title ?? "",
    agency: data.agency ?? "",
    work_type: data.work_type,
    region: data.region ?? "",
    base_amount: data.base_amount != null ? String(data.base_amount) : "",
    estimated_price: data.estimated_price != null ? String(data.estimated_price) : "",
    bid_date: data.bid_date ?? "",
    bid_method: data.bid_method ?? "",
    qualification_limit: data.qualification_limit ?? "",
    participant_count: data.participant_count != null ? String(data.participant_count) : "",
    my_bid_amount: data.my_bid_amount != null ? String(data.my_bid_amount) : "",
    winning_amount: data.winning_amount != null ? String(data.winning_amount) : "",
    second_amount: data.second_amount != null ? String(data.second_amount) : "",
    result_status: data.result_status,
    note: data.note ?? "",
  };
}

function toAnalyzeSeed(data: ResultPrefill): AnalyzeSeed {
  const wt = data.work_type;
  return {
    agency: data.agency ?? "",
    work_type:
      wt && (WORK_TYPES as readonly string[]).includes(wt) ? (wt as WorkType) : "",
    region: data.region ?? "",
    base_amount: data.base_amount != null ? String(data.base_amount) : "",
    bid_date: data.bid_date ?? "",
    qualification_limit: data.qualification_limit ?? "",
    bid_method: data.bid_method ?? "",
    participant_count: data.participant_count != null ? String(data.participant_count) : "",
  };
}

export default function BidEntryWithUpload({ bids, agencyOptions, workTypeOptions }: Props) {
  // BidForm은 자체 useState로 form을 잡고 있어서, 외부에서 prefill하려면
  // key를 바꿔 강제 재마운트하는 게 가장 단순.
  const [seed, setSeed] = useState<BidFormSeed>({});
  const [analyzeSeed, setAnalyzeSeed] = useState<AnalyzeSeed | null>(null);
  const [marketCtx, setMarketCtx] = useState<NoticeContext | null>(null);
  const [version, setVersion] = useState(0);

  function applyExtracted(data: ResultPrefill) {
    setSeed(toPrefill(data));
    setAnalyzeSeed(toAnalyzeSeed(data));
    if (data.notice_no && data.agency && data.base_amount) {
      setMarketCtx({
        notice_no: data.notice_no,
        notice_title: data.notice_title ?? "",
        agency: data.agency,
        base_amount: Number(data.base_amount),
        sucsfbid_lwlt_rate: Number(data.sucsfbid_lwlt_rate ?? 89.745),
        bid_method: data.bid_method ?? null,
      });
    }
    setVersion((v) => v + 1);
  }

  return (
    <div className="space-y-4">
      <QualificationCheck />
      <BidLookup onLookup={applyExtracted} />
      <ResultPdfUploader onExtracted={applyExtracted} />

      {marketCtx && <MarketAnalysisPanel ctx={marketCtx} />}

      {analyzeSeed && (
        <section className="rounded-lg border-2 border-blue-200 bg-blue-50/30 p-4">
          <h2 className="mb-3 text-base font-semibold text-blue-900">📊 자동 분석</h2>
          <AnalyzePanel
            key={`analyze-${version}`}
            bids={bids}
            agencyOptions={agencyOptions}
            workTypeOptions={workTypeOptions}
            initial={analyzeSeed}
          />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-base font-semibold">등록 폼</h2>
        <BidForm key={version} initial={seed} />
      </section>
    </div>
  );
}
