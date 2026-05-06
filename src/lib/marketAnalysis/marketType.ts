// 공고별 시장 유형 분류 (① 시장 유형 카드).
//
// 우선순위:
//   1. 데이터 < 5건 → 데이터 부족
//   2. 강자 매칭 → 강자 회피
//   3. 사정율 분포 → 공격형 / 안전형 / (둘 다 아니면) 데이터 부족 fallback

import {
  MARKET_TYPE_THRESHOLDS,
  KEYWORD_STRONG_THRESHOLD_COUNT,
  KEYWORD_STRONG_THRESHOLD_RATIO,
  type PublicWin,
  type MarketType,
  extractKeywords,
} from "./types";

export type StrongCompany = {
  name: string;
  count: number;
  share: number; // 0~1
  keyword: string;
};

export type MarketTypeResult = {
  type: MarketType;
  reasons: {
    sample_size: number;
    agency_median: number | null;
    keyword_median: number | null;
    recent5_rates: number[];
    strong_companies: StrongCompany[];
  };
  recommendation: string;
};

function median(rates: number[]): number | null {
  if (rates.length === 0) return null;
  const sorted = [...rates].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function classifyMarketType(
  noticeAgency: string,
  noticeName: string,
  allWins: PublicWin[],
): MarketTypeResult {
  // 안산∩비방제만
  const ansanPool = allWins.filter((w) => w.is_ansan && !w.is_bangje && w.sucsfbid_rate != null);

  // 발주처 일치 (안산시 본청은 부분 일치 허용)
  const sameAgency = ansanPool.filter((w) => {
    if (!w.dminstt_nm) return false;
    return w.dminstt_nm === noticeAgency || w.dminstt_nm.includes(noticeAgency) || noticeAgency.includes(w.dminstt_nm);
  });

  // 유사 키워드
  const noticeKeywords = extractKeywords(noticeName);
  const sameKeyword = ansanPool.filter((w) => {
    if (!w.bid_ntce_nm) return false;
    return noticeKeywords.some((k) => w.bid_ntce_nm!.includes(k));
  });

  // 매칭 풀: 발주처 + 키워드 우선, 부족하면 발주처만
  let matched = ansanPool.filter((w) => {
    const agencyMatch =
      w.dminstt_nm === noticeAgency ||
      (w.dminstt_nm && (w.dminstt_nm.includes(noticeAgency) || noticeAgency.includes(w.dminstt_nm)));
    const keywordMatch =
      w.bid_ntce_nm && noticeKeywords.some((k) => w.bid_ntce_nm!.includes(k));
    return agencyMatch && keywordMatch;
  });
  if (matched.length < MARKET_TYPE_THRESHOLDS.MIN_SAMPLE_SIZE) {
    // fallback: 발주처만
    matched = sameAgency;
  }

  const agencyMedian = median(sameAgency.map((w) => Number(w.sucsfbid_rate)).filter((r) => !isNaN(r)));
  const keywordMedian = median(sameKeyword.map((w) => Number(w.sucsfbid_rate)).filter((r) => !isNaN(r)));

  // 최근 5건 (매칭 풀에서)
  const recent5 = [...matched]
    .sort((a, b) => (b.rl_openg_dt ?? "").localeCompare(a.rl_openg_dt ?? ""))
    .slice(0, 5)
    .map((w) => Number(w.sucsfbid_rate))
    .filter((r) => !isNaN(r));

  // 강자 분석 — 키워드별
  const strongCompanies: StrongCompany[] = [];
  for (const kw of noticeKeywords) {
    const kwPool = ansanPool.filter((w) => w.bid_ntce_nm?.includes(kw));
    if (kwPool.length === 0) continue;
    const byCompany: Record<string, number> = {};
    kwPool.forEach((w) => {
      const k = w.bidwinnr_nm ?? "?";
      byCompany[k] = (byCompany[k] ?? 0) + 1;
    });
    const sorted = Object.entries(byCompany).sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sorted) {
      const share = count / kwPool.length;
      if (count >= KEYWORD_STRONG_THRESHOLD_COUNT && share >= KEYWORD_STRONG_THRESHOLD_RATIO) {
        if (!strongCompanies.find((s) => s.name === name && s.keyword === kw)) {
          strongCompanies.push({ name, count, share, keyword: kw });
        }
      }
    }
  }

  // ─── 우선순위 적용 ───
  // 1. 데이터 부족
  if (matched.length < MARKET_TYPE_THRESHOLDS.MIN_SAMPLE_SIZE) {
    return {
      type: "데이터 부족",
      reasons: {
        sample_size: matched.length,
        agency_median: agencyMedian,
        keyword_median: keywordMedian,
        recent5_rates: recent5,
        strong_companies: strongCompanies,
      },
      recommendation: "기존 안전형 기준으로만 참고",
    };
  }

  // 2. 강자 회피
  if (strongCompanies.length > 0) {
    return {
      type: "강자 회피",
      reasons: {
        sample_size: matched.length,
        agency_median: agencyMedian,
        keyword_median: keywordMedian,
        recent5_rates: recent5,
        strong_companies: strongCompanies,
      },
      recommendation: "참여 시 공격형 아니면 실익 낮음",
    };
  }

  const matchedMedian = median(matched.map((w) => Number(w.sucsfbid_rate)).filter((r) => !isNaN(r)));
  const recentSafe = recent5.filter((r) => r >= MARKET_TYPE_THRESHOLDS.RECENT_SAFE_THRESHOLD).length;
  const recentAgg = recent5.filter((r) => r <= MARKET_TYPE_THRESHOLDS.RECENT_AGGRESSIVE_THRESHOLD).length;

  // 3. 안전형 필요 (최근 트렌드 우선)
  if (
    (matchedMedian != null && matchedMedian >= MARKET_TYPE_THRESHOLDS.SAFE_MIN_MEDIAN) ||
    recentSafe >= MARKET_TYPE_THRESHOLDS.RECENT_SAFE_COUNT
  ) {
    return {
      type: "안전형 필요",
      reasons: {
        sample_size: matched.length,
        agency_median: agencyMedian,
        keyword_median: keywordMedian,
        recent5_rates: recent5,
        strong_companies: strongCompanies,
      },
      recommendation: "낙찰보다 미달 회피 우선",
    };
  }

  // 4. 공격형 가능
  if (
    (matchedMedian != null && matchedMedian <= MARKET_TYPE_THRESHOLDS.AGGRESSIVE_MAX_MEDIAN) ||
    recentAgg >= MARKET_TYPE_THRESHOLDS.RECENT_AGGRESSIVE_COUNT
  ) {
    return {
      type: "공격형 가능",
      reasons: {
        sample_size: matched.length,
        agency_median: agencyMedian,
        keyword_median: keywordMedian,
        recent5_rates: recent5,
        strong_companies: strongCompanies,
      },
      recommendation: "공격형 검토 가능. 단, 미달 위험 표시",
    };
  }

  // 모호 영역 → 데이터 부족 처리
  return {
    type: "데이터 부족",
    reasons: {
      sample_size: matched.length,
      agency_median: agencyMedian,
      keyword_median: keywordMedian,
      recent5_rates: recent5,
      strong_companies: strongCompanies,
    },
    recommendation: "기존 안전형 기준으로만 참고",
  };
}
