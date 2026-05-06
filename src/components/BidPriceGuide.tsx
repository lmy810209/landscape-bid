"use client";

// 입찰가 가이드 카드 — lookup 성공 후 표시.
//
// 표시 내용:
//   1) 부적격 경계 (낙찰하한율) — 이하 가면 부적격
//   2) 권장 안전 영역 (낙찰하한율 + 0.5%p ~ 91.0%)
//   3) 본인 자연 패턴 (median 90.33%)
//   4) 풀 median 영역 (88.65%)
//
// 추첨 운에 좌우되는 영역은 정직하게 "보장 불가" 명시.
// 클릭 시 my_bid_amount 자동 입력.

type Props = {
  baseAmount: number;
  sucsfbidLwltRate: number | null; // 89.745 같은 % 값
  onApplyBid: (amount: number) => void;
};

const ROUND = (n: number) => Math.round(n / 1000) * 1000; // 천원 단위 라운드

export default function BidPriceGuide({ baseAmount, sucsfbidLwltRate, onApplyBid }: Props) {
  const threshold = sucsfbidLwltRate != null ? sucsfbidLwltRate : null;

  // 시나리오들 (사정율 % 기준)
  const scenarios: { label: string; ratio: number; color: string; note: string }[] = [];

  if (threshold != null) {
    scenarios.push({
      label: "부적격 경계",
      ratio: threshold,
      color: "red",
      note: "이 이하 가면 자동 탈락",
    });
    scenarios.push({
      label: "안전 (하한 +0.3%)",
      ratio: threshold + 0.3,
      color: "amber",
      note: "부적격 위험 매우 낮음",
    });
    scenarios.push({
      label: "권장 (하한 +0.5%)",
      ratio: threshold + 0.5,
      color: "emerald",
      note: "본인 평소 영역, 가장 합리적",
    });
  }
  scenarios.push({
    label: "본인 평소 median",
    ratio: 90.33,
    color: "blue",
    note: "scope 2 32회 기준",
  });
  scenarios.push({
    label: "풀 median (공격형)",
    ratio: 88.65,
    color: "slate",
    note: "1,124명 몰림. 부적격 위험·운빨 높음",
  });

  const colorMap: Record<string, string> = {
    red: "border-red-300 bg-red-50",
    amber: "border-amber-300 bg-amber-50",
    emerald: "border-emerald-300 bg-emerald-50",
    blue: "border-blue-300 bg-blue-50",
    slate: "border-slate-300 bg-slate-50",
  };

  return (
    <div className="mt-3 rounded border border-indigo-200 bg-indigo-50/50 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">💡 추천 투찰가 시나리오</h3>
        <span className="text-[11px] text-slate-500">
          기초금액 {baseAmount.toLocaleString()}원 기준
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        클릭하면 "나의 투찰가" 폼에 자동 입력. ※ 추첨번호 운으로 결정되어 어떤 가격이든 낙찰 보장은 없음.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
        {scenarios.map((s) => {
          const amount = ROUND(baseAmount * (s.ratio / 100));
          const isPicked = s.color === "emerald";
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => onApplyBid(amount)}
              className={`group rounded border p-3 text-left transition-shadow hover:shadow-md ${colorMap[s.color]} ${
                isPicked ? "ring-2 ring-emerald-400" : ""
              }`}
            >
              <div className="flex items-baseline justify-between">
                <div className="text-xs font-medium text-slate-700">{s.label}</div>
                <div className="font-mono text-xs text-slate-600">{s.ratio.toFixed(2)}%</div>
              </div>
              <div className="mt-1 font-mono text-base font-semibold text-slate-900">
                {amount.toLocaleString()}원
              </div>
              <div className="mt-0.5 text-[11px] text-slate-600">{s.note}</div>
              {isPicked && (
                <div className="mt-1 text-[10px] font-medium text-emerald-700">✓ 추천</div>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-600">
        <strong className="text-slate-800">정직한 한계</strong> — 본인 32회 분석 결과:
        가격이 1위와 0.5%p 이내로 가까운 경우가 37.5%지만 평균 순위 24위.
        실제 낙찰은 가격이 아닌 추첨번호(15개 중 4개) 운으로 결정. 위 시나리오는
        부적격 회피 + 평소 패턴 유지를 위한 가이드일 뿐 낙찰 보장 아님.
      </div>
    </div>
  );
}
