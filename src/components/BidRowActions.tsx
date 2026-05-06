"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

type Props = {
  bidId: string;
  noticeTitle: string;
  layout?: "inline" | "stack";
  redirectTo?: string;
};

export default function BidRowActions({
  bidId,
  noticeTitle,
  layout = "inline",
  redirectTo,
}: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`정말 삭제하시겠습니까?\n\n"${noticeTitle}"`)) return;

    setDeleting(true);
    const res = await fetch(`/api/bids/${bidId}`, { method: "DELETE" });
    setDeleting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(`삭제 실패: ${body.error ?? "알 수 없는 오류"}`);
      return;
    }
    alert("삭제 완료");
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  }

  const wrapCls = layout === "stack" ? "flex flex-col gap-1" : "flex items-center gap-1";

  return (
    <div className={wrapCls} onClick={(e) => e.stopPropagation()}>
      <Link
        href={`/bids/${bidId}/edit`}
        className="rounded border px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
      >
        수정
      </Link>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
      >
        {deleting ? "삭제 중..." : "삭제"}
      </button>
    </div>
  );
}
