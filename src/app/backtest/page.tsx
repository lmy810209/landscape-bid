import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Bid } from "@/types/bid";
import { formatPercent } from "@/lib/analysis/calculations";
import { runBacktest, type BacktestRow } from "@/lib/analysis/backtest";

export const dynamic = "force-dynamic";

export default async function BacktestPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("bids")
    .select("*")
    .order("bid_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const bids = (data ?? []) as Bid[];
  const result = runBacktest(bids);
  const { rows, summary } = result;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">백테스트 검증</h1>
        <p className="mt-1 text-sm text-slate-600">
          각 공고를 학습 데이터에서 1건씩 제외하고(Leave-One-Out) 나머지로 추천
          구간/전략을 산출한 뒤 실제 낙찰 사정율과 비교합니다. 단일 정답 정확도가 아니라
          도구의 안정성·유용성을 평가하는 지표입니다.
        </p>
      </header>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          데이터를 불러오지 못했습니다: {error.message}
        </div>
      )}

      {/* 분류 요약 */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="전체 공고" value={`${summary.totalBids}건`} />
        <Card
          label="평가됨"
          value={`${summary.evaluatedCount}건`}
          sub="검증 가능한 케이스"
          tone="primary"
        />
        <Card
          label="표본 부족"
          value={`${summary.insufficientCount}건`}
          sub="동일 조건 매칭 데이터 < 2건"
        />
        <Card
          label="결과 없음"
          value={`${summary.noActualCount}건`}
          sub="낙찰가 미입력 (검증 불가)"
        />
      </section>

      {summary.evaluatedCount === 0 ? (
        <div className="rounded border bg-white p-8 text-center text-sm text-slate-500">
          평가 가능한 공고가 없습니다. 동일 발주처/공종 조합으로 최소 3건 이상의
          낙찰 결과가 입력되어야 검증이 시작됩니다.
        </div>
      ) : (
        <>
          {/* 핵심 지표 */}
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">핵심 지표</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card
                label="추천 구간 포함률"
                value={formatPercent(summary.inclusionRate)}
                sub={`평가 ${summary.evaluatedCount}건 중 실제 사정율이 추천 구간 안에 들어온 비율`}
                tone="primary"
              />
              <Card
                label="공격형 평균 오차"
                value={formatPercent(summary.meanError.aggressive, 3)}
                sub="|공격형 - 실제| 평균 (절대값)"
              />
              <Card
                label="균형형 평균 오차"
                value={formatPercent(summary.meanError.balanced, 3)}
                sub="|균형형 - 실제| 평균"
              />
              <Card
                label="보수형 평균 오차"
                value={formatPercent(summary.meanError.conservative, 3)}
                sub="|보수형 - 실제| 평균"
              />
              <Card
                label="최소 오차 평균"
                value={formatPercent(summary.meanError.bestOfThree, 3)}
                sub="3개 중 매번 최선을 골랐다고 가정한 이론치"
                tone="primary"
              />
              <Card
                label="내 투찰 평균 오차"
                value={
                  summary.meanMyError != null ? formatPercent(summary.meanMyError, 3) : "—"
                }
                sub={
                  summary.myErrorComparedCount > 0
                    ? `내 투찰가 입력 ${summary.myErrorComparedCount}건 기준`
                    : "내 투찰가 입력된 평가 건 없음"
                }
              />
              <Card
                label="개선된 비율"
                value={
                  summary.improvementRate != null
                    ? formatPercent(summary.improvementRate)
                    : "—"
                }
                sub={
                  summary.myErrorComparedCount > 0
                    ? `${summary.improvedCount}/${summary.myErrorComparedCount}건에서 도구가 더 가까웠음`
                    : "비교 가능한 건 없음"
                }
                tone={
                  summary.improvementRate != null && summary.improvementRate >= 0.5
                    ? "good"
                    : "neutral"
                }
              />
              <Card
                label="2등 공고 도이접 개선"
                value={
                  summary.runnerUpImprovementRate != null
                    ? formatPercent(summary.runnerUpImprovementRate)
                    : "—"
                }
                sub={
                  summary.runnerUpEvaluatedCount > 0
                    ? `2등 ${summary.runnerUpEvaluatedCount}건 중 ${summary.runnerUpImprovedCount}건에서 도구 우위`
                    : "2등 평가 건 없음"
                }
                tone={
                  summary.runnerUpImprovementRate != null && summary.runnerUpImprovementRate >= 0.5
                    ? "good"
                    : "neutral"
                }
              />
            </div>
          </section>

          {/* 종합 한 줄 평가 */}
          <SummaryStatement summary={summary} />

          {/* 공고별 상세 */}
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">공고별 결과</h2>
            <div className="overflow-x-auto rounded border bg-white">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="px-2 py-2">공고</th>
                    <th className="px-2 py-2">결과</th>
                    <th className="px-2 py-2 text-right">표본</th>
                    <th className="px-2 py-2 text-right">실제 사정율</th>
                    <th className="px-2 py-2 text-right">추천 구간</th>
                    <th className="px-2 py-2 text-center">포함</th>
                    <th className="px-2 py-2 text-right">최소 오차</th>
                    <th className="px-2 py-2 text-right">내 오차</th>
                    <th className="px-2 py-2 text-right">개선</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => (
                    <Row key={r.bid.id} row={r} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function SummaryStatement({
  summary,
}: {
  summary: ReturnType<typeof runBacktest>["summary"];
}) {
  const sentences: string[] = [];

  if (summary.inclusionRate != null) {
    sentences.push(
      `평가된 ${summary.evaluatedCount}건 중 ${formatPercent(summary.inclusionRate)}에서 실제 사정율이 추천 구간 안에 들어왔습니다.`,
    );
  }
  if (summary.meanError.bestOfThree != null) {
    sentences.push(
      `3개 전략 중 최선을 골랐다는 가정하에 평균 오차는 ${formatPercent(summary.meanError.bestOfThree, 3)}입니다.`,
    );
  }
  if (summary.meanMyError != null && summary.improvementRate != null) {
    const dir = summary.improvementRate >= 0.5 ? "더 가까웠습니다" : "더 가깝지 않았습니다";
    sentences.push(
      `사용자 실제 투찰 평균 오차 ${formatPercent(summary.meanMyError, 3)}와 비교 시, 도구가 ${formatPercent(summary.improvementRate)} 케이스에서 ${dir}.`,
    );
  }
  if (summary.runnerUpEvaluatedCount > 0 && summary.runnerUpImprovementRate != null) {
    sentences.push(
      `2등 공고 ${summary.runnerUpEvaluatedCount}건만 한정하면 도구 우위 비율은 ${formatPercent(summary.runnerUpImprovementRate)}입니다.`,
    );
  }

  return (
    <div className="rounded border bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
      <div className="mb-1 text-xs font-semibold text-slate-500">종합 평가</div>
      {sentences.join(" ")}
    </div>
  );
}

function Row({ row }: { row: BacktestRow }) {
  if (row.status === "no_actual_result") {
    return (
      <tr className="text-slate-500">
        <td className="px-2 py-2">
          <Link href={`/bids/${row.bid.id}`} className="hover:underline">
            {row.bid.notice_title}
          </Link>
          <div className="text-xs text-slate-400">
            {row.bid.agency} · {row.bid.work_type}
          </div>
        </td>
        <td className="px-2 py-2">
          <StatusBadge label="결과 없음" tone="muted" />
        </td>
        <td className="px-2 py-2 text-right text-slate-400">—</td>
        <td className="px-2 py-2 text-right text-slate-400">—</td>
        <td className="px-2 py-2 text-right text-slate-400">—</td>
        <td className="px-2 py-2 text-center text-slate-400">—</td>
        <td className="px-2 py-2 text-right text-slate-400">—</td>
        <td className="px-2 py-2 text-right text-slate-400">—</td>
        <td className="px-2 py-2 text-right text-slate-400">—</td>
      </tr>
    );
  }

  if (row.status === "insufficient_data") {
    return (
      <tr className="text-slate-500">
        <td className="px-2 py-2">
          <Link href={`/bids/${row.bid.id}`} className="hover:underline">
            {row.bid.notice_title}
          </Link>
          <div className="text-xs text-slate-400">
            {row.bid.agency} · {row.bid.work_type}
          </div>
        </td>
        <td className="px-2 py-2">
          <StatusBadge label="표본 부족" tone="warn" />
        </td>
        <td className="px-2 py-2 text-right">{row.historicalSampleCount}</td>
        <td className="px-2 py-2 text-right tabular-nums">
          {formatPercent(row.actualWinRatio)}
        </td>
        <td className="px-2 py-2 text-right text-slate-400">—</td>
        <td className="px-2 py-2 text-center text-slate-400">—</td>
        <td className="px-2 py-2 text-right text-slate-400">—</td>
        <td className="px-2 py-2 text-right text-slate-400">—</td>
        <td className="px-2 py-2 text-right text-slate-400">—</td>
      </tr>
    );
  }

  // evaluated
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-2 py-2">
        <Link href={`/bids/${row.bid.id}`} className="font-medium hover:underline">
          {row.bid.notice_title}
        </Link>
        <div className="text-xs text-slate-500">
          {row.bid.agency} · {row.bid.work_type}
          {row.isRunnerUp && (
            <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">
              2등
            </span>
          )}
        </div>
      </td>
      <td className="px-2 py-2">
        <StatusBadge label="평가됨" tone="ok" />
      </td>
      <td className="px-2 py-2 text-right">{row.historicalSampleCount}</td>
      <td className="px-2 py-2 text-right tabular-nums">
        {formatPercent(row.actualWinRatio)}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-slate-600">
        {row.range
          ? `${formatPercent(row.range.low)}~${formatPercent(row.range.high)}`
          : "—"}
      </td>
      <td className="px-2 py-2 text-center">
        {row.included ? (
          <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
            ✓
          </span>
        ) : (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
            ✗
          </span>
        )}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        {row.errors ? (
          <>
            {formatPercent(row.errors.min, 3)}
            <span className="ml-1 text-[10px] text-slate-400">{row.errors.bestLabel}</span>
          </>
        ) : (
          "—"
        )}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        {row.myError != null ? formatPercent(row.myError, 3) : "—"}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        {row.improvement == null ? (
          "—"
        ) : row.improvement > 0 ? (
          <span className="text-green-700">
            +{formatPercent(row.improvement, 3)}
          </span>
        ) : row.improvement < 0 ? (
          <span className="text-red-700">{formatPercent(row.improvement, 3)}</span>
        ) : (
          <span className="text-slate-500">0</span>
        )}
      </td>
    </tr>
  );
}

function Card({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "primary" | "good";
}) {
  const cls =
    tone === "primary"
      ? "border-blue-300 bg-blue-50/40"
      : tone === "good"
        ? "border-emerald-300 bg-emerald-50/40"
        : "";
  return (
    <div className={`rounded border bg-white p-4 ${cls}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "warn" | "muted";
}) {
  const cls = {
    ok: "bg-green-100 text-green-700",
    warn: "bg-amber-100 text-amber-700",
    muted: "bg-slate-100 text-slate-500",
  }[tone];
  return <span className={`rounded px-1.5 py-0.5 text-xs ${cls}`}>{label}</span>;
}
