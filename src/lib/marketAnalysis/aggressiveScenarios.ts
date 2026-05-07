// 공격형 시뮬레이션 (③ 공격형 시나리오 카드).
//
// 공격 A: 유사 공고 P25 사정율
// 공격 B: 유사 공고 중앙값 사정율
// 공격 C: 상위업체 평균 사정율

import {
  detectInsuranceDeduction,
  extractKeywords,
  type NoticeContext,
  type PublicWin,
} from "./types";
import { TOP5_COMPETITORS } from "./topCompetitors";
import { estimateEffectiveCutoff, type ParticipantRow } from "./effectiveCutoff";

export type RiskLevel = "낮음" | "중간" | "높음";
export type Position = "공격권" | "정상권" | "미달위험권";

export type AggressiveScenario = {
  label: string; // "공격 A" / "공격 B" / "공격 C"
  description: string;
  rate: number; // 사정율 %
  bid_amount: number; // 예상 투찰금액
  margin_to_lower_bound: number; // 낙찰하한선 대비 여유 (원). + = 위, - = 아래
  margin_pct: number; // 같은 것 (%p)
  risk_level: RiskLevel;
  position: Position;
};

export type AggressiveScenariosResult = {
  scenarios: AggressiveScenario[];
  insurance_deduction: boolean; // 보험료 감액 적용 여부
  insurance_warning: string | null;
  effective_cutoff_estimate: number | null; // 보정된 사정율 cutoff (% — 추정 시에만)
  effective_cutoff_amount: number | null; // 원 단위
  sample_size: number;
};

function median(rates: number[]): number | null {
  if (rates.length === 0) return null;
  const s = [...rates].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}
function percentile(rates: number[], p: number): number | null {
  if (rates.length === 0) return null;
  const s = [...rates].sort((a, b) => a - b);
  return s[Math.floor(s.length * p)] ?? null;
}

function classifyRisk(
  bidAmount: number,
  lowerBound: number,
  baseAmount: number,
): RiskLevel {
  if (bidAmount < lowerBound) return "높음";
  const margin = (bidAmount - lowerBound) / baseAmount;
  if (margin <= 0.002) return "중간"; // 0.2%p 이내
  return "낮음";
}

function classifyPosition(rate: number, similarMedian: number | null): Position {
  if (similarMedian == null) return "정상권";
  if (rate < similarMedian - 0.5) return "공격권"; // 유사 공고 중앙값보다 0.5%p 이상 낮음
  if (rate < similarMedian + 0.3) return "정상권";
  return "미달위험권"; // 너무 높음 (의외 — 시뮬에선 잘 안 나옴)
}

export function buildAggressiveScenarios(
  ctx: NoticeContext,
  allWins: PublicWin[],
  participants: ParticipantRow[] = [],
): AggressiveScenariosResult {
  const ansanPool = allWins.filter((w) => w.is_ansan && !w.is_bangje && w.sucsfbid_rate != null);
  const noticeKeywords = extractKeywords(ctx.notice_title);

  // 유사 공고 (발주처 + 키워드 매칭, 부족하면 발주처만)
  const same = ansanPool.filter((w) => {
    const ag =
      w.dminstt_nm === ctx.agency ||
      (w.dminstt_nm && (w.dminstt_nm.includes(ctx.agency) || ctx.agency.includes(w.dminstt_nm)));
    const kw = w.bid_ntce_nm && noticeKeywords.some((k) => w.bid_ntce_nm!.includes(k));
    return ag && kw;
  });
  let matched = same;
  if (matched.length < 5) {
    matched = ansanPool.filter((w) => {
      return (
        w.dminstt_nm === ctx.agency ||
        (w.dminstt_nm && (w.dminstt_nm.includes(ctx.agency) || ctx.agency.includes(w.dminstt_nm)))
      );
    });
  }

  const matchedRates = matched.map((w) => Number(w.sucsfbid_rate)).filter((r) => !isNaN(r));
  const matchedMedian = median(matchedRates);
  const matchedP25 = percentile(matchedRates, 0.25);

  // 상위 5명 평균
  const top5BiznoSet = new Set(TOP5_COMPETITORS.map((c) => c.bizno));
  const top5Rates = ansanPool
    .filter((w) => w.bidwinnr_bizno && top5BiznoSet.has(w.bidwinnr_bizno))
    .map((w) => Number(w.sucsfbid_rate))
    .filter((r) => !isNaN(r));
  const top5Avg =
    top5Rates.length > 0 ? top5Rates.reduce((s, r) => s + r, 0) / top5Rates.length : null;

  // op13 정상 참여자 데이터로 effective cutoff 추정 (보험료 감액 + 일반 모두)
  const matchedNoticeIds = matched.map((w) => w.bid_ntce_no).filter((x): x is string => !!x);
  const cutoffStats = estimateEffectiveCutoff(matchedNoticeIds, participants);

  const insuranceDeduction = detectInsuranceDeduction(ctx.bid_method);
  let effectiveCutoffRate: number | null = null;
  let effectiveCutoffAmount: number | null = null;
  let warning: string | null = null;

  // op13 데이터 충분하면 그걸 우선 사용 (per-notice cutoff 분포의 25%값)
  if (cutoffStats.per_notice_p25 != null && cutoffStats.per_notice_cutoffs.length >= 5) {
    effectiveCutoffRate = cutoffStats.per_notice_p25;
    effectiveCutoffAmount = ctx.base_amount * (effectiveCutoffRate / 100);
  }

  if (insuranceDeduction) {
    warning =
      "이 공고는 보험료 등 합산액 감액 적용 공고입니다. 단순 낙찰하한율보다 실제 미달선이 높게 형성될 수 있습니다.";
    // 보험료 감액일 때 추정값을 실제 advertised보다 아래로 내리지 않음
    if (effectiveCutoffRate != null && effectiveCutoffRate < ctx.sucsfbid_lwlt_rate) {
      effectiveCutoffRate = ctx.sucsfbid_lwlt_rate;
      effectiveCutoffAmount = ctx.base_amount * (effectiveCutoffRate / 100);
    }
    // op13 데이터 없으면 fallback: 매칭 winners 최근 8건 min - 0.05
    if (effectiveCutoffRate == null) {
      const recent = [...matched]
        .sort((a, b) => (b.rl_openg_dt ?? "").localeCompare(a.rl_openg_dt ?? ""))
        .slice(0, 8)
        .map((w) => Number(w.sucsfbid_rate))
        .filter((r) => !isNaN(r));
      if (recent.length >= 3) {
        const minRecent = Math.min(...recent);
        effectiveCutoffRate = Math.max(minRecent - 0.05, ctx.sucsfbid_lwlt_rate);
        effectiveCutoffAmount = ctx.base_amount * (effectiveCutoffRate / 100);
      }
    }
  }

  // 단순 낙찰하한선 (= 기초 × 낙찰하한율)
  const simpleLowerBound = ctx.base_amount * (ctx.sucsfbid_lwlt_rate / 100);
  const effectiveLowerBound = effectiveCutoffAmount ?? simpleLowerBound;

  function makeScenario(
    label: string,
    description: string,
    rate: number | null,
  ): AggressiveScenario | null {
    if (rate == null) return null;
    const bid = Math.round(ctx.base_amount * (rate / 100));
    const margin = bid - effectiveLowerBound;
    const marginPct = (margin / ctx.base_amount) * 100;
    return {
      label,
      description,
      rate,
      bid_amount: bid,
      margin_to_lower_bound: margin,
      margin_pct: marginPct,
      risk_level: classifyRisk(bid, effectiveLowerBound, ctx.base_amount),
      position: classifyPosition(rate, matchedMedian),
    };
  }

  const scenarios: AggressiveScenario[] = [];
  const a = makeScenario("공격 A", "유사 공고 P25 사정율", matchedP25);
  const b = makeScenario("공격 B", "유사 공고 중앙값 사정율", matchedMedian);
  const c = makeScenario("공격 C", "상위 5개 업체 평균 사정율", top5Avg);
  if (a) scenarios.push(a);
  if (b) scenarios.push(b);
  if (c) scenarios.push(c);

  return {
    scenarios,
    insurance_deduction: insuranceDeduction,
    insurance_warning: warning,
    effective_cutoff_estimate: effectiveCutoffRate,
    effective_cutoff_amount: effectiveCutoffAmount,
    sample_size: matched.length,
  };
}
