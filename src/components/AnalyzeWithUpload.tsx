"use client";

import { useState } from "react";
import type { Bid, WorkType } from "@/types/bid";
import { WORK_TYPES } from "@/types/bid";
import type { ExtractedFields } from "@/lib/extraction/normalize";
import { formatKRW } from "@/lib/analysis/calculations";
import PdfUploader from "./PdfUploader";
import AnalyzePanel from "./AnalyzePanel";

type FormSeed = {
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
  initial?: FormSeed;
};

export default function AnalyzeWithUpload({
  bids,
  agencyOptions,
  workTypeOptions,
  initial,
}: Props) {
  const [seed, setSeed] = useState<FormSeed>(initial ?? {});
  // AnalyzePanel은 useState로 form을 잡고 있어서, 외부에서 prefill하려면
  // key를 바꿔 강제 재마운트하는 게 가장 단순하다.
  const [version, setVersion] = useState(0);
  const [extracted, setExtracted] = useState<ExtractedFields | null>(null);

  function applyExtraction(data: ExtractedFields) {
    setExtracted(data);
    setSeed({
      agency: data.agency ?? "",
      work_type:
        data.work_type && (WORK_TYPES as readonly string[]).includes(data.work_type)
          ? (data.work_type as WorkType)
          : "",
      region: data.region ?? "",
      base_amount: data.base_amount != null ? String(data.base_amount) : "",
      bid_date: data.bid_date ?? "",
      qualification_limit: data.qualification_limit ?? "",
      bid_method: data.bid_method ?? "",
      participant_count: data.participant_count != null ? String(data.participant_count) : "",
    });
    setVersion((v) => v + 1);
  }

  return (
    <div className="space-y-4">
      <PdfUploader onExtracted={applyExtraction} />

      {extracted && <ExtractedSummary data={extracted} />}

      <AnalyzePanel
        key={version}
        bids={bids}
        agencyOptions={agencyOptions}
        workTypeOptions={workTypeOptions}
        initial={seed}
      />
    </div>
  );
}

function ExtractedSummary({ data }: { data: ExtractedFields }) {
  // 분석 폼에 직접 매핑되지 않는 보조 정보(공고명/예정가격/특이사항)를 따로 보여준다.
  return (
    <div className="rounded border border-blue-200 bg-blue-50/40 p-3 text-sm">
      <div className="mb-2 text-xs font-semibold text-blue-800">
        추출된 보조 정보 (분석 폼에는 미반영, 등록 시 활용)
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        <Row k="공고명" v={data.title} />
        <Row k="예정가격" v={data.estimated_price != null ? formatKRW(data.estimated_price) : null} />
      </dl>
      {data.note && (
        <div className="mt-2 rounded bg-white/80 p-2 text-xs text-slate-700">
          <span className="font-semibold">특이사항:</span> {data.note}
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="flex justify-between gap-4 border-b border-blue-100/60 py-1 last:border-0">
      <dt className="text-slate-600">{k}</dt>
      <dd className="text-right font-medium tabular-nums">{v ?? "—"}</dd>
    </div>
  );
}
