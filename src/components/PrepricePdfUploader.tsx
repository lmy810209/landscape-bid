"use client";

import { useState } from "react";
import type { PrepriceFields } from "@/lib/extraction/normalize-preprice";
import type { LowerBoundResult } from "@/lib/analysis/lowerBound";

export type PrepriceExtractResponse = {
  data: {
    extracted: PrepriceFields;
    calculated: LowerBoundResult;
  };
  meta: {
    success: boolean;
    text_length: number;
    used_chars: number;
    warnings: string[];
  };
};

type Props = {
  onExtracted: (r: PrepriceExtractResponse) => void;
  // 현재 분석 중인 공고의 기초금액을 함께 보내면 문서 누락 시 폴백으로 사용됨.
  baseAmountHint?: number | null;
  // 사용자가 하한율 규칙을 입력할 수 있게 열어둠 (예: 0.8795).
  // 값이 있으면 계산 결과에 lowerBoundAmount가 포함됨.
  lowerBoundRateRule?: number | null;
  onLowerBoundRateRuleChange?: (v: number | null) => void;
};

export default function PrepricePdfUploader({
  onExtracted,
  baseAmountHint,
  lowerBoundRateRule,
  onLowerBoundRateRuleChange,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  async function handleFile(file: File) {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setWarnings([]);

    const fd = new FormData();
    fd.append("file", file);
    if (baseAmountHint != null) fd.append("baseAmount", String(baseAmountHint));
    if (lowerBoundRateRule != null) fd.append("lowerBoundRateRule", String(lowerBoundRateRule));

    try {
      const res = await fetch("/api/extract-preprice-pdf", { method: "POST", body: fd });
      const json = (await res.json()) as PrepriceExtractResponse | { error: string };
      if (!res.ok || "error" in json) {
        setError(("error" in json && json.error) || "추출 실패. 수동 입력으로 진행하세요.");
        return;
      }
      onExtracted(json);
      setSuccess(
        `${file.name} — ${json.meta.success ? "예정가격 복원 성공." : "추출 완료 (일부 수동 확인 필요)."}`,
      );
      if (json.meta.warnings?.length) setWarnings(json.meta.warnings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류. 수동 입력으로 진행하세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2 rounded border bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold">📑 복수예비가격 PDF 업로드 (예정가격 / A값 복원)</h2>
        <p className="text-xs text-slate-500">
          예비가격 산정조서 / 개찰 시 추첨된 4개 예비가격이 담긴 PDF를 업로드하면
          예정가격과 A값을 산술 복원합니다. 낙찰하한금액은 공고별 규칙이 주입될 때만 계산됩니다.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-xs">
          <span className="mb-1 block text-slate-600">낙찰하한율 규칙 (선택 입력)</span>
          <input
            type="number"
            step="0.0001"
            min={0}
            max={1}
            placeholder="예: 0.8795"
            defaultValue={lowerBoundRateRule ?? undefined}
            onChange={(e) => {
              const v = e.target.value.trim();
              const n = v === "" ? null : Number(v);
              onLowerBoundRateRuleChange?.(n != null && Number.isFinite(n) ? n : null);
            }}
            className="w-36 rounded border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-slate-500"
          />
        </label>
        <input
          type="file"
          accept="application/pdf"
          disabled={loading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
          className="block text-sm file:mr-3 file:rounded file:border file:bg-slate-50 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-100"
        />
      </div>

      {loading && (
        <p className="text-sm text-slate-600">추출 중입니다. 보통 10~30초 소요.</p>
      )}
      {error && (
        <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}
      {success && (
        <p className="rounded border border-green-200 bg-green-50 p-2 text-sm text-green-800">
          {success}
        </p>
      )}
      {warnings.length > 0 && (
        <ul className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          {warnings.map((w, i) => (
            <li key={i}>• {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
