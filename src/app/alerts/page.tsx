import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { classifyNoticeByKeywords } from "@/lib/analysis/scope2";
import { fetchRecentCnstwk, type RecentNoticeRaw } from "@/lib/scope2/fetchRecentNotices";
import { getKeywordSummaries } from "@/lib/scope2/keywordCache";
import { matchQualification } from "@/lib/config/myCompany";

export const dynamic = "force-dynamic";

const ANSAN = /안산/;
const BANGJE = /(방제|병해충|살균|살충|소독|약제살포)/;

type SearchParams = { days?: string };

export default async function AlertsPage({ searchParams }: { searchParams: SearchParams }) {
  const days = Math.min(30, Math.max(1, Number(searchParams.days) || 14));

  // 1) API: 최근 N일 등록 공고
  let raw: RecentNoticeRaw[] = [];
  let fetchError: string | null = null;
  try {
    raw = await fetchRecentCnstwk(days);
  } catch (e) {
    fetchError = e instanceof Error ? e.message : "조회 실패";
  }

  // 2) 안산 ∩ 비방제 필터
  const ansanNotices = raw.filter(
    (r) => ANSAN.test(r.dminsttNm ?? "") && !BANGJE.test(r.bidNtceNm ?? ""),
  );

  // 3) 키워드 분류 (1시간 메모리 캐시 — 매번 5,300 row 페이징 방지)
  const supabase = createClient();
  const [keywords, { data: bidsData }] = await Promise.all([
    getKeywordSummaries(),
    supabase.from("bids").select("notice_no"),
  ]);

  // 4) 본인 이미 등록한 공고
  const myKnown = new Set(
    (bidsData ?? []).map((b) => (b.notice_no ?? "").replace(/-\d+$/, "")),
  );

  // 5) 분류 + 자격 매칭 + 정렬
  const today = new Date();
  const enriched = ansanNotices
    .map((n) => {
      const cls = classifyNoticeByKeywords(n.bidNtceNm, keywords);
      const opengDate = n.opengDt?.slice(0, 10) ?? "";
      const isFuture = opengDate ? new Date(opengDate) > today : false;
      const knownByMe = myKnown.has(n.bidNtceNo);
      const qual = matchQualification(n.bidNtceNm, n.mainCnsttyNm, n.prtcptLmtRgnNm ?? null);
      return { ...n, cls, opengDate, isFuture, knownByMe, qual };
    })
    .sort((a, b) => {
      // 자격가능 + 미참여 + 안전형 + 미래 개찰 우선
      const score = (x: typeof a) =>
        (x.qual.match ? 200 : -100) +
        (x.knownByMe ? 0 : 100) +
        (x.cls.poolType === "안전형" ? 50 : x.cls.poolType === "혼합" ? 25 : 0) +
        (x.isFuture ? 30 : 0);
      const diff = score(b) - score(a);
      if (diff !== 0) return diff;
      return (b.opengDt ?? "").localeCompare(a.opengDt ?? "");
    });

  // 6) 일정 충돌 — 같은 개찰일 그룹화
  const opengDateGroups = new Map<string, number>();
  for (const e of enriched) {
    if (!e.opengDate || !e.isFuture || !e.qual.match || e.knownByMe) continue;
    opengDateGroups.set(e.opengDate, (opengDateGroups.get(e.opengDate) ?? 0) + 1);
  }
  const conflicts = [...opengDateGroups.entries()].filter(([, n]) => n > 1).sort((a, b) => (a[0] < b[0] ? -1 : 1));

  const safeCount = enriched.filter((e) => e.cls.poolType === "안전형").length;
  const unknownCount = enriched.filter((e) => !e.knownByMe).length;
  const futureCount = enriched.filter((e) => e.isFuture && !e.knownByMe).length;
  const qualifiedFutureCount = enriched.filter((e) => e.qual.match && e.isFuture && !e.knownByMe).length;

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">새 공고 알림 — 안산 비방제</h1>
        <p className="mt-1 text-sm text-slate-600">
          공공데이터 입찰공고정보서비스에서 최근 <strong>{days}일</strong> 등록된 공사 공고를
          안산∩비방제 필터링. 키워드 분류로 안전형 우선 정렬.
        </p>
        <div className="mt-2 flex gap-2 text-xs">
          {[7, 14, 30].map((d) => (
            <Link
              key={d}
              href={`/alerts?days=${d}`}
              className={`rounded px-2 py-1 ${
                d === days ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              최근 {d}일
            </Link>
          ))}
        </div>
      </section>

      {fetchError && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          ❌ API 조회 실패: {fetchError}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="전체 공고 (전국 공사)" value={`${raw.length}건`} sub={`최근 ${days}일`} />
        <Card label="안산∩비방제" value={`${ansanNotices.length}건`} sub="필터 후" />
        <Card label="자격가능 + 미래개찰" value={`${qualifiedFutureCount}건`} sub="본인 진입 가능" highlight="green" />
        <Card label="🟢 안전형 분류" value={`${safeCount}건`} sub="가격 경쟁 유리" highlight="amber" />
      </section>

      {/* 일정 충돌 알림 */}
      {conflicts.length > 0 && (
        <section className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <div className="font-medium text-amber-900">⚠️ 같은 개찰일 다중 공고 — 우선순위 결정 필요</div>
          <div className="mt-1 space-y-0.5 text-xs text-amber-800">
            {conflicts.map(([date, n]) => (
              <div key={date}>
                · <span className="font-mono">{date}</span> — 자격가능 미등록 미래 공고 <strong>{n}건</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold">공고 목록 ({enriched.length}건)</h2>
        <p className="text-xs text-slate-500">
          본인 이미 등록한 공고는 회색 표시. 안전형 + 미래 개찰 우선 정렬.
        </p>
        <div className="mt-3 overflow-x-auto rounded border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">공고일</th>
                <th className="px-3 py-2 text-left">개찰일</th>
                <th className="px-3 py-2 text-left">공고명</th>
                <th className="px-3 py-2 text-left">발주처</th>
                <th className="px-3 py-2 text-right">기초금액</th>
                <th className="px-3 py-2 text-center">분류</th>
                <th className="px-3 py-2 text-center">자격</th>
                <th className="px-3 py-2 text-right">하한율</th>
                <th className="px-3 py-2 text-center">상태</th>
              </tr>
            </thead>
            <tbody>
              {enriched.map((n) => {
                const badgeBg =
                  n.cls.poolType === "안전형"
                    ? "bg-emerald-100 text-emerald-800"
                    : n.cls.poolType === "공격형"
                      ? "bg-red-100 text-red-800"
                      : n.cls.poolType === "혼합"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-slate-600";
                const rowClass = n.knownByMe
                  ? "bg-slate-50 text-slate-400"
                  : !n.qual.match
                    ? "bg-slate-50/60 text-slate-500"
                    : n.isFuture && n.cls.poolType === "안전형"
                      ? "bg-emerald-50/40 font-medium"
                      : "";
                return (
                  <tr key={`${n.bidNtceNo}-${n.bidNtceOrd}`} className={`border-t ${rowClass}`}>
                    <td className="px-3 py-2 font-mono text-xs">{n.bidNtceDt?.slice(0, 10)}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {n.opengDate}
                      {n.isFuture && <span className="ml-1 rounded bg-blue-100 px-1 text-[10px] text-blue-700">예정</span>}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/bids/new?bidNtceNo=${n.bidNtceNo}`}
                        className="hover:underline"
                        title="이 공고로 새 입찰 등록"
                      >
                        {n.bidNtceNm.length > 38 ? n.bidNtceNm.slice(0, 38) + "…" : n.bidNtceNm}
                      </Link>
                      <div className="text-[10px] font-mono text-slate-400">{n.bidNtceNo}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {(n.dminsttNm ?? "").replace("경기도 ", "").replace("경기도교육청 ", "")}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {n.bdgtAmt ? Number(n.bdgtAmt).toLocaleString() : "-"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`rounded px-1.5 py-0.5 text-xs ${badgeBg}`}>
                        {n.cls.poolType}
                      </span>
                      {n.cls.matchedKeywords.length > 0 && (
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          {n.cls.matchedKeywords.slice(0, 2).join(", ")}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center" title={n.qual.reasons.join(" | ")}>
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs ${
                          n.qual.match ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"
                        }`}
                      >
                        {n.qual.match ? "가능" : "불가"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {n.sucsfbidLwltRate ? `${n.sucsfbidLwltRate}%` : "-"}
                    </td>
                    <td className="px-3 py-2 text-center text-xs">
                      {n.knownByMe ? (
                        <span className="text-slate-400">등록됨</span>
                      ) : (
                        <Link
                          href={`/bids/new?bidNtceNo=${n.bidNtceNo}`}
                          className="rounded bg-blue-600 px-2 py-1 text-[10px] text-white hover:bg-blue-700"
                        >
                          등록
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {enriched.length === 0 && (
          <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-600">
            최근 {days}일 안산∩비방제 신규 공고 없음. 기간을 늘려보세요.
          </div>
        )}

        <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <div className="font-medium">행동 가이드</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>🟢 <strong>안전형 + 예정</strong> 공고가 본인 우선 타겟</li>
            <li>"등록" 버튼 클릭 → /bids/new에서 공고번호 자동 채움 (기초금액·낙찰하한율 포함)</li>
            <li>매일 한 번 이 페이지 확인하면 본인 시도 빈도 늘릴 수 있음</li>
            <li>참여 결정 시 → 본인 투찰가만 입력하고 저장</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

function Card({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: "green" | "amber";
}) {
  const ring =
    highlight === "green"
      ? "border-emerald-200 bg-emerald-50"
      : highlight === "amber"
        ? "border-amber-200 bg-amber-50"
        : "border-slate-200 bg-white";
  return (
    <div className={`rounded border p-3 ${ring}`}>
      <div className="text-xs text-slate-600">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
