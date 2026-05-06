"use client";

// 공고 PDF 업로드 → 자격요건 자동 추출 → 새빛조경 자격과 비교 → GO/조건부/NO-GO 표시.

import { useState } from "react";
import {
  checkEligibility,
  type EligibilityResult,
  type QualificationDetails,
} from "@/lib/extraction/qualification";
import { DEFAULT_MY_COMPANY } from "@/lib/config/myCompany";

export default function QualificationCheck() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<QualificationDetails | null>(null);
  const [result, setResult] = useState<EligibilityResult | null>(null);

  async function handleFile(file: File) {
    setLoading(true);
    setError(null);
    setData(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/check-qualification", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      const q = json.data as QualificationDetails;
      setData(q);
      setResult(checkEligibility(q, DEFAULT_MY_COMPANY));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded border-2 border-amber-200 bg-amber-50/30 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-amber-900">🛡️ 자격 자동 체크</h2>
        <span className="text-xs text-slate-500">공고서 PDF 업로드 → 면허/지역/시평/실적 자동 분석</span>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        공고서(입찰참가자격 명시된 PDF) 업로드 시 새빛조경 자격과 즉시 매칭. GO/조건부/NO-GO 즉시 표시.
      </p>

      <div className="mt-3">
        <input
          type="file"
          accept="application/pdf"
          disabled={loading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
          className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-amber-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-amber-700 disabled:opacity-60"
        />
      </div>

      {loading && (
        <div className="mt-3 text-sm text-amber-800">분석 중... (Gemini로 자격요건 추출 중, 5~15초)</div>
      )}

      {error && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">
          ❌ {error}
        </div>
      )}

      {result && data && <ResultPanel data={data} result={result} />}
    </div>
  );
}

function ResultPanel({
  data,
  result,
}: {
  data: QualificationDetails;
  result: EligibilityResult;
}) {
  const statusColor =
    result.status === "GO"
      ? "bg-emerald-100 text-emerald-900 border-emerald-300"
      : result.status === "조건부"
      ? "bg-yellow-100 text-yellow-900 border-yellow-300"
      : "bg-red-100 text-red-900 border-red-300";

  return (
    <div className="mt-4 space-y-3">
      <div className={`rounded border-2 p-3 ${statusColor}`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold">{result.status}</span>
          <span className="text-sm">
            {result.status === "GO" && "자격 충족, 입찰 가능 판단"}
            {result.status === "조건부" && "추가 확인 필요 항목 있음"}
            {result.status === "NO-GO" && "자격 미충족 — 입찰 불가능"}
          </span>
        </div>
      </div>

      {/* 추출된 원본 자격 요건 */}
      <div className="rounded border bg-white p-3 text-sm">
        <h3 className="mb-2 text-xs font-semibold text-slate-600">📋 추출된 자격요건 (PDF 원문)</h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          <Row k="요구 면허" v={data.required_licenses?.join(", ") ?? null} />
          <Row k="지역 제한" v={data.region_limit} />
          <Row k="실적 요건" v={data.performance_required} />
          <Row k="시평 최소" v={data.ability_eval_min ? `${(data.ability_eval_min / 100_000_000).toFixed(0)}억` : null} />
          <Row k="소기업 한정" v={data.small_business_only === true ? "예" : data.small_business_only === false ? "아니오" : null} />
          <Row k="공동도급" v={data.joint_venture_required === true ? "필수" : data.joint_venture_required === false ? "단독 가능" : null} />
        </dl>
        {data.other_requirements && data.other_requirements.length > 0 && (
          <div className="mt-2 text-xs">
            <span className="font-semibold text-slate-600">기타: </span>
            {data.other_requirements.join(" / ")}
          </div>
        )}
        {data.raw_summary && (
          <div className="mt-2 rounded bg-slate-50 p-2 text-xs italic text-slate-700">
            "{data.raw_summary}"
          </div>
        )}
      </div>

      {/* 매칭 결과 */}
      <div className="grid gap-2 sm:grid-cols-3">
        {result.reasons.fail.length > 0 && (
          <ReasonList title="✗ 미충족" items={result.reasons.fail} tone="red" />
        )}
        {result.reasons.warn.length > 0 && (
          <ReasonList title="⚠ 확인 필요" items={result.reasons.warn} tone="amber" />
        )}
        {result.reasons.ok.length > 0 && (
          <ReasonList title="✓ 충족" items={result.reasons.ok} tone="green" />
        )}
      </div>

      <p className="text-[11px] text-slate-500">
        ※ 자동 추출 결과로 수동 검증 필요. 면허·시평액 등은 본인 데이터를 myCompany 설정에 입력하면 정확도 ↑.
      </p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-1 last:border-0">
      <dt className="text-slate-600">{k}</dt>
      <dd className="text-right font-medium tabular-nums">{v ?? "—"}</dd>
    </div>
  );
}

function ReasonList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "red" | "amber" | "green";
}) {
  const cls =
    tone === "red"
      ? "bg-red-50 border-red-200 text-red-900"
      : tone === "amber"
      ? "bg-amber-50 border-amber-200 text-amber-900"
      : "bg-emerald-50 border-emerald-200 text-emerald-900";
  return (
    <div className={`rounded border p-2 ${cls}`}>
      <div className="mb-1 text-xs font-semibold">{title}</div>
      <ul className="space-y-0.5 text-xs">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
