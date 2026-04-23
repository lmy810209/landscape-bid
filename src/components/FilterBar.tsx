"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Props = {
  agencies: string[];
  workTypes: string[];
};

export default function FilterBar({ agencies, workTypes }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  const agency = sp.get("agency") ?? "";
  const workType = sp.get("work_type") ?? "";

  function update(key: "agency" | "work_type", value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
  }

  function reset() {
    router.push("/");
  }

  const hasFilter = !!(agency || workType);

  return (
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

      {hasFilter && (
        <button
          type="button"
          onClick={reset}
          className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          필터 초기화
        </button>
      )}
    </div>
  );
}

const selectCls =
  "min-w-[180px] rounded border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-slate-500";
