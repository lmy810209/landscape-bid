// 본인과 특정 경쟁자가 같은 공고에 정상 진입한 케이스 직접 비교.
// "같은 공고에서 평균 X.X%p 더 비싸게/낮게 썼다"를 보여줌.

export type HeadToHeadRow = {
  bid_ntce_no: string;
  my_rate: number; // % (예: 90.32)
  opp_rate: number;
  gap_pp: number; // my - opp. 양수면 본인이 더 높게 (비쌌음)
  my_rank: number;
  opp_rank: number;
};

export type HeadToHeadSummary = {
  opp_bizno: string;
  opp_name: string;
  total_overlap: number; // 같은 공고에 둘 다 정상 진입한 케이스 수
  my_lower_count: number; // 본인이 더 낮게 (공격적) 쓴 횟수
  opp_lower_count: number; // 상대가 더 낮게 쓴 횟수
  avg_my_rate: number | null;
  avg_opp_rate: number | null;
  avg_gap_pp: number | null; // mean(my - opp). 양수 = 본인이 평균 더 높음
  rows: HeadToHeadRow[]; // 최근 5건
};

type ParticipantRow = {
  bid_ntce_no: string;
  prcbdr_bizno: string;
  openg_rank: number | null;
  bidprcrt: number | null;
};

export function buildHeadToHead(
  participants: ParticipantRow[],
  myBizno: string,
  oppBizno: string,
  oppName: string,
): HeadToHeadSummary {
  const myByNotice = new Map<string, ParticipantRow>();
  const oppByNotice = new Map<string, ParticipantRow>();

  for (const p of participants) {
    if (p.prcbdr_bizno === myBizno) myByNotice.set(p.bid_ntce_no, p);
    else if (p.prcbdr_bizno === oppBizno) oppByNotice.set(p.bid_ntce_no, p);
  }

  const overlap: HeadToHeadRow[] = [];
  for (const [no, my] of myByNotice) {
    const opp = oppByNotice.get(no);
    if (!opp) continue;
    if (my.bidprcrt == null || opp.bidprcrt == null) continue;
    overlap.push({
      bid_ntce_no: no,
      my_rate: Number(my.bidprcrt),
      opp_rate: Number(opp.bidprcrt),
      gap_pp: Number(my.bidprcrt) - Number(opp.bidprcrt),
      my_rank: my.openg_rank ?? 0,
      opp_rank: opp.openg_rank ?? 0,
    });
  }

  if (overlap.length === 0) {
    return {
      opp_bizno: oppBizno,
      opp_name: oppName,
      total_overlap: 0,
      my_lower_count: 0,
      opp_lower_count: 0,
      avg_my_rate: null,
      avg_opp_rate: null,
      avg_gap_pp: null,
      rows: [],
    };
  }

  const my_lower = overlap.filter((r) => r.gap_pp < 0).length;
  const opp_lower = overlap.filter((r) => r.gap_pp > 0).length;
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

  return {
    opp_bizno: oppBizno,
    opp_name: oppName,
    total_overlap: overlap.length,
    my_lower_count: my_lower,
    opp_lower_count: opp_lower,
    avg_my_rate: mean(overlap.map((r) => r.my_rate)),
    avg_opp_rate: mean(overlap.map((r) => r.opp_rate)),
    avg_gap_pp: mean(overlap.map((r) => r.gap_pp)),
    rows: overlap.sort((a, b) => b.bid_ntce_no.localeCompare(a.bid_ntce_no)).slice(0, 5),
  };
}
