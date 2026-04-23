"use client";

import { useMemo, useState } from "react";
import type { Bid, WorkType } from "@/types/bid";
import { WORK_TYPES } from "@/types/bid";
import { formatKRW, formatPercent } from "@/lib/analysis/calculations";
import {
  BIN_SIZE,
  MIN_FOR_CONDITIONAL,
  RANGE_EXPAND_THRESHOLD,
  RECENT_COUNT,
  RECENT_WEIGHT,
  analyzeNotice,
  type NoticeAnalysisInput,
  type NoticeAnalysisResult,
  type ParticipationStatus,
  type Risk,
  type RiskLevel,
} from "@/lib/analysis/recommendation";
import {
  calculateBidStrategies,
  type BidStrategies,
  type StrategyOption,
} from "@/lib/analysis/strategy";

type Props = {
  bids: Bid[];
  agencyOptions: string[];
  workTypeOptions: string[];
  initial?: Partial<FormState>;
};

type FormState = {
  agency: string;
  work_type: WorkType | "";
  region: string;
  base_amount: string;
  bid_date: string;
  qualification_limit: string;
  bid_method: string;
  participant_count: string;
};

const empty: FormState = {
  agency: "",
  work_type: "",
  region: "",
  base_amount: "",
  bid_date: "",
  qualification_limit: "",
  bid_method: "",
  participant_count: "",
};

export default function AnalyzePanel({ bids, agencyOptions, workTypeOptions, initial }: Props) {
  const [form, setForm] = useState<FormState>({ ...empty, ...initial });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  const input: NoticeAnalysisInput = useMemo(
    () => ({
      agency: form.agency.trim(),
      work_type: form.work_type,
      region: form.region.trim() || null,
      base_amount: form.base_amount ? Number(form.base_amount) : null,
      bid_date: form.bid_date || null,
      qualification_limit: form.qualification_limit.trim() || null,
      bid_method: form.bid_method.trim() || null,
      participant_count: form.participant_count ? Number(form.participant_count) : null,
    }),
    [form],
  );

  const result: NoticeAnalysisResult = useMemo(
    () => analyzeNotice(input, bids),
    [input, bids],
  );

  // 추천 구간이 도출됐고 표본이 최소 임계 이상일 때만 전략 계산.
  // 그 외에는 null → UI에서 "전략 계산 불가" 카드로 폴백.
  const strategies: BidStrategies | null = useMemo(() => {
    if (!result.range) return null;
    if (result.sampleCount < MIN_FOR_CONDITIONAL) return null;
    return calculateBidStrategies({
      range: result.range,
      baseAmount: input.base_amount,
      sampleCount: result.sampleCount,
      myGapRateMean: result.myGapRateMean,
      participantCount: input.participant_count,
    });
  }, [result, input.base_amount, input.participant_count]);

  const filled = !!(input.agency && input.work_type);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
      {/* 왼쪽: 입력 폼 */}
      <aside className="space-y-4 rounded border bg-white p-4">
        <h2 className="text-sm font-semibold">분석 대상 공고</h2>

        <Field label="발주처" required>
          <input
            list="agency-options"
            className={inputCls}
            value={form.agency}
            onChange={(e) => update("agency", e.target.value)}
            placeholder="예: 서울특별시청"
          />
          <datalist id="agency-options">
            {agencyOptions.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Field>

        <Field label="공종" required>
          <select
            className={inputCls}
            value={form.work_type}
            onChange={(e) => update("work_type", e.target.value as WorkType)}
          >
            <option value="">선택하세요</option>
            {WORK_TYPES.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
          {workTypeOptions.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              실제 데이터에 있는 공종: {workTypeOptions.join(", ")}
            </p>
          )}
        </Field>

        <Field label="지역">
          <input
            className={inputCls}
            value={form.region}
            onChange={(e) => update("region", e.target.value)}
          />
        </Field>

        <Field label="기초금액(원)">
          <input
            type="number"
            className={inputCls}
            value={form.base_amount}
            onChange={(e) => update("base_amount", e.target.value)}
            min={0}
          />
        </Field>

        <Field label="개찰일">
          <input
            type="date"
            className={inputCls}
            value={form.bid_date}
            onChange={(e) => update("bid_date", e.target.value)}
          />
        </Field>

        <Field label="등급/면허 제한">
          <input
            className={inputCls}
            value={form.qualification_limit}
            onChange={(e) => update("qualification_limit", e.target.value)}
            placeholder="예: 조경공사업, 시평 30억"
          />
        </Field>

        <Field label="입찰 방식">
          <input
            className={inputCls}
            value={form.bid_method}
            onChange={(e) => update("bid_method", e.target.value)}
            placeholder="예: 적격심사"
          />
        </Field>

        <Field label="참가 업체 수">
          <input
            type="number"
            className={inputCls}
            value={form.participant_count}
            onChange={(e) => update("participant_count", e.target.value)}
            min={0}
          />
        </Field>

        <button
          type="button"
          onClick={() => setForm(empty)}
          className="w-full rounded border px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          입력값 초기화
        </button>
      </aside>

      {/* 오른쪽: 결과 */}
      <section className="space-y-4">
        {!filled ? (
          <div className="rounded border bg-white p-8 text-center text-sm text-slate-500">
            왼쪽에서 <strong>발주처</strong>와 <strong>공종</strong>을 입력하면
            추천 사정율 구간이 계산됩니다.
          </div>
        ) : (
          <>
            <StatusBanner status={result.status} reason={result.reason} />

            <SummaryBox text={result.summary} />

            <StrategiesSection strategies={strategies} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Card
                label="추천 사정율 구간"
                primary
                value={
                  result.range
                    ? `${formatPercent(result.range.low)} ~ ${formatPercent(result.range.high)}`
                    : "—"
                }
                sub={
                  result.range
                    ? `${(BIN_SIZE * 100).toFixed(1)}% bin · 인접 ${(RANGE_EXPAND_THRESHOLD * 100).toFixed(0)}% 이상 흡수`
                    : "데이터 부족으로 도출 불가"
                }
              />
              <Card
                label="가중 평균 사정율"
                value={formatPercent(result.weightedMean)}
                sub={`최근 ${RECENT_COUNT}건 ×${RECENT_WEIGHT.toFixed(1)} 가중`}
              />
              <Card
                label="my_gap_rate 평균"
                value={formatPercent(result.myGapRateMean)}
                sub={`표본 ${result.myGapSampleCount}건`}
              />
              <Card
                label="runner_up_gap_rate 평균"
                value={formatPercent(result.runnerUpGapRateMean)}
                sub={
                  result.runnerUpGapSampleCount > 0
                    ? `표본 ${result.runnerUpGapSampleCount}건 — 미세 조정 참고`
                    : "2등 데이터 없음 → 보류"
                }
              />
              <Card
                label="데이터 근거"
                value={`${result.sampleCount}건`}
                sub={`매칭 전체 ${result.totalCount}건 중 사정율 산출 가능`}
              />
              {input.base_amount != null && result.range && (
                <Card
                  label="투찰가 환산 (참고)"
                  value={`${formatKRW(Math.round(input.base_amount * result.range.low))} ~ ${formatKRW(Math.round(input.base_amount * result.range.high))}`}
                  sub={`기초금액 × 추천 구간 (단일 값 아님)`}
                />
              )}
            </div>

            <RiskList risks={result.risks} />

            {result.bins.length > 0 && (
              <Histogram bins={result.bins} highlight={result.range} />
            )}
          </>
        )}
      </section>
    </div>
  );
}

// === sub components ===

const inputCls =
  "w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-slate-500";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-slate-600">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function Card({
  label,
  value,
  sub,
  primary,
}: {
  label: string;
  value: string;
  sub?: string;
  primary?: boolean;
}) {
  return (
    <div
      className={
        "rounded border bg-white p-4 " + (primary ? "border-blue-300 bg-blue-50/40" : "")
      }
    >
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function StatusBanner({
  status,
  reason,
}: {
  status: ParticipationStatus;
  reason: string;
}) {
  const map = {
    recommended: { label: "참여 가능", cls: "bg-green-50 text-green-800 border-green-200" },
    conditional: { label: "조건부 참여", cls: "bg-yellow-50 text-yellow-800 border-yellow-200" },
    not_recommended: { label: "비추천", cls: "bg-red-50 text-red-800 border-red-200" },
  } as const;
  const v = map[status];
  return (
    <div className={`rounded border p-3 text-sm ${v.cls}`}>
      <span className="font-semibold">{v.label}</span> · {reason}
    </div>
  );
}

function SummaryBox({ text }: { text: string }) {
  return (
    <div className="rounded border bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
      <div className="mb-1 text-xs font-semibold text-slate-500">결과 요약</div>
      {text}
    </div>
  );
}

function StrategiesSection({ strategies }: { strategies: BidStrategies | null }) {
  if (!strategies) {
    return (
      <div className="rounded border border-slate-200 bg-white p-4">
        <h3 className="mb-1 text-sm font-semibold">투찰 전략 옵션</h3>
        <p className="text-sm text-slate-500">
          추천 구간이 도출되지 않아 전략 계산이 불가합니다. 동일 발주처/공종 데이터를
          더 축적한 뒤 다시 시도하세요.
        </p>
      </div>
    );
  }

  const { aggressive, balanced, conservative, meta } = strategies;
  const adjustments: string[] = [];
  if (meta.gapAdjustmentApplied !== 0) {
    const sign = meta.gapAdjustmentApplied > 0 ? "+" : "";
    adjustments.push(
      `my_gap_rate 보정 ${sign}${(meta.gapAdjustmentApplied * 100).toFixed(3)}%p (모든 옵션)`,
    );
  }
  if (meta.competitionAdjustmentApplied !== 0) {
    adjustments.push(
      `경쟁 강도 보정 ${(meta.competitionAdjustmentApplied * 100).toFixed(3)}%p (균형형만, 참가 ${meta.participantCount}개)`,
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between">
        <div>
          <h3 className="text-sm font-semibold">투찰 전략 옵션 (참고값)</h3>
          <p className="text-xs text-slate-500">
            추천 구간 내 위치 기반 3가지 옵션. 단일 정답이 아니라 참고용 전략입니다.
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">표본 {meta.sampleCount}건</div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StrategyCard option={aggressive} tone="aggressive" />
        <StrategyCard option={balanced} tone="balanced" />
        <StrategyCard option={conservative} tone="conservative" />
      </div>

      {adjustments.length > 0 && (
        <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
          <span className="font-semibold">적용된 보정: </span>
          {adjustments.join(" · ")}
        </div>
      )}
    </div>
  );
}

function StrategyCard({
  option,
  tone,
}: {
  option: StrategyOption;
  tone: "aggressive" | "balanced" | "conservative";
}) {
  const toneCls = {
    aggressive: "border-red-200 bg-red-50/40",
    balanced: "border-blue-300 bg-blue-50/40",
    conservative: "border-emerald-200 bg-emerald-50/40",
  }[tone];
  const badgeCls = {
    aggressive: "bg-red-100 text-red-700",
    balanced: "bg-blue-100 text-blue-700",
    conservative: "bg-emerald-100 text-emerald-700",
  }[tone];

  return (
    <div className={`rounded border p-4 ${toneCls}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${badgeCls}`}>
          {option.label}
        </span>
        <span className="text-xs text-slate-500">사정율</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums">
        {(option.rate * 100).toFixed(3)}%
      </div>
      <div className="mt-1 text-sm tabular-nums text-slate-700">
        예상 투찰가 {option.bidAmount != null ? `${option.bidAmount.toLocaleString("ko-KR")}원` : "—"}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">{option.description}</p>
    </div>
  );
}

function RiskList({ risks }: { risks: Risk[] }) {
  return (
    <div className="rounded border bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold">주요 리스크 (최대 3개)</h3>
      {risks.length === 0 ? (
        <p className="text-sm text-slate-500">현재 입력 기준 특이 리스크가 발견되지 않았습니다.</p>
      ) : (
        <ul className="space-y-2">
          {risks.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <RiskBadge level={r.level} />
              <div>
                <div className="font-medium">{r.label}</div>
                <div className="text-slate-600">{r.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RiskBadge({ level }: { level: RiskLevel }) {
  const map = {
    critical: { label: "치명", cls: "bg-red-100 text-red-700" },
    warning: { label: "경고", cls: "bg-amber-100 text-amber-700" },
    info: { label: "정보", cls: "bg-slate-100 text-slate-600" },
  } as const;
  const v = map[level];
  return (
    <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${v.cls}`}>{v.label}</span>
  );
}

function Histogram({
  bins,
  highlight,
}: {
  bins: { low: number; high: number; weight: number; count: number }[];
  highlight: { low: number; high: number } | null;
}) {
  const max = Math.max(...bins.map((b) => b.weight), 1);
  return (
    <div className="rounded border bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">사정율 분포 (가중 빈도)</h3>
        <span className="text-xs text-slate-500">bin {(BIN_SIZE * 100).toFixed(1)}%</span>
      </div>
      <div className="space-y-1">
        {bins.map((b) => {
          const isHl = highlight && b.low >= highlight.low && b.high <= highlight.high;
          const widthPct = (b.weight / max) * 100;
          return (
            <div key={b.low} className="flex items-center gap-2 text-xs">
              <span className="w-28 tabular-nums text-slate-600">
                {formatPercent(b.low)}–{formatPercent(b.high)}
              </span>
              <div className="relative h-4 flex-1 rounded bg-slate-100">
                <div
                  className={`h-full rounded ${isHl ? "bg-blue-500" : "bg-slate-400"}`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span className="w-24 text-right tabular-nums text-slate-600">
                {b.count}건 (w{b.weight.toFixed(1)})
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
