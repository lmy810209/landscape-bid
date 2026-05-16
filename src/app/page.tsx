import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Bid } from "@/types/bid";
import { classifyNoticeByKeywords } from "@/lib/analysis/scope2";
import { fetchRecentCnstwk } from "@/lib/scope2/fetchRecentNotices";
import { getKeywordSummaries } from "@/lib/scope2/keywordCache";
import { matchQualification } from "@/lib/config/myCompany";
import { buildTimeline } from "@/lib/marketAnalysis/timeline";
import type { PublicWin } from "@/lib/marketAnalysis/types";

export const dynamic = "force-dynamic";

const ANSAN = /안산/;
const BANGJE = /(방제|병해충|살균|살충|소독|약제살포)/;
// 조경 핵심 키워드 화이트리스트 (alerts와 동일).
// "공원" 단독은 제외 — 공원 화장실/주차장/방수 등 비조경 케이스 거르기 위함.
const LANDSCAPE =
  /(조경|녹지|가로수|잔디|수목|화단|식재|전정|풀깎기|예초|제초|화훼|꽃길|꽃밭|초화|텃밭|숲길|등산로|쌈지|가로화단|꽃묘|관목|교목|방초|초지|조림|가지치기|식물|정원수|관리공사|유지관리)/;

export default async function HomePage() {
  const supabase = createClient();

  // 본인 입찰 이력
  const { data: bidsData } = await supabase
    .from("bids")
    .select("*")
    .order("bid_date", { ascending: false, nullsFirst: false });
  const bids = (bidsData ?? []) as Bid[];

  // 오늘의 공고 (캐시된 데이터)
  let recentNotices: Awaited<ReturnType<typeof fetchRecentCnstwk>> = [];
  try {
    recentNotices = await fetchRecentCnstwk(14);
  } catch {
    // ignore
  }
  const ansanNotices = recentNotices.filter((r) => {
    if (!ANSAN.test(r.dminsttNm ?? "")) return false;
    const name = r.bidNtceNm ?? "";
    if (BANGJE.test(name)) return false;
    return LANDSCAPE.test(name);
  });

  // 키워드 분류 + 자격 매칭
  const keywords = await getKeywordSummaries();
  const myKnown = new Set(bids.map((b) => (b.notice_no ?? "").replace(/-\d+$/, "")));
  const today = new Date();

  const enrichedNotices = ansanNotices
    .map((n) => {
      const cls = classifyNoticeByKeywords(n.bidNtceNm, keywords);
      const qual = matchQualification(n.bidNtceNm, n.mainCnsttyNm, n.prtcptLmtRgnNm ?? null);
      const opengDate = n.opengDt?.slice(0, 10) ?? "";
      const isFuture = opengDate ? new Date(opengDate) > today : false;
      const knownByMe = myKnown.has(n.bidNtceNo);
      return { ...n, cls, qual, opengDate, isFuture, knownByMe };
    })
    .filter((n) => n.qual.match && n.isFuture && !n.knownByMe)
    .sort((a, b) => {
      const score = (x: typeof a) => (x.cls.poolType === "안전형" ? 100 : x.cls.poolType === "혼합" ? 50 : 0);
      const diff = score(b) - score(a);
      if (diff !== 0) return diff;
      return (a.opengDate ?? "").localeCompare(b.opengDate ?? "");
    })
    .slice(0, 10);

  // 누적 통계 — notice_no에서 -000 같은 suffix 제거 후 dedup
  const normalizeNo = (no: string) => (no ?? "").replace(/-\d+$/, "");
  const seen = new Set<string>();
  const uniqueBids = bids.filter((b) => {
    const k = normalizeNo(b.notice_no);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const total = uniqueBids.length;
  const wins = uniqueBids.filter((b) => b.result_status === "낙찰");
  const winCount = wins.length;
  const failures = uniqueBids.filter((b) => b.result_status === "낙찰하한선미달").length;

  // 시장 시계열 트렌드 (안산∩비방제 5년)
  const { data: winsForTrend } = await supabase
    .from("public_wins")
    .select("bid_ntce_no,sucsfbid_rate,rl_openg_dt,is_ansan,is_bangje")
    .eq("is_ansan", true)
    .eq("is_bangje", false)
    .order("rl_openg_dt", { ascending: false })
    .limit(1000);
  const timeline = buildTimeline((winsForTrend ?? []) as unknown as PublicWin[]);

  // 이번 주 우선 후보 — 개찰 D-3 이내 + 안전형/혼합만 (공격형 제외) Top 3
  const msInDay = 24 * 60 * 60 * 1000;
  const top3Candidates = enrichedNotices
    .filter((n) => {
      if (!n.opengDate) return false;
      const daysToOpen = Math.ceil((new Date(n.opengDate).getTime() - today.getTime()) / msInDay);
      if (daysToOpen > 3) return false;
      return n.cls.poolType === "안전형" || n.cls.poolType === "혼합";
    })
    .slice(0, 3);

  // 일정 충돌 (같은 개찰일 2건+)
  const opengDateGroups = new Map<string, number>();
  for (const n of enrichedNotices) {
    if (!n.opengDate) continue;
    opengDateGroups.set(n.opengDate, (opengDateGroups.get(n.opengDate) ?? 0) + 1);
  }
  const conflicts = [...opengDateGroups.entries()].filter(([, n]) => n > 1).sort((a, b) => (a[0] < b[0] ? -1 : 1));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold sm:text-2xl">새빛조경 입찰 도구</h1>
        <p className="mt-1 text-sm text-slate-600">
          매일 5분 — 오늘 들어갈 공고 확인 → 클릭 → 자동 채움 → 저장.
        </p>
      </header>

      {/* 도구 한계 명시 — 거짓 약속 방지 */}
      <section className="rounded border border-slate-300 bg-slate-50 p-3 text-xs text-slate-700">
        <div className="font-semibold text-slate-900">⚠️ 이 도구가 하는 것 / 못 하는 것</div>
        <div className="mt-1 grid gap-1 sm:grid-cols-2">
          <div>
            <span className="font-medium text-emerald-700">✅ 도움됨:</span> 부적격(낙찰하한선 미달) 회피, 투찰가 가이드 (시장 분포 기준), 자격 자동 매칭, 보험료 감액 공고 경고, 본인 이력 관리
          </div>
          <div>
            <span className="font-medium text-red-700">❌ 못함:</span> 낙찰 보장, <strong>추첨번호 추천</strong> (조달청 화면에서 번호 블라인드 선택이라 사전 추천 불가능), 추첨운 통제
          </div>
        </div>
      </section>

      {/* ⭐ 이번 주 우선 후보 — D-3 이내 + 안전형/혼합 */}
      {top3Candidates.length > 0 && (
        <section className="rounded-lg border-2 border-blue-400 bg-blue-50 p-3 sm:p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-bold text-blue-900 sm:text-lg">⭐ 이번 주 우선 후보 ({top3Candidates.length}건)</h2>
            <Link href="/alerts" className="text-xs text-blue-700 hover:underline">전체 →</Link>
          </div>
          <p className="mt-0.5 text-xs text-blue-800">개찰 D-3 이내 · 안전형/혼합만 · 자격 가능</p>
          <ul className="mt-2 space-y-1.5">
            {top3Candidates.map((n) => {
              const days = Math.ceil((new Date(n.opengDate).getTime() - today.getTime()) / msInDay);
              const dLabel = days <= 0 ? "오늘" : `D-${days}`;
              const dColor = days <= 1 ? "bg-red-600 text-white" : days <= 2 ? "bg-amber-600 text-white" : "bg-blue-600 text-white";
              return (
                <li key={n.bidNtceNo} className="rounded bg-white p-2 sm:p-2.5">
                  <div className="flex items-start gap-2">
                    <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${dColor}`}>{dLabel}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-900">{n.bidNtceNm}</div>
                      <div className="mt-0.5 text-[11px] text-slate-600 sm:text-xs">
                        {n.dminsttNm} · {n.opengDate}
                        <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${
                          n.cls.poolType === "안전형" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }`}>{n.cls.poolType}</span>
                      </div>
                    </div>
                    <Link
                      href={`/bids/new?bidNtceNo=${n.bidNtceNo}`}
                      className="shrink-0 rounded bg-slate-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-slate-800 sm:text-xs"
                    >
                      등록
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 시장 트렌드 배너 */}
      {timeline.trend_diff != null && timeline.recent_mean != null && timeline.overall_mean != null && (
        <section className={`rounded-lg border p-3 text-sm ${
          timeline.trend_label === "보수형 이동"
            ? "border-amber-300 bg-amber-50"
            : timeline.trend_label === "공격형 이동"
              ? "border-emerald-300 bg-emerald-50"
              : "border-slate-200 bg-slate-50"
        }`}>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-semibold">📈 시장 트렌드</span>
            <span className="text-xs text-slate-600">(안산∩비방제 5년)</span>
            <span className="ml-auto text-xs text-slate-500">{timeline.total_count}건 기준</span>
          </div>
          <div className="mt-1 text-slate-700">
            최근 6개월 평균 <strong>{timeline.recent_mean.toFixed(2)}%</strong> vs
            5년 평균 <strong>{timeline.overall_mean.toFixed(2)}%</strong>
            <span className={`ml-2 font-medium ${
              timeline.trend_diff > 0 ? "text-amber-700" : timeline.trend_diff < 0 ? "text-emerald-700" : "text-slate-600"
            }`}>
              ({timeline.trend_diff > 0 ? "+" : ""}{timeline.trend_diff.toFixed(2)}%p · {timeline.trend_label})
            </span>
          </div>
          {timeline.trend_label === "보수형 이동" && (
            <div className="mt-1 text-xs text-amber-800">
              ⚠️ 시장이 더 보수형으로 이동 중. 과거 88%대 공격형 시도 시 미달 위험 ↑
            </div>
          )}
        </section>
      )}

      {/* 누적 통계 */}
      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="누적 시도" value={`${total}건`} sub="2025년부터" />
        <Stat
          label="낙찰"
          value={`${winCount}건`}
          sub={total > 0 ? `${((winCount / total) * 100).toFixed(1)}%` : "-"}
          highlight="emerald"
        />
        <Stat
          label="부적격 (낙찰하한선미달)"
          value={`${failures}건`}
          sub={total > 0 ? `${((failures / total) * 100).toFixed(1)}%` : "-"}
          highlight={failures > 0 ? "amber" : undefined}
        />
      </section>

      {/* 오늘 들어갈 공고 */}
      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">📋 오늘 들어갈 공고 ({enrichedNotices.length}건)</h2>
          <Link href="/alerts" className="text-xs text-blue-600 hover:underline">
            전체 보기 →
          </Link>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          자격 가능 + 미래 개찰 + 미등록 공고. 안전형 우선.
        </p>

        {conflicts.length > 0 && (
          <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            ⚠️ 일정 충돌:{" "}
            {conflicts.map(([date, n]) => `${date} (${n}건)`).join(", ")}
          </div>
        )}

        {enrichedNotices.length === 0 ? (
          <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-600">
            지금 들어갈 공고 없음. 새 공고는 매일 알림으로 추가됩니다.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-xs text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">개찰일</th>
                  <th className="px-3 py-2 text-left">공고명</th>
                  <th className="px-3 py-2 text-left">발주처</th>
                  <th className="px-3 py-2 text-right">기초금액</th>
                  <th className="px-3 py-2 text-center">분류</th>
                  <th className="px-3 py-2 text-right">하한율</th>
                  <th className="px-3 py-2 text-center">액션</th>
                </tr>
              </thead>
              <tbody>
                {enrichedNotices.map((n) => {
                  const badge =
                    n.cls.poolType === "안전형"
                      ? "bg-emerald-100 text-emerald-800"
                      : n.cls.poolType === "공격형"
                        ? "bg-red-100 text-red-800"
                        : n.cls.poolType === "혼합"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-600";
                  return (
                    <tr
                      key={n.bidNtceNo}
                      className={`border-t ${n.cls.poolType === "안전형" ? "bg-emerald-50/40 font-medium" : ""}`}
                    >
                      <td className="px-3 py-2 font-mono text-xs">{n.opengDate}</td>
                      <td className="px-3 py-2">
                        {n.bidNtceNm.length > 32 ? n.bidNtceNm.slice(0, 32) + "…" : n.bidNtceNm}
                        <div className="text-[10px] font-mono text-slate-400">{n.bidNtceNo}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {(n.dminsttNm ?? "")
                          .replace("경기도 ", "")
                          .replace("경기도교육청 ", "")}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {n.bdgtAmt ? Number(n.bdgtAmt).toLocaleString() : "-"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`rounded px-1.5 py-0.5 text-xs ${badge}`}>
                          {n.cls.poolType}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {n.sucsfbidLwltRate ? `${n.sucsfbidLwltRate}%` : "-"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Link
                          href={`/bids/new?bidNtceNo=${n.bidNtceNo}`}
                          className="rounded bg-blue-600 px-2 py-1 text-[10px] text-white hover:bg-blue-700"
                        >
                          등록
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 빠른 액션 */}
      <section>
        <h2 className="text-lg font-semibold">빠른 작업</h2>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          <ActionCard href="/alerts" title="📢 새 공고 알림" desc="안산 비방제 14일 신규 (자격 가능 + 미래)" />
          <ActionCard href="/bids/new" title="📝 입찰 등록" desc="공고번호 → 자동 채움 + 가격·추첨번호 추천" />
          <ActionCard href="/competitors" title="📊 경쟁사 분석" desc="안산 풀 분포·반복 경쟁자·키워드 분류" />
        </div>
      </section>

      {/* 최근 입찰 5건 */}
      {bids.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">최근 입찰 5건</h2>
            <Link href="/bids" className="text-xs text-blue-600 hover:underline">
              전체 목록 →
            </Link>
          </div>
          <div className="mt-3 overflow-x-auto rounded border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-xs text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">개찰일</th>
                  <th className="px-3 py-2 text-left">공고명</th>
                  <th className="px-3 py-2 text-right">기초금액</th>
                  <th className="px-3 py-2 text-right">내 투찰률</th>
                  <th className="px-3 py-2 text-center">결과</th>
                </tr>
              </thead>
              <tbody>
                {bids.slice(0, 5).map((b) => {
                  const myRatio =
                    b.my_bid_amount && b.base_amount
                      ? ((Number(b.my_bid_amount) / Number(b.base_amount)) * 100).toFixed(2)
                      : null;
                  const statusBadge =
                    b.result_status === "낙찰"
                      ? "bg-emerald-100 text-emerald-800"
                      : b.result_status === "낙찰하한선미달"
                        ? "bg-red-100 text-red-700"
                        : "bg-slate-100 text-slate-600";
                  return (
                    <tr key={b.id} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">{b.bid_date ?? "-"}</td>
                      <td className="px-3 py-2 text-xs">
                        {b.notice_title.length > 30
                          ? b.notice_title.slice(0, 30) + "…"
                          : b.notice_title}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {Number(b.base_amount).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {myRatio ? `${myRatio}%` : "-"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`rounded px-1.5 py-0.5 text-xs ${statusBadge}`}>
                          {b.result_status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <footer className="text-center text-xs text-slate-400">
        새빛조경 (2024년 설립) · 자체 입찰 운영 도구
      </footer>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: "emerald" | "blue" | "amber";
}) {
  const cls =
    highlight === "emerald"
      ? "border-emerald-200 bg-emerald-50"
      : highlight === "blue"
        ? "border-blue-200 bg-blue-50"
        : highlight === "amber"
          ? "border-amber-200 bg-amber-50"
          : "border-slate-200 bg-white";
  return (
    <div className={`rounded border p-3 ${cls}`}>
      <div className="text-xs text-slate-600">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function ActionCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="group rounded border border-slate-200 bg-white p-4 transition hover:border-blue-400 hover:shadow"
    >
      <div className="text-base font-medium text-slate-800 group-hover:text-blue-700">{title}</div>
      <div className="mt-1 text-xs text-slate-600">{desc}</div>
    </Link>
  );
}
