"use client";

// 공고번호 입력 → /api/lookup-bid 호출 → BidForm prefill.
// PDF 업로드보다 빠르고 정확. 개찰 전 공고는 win/preprice 비어 있어 메타만 채워짐.

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ResultPrefill } from "@/lib/extraction/normalize-result";
import BidPriceGuide from "./BidPriceGuide";

type Props = {
  onLookup: (data: ResultPrefill) => void;
};

type SourceFlags = {
  hasNotice: boolean;
  hasWin: boolean;
  hasPreprices: boolean;
  isMyWin: boolean;
  myParticipated: boolean;
  myRank: number | null;
  myRmrk: string | null;
  participantCount: number;
  sucsfbidLwltRate: number | null;
  failedApis?: string[];
};

export default function BidLookup({ onLookup }: Props) {
  const searchParams = useSearchParams();
  const [bidNtceNo, setBidNtceNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ msg: string; flags: SourceFlags } | null>(null);
  const [lastPrefill, setLastPrefill] = useState<ResultPrefill | null>(null);
  const [autoTriggered, setAutoTriggered] = useState(false);

  // /alerts에서 ?bidNtceNo=R26... 로 넘어온 경우 자동 채움 + 자동 조회
  useEffect(() => {
    const param = searchParams?.get("bidNtceNo");
    if (param && !autoTriggered) {
      setBidNtceNo(param);
      setAutoTriggered(true);
      // 약간의 지연 후 자동 조회
      setTimeout(() => {
        const btn = document.getElementById("bid-lookup-button") as HTMLButtonElement | null;
        btn?.click();
      }, 300);
    }
  }, [searchParams, autoTriggered]);

  async function handleLookup() {
    const trimmed = bidNtceNo.trim();
    if (!trimmed) {
      setError("공고번호를 입력하세요");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/lookup-bid", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bidNtceNo: trimmed }),
      });
      // 응답 본문 안전 파싱 (data.go.kr 타임아웃 시 빈 응답 가능)
      const text = await res.text();
      let json: { found?: boolean; error?: string; prefill?: ResultPrefill; sourceFlags?: SourceFlags } = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        setError(`서버 응답 파싱 실패 (HTTP ${res.status}). 잠시 후 재시도하세요.`);
        return;
      }
      if (!res.ok || !json.found) {
        setError(json.error ?? `조회 실패 (HTTP ${res.status})`);
        return;
      }
      const flags = json.sourceFlags as SourceFlags;
      const enrichedPrefill: ResultPrefill = {
        ...(json.prefill as ResultPrefill),
        sucsfbid_lwlt_rate: flags.sucsfbidLwltRate ?? null,
      };
      onLookup(enrichedPrefill);
      setLastPrefill(enrichedPrefill);
      const summary: string[] = [];
      if (flags.hasNotice) summary.push("공고");
      if (flags.participantCount > 0) summary.push(`참여 ${flags.participantCount}명`);
      if (flags.hasPreprices) summary.push("예비가격 15");
      if (flags.myParticipated) {
        summary.push(`본인 ${flags.myRank}위 (${flags.myRmrk ?? "?"})`);
      } else if (flags.participantCount > 0) {
        summary.push("본인 미참여");
      }
      const failedNote =
        flags.failedApis && flags.failedApis.length > 0
          ? ` · ⚠️ ${flags.failedApis.join("/")} 일시실패 (재조회 권장)`
          : "";
      setSuccess({
        msg: `자동 채움 — ${summary.join(", ")}${
          flags.sucsfbidLwltRate != null ? ` · 낙찰하한율 ${flags.sucsfbidLwltRate}%` : ""
        }${failedNote}`,
        flags,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded border border-blue-200 bg-blue-50/40 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">공고번호로 자동 채움 (API)</h2>
        <span className="text-xs text-slate-500">PDF 없이 공공데이터로 즉시 조회</span>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        예: <code className="rounded bg-white px-1">R26BK01294519</code>{" "}
        (개찰 전이면 공고 메타만, 개찰 후이면 낙찰자·예비가격까지 채워집니다)
      </p>
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={bidNtceNo}
          onChange={(e) => setBidNtceNo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleLookup();
          }}
          placeholder="여기에 공고번호 입력..."
          disabled={loading}
          className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none disabled:bg-slate-100"
        />
        <button
          id="bid-lookup-button"
          type="button"
          onClick={handleLookup}
          disabled={loading || !bidNtceNo.trim()}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
        >
          {loading ? "조회 중..." : "조회"}
        </button>
      </div>
      {error && (
        <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          ❌ {error}
        </div>
      )}
      {success && (
        <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          ✅ {success.msg}
        </div>
      )}
      <div className="mt-2 text-[11px] text-slate-500">
        ※ 본인 투찰가(my_bid_amount)와 2등 금액은 API에 없어서 직접 입력이 필요합니다.
      </div>

      {/* 가격 가이드 — 자동 채움 성공 + 기초금액 있을 때 */}
      {success && lastPrefill?.base_amount && (
        <BidPriceGuide
          baseAmount={lastPrefill.base_amount}
          sucsfbidLwltRate={success.flags.sucsfbidLwltRate}
          onApplyBid={(amount) => {
            if (lastPrefill) onLookup({ ...lastPrefill, my_bid_amount: amount });
          }}
        />
      )}

    </div>
  );
}
