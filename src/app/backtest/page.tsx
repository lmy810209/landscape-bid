import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Bid } from "@/types/bid";
import { formatPercent } from "@/lib/analysis/calculations";
import { runBacktest, type BacktestRow } from "@/lib/analysis/backtest";
import {
  BIN_SIZE,
  RANGE_EXPAND_THRESHOLD,
  RECENT_COUNT,
  RECENT_WEIGHT,
  MIN_FOR_CONDITIONAL,
  MIN_FOR_RECOMMEND,
} from "@/lib/analysis/recommendation";
import type { BacktestSummary } from "@/lib/analysis/backtest";
import type { BootstrapCI } from "@/lib/analysis/stats";
// v2.2: personalAdjustment 모듈 삭제 (§4.5 최종 제거).
// 관련 상수 배지도 제거. 파일 하단 ConstantsBadge에서 해당 그룹 삭제됨.
import {
  filterBids,
  uniqueValues,
  resolveAnalysisFilter,
  describeFilter,
  isDefaultApplied,
  type AnalyzeSearchParams,
} from "@/lib/analysis/filters";
import FilterBar from "@/components/FilterBar";

export const dynamic = "force-dynamic";

export default async function BacktestPage({
  searchParams,
}: {
  searchParams: AnalyzeSearchParams;
}) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("bids")
    .select("*")
    .order("bid_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const all = (data ?? []) as Bid[];
  const criteria = resolveAnalysisFilter(searchParams);
  const bids = filterBids(all, criteria);
  const agencies = uniqueValues(all, "agency");
  const workTypes = uniqueValues(all, "work_type");
  const criteriaLabel = describeFilter(criteria);
  const defaultApplied = isDefaultApplied(criteria);

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

      <FilterBar
        agencies={agencies}
        workTypes={workTypes}
        basePath="/backtest"
        defaultApplied={defaultApplied}
        criteriaLabel={criteriaLabel}
      />

      <ConstantsBadge />

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
                label="참고 구간 포함률"
                value={formatPercent(summary.inclusionRate)}
                sub={`평가 ${summary.evaluatedCount}건 중 실제 사정율이 참고 구간 안에 들어온 비율`}
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
              <Card
                label="부적격 회피 가능 비율"
                value={
                  summary.underThresholdAvoidableRate != null
                    ? formatPercent(summary.underThresholdAvoidableRate)
                    : "—"
                }
                sub={
                  summary.underThresholdTotal > 0
                    ? `낙찰하한선미달 ${summary.underThresholdTotal}건 중 ${summary.underThresholdAvoidableCount}건은 보수형 추천이 1등 사정율 위였음 (회피 가능)`
                    : "낙찰하한선미달 평가 건 없음"
                }
                tone={
                  summary.underThresholdAvoidableRate != null &&
                  summary.underThresholdAvoidableRate >= 0.5
                    ? "good"
                    : "neutral"
                }
              />
            </div>
          </section>

          {/* 종합 한 줄 평가 */}
          {/* P1 신규 지표: Calibration + Sharpness + CI. 기존 "핵심 지표"는 그대로 두고 병행. */}
          <CalibrationSharpnessSection summary={summary} />

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
                    <th className="px-2 py-2 text-right">참고 구간</th>
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

function CalibrationSharpnessSection({ summary }: { summary: BacktestSummary }) {
  const { calibration50, calibration80, sharpness50, sharpness80, improvementCI, vsUserMaeRatio } =
    summary;

  const anyData = !!(calibration50 || calibration80 || sharpness50 || sharpness80);
  if (!anyData) return null;

  const toneMap = {
    good: { badge: "bg-green-100 text-green-800", border: "border-green-300" },
    warn: { badge: "bg-amber-100 text-amber-800", border: "border-amber-300" },
    bad: { badge: "bg-red-100 text-red-800", border: "border-red-300" },
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">캘리브레이션 · 샤프니스 (신규, v2.1)</h2>
        <p className="text-xs text-slate-500">
          Quantile 기반 신뢰구간 지표 + Bootstrap/Wilson CI. 기존 "핵심 지표"와 <strong>병행 표시</strong>되며,
          어느 것이 더 유용한 신호를 주는지 비교 판단하세요. 값 우측 대괄호 안은 95% 신뢰구간.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {calibration50 && (
          <div className={`rounded border-2 bg-white p-4 ${toneMap[calibration50.tone].border}`}>
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-500">Calibration@50</div>
              <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${toneMap[calibration50.tone].badge}`}>
                목표 50% · {calibration50.tone === "good" ? "양호" : calibration50.tone === "warn" ? "주의" : "이탈"}
              </span>
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {pctPct(calibration50.ci.point)}
            </div>
            <div className="text-xs tabular-nums text-slate-500">
              [{pctPct(calibration50.ci.low)} ~ {pctPct(calibration50.ci.high)}]
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              50% 구간(Q25~Q75)에 실제 사정율이 들어온 비율 · n={calibration50.n}
            </div>
          </div>
        )}

        {calibration80 && (
          <div className={`rounded border-2 bg-white p-4 ${toneMap[calibration80.tone].border}`}>
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-500">Calibration@80</div>
              <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${toneMap[calibration80.tone].badge}`}>
                목표 80% · {calibration80.tone === "good" ? "양호" : calibration80.tone === "warn" ? "주의" : "이탈"}
              </span>
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {pctPct(calibration80.ci.point)}
            </div>
            <div className="text-xs tabular-nums text-slate-500">
              [{pctPct(calibration80.ci.low)} ~ {pctPct(calibration80.ci.high)}]
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              80% 구간(Q10~Q90)에 실제 사정율이 들어온 비율 · n={calibration80.n}
            </div>
          </div>
        )}

        {sharpness50 && (
          <SharpnessCard
            label="Sharpness@50 (구간 평균 폭)"
            ci={sharpness50.ci}
            drawLB={sharpness50.theoreticalLowerBound}
            empLB={sharpness50.empiricalLowerBound}
            n={sharpness50.n}
          />
        )}

        {sharpness80 && (
          <SharpnessCard
            label="Sharpness@80 (구간 평균 폭)"
            ci={sharpness80.ci}
            drawLB={sharpness80.theoreticalLowerBound}
            empLB={sharpness80.empiricalLowerBound}
            n={sharpness80.n}
          />
        )}

        {improvementCI && (
          <div className="rounded border bg-white p-4">
            <div className="text-xs text-slate-500">개선률 (95% CI, Wilson)</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {pctPct(improvementCI.point)}
            </div>
            <div className="text-xs tabular-nums text-slate-500">
              [{pctPct(improvementCI.low)} ~ {pctPct(improvementCI.high)}]
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              {improvementCI.low <= 0.5 && improvementCI.high >= 0.5
                ? "CI가 50%를 포함 — 통계적 유의성 없음 (동전 던지기 구간)"
                : improvementCI.low > 0.5
                  ? "CI가 50% 초과 — 도구 우위"
                  : "CI가 50% 미만 — 도구 열세"}
              · n={improvementCI.n}
            </div>
          </div>
        )}

        {vsUserMaeRatio != null && (
          <div
            className={`rounded border bg-white p-4 ${vsUserMaeRatio < 1 ? "border-green-300" : "border-red-300"}`}
          >
            <div className="text-xs text-slate-500">vs 사용자 MAE 비율</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {vsUserMaeRatio.toFixed(2)}×
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              도구 최소오차 / 사용자 오차. <strong>1.00 미만</strong>이어야 도구가 유리.
              {vsUserMaeRatio >= 1 && (
                <span className="ml-1 rounded bg-red-100 px-1 py-0.5 text-red-700">
                  현재 사용자 직관이 도구보다 정확
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function pctPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

// Sharpness 카드 — 두 가지 이론 하한을 병기.
//
// 왜 두 개인가:
//   1) "추첨 이론 하한" (σ_draw=0.66% 기반, 약 0.78%/1.49%):
//      예비가격 4/15 추첨만 고려한 수학적 하한. 도구가 절대 깰 수 없는 벽.
//   2) "실측 σ 기반 하한" (σ_total=실측 표본 sd, 약 1.53%/2.91%):
//      현실 데이터의 전체 분산(추첨 + 발주처 편향). Calibration이 맞으려면
//      구간 폭이 이 값 근처여야 한다. 아래면 과대신뢰 → Calibration 미달.
//
// 즉 구간이 "추첨 하한보다 넓고 실측 하한보다도 넓어야" 하는데,
// 현재 구간이 실측 하한보다 좁으면 Calibration 목표 미달의 구조적 원인이 된다.
function SharpnessCard({
  label,
  ci,
  drawLB,
  empLB,
  n,
}: {
  label: string;
  ci: BootstrapCI;
  drawLB: number;
  empLB: number | null;
  n: number;
}) {
  const ratio = empLB != null && empLB > 0 ? ci.point / empLB : null;
  const tooNarrow = ratio != null && ratio < 0.95;

  return (
    <div className={`rounded border bg-white p-4 ${tooNarrow ? "border-amber-300" : ""}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {formatPercent(ci.point, 3)}
      </div>
      <div className="text-xs tabular-nums text-slate-500">
        [{formatPercent(ci.low, 3)} ~ {formatPercent(ci.high, 3)}]
      </div>
      <div className="mt-2 space-y-0.5 text-[11px] text-slate-600">
        <div>
          추첨 이론 하한 (σ_draw) ≈ {formatPercent(drawLB, 2)}
          <span className="ml-1 text-slate-400">— 절대 못 깨는 벽</span>
        </div>
        {empLB != null ? (
          <div>
            실측 σ 기반 하한 ≈ {formatPercent(empLB, 2)}
            <span className="ml-1 text-slate-400">— Calibration 기준</span>
            {" · 현재 "}
            <span className="font-semibold tabular-nums">{ratio!.toFixed(2)}×</span>
            {tooNarrow && (
              <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-amber-800">
                좁음 → Calibration 미달 원인
              </span>
            )}
          </div>
        ) : (
          <div className="text-slate-400">실측 σ 계산 불가 (표본 &lt; 2)</div>
        )}
        <div className="text-slate-400">n={n}</div>
      </div>
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
      `평가된 ${summary.evaluatedCount}건 중 ${formatPercent(summary.inclusionRate)}에서 실제 사정율이 참고 구간 안에 들어왔습니다.`,
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
  if (summary.underThresholdTotal > 0 && summary.underThresholdAvoidableRate != null) {
    sentences.push(
      `낙찰하한선미달 ${summary.underThresholdTotal}건 중 보수형 추천이 1등 사정율 위였던 (회피 가능했을) 비율은 ${formatPercent(summary.underThresholdAvoidableRate)}입니다.`,
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
          {row.isUnderThreshold && (
            <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">
              낙찰하한선미달
              {row.underThresholdAvoidable === true && " · 회피 가능"}
              {row.underThresholdAvoidable === false && " · 회피 불가"}
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

function ConstantsBadge() {
  return (
    <details className="rounded border border-slate-200 bg-slate-50 text-xs">
      <summary className="cursor-pointer select-none px-3 py-2 font-semibold text-slate-700">
        현재 상수 세트 (v3 · 2026-04 잠정 확정) — 클릭해서 펼치기
      </summary>
      <div className="grid grid-cols-1 gap-4 px-3 pb-3 sm:grid-cols-3">
        <ConstGroup title="참고 구간 (recommendation.ts)">
          <ConstRow k="BIN_SIZE" v={fmt(BIN_SIZE)} />
          <ConstRow k="RANGE_EXPAND_THRESHOLD" v={RANGE_EXPAND_THRESHOLD.toFixed(2)} />
          <ConstRow k="RECENT_COUNT × WEIGHT" v={`${RECENT_COUNT} × ${RECENT_WEIGHT.toFixed(1)}`} />
          <ConstRow k="MIN_FOR_CONDITIONAL / RECOMMEND" v={`${MIN_FOR_CONDITIONAL} / ${MIN_FOR_RECOMMEND}`} />
        </ConstGroup>
        <ConstGroup title="개인 보정 (제거됨, v2.2)">
          <ConstRow k="상태" v="모듈 삭제" />
          <ConstRow k="사유" v="자기참조 오염 + 표본 부족" />
          <ConstRow k="근거" v="concept-note §4.5 · §8.1" />
        </ConstGroup>
        <ConstGroup title="전략 위치 비율 (strategy.ts, backtest 전용)">
          <ConstRow k="≤4건" v="0.42 / 0.50 / 0.68" />
          <ConstRow k="5~9건" v="0.38 / 0.50 / 0.70" />
          <ConstRow k="≥10건" v="0.35 / 0.50 / 0.72" />
          <ConstRow k="순서" v="공격 / 균형 / 보수" />
        </ConstGroup>
      </div>
      <p className="px-3 pb-3 text-[11px] text-slate-500">
        상수 변경은 "한 번에 하나씩" 원칙. 수정 이력과 구조적 제약(포함률 상한)은 CLAUDE.md 참조.
      </p>
    </details>
  );
}

function ConstGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border bg-white p-2">
      <div className="mb-1 text-[11px] font-semibold text-slate-600">{title}</div>
      <dl className="space-y-0.5">{children}</dl>
    </div>
  );
}

function ConstRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500">{k}</dt>
      <dd className="tabular-nums text-slate-800">{v}</dd>
    </div>
  );
}

function fmt(n: number): string {
  // 0.003 같은 값을 "0.003" 그대로, 정수는 정수로.
  return Number.isInteger(n) ? String(n) : n.toString();
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
