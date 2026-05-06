"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { PARTICIPATION_OPTIONS } from "@/lib/analysis/filters";

type Props = {
  agencies: string[];
  workTypes: string[];
  // URL 갱신 시 push할 base path. 기본은 '/' (대시보드).
  basePath?: string;
  // 기본 분석 기준(안산/유지관리)이 현재 적용 중인지. 배지 표시용.
  defaultApplied?: boolean;
  // 현재 적용 중인 기준을 한 줄로 보여주는 설명.
  criteriaLabel?: string;
};

export default function FilterBar({
  agencies,
  workTypes,
  basePath = "/",
  defaultApplied,
  criteriaLabel,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  const agency = sp.get("agency") ?? "";
  const workType = sp.get("work_type") ?? "";
  const participation = sp.get("participation") ?? "all";
  const scope = sp.get("scope") ?? "";

  function pushWith(params: URLSearchParams) {
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function update(key: "agency" | "work_type" | "participation", value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    pushWith(params);
  }

  function toggleScopeAll(toAll: boolean) {
    const params = new URLSearchParams(sp.toString());
    if (toAll) params.set("scope", "all");
    else params.delete("scope");
    pushWith(params);
  }

  function reset() {
    router.push(basePath);
  }

  const hasAnyParam = !!(agency || workType || participation !== "all" || scope);

  return (
    <div className="space-y-2">
      {criteriaLabel && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-600">현재 분석 기준:</span>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">{criteriaLabel}</span>
          {defaultApplied && (
            <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-700">기본값 적용 중</span>
          )}
          {scope === "all" && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-700">전체 데이터 모드</span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded border bg-white p-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-600">발주처</span>
          <select
            className={selectCls}
            value={agency}
            onChange={(e) => update("agency", e.target.value)}
          >
            <option value="">전체</option>
            {agencies.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-600">공종</span>
          <select
            className={selectCls}
            value={workType}
            onChange={(e) => update("work_type", e.target.value)}
          >
            <option value="">전체</option>
            {workTypes.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-600">참여 여부</span>
          <select
            className={selectCls}
            value={participation}
            onChange={(e) => update("participation", e.target.value)}
          >
            {PARTICIPATION_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => toggleScopeAll(scope !== "all")}
          className={`rounded border px-3 py-1.5 text-sm ${
            scope === "all"
              ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
              : "hover:bg-slate-50"
          }`}
          title={
            scope === "all"
              ? "기본 분석 기준(안산/유지관리)을 다시 적용합니다."
              : "기본값을 끄고 전체 데이터를 봅니다. 목록과 동일한 범위가 됩니다."
          }
        >
          {scope === "all" ? "기본 기준으로" : "전체 데이터 보기"}
        </button>

        {hasAnyParam && (
          <button
            type="button"
            onClick={reset}
            className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            필터 초기화
          </button>
        )}
      </div>
    </div>
  );
}

const selectCls =
  "min-w-[160px] rounded border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-slate-500";
