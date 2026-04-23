"use client";

import { useState } from "react";
import type { ExtractedFields } from "@/lib/extraction/normalize";

type Props = {
  onExtracted: (data: ExtractedFields, meta: { used_chars: number; text_length: number }) => void;
};

export default function PdfUploader({ onExtracted }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleFile(file: File) {
    setLoading(true);
    setError(null);
    setSuccess(null);

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch("/api/extract-pdf", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "추출 실패. 수동으로 입력해 주세요.");
        return;
      }
      onExtracted(json.data as ExtractedFields, json.meta);
      setSuccess(
        `${file.name} — 본문 ${json.meta.text_length.toLocaleString("ko-KR")}자 중 ${json.meta.used_chars.toLocaleString("ko-KR")}자를 분석에 사용했습니다.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류. 수동 입력으로 진행하세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2 rounded border bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold">📄 공고 PDF 자동 추출</h2>
        <p className="text-xs text-slate-500">
          공고문 PDF를 올리면 Gemini가 핵심 필드를 추출해 분석 폼에 자동 입력합니다.
          추출된 값은 자유롭게 수정 가능하며, 실패 시 수동 입력으로 진행할 수 있습니다.
          (※ 이 화면은 분석만 수행하며 저장하지 않습니다. 과거 결과 등록은 "입찰 등록" 메뉴에서 하세요.)
        </p>
      </div>
      <input
        type="file"
        accept="application/pdf"
        disabled={loading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
        className="block w-full text-sm file:mr-3 file:rounded file:border file:bg-slate-50 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-100"
      />
      {loading && (
        <p className="text-sm text-slate-600">
          추출 중입니다. PDF 분량에 따라 최대 1분이 소요될 수 있습니다.
        </p>
      )}
      {error && <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {success && (
        <p className="rounded border border-green-200 bg-green-50 p-2 text-sm text-green-800">{success}</p>
      )}
    </div>
  );
}
