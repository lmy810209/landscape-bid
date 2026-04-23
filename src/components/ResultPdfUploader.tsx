"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_MY_COMPANY,
  buildCompanyQuery,
  loadMyCompany,
  saveMyCompany,
  type MyCompany,
} from "@/lib/config/myCompany";
import type {
  ResultMyMatchSummary,
  ResultPrefill,
} from "@/lib/extraction/normalize-result";

type Props = {
  onExtracted: (data: ResultPrefill, myMatch: ResultMyMatchSummary) => void;
};

export default function ResultPdfUploader({ onExtracted }: Props) {
  // SSR/CSR 일관성을 위해 초기 렌더는 기본값으로, 마운트 후 localStorage로 덮어씀.
  const [myCompany, setMyCompany] = useState<MyCompany>(DEFAULT_MY_COMPANY);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MyCompany>(DEFAULT_MY_COMPANY);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const c = loadMyCompany();
    setMyCompany(c);
    setDraft(c);
  }, []);

  function startEdit() {
    setEditing(true);
    setDraft(myCompany);
  }
  function commitEdit() {
    saveMyCompany(draft);
    setMyCompany(draft);
    setEditing(false);
  }
  function cancelEdit() {
    setDraft(myCompany);
    setEditing(false);
  }

  async function handleFile(file: File) {
    setLoading(true);
    setError(null);
    setSuccess(null);

    const query = buildCompanyQuery(myCompany);
    if (!query) {
      setError("내 회사 사업자등록번호 또는 회사명이 설정되어 있지 않습니다.");
      setLoading(false);
      return;
    }

    const fd = new FormData();
    fd.append("file", file);
    fd.append("my_company_query", query);

    try {
      const res = await fetch("/api/extract-result-pdf", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "추출 실패. 수동 입력으로 진행하세요.");
        return;
      }
      onExtracted(json.data as ResultPrefill, json.myMatch as ResultMyMatchSummary);
      const matchMsg = json.myMatch?.found
        ? `매칭됨: ${json.myMatch.matchedName ?? "-"} (순위 ${json.myMatch.rank})`
        : "내 회사 미참여 또는 PDF에 없음";
      setSuccess(`${file.name} 추출 완료. ${matchMsg}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류. 수동 입력으로 진행하세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 rounded border bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold">📄 개찰결과 PDF 자동 입력</h2>
        <p className="text-xs text-slate-500">
          나라장터 개찰결과 PDF를 올리면 공고 정보 + 1등/2등/참가수 + 내 회사 매칭(투찰가/순위)이
          자동으로 채워집니다. 추출 후 자유롭게 수정 가능합니다.
        </p>
      </div>

      <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
        {!editing ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-medium">{myCompany.name || "(회사명 미설정)"}</span>
              <span className="ml-2 text-xs text-slate-500">
                사업자번호 {myCompany.businessNumber || "—"}
              </span>
            </div>
            <button
              type="button"
              onClick={startEdit}
              className="rounded border bg-white px-2 py-0.5 text-xs hover:bg-slate-100"
            >
              변경
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block">
              <span className="mb-0.5 block text-xs text-slate-600">회사명</span>
              <input
                className={inputCls}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-xs text-slate-600">사업자등록번호</span>
              <input
                className={inputCls}
                value={draft.businessNumber}
                onChange={(e) => setDraft({ ...draft, businessNumber: e.target.value })}
                placeholder="예: 495-86-03422"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded border bg-white px-2 py-0.5 text-xs hover:bg-slate-100"
              >
                취소
              </button>
              <button
                type="button"
                onClick={commitEdit}
                className="rounded bg-slate-900 px-2 py-0.5 text-xs text-white hover:bg-slate-800"
              >
                저장
              </button>
            </div>
          </div>
        )}
      </div>

      <input
        type="file"
        accept="application/pdf"
        disabled={loading || editing}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
        className="block w-full text-sm file:mr-3 file:rounded file:border file:bg-slate-50 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-100"
      />
      {loading && (
        <p className="text-sm text-slate-600">추출 중... (PDF 분량에 따라 수십 초 소요)</p>
      )}
      {error && (
        <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}
      {success && (
        <p className="rounded border border-green-200 bg-green-50 p-2 text-sm text-green-800">
          {success}
        </p>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-slate-500";
