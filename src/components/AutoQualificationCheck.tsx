"use client";

// 공고번호로 자동 PDF 다운 + Gemini 자격 추출 + 새빛 매칭.
// BidLookup 성공 후 자동 호출 또는 명시 버튼.

import { useEffect, useState } from "react";
import {
  type EligibilityResult,
  type QualificationDetails,
} from "@/lib/extraction/qualification";

type Props = {
  noticeNo: string | null;
  autoFetch?: boolean; // true면 noticeNo 변경 시 자동 fetch
};

export default function AutoQualificationCheck({ noticeNo, autoFetch = false }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<QualificationDetails | null>(null);
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [triggered, setTriggered] = useState(false);

  async function run() {
    if (!noticeNo) return;
    setLoading(true);
    setError(null);
    setData(null);
    setResult(null);
    try {
      const r = await fetch("/api/auto-qualification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notice_no: noticeNo }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? `HTTP ${r.status}`);
        return;
      }
      setData(j.data);
      setResult(j.result);
      setFileName(j.file?.name ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setTriggered(true);
    }
  }

  useEffect(() => {
    if (autoFetch && noticeNo && !triggered) {
      run();
    }
  }, [autoFetch, noticeNo, triggered]);

  if (!noticeNo) return null;

  return (
    <div className="rounded border-2 border-cyan-300 bg-cyan-50/40 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-cyan-900">🤖 자격 자동 분석</h3>
        <span className="text-[11px] text-slate-500">
          공고 첨부 PDF 자동 다운 → Gemini 추출 → 새빛 매칭
        </span>
      </div>

      {!loading && !data && !error && (
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={run}
            className="rounded bg-cyan-600 px-3 py-1 text-xs font-medium text-white hover:bg-cyan-700"
          >
            자격 자동 분석 실행
          </button>
          <span className="text-xs text-slate-600">5~15초 (다운 + Gemini)</span>
        </div>
      )}

      {loading && (
        <div className="mt-2 text-sm text-cyan-800">
          ⏳ 공고문 PDF 다운로드 + Gemini 자격 추출 중... (5~15초)
        </div>
      )}

      {error && (
        <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          ❌ {error}
          <button
            onClick={run}
            className="ml-2 rounded bg-red-200 px-2 py-0.5 text-[11px] font-medium text-red-900 hover:bg-red-300"
          >
            재시도
          </button>
        </div>
      )}

      {result && data && (
        <div className="mt-3 space-y-2">
          {fileName && <div className="text-xs text-slate-500">📄 {fileName}</div>}
          <div
            className={`rounded border-2 px-3 py-2 ${
              result.status === "GO"
                ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                : result.status === "조건부"
                  ? "bg-yellow-100 text-yellow-900 border-yellow-300"
                  : "bg-red-100 text-red-900 border-red-300"
            }`}
          >
            <span className="text-xl font-bold">{result.status}</span>
            <span className="ml-2 text-sm">
              {result.status === "GO" && "자격 충족"}
              {result.status === "조건부" && "추가 확인 필요"}
              {result.status === "NO-GO" && "자격 미충족"}
            </span>
          </div>

          <div className="rounded border bg-white p-2 text-xs">
            <div className="mb-1 text-[11px] font-semibold text-slate-700">📋 자격</div>
            <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
              <Row k="요구 면허" v={data.required_licenses?.join(", ") ?? null} />
              <Row k="지역 제한" v={data.region_limit} />
              <Row k="실적 요건" v={data.performance_required} />
              <Row k="시평 최소" v={data.ability_eval_min ? `${(data.ability_eval_min / 100_000_000).toFixed(0)}억` : null} />
              <Row k="공동도급" v={data.joint_venture_required === true ? "필수" : data.joint_venture_required === false ? "단독 가능" : null} />
            </div>
            {data.raw_summary && (
              <div className="mt-1 rounded bg-slate-50 p-1.5 text-[11px] italic text-slate-700">
                "{data.raw_summary}"
              </div>
            )}
          </div>

          {/* 가격 룰 — 순공사비 / 부적격 추가 룰 */}
          {(data.pure_construction_cost ||
            data.lower_bound_rule_text ||
            data.applies_purcost_floor) && (
            <div className="rounded border-2 border-orange-200 bg-orange-50/40 p-2 text-xs">
              <div className="mb-1 text-[11px] font-semibold text-orange-900">
                💰 가격 룰 (부적격 추가 사유 체크)
              </div>
              <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
                <Row
                  k="순공사비"
                  v={data.pure_construction_cost ? `${data.pure_construction_cost.toLocaleString()}원` : null}
                />
                <Row
                  k="기초금액 (PDF)"
                  v={data.base_amount_in_doc ? `${data.base_amount_in_doc.toLocaleString()}원` : null}
                />
              </div>
              {data.lower_bound_rule_text && (
                <div className="mt-1 rounded bg-white/60 p-1.5 text-[11px] text-slate-800">
                  <strong>룰 원문:</strong> {data.lower_bound_rule_text}
                </div>
              )}
              {data.applies_purcost_floor === true && data.purcost_floor_pct && (
                <div className="mt-1 rounded bg-red-100 p-1.5 text-[11px] font-semibold text-red-900">
                  ⚠ 순공사비 {data.purcost_floor_pct}% 미만 부적격 룰 적용 — 사정율 안전권이라도 별도 체크 필수
                  {data.pure_construction_cost && (
                    <div className="mt-0.5 font-normal">
                      → 최소 투찰가:{" "}
                      <strong>
                        {Math.round(
                          (data.pure_construction_cost * data.purcost_floor_pct) / 100,
                        ).toLocaleString()}
                        원
                      </strong>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-3">
            {result.reasons.fail.length > 0 && <ReasonBox title="✗ 미충족" items={result.reasons.fail} tone="red" />}
            {result.reasons.warn.length > 0 && <ReasonBox title="⚠ 확인 필요" items={result.reasons.warn} tone="amber" />}
            {result.reasons.ok.length > 0 && <ReasonBox title="✓ 충족" items={result.reasons.ok} tone="green" />}
          </div>
        </div>
      )}

      <p className="mt-2 text-[11px] text-slate-500">
        ※ Gemini 자동 추출 — 핵심 자격은 공고서 직접 확인 권장.
      </p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="flex justify-between gap-2 border-b border-slate-100 py-0.5 last:border-0">
      <dt className="text-slate-600">{k}</dt>
      <dd className="text-right font-medium tabular-nums">{v ?? "—"}</dd>
    </div>
  );
}

function ReasonBox({ title, items, tone }: { title: string; items: string[]; tone: "red" | "amber" | "green" }) {
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
