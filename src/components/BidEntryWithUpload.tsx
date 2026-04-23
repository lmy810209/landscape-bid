"use client";

import { useState } from "react";
import type { ResultStatus, WorkType } from "@/types/bid";
import type { ResultPrefill } from "@/lib/extraction/normalize-result";
import BidForm from "./BidForm";
import ResultPdfUploader from "./ResultPdfUploader";

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

export default function BidEntryWithUpload() {
  // BidForm은 자체 useState로 form을 잡고 있어서, 외부에서 prefill하려면
  // key를 바꿔 강제 재마운트하는 게 가장 단순.
  const [seed, setSeed] = useState<BidFormSeed>({});
  const [version, setVersion] = useState(0);

  function applyExtracted(data: ResultPrefill) {
    setSeed(toPrefill(data));
    setVersion((v) => v + 1);
  }

  return (
    <div className="space-y-4">
      <ResultPdfUploader onExtracted={applyExtracted} />
      <BidForm key={version} initial={seed} />
    </div>
  );
}
