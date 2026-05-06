"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RESULT_STATUSES, WORK_TYPES, type ResultStatus, type WorkType } from "@/types/bid";

type FormState = {
  notice_no: string;
  notice_title: string;
  agency: string;
  work_type: WorkType | "";
  region: string;
  base_amount: string;
  estimated_price: string;
  bid_date: string;
  bid_method: string;
  qualification_limit: string;
  participant_count: string;
  my_bid_amount: string;
  winning_amount: string;
  second_amount: string;
  result_status: ResultStatus | "";
  note: string;
};

const EMPTY_FORM: FormState = {
  notice_no: "",
  notice_title: "",
  agency: "",
  work_type: "",
  region: "",
  base_amount: "",
  estimated_price: "",
  bid_date: "",
  bid_method: "",
  qualification_limit: "",
  participant_count: "",
  my_bid_amount: "",
  winning_amount: "",
  second_amount: "",
  result_status: "",
  note: "",
};

type Props = {
  initial?: Partial<FormState>;
  mode?: "create" | "edit";
  bidId?: string;
};

export default function BidForm({ initial, mode = "create", bidId }: Props = {}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, ...initial });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = mode === "edit";

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toNumber(v: string): number | null {
    const trimmed = v.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload = {
      notice_no: form.notice_no.trim(),
      notice_title: form.notice_title.trim(),
      agency: form.agency.trim(),
      work_type: form.work_type,
      region: form.region.trim() || null,
      base_amount: toNumber(form.base_amount),
      estimated_price: toNumber(form.estimated_price),
      bid_date: form.bid_date || null,
      bid_method: form.bid_method.trim() || null,
      qualification_limit: form.qualification_limit.trim() || null,
      participant_count: toNumber(form.participant_count),
      my_bid_amount: toNumber(form.my_bid_amount),
      winning_amount: toNumber(form.winning_amount),
      second_amount: toNumber(form.second_amount),
      result_status: form.result_status,
      note: form.note.trim() || null,
    };

    const url = isEdit && bidId ? `/api/bids/${bidId}` : "/api/bids";
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "저장에 실패했습니다.");
      setSubmitting(false);
      return;
    }

    if (isEdit && bidId) {
      router.push(`/bids/${bidId}`);
    } else {
      router.push("/bids");
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded border bg-white p-4">
      <Section title="공고 정보">
        <Field label="공고번호" required>
          <input
            className={inputCls}
            value={form.notice_no}
            onChange={(e) => update("notice_no", e.target.value)}
            required
          />
        </Field>
        <Field label="공고명" required>
          <input
            className={inputCls}
            value={form.notice_title}
            onChange={(e) => update("notice_title", e.target.value)}
            required
          />
        </Field>
        <Field label="발주처" required>
          <input
            className={inputCls}
            value={form.agency}
            onChange={(e) => update("agency", e.target.value)}
            placeholder="예: 서울특별시청, 한국토지주택공사"
            required
          />
        </Field>
        <Field label="공종" required>
          <select
            className={inputCls}
            value={form.work_type}
            onChange={(e) => update("work_type", e.target.value as WorkType)}
            required
          >
            <option value="">선택하세요</option>
            {WORK_TYPES.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </Field>
        <Field label="지역">
          <input
            className={inputCls}
            value={form.region}
            onChange={(e) => update("region", e.target.value)}
            placeholder="예: 서울, 경기"
          />
        </Field>
        <Field label="개찰일/입찰일">
          <input
            type="date"
            className={inputCls}
            value={form.bid_date}
            onChange={(e) => update("bid_date", e.target.value)}
          />
        </Field>
        <Field label="기초금액(원)" required>
          <input
            type="number"
            className={inputCls}
            value={form.base_amount}
            onChange={(e) => update("base_amount", e.target.value)}
            min={0}
            required
          />
        </Field>
        <Field label="예정가격(원)">
          <input
            type="number"
            className={inputCls}
            value={form.estimated_price}
            onChange={(e) => update("estimated_price", e.target.value)}
            min={0}
          />
        </Field>
        <Field label="입찰 방식">
          <input
            className={inputCls}
            value={form.bid_method}
            onChange={(e) => update("bid_method", e.target.value)}
            placeholder="예: 적격심사, 종합심사낙찰제"
          />
        </Field>
        <Field label="등급/면허 제한">
          <input
            className={inputCls}
            value={form.qualification_limit}
            onChange={(e) => update("qualification_limit", e.target.value)}
            placeholder="예: 조경공사업, 시평 30억 이상"
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
      </Section>

      <Section title="투찰 / 결과">
        <Field label="결과 상태" required>
          <select
            className={inputCls}
            value={form.result_status}
            onChange={(e) => update("result_status", e.target.value as ResultStatus)}
            required
          >
            <option value="">선택하세요</option>
            {RESULT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="나의 투찰가(원)">
          <input
            type="number"
            className={inputCls}
            value={form.my_bid_amount}
            onChange={(e) => update("my_bid_amount", e.target.value)}
            min={0}
          />
        </Field>
        <Field label="낙찰가(원)">
          <input
            type="number"
            className={inputCls}
            value={form.winning_amount}
            onChange={(e) => update("winning_amount", e.target.value)}
            min={0}
          />
        </Field>
        <Field label="2등 금액(원)">
          <input
            type="number"
            className={inputCls}
            value={form.second_amount}
            onChange={(e) => update("second_amount", e.target.value)}
            min={0}
          />
        </Field>
      </Section>

      <Section title="특이사항">
        <div className="sm:col-span-2">
          <textarea
            className={`${inputCls} min-h-[80px]`}
            value={form.note}
            onChange={(e) => update("note", e.target.value)}
            placeholder="자유 기록 (조건, 특이사항 등)"
          />
        </div>
      </Section>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        {isEdit ? (
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            취소
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setForm(EMPTY_FORM)}
            className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            초기화
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? (isEdit ? "수정 중..." : "저장 중...") : isEdit ? "수정 저장" : "저장"}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-slate-500";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-slate-700">{title}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

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
