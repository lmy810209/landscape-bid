import type { Bid } from "@/types/bid";

// 모든 비율은 소수(예: 0.8745 = 87.45%)로 반환한다.
// 분모가 0이거나 입력이 없으면 null을 반환해 호출부에서 명시적으로 처리한다.

export function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null) return null;
  if (denominator <= 0) return null;
  return numerator / denominator;
}

// 사정율 = 낙찰가 / 기초금액
export function calcWinRatio(bid: Pick<Bid, "winning_amount" | "base_amount">): number | null {
  return ratio(bid.winning_amount, bid.base_amount);
}

// 나의 투찰률 = 나의 투찰가 / 기초금액
export function calcMyBidRatio(bid: Pick<Bid, "my_bid_amount" | "base_amount">): number | null {
  return ratio(bid.my_bid_amount, bid.base_amount);
}

// my_gap_rate = (낙찰가 - 나의 투찰가) / 기초금액
export function calcMyGapRate(
  bid: Pick<Bid, "winning_amount" | "my_bid_amount" | "base_amount">,
): number | null {
  if (bid.winning_amount == null || bid.my_bid_amount == null) return null;
  return ratio(bid.winning_amount - bid.my_bid_amount, bid.base_amount);
}

// runner_up_gap_rate = (낙찰가 - 2등가) / 기초금액
//   2등 데이터는 추천 구간 미세 조정의 핵심 지표.
export function calcRunnerUpGapRate(
  bid: Pick<Bid, "winning_amount" | "second_amount" | "base_amount">,
): number | null {
  if (bid.winning_amount == null || bid.second_amount == null) return null;
  return ratio(bid.winning_amount - bid.second_amount, bid.base_amount);
}

export function formatPercent(value: number | null, fractionDigits = 2): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

export function formatKRW(value: number | null): string {
  if (value == null) return "—";
  return `${value.toLocaleString("ko-KR")}원`;
}
