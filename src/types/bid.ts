// 결과 상태 — '2등'은 diff_rate 미세 조정값 산출의 핵심 지표
export const RESULT_STATUSES = [
  "낙찰",
  "2등",
  "순위권밖",
  "미참여",
  "유찰",
] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

// 공종 — 자유입력 대신 선택형. 운영 중 추가 필요 시 이 배열만 확장.
export const WORK_TYPES = [
  "조경식재",
  "조경시설물",
  "조경시공",
  "유지관리",
  "기타",
] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export type Bid = {
  id: string;

  // 공고
  notice_no: string;
  notice_title: string;
  agency: string;
  work_type: string;
  region: string | null;
  base_amount: number;
  estimated_price: number | null;
  bid_date: string | null;
  bid_method: string | null;
  qualification_limit: string | null;
  participant_count: number | null;

  // 내 투찰
  my_bid_amount: number | null;

  // 결과
  winning_amount: number | null;
  second_amount: number | null;
  result_status: ResultStatus;

  note: string | null;
  created_at: string;
  updated_at: string;
};

export type BidInput = Omit<Bid, "id" | "created_at" | "updated_at">;
