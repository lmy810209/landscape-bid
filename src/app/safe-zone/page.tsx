// 새빛 공격형 안전권 지도 — 발주처 × 키워드 × 금액대 조합별 op13 cutoff 분포.
// "여기서 88.5% 시도해도 안전한가?" 한 페이지에서 한눈에.

import { createClient } from "@/lib/supabase/server";
import { estimateEffectiveCutoff, isSurvivableAggressive } from "@/lib/marketAnalysis/effectiveCutoff";

export const dynamic = "force-dynamic";

const KEYWORDS = ["공원", "유지관리", "보수", "풀깎기", "전정", "녹지", "수목", "예초", "민원"];
const AGENCIES = [
  "경기도 안산시",
  "경기도 안산시 상록구",
  "경기도 안산시 단원구",
  "경기도교육청 경기도안산교육지원청",
];
const AMOUNT_BUCKETS: Array<[string, number, number]> = [
  ["~5천만", 0, 50_000_000],
  ["5천~1억", 50_000_000, 100_000_000],
  ["1억~", 100_000_000, Infinity],
];

export default async function SafeZonePage() {
  const supabase = createClient();

  // 안산∩비방제 wins
  const allWins: Array<{
    bid_ntce_no: string;
    bid_ntce_nm: string;
    dminstt_nm: string;
    sucsfbid_amt: number;
  }> = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from("public_wins")
      .select("bid_ntce_no,bid_ntce_nm,dminstt_nm,sucsfbid_amt")
      .eq("is_ansan", true)
      .eq("is_bangje", false)
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    allWins.push(...(data as typeof allWins));
    if (data.length < 1000) break;
    from += 1000;
  }

  // op13 정상 참여자
  const noticeIds = allWins.map((w) => w.bid_ntce_no);
  const allParts: Array<{ bid_ntce_no: string; prcbdr_bizno: string | null; bidprcrt: number; rmrk: string }> = [];
  for (let i = 0; i < noticeIds.length; i += 100) {
    const chunk = noticeIds.slice(i, i + 100);
    let pageFrom = 0;
    while (true) {
      const { data } = await supabase
        .from("public_participants")
        .select("bid_ntce_no,prcbdr_bizno,bidprcrt,rmrk")
        .in("bid_ntce_no", chunk)
        .eq("rmrk", "정상")
        .range(pageFrom, pageFrom + 999);
      if (!data || data.length === 0) break;
      allParts.push(...(data as typeof allParts));
      if (data.length < 1000) break;
      pageFrom += 1000;
    }
  }

  // cells: 발주처 × 키워드 × 금액대
  type Cell = {
    agency: string;
    keyword: string;
    bucket: string;
    notices: string[];
    cutoff_median: number | null;
    cutoff_p25: number | null;
    miss_88_5: number | null;
    survivable: boolean;
  };

  const cells: Cell[] = [];
  for (const agency of AGENCIES) {
    for (const kw of KEYWORDS) {
      for (const [bn, lo, hi] of AMOUNT_BUCKETS) {
        const matched = allWins.filter(
          (w) =>
            w.dminstt_nm === agency &&
            w.bid_ntce_nm?.includes(kw) &&
            Number(w.sucsfbid_amt) >= lo &&
            Number(w.sucsfbid_amt) < hi,
        );
        if (matched.length === 0) continue;
        const ids = matched.map((m) => m.bid_ntce_no);
        const c = estimateEffectiveCutoff(ids, allParts);
        cells.push({
          agency,
          keyword: kw,
          bucket: bn,
          notices: ids,
          cutoff_median: c.per_notice_median,
          cutoff_p25: c.per_notice_p25,
          miss_88_5: c.miss_risk_at_88_5,
          survivable: isSurvivableAggressive(c),
        });
      }
    }
  }

  cells.sort((a, b) => {
    if (a.survivable !== b.survivable) return a.survivable ? -1 : 1;
    return (a.cutoff_median ?? 100) - (b.cutoff_median ?? 100);
  });

  const survivableCount = cells.filter((c) => c.survivable).length;
  const insufficientCount = cells.filter((c) => c.notices.length < 5).length;

  return (
    <div className="space-y-4 p-4">
      <header>
        <h1 className="text-2xl font-semibold">🎯 새빛 공격형 안전권 지도</h1>
        <p className="mt-1 text-sm text-slate-600">
          발주처 × 키워드 × 금액대 조합별 op13 정상 진입 cutoff 분포. <strong>88.5% 시도 시 미달 위험이 절반 이하</strong>인 영역이 "공격형 안전권".
        </p>
        <p className="mt-1 text-xs text-slate-500">
          ※ op13에 잡힌 정상 진입자만 기준. 미달 부적격은 표본 외. 조합당 매칭 공고 5건 미만은 "데이터 부족"으로 안전권 판정 안 됨.
        </p>
      </header>

      <section className="rounded border-2 border-violet-300 bg-violet-50/40 p-3">
        <h2 className="mb-1 text-sm font-semibold text-violet-900">
          ✅ 공격형 안전권 — {survivableCount}개 조합 / {cells.length - insufficientCount}개 평가 / {insufficientCount}개는 데이터 부족
        </h2>
        <p className="text-xs text-slate-600">
          여기서 사정율 88~88.5% 시도하면 op13 매칭 풀의 절반 이상이 그 사정율 이하로 정상 진입했음.
          <strong> 낙찰 가능을 의미하지 않음. 시도 참고 영역</strong>.
        </p>
      </section>

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-xs">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-2 py-2 text-left">발주처</th>
              <th className="px-2 py-2 text-left">키워드</th>
              <th className="px-2 py-2 text-left">금액대</th>
              <th className="px-2 py-2 text-right">매칭 공고</th>
              <th className="px-2 py-2 text-right">cutoff median</th>
              <th className="px-2 py-2 text-right">cutoff P25</th>
              <th className="px-2 py-2 text-right">88.5% 미달위험</th>
              <th className="px-2 py-2 text-center">판정</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((c, i) => (
              <tr key={i} className={`border-t ${c.survivable ? "bg-violet-50/40" : ""}`}>
                <td className="px-2 py-1.5">{c.agency.split(" ").slice(-1)[0]}</td>
                <td className="px-2 py-1.5">{c.keyword}</td>
                <td className="px-2 py-1.5">{c.bucket}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{c.notices.length}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {c.cutoff_median != null ? c.cutoff_median.toFixed(2) + "%" : "—"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {c.cutoff_p25 != null ? c.cutoff_p25.toFixed(2) + "%" : "—"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  <span
                    className={
                      (c.miss_88_5 ?? 1) <= 0.3
                        ? "text-emerald-700 font-semibold"
                        : (c.miss_88_5 ?? 1) <= 0.5
                          ? "text-yellow-700"
                          : "text-red-700"
                    }
                  >
                    {c.miss_88_5 != null ? (c.miss_88_5 * 100).toFixed(0) + "%" : "—"}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-center">
                  {c.notices.length < 5 ? (
                    <span className="rounded bg-slate-300 px-2 py-0.5 text-xs text-slate-700">
                      데이터 부족
                    </span>
                  ) : c.survivable ? (
                    <span className="rounded bg-violet-200 px-2 py-0.5 font-semibold text-violet-900">
                      🎯 안전권
                    </span>
                  ) : (
                    <span className="rounded bg-slate-200 px-2 py-0.5 text-slate-700">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-500">
        ※ 본 표는 운영 패턴 관찰일 뿐 낙찰을 단정하지 않습니다. 미달 위험 항상 동반. 최종 판단은 사용자가 합니다.
      </p>
    </div>
  );
}
