"use client";

// v2.2 (2026-04-24) — 옵션 1 전환.
//
// 역할 재정의:
//   - 예측 도구 (투찰값 추천 / 점수 / 전략) → 전부 제거
//   - 기록/복기 도구 (과거 공고 조회 + 패턴 시각화 + 게이트 경고) 로 축소
//
// 근거 (concept-note §8.1):
//   - 백테스트 vs 사용자 MAE = 1.61× (사용자 직관이 더 정확)
//   - 개선률 95% CI [31%, 74%] (50% 가로지름 → 통계적 유의성 없음)
//   - GoNoGo 85점 4축 전부 artefact/더미값으로 판정
//   - my_gap_rate 자기참조 오염 (§4.2) + 안정성 축 BIN_SIZE 자기참조 (v2.1 진단)
//
// 유지:
//   - CRUD (src/app/bids/*)
//   - PDF 추출 (src/lib/extraction/*)
//   - /backtest 전체 (도구 정직성 지표)
//   - 이진 게이트 경고 (자격/예산)
//   - 사정율 분포 히스토그램 + 내 투찰 오버레이
//   - 매칭 공고 목록 (동일 발주처/공종 과거 N건)

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Bid, WorkType } from "@/types/bid";
import { WORK_TYPES } from "@/types/bid";
import {
  calcMyBidRatio,
  calcWinRatio,
  formatKRW,
  formatPercent,
} from "@/lib/analysis/calculations";
import {
  BIN_SIZE,
  RECENT_COUNT,
  RECENT_WEIGHT,
  computeRecommendation,
  type RecommendationResult,
} from "@/lib/analysis/recommendation";
import { filterBids } from "@/lib/analysis/filters";

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

const EMPTY: FormState = {
  agency: "",
  work_type: "",
  region: "",
  base_amount: "",
  bid_date: "",
  qualification_limit: "",
  bid_method: "",
  participant_count: "",
};

// 이진 게이트: 사용자 캐파 범위. 외부 설정 필요 시 props로 승격.
const BUDGET_MIN = 10_000_000; // 1천만
const BUDGET_MAX = 10_000_000_000; // 100억

export default function AnalyzePanel({ bids, agencyOptions, workTypeOptions, initial }: Props) {
  const [form, setForm] = useState<FormState>({ ...EMPTY, ...initial });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  // 매칭 공고 (발주처 + 공종 정확 일치)
  const matched = useMemo(() => {
    if (!form.agency.trim() || !form.work_type) return [] as Bid[];
    return filterBids(bids, {
      agency: form.agency.trim(),
      workType: form.work_type,
    });
  }, [bids, form.agency, form.work_type]);

  // 히스토그램 계산 (BIN_SIZE=0.3%는 기존 상수 재사용)
  // 주의: "추천 구간" 개념은 제거. rec.range는 UI에 표시하지 않음.
  const rec: RecommendationResult | null = useMemo(
    () => (matched.length > 0 ? computeRecommendation(matched) : null),
    [matched],
  );

  // 내 투찰가 오버레이용: 매칭 공고 중 my_bid_ratio 계산 가능한 행
  const myBidOverlay = useMemo(() => {
    return matched
      .map((b) => {
        const r = calcMyBidRatio(b);
        if (r == null) return null;
        return { bid: b, ratio: r, isUnderThreshold: b.result_status === "낙찰하한선미달" };
      })
      .filter((x): x is { bid: Bid; ratio: number; isUnderThreshold: boolean } => x != null);
  }, [matched]);

  // 이진 게이트 판정
  const baseAmount = form.base_amount ? Number(form.base_amount) : null;
  const hasQualification = !!(form.qualification_limit && form.qualification_limit.trim());
  const budgetOk =
    baseAmount == null || (baseAmount >= BUDGET_MIN && baseAmount <= BUDGET_MAX);

  const gateFailures: string[] = [];
  if (!hasQualification) gateFailures.push("자격 요건(등급/면허) 미입력 — 공고 원문 확인 필요");
  if (!budgetOk)
    gateFailures.push(
      `기초금액이 운영 범위 밖 (${formatKRW(BUDGET_MIN)} ~ ${formatKRW(BUDGET_MAX)})`,
    );

  const filled = !!(form.agency.trim() && form.work_type);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
      {/* 왼쪽: 입력 폼 */}
      <aside className="space-y-4 rounded border bg-white p-4">
        <h2 className="text-sm font-semibold">조회 조건</h2>
        <p className="text-xs text-slate-500">
          발주처 + 공종을 입력하면 동일 조건 과거 공고와 사정율 분포를 보여줍니다.
        </p>

        <Field label="발주처" required>
          <input
            list="agency-options"
            className={inputCls}
            value={form.agency}
            onChange={(e) => update("agency", e.target.value)}
            placeholder="예: 경기도 안산시 단원구"
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

        <Field label="기초금액(원)">
          <input
            type="number"
            className={inputCls}
            value={form.base_amount}
            onChange={(e) => update("base_amount", e.target.value)}
            min={0}
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

        <Field label="입찰 방식 (선택)">
          <input
            className={inputCls}
            value={form.bid_method}
            onChange={(e) => update("bid_method", e.target.value)}
            placeholder="예: 적격심사"
          />
        </Field>

        <button
          type="button"
          onClick={() => setForm(EMPTY)}
          className="w-full rounded border px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          입력값 초기화
        </button>
      </aside>

      {/* 오른쪽: 기록/복기 뷰 */}
      <section className="space-y-4">
        <RoleNoticeBanner />

        {!filled ? (
          <div className="rounded border bg-white p-8 text-center text-sm text-slate-500">
            왼쪽에서 <strong>발주처</strong>와 <strong>공종</strong>을 입력하면 과거 공고와
            사정율 분포가 표시됩니다.
          </div>
        ) : (
          <>
            {gateFailures.length > 0 && <GateWarningCard failures={gateFailures} />}

            <MatchedSummary matched={matched} rec={rec} baseAmount={baseAmount} />

            {rec && rec.bins.length > 0 && (
              <DistributionCard rec={rec} overlay={myBidOverlay} baseAmount={baseAmount} />
            )}

            <MatchedBidsList bids={matched} />
          </>
        )}
      </section>
    </div>
  );
}

// === 서브 컴포넌트 ===

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

// v2.2 정체성 안내. 접힘형 details로 평상시엔 간결하게.
function RoleNoticeBanner() {
  return (
    <details className="rounded border border-slate-200 bg-slate-50 p-3 text-xs">
      <summary className="cursor-pointer select-none font-semibold text-slate-700">
        이 도구의 역할 (v2.2, 기록/복기 도구로 축소됨) — 클릭해서 펼치기
      </summary>
      <div className="mt-2 space-y-2 text-slate-600">
        <p>
          2026-04 백테스트 결과: 도구 최소 오차 <strong>0.913%</strong>가 사용자 직관
          오차 <strong>0.566%</strong>의 <strong>1.61배</strong>. 개선률 95% CI
          [31%, 74%]가 50%를 가로지름 → 통계적 유의성 없음.
        </p>
        <p>
          도구가 예측으로 판단을 대체하면 오히려 해가 될 위험이 확인되어, 추천 투찰값·
          GoNoGo 점수·전략 3옵션·최종 투찰값 기능을 <strong>제거</strong>했습니다.
        </p>
        <p>
          현재 역할: <strong>과거 공고 빠른 조회 + 사정율 분포 시각화 + 자격/예산 이진
          게이트 경고</strong>. 판단은 사용자가 직접 내리고, 도구는 복기 자료만
          빠르게 제공합니다.
        </p>
        <p>
          상세 근거는{" "}
          <Link href="/backtest" className="text-blue-600 hover:underline">
            /backtest
          </Link>
          의 Calibration·Sharpness·vs User MAE 카드와{" "}
          <code className="rounded bg-white px-1">docs/concept-note.md</code> §8 참조.
        </p>
      </div>
    </details>
  );
}

function GateWarningCard({ failures }: { failures: string[] }) {
  return (
    <div className="rounded border-2 border-red-300 bg-red-50 p-4">
      <div className="flex items-center gap-2">
        <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
          NO-GO 경고
        </span>
        <h3 className="text-sm font-semibold text-slate-800">기본 조건 미충족</h3>
      </div>
      <ul className="mt-2 space-y-1 text-sm text-slate-700">
        {failures.map((f, i) => (
          <li key={i}>• {f}</li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-slate-500">
        * 자격 요건은 공고 원문에서 실제 충족 여부를 반드시 수동 확인하세요. 이 경고는
        입력 누락만 잡습니다.
      </p>
    </div>
  );
}

function MatchedSummary({
  matched,
  rec,
  baseAmount,
}: {
  matched: Bid[];
  rec: RecommendationResult | null;
  baseAmount: number | null;
}) {
  const n = matched.length;
  const hasRec = rec != null && rec.sampleCount > 0;

  return (
    <div className="rounded border bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-800">매칭 공고 요약</h3>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="매칭 공고 수" value={`${n}건`} sub="발주처 + 공종 일치" />
        <MiniStat
          label="사정율 산출 가능"
          value={hasRec ? `${rec.sampleCount}건` : "—"}
          sub={
            hasRec
              ? `최근 ${Math.min(rec.sampleCount, RECENT_COUNT)}건 × ${RECENT_WEIGHT.toFixed(1)} 가중`
              : "—"
          }
        />
        <MiniStat
          label="가중 평균 사정율"
          value={hasRec ? formatPercent(rec.weightedMean) : "—"}
          sub="참고치 — 예측 아님"
        />
        <MiniStat
          label="기초금액 (입력)"
          value={baseAmount != null ? formatKRW(baseAmount) : "—"}
          sub={baseAmount != null ? "게이트 판정 기준" : "—"}
        />
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded border bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

type OverlayPoint = { bid: Bid; ratio: number; isUnderThreshold: boolean };

function DistributionCard({
  rec,
  overlay,
  baseAmount,
}: {
  rec: RecommendationResult;
  overlay: OverlayPoint[];
  baseAmount: number | null;
}) {
  const maxWeight = Math.max(...rec.bins.map((b) => b.weight), 1);

  return (
    <div className="rounded border bg-white p-4">
      <div className="flex items-end justify-between">
        <h3 className="text-sm font-semibold text-slate-800">사정율 분포</h3>
        <span className="text-xs text-slate-500">bin {(BIN_SIZE * 100).toFixed(1)}%</span>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        파란 막대 = 과거 매칭 공고의 사정율 가중 빈도. 점은 내 투찰 사정율 (있는 경우).
        <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-red-700">
          빨강 점 = 낙찰하한선미달
        </span>
      </p>

      <div className="mt-3 space-y-1">
        {rec.bins.map((b) => {
          const widthPct = (b.weight / maxWeight) * 100;
          // 이 bin에 속하는 my_bid 오버레이 점
          const myPoints = overlay.filter((p) => p.ratio >= b.low && p.ratio < b.high);
          return (
            <div key={b.low} className="flex items-center gap-2 text-xs">
              <span className="w-28 tabular-nums text-slate-600">
                {formatPercent(b.low)}–{formatPercent(b.high)}
              </span>
              <div className="relative h-5 flex-1 rounded bg-slate-100">
                <div
                  className="h-full rounded bg-blue-400"
                  style={{ width: `${widthPct}%` }}
                />
                {/* 내 투찰 오버레이 점: 빨강 (부적격) / 검정 (일반) */}
                {myPoints.map((p, i) => {
                  const leftPct =
                    ((p.ratio - b.low) / (b.high - b.low)) * 100;
                  return (
                    <span
                      key={p.bid.id + i}
                      title={`${p.bid.notice_title} (${formatPercent(p.ratio, 3)})`}
                      className={`absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ring-2 ring-white ${
                        p.isUnderThreshold ? "bg-red-600" : "bg-slate-800"
                      }`}
                      style={{ left: `${Math.min(Math.max(leftPct, 0), 100)}%` }}
                    />
                  );
                })}
              </div>
              <span className="w-24 text-right tabular-nums text-slate-600">
                {b.count}건 (w{b.weight.toFixed(1)})
              </span>
            </div>
          );
        })}
      </div>

      {baseAmount != null && (
        <p className="mt-2 text-[11px] text-slate-500">
          기초금액 {formatKRW(baseAmount)} 기준 ±1%p 구간 환산:{" "}
          {formatKRW(Math.round(baseAmount * 0.01))} 정도 변동.
        </p>
      )}
    </div>
  );
}

function MatchedBidsList({ bids }: { bids: Bid[] }) {
  if (bids.length === 0) {
    return (
      <div className="rounded border bg-white p-4 text-sm text-slate-500">
        매칭 공고가 없습니다. 발주처 또는 공종 입력을 다시 확인해 주세요.
      </div>
    );
  }

  // 최근 순 정렬
  const sorted = [...bids].sort((a, b) => {
    const da = a.bid_date ?? "";
    const db = b.bid_date ?? "";
    if (db !== da) return db.localeCompare(da);
    return b.created_at.localeCompare(a.created_at);
  });

  return (
    <div className="rounded border bg-white">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h3 className="text-sm font-semibold text-slate-800">매칭 공고 목록</h3>
        <span className="text-xs text-slate-500">{sorted.length}건 (최근순)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2">공고</th>
              <th className="px-3 py-2">개찰일</th>
              <th className="px-3 py-2 text-right">기초금액</th>
              <th className="px-3 py-2 text-right">사정율</th>
              <th className="px-3 py-2 text-right">내 투찰률</th>
              <th className="px-3 py-2 text-center">결과</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((b) => {
              const winRatio = calcWinRatio(b);
              const myRatio = calcMyBidRatio(b);
              return (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Link
                      href={`/bids/${b.id}`}
                      className="font-medium hover:underline"
                    >
                      {b.notice_title}
                    </Link>
                    <div className="text-[11px] text-slate-500">{b.notice_no}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{b.bid_date ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatKRW(b.base_amount)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatPercent(winRatio)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatPercent(myRatio)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <ResultBadge status={b.result_status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResultBadge({ status }: { status: string }) {
  const cls =
    status === "낙찰"
      ? "bg-green-100 text-green-700"
      : status === "2등"
        ? "bg-blue-100 text-blue-700"
        : status === "낙찰하한선미달"
          ? "bg-red-100 text-red-700"
          : status === "유찰"
            ? "bg-amber-100 text-amber-700"
            : "bg-slate-100 text-slate-600";
  return <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>{status}</span>;
}
