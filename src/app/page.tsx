import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Bid } from "@/types/bid";
import { formatPercent } from "@/lib/analysis/calculations";
import {
  BIN_SIZE,
  RECENT_COUNT,
  RECENT_WEIGHT,
  computeRecommendation,
  filterBids,
  uniqueValues,
  type ParticipationStatus,
} from "@/lib/analysis/recommendation";
import FilterBar from "@/components/FilterBar";

export const dynamic = "force-dynamic";

type SearchParams = { agency?: string; work_type?: string };

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("bids")
    .select("*")
    .order("bid_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const all = (data ?? []) as Bid[];
  const filtered = filterBids(all, {
    agency: searchParams.agency,
    workType: searchParams.work_type,
  });
  const rec = computeRecommendation(filtered);

  const agencies = uniqueValues(all, "agency");
  const workTypes = uniqueValues(all, "work_type");

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">분석 대시보드</h1>
        <p className="mt-1 text-sm text-slate-600">
          발주처/공종으로 필터링하여 추천 사정율 구간을 확인하세요. 모든 결과는{" "}
          <strong>추천 구간</strong>으로만 제시됩니다 (단일 예측값 아님).
        </p>
      </section>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          데이터를 불러오지 못했습니다: {error.message}
        </div>
      )}

      <FilterBar agencies={agencies} workTypes={workTypes} />

      <section className="space-y-3">
        <StatusBanner status={rec.status} reason={rec.reason} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            label="추천 사정율 구간"
            value={
              rec.range
                ? `${formatPercent(rec.range.low)} ~ ${formatPercent(rec.range.high)}`
                : "—"
            }
            sub={
              rec.range
                ? `${(BIN_SIZE * 100).toFixed(1)}% 단위 가중 빈도 최대 구간`
                : "데이터 부족"
            }
          />
          <Card
            label="가중 평균 사정율"
            value={formatPercent(rec.weightedMean)}
            sub={`최근 ${RECENT_COUNT}건 ×${RECENT_WEIGHT.toFixed(1)} 가중`}
          />
          <Card
            label="2등 차이값 (평균)"
            value={formatPercent(rec.diffRateMean)}
            sub={`표본 ${rec.diffSampleCount}건 — 미세 조정 참고`}
          />
          <Card
            label="데이터 근거"
            value={`${rec.sampleCount}건`}
            sub={`전체 ${rec.totalCount}건 중 사정율 산출 가능`}
          />
        </div>

        {rec.bins.length > 0 && (
          <div className="rounded border bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">사정율 분포 (가중 빈도)</h3>
              <span className="text-xs text-slate-500">
                bin 크기 {(BIN_SIZE * 100).toFixed(1)}%
              </span>
            </div>
            <Histogram
              bins={rec.bins}
              highlight={rec.range}
            />
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">최근 등록</h2>
          <Link href="/bids" className="text-sm text-blue-600 hover:underline">
            전체 보기 →
          </Link>
        </div>
        {filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="divide-y rounded border bg-white">
            {filtered.slice(0, 5).map((b) => (
              <li key={b.id} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <Link
                    href={`/bids/${b.id}`}
                    className="font-medium hover:underline"
                  >
                    {b.notice_title}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {b.agency} · {b.work_type} · {b.bid_date ?? "—"}
                  </div>
                </div>
                <ResultBadge status={b.result_status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded border bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function StatusBanner({ status, reason }: { status: ParticipationStatus; reason: string }) {
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

function ResultBadge({ status }: { status: string }) {
  const cls =
    status === "낙찰"
      ? "bg-green-100 text-green-700"
      : status === "2등"
        ? "bg-blue-100 text-blue-700"
        : status === "유찰"
          ? "bg-amber-100 text-amber-700"
          : "bg-slate-100 text-slate-600";
  return <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>{status}</span>;
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
    <div className="space-y-1">
      {bins.map((b) => {
        const isHl =
          highlight && b.low >= highlight.low && b.high <= highlight.high;
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
            <span className="w-20 text-right tabular-nums text-slate-600">
              {b.count}건 (w{b.weight.toFixed(1)})
            </span>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded border bg-white p-8 text-center text-sm text-slate-500">
      필터 조건에 해당하는 데이터가 없습니다.{" "}
      <Link href="/bids/new" className="text-blue-600 hover:underline">
        새 입찰 등록하기
      </Link>
    </div>
  );
}
