// 스코프 2 — data.go.kr 낙찰정보서비스 수집 데이터 타입.

export type Company = {
  bizno: string;
  name: string;
  ceo_nm: string | null;
  address: string | null;
  tel: string | null;
  is_self: boolean;
  is_competitor: boolean;
  note: string | null;
  first_seen_at: string;
  last_updated_at: string;
};

export type PublicParticipant = {
  id: string;
  bid_ntce_no: string;
  bid_ntce_ord: string;
  bid_clsfc_no: string;
  rbid_no: string;
  openg_rank: number;
  prcbdr_bizno: string | null;
  prcbdr_nm: string | null;
  prcbdr_ceo_nm: string | null;
  bidprc_amt: number | null;
  bidprcrt: number | null;
  rmrk: string | null;
  drwt_no_1: string | null;
  drwt_no_2: string | null;
  bidprc_dt: string | null;
  is_qualified: boolean;
  is_under_threshold: boolean;
};

export type PublicWin = {
  id: string;
  bid_ntce_no: string;
  bid_ntce_ord: string;
  bid_clsfc_no: string;
  rbid_no: string;
  bid_ntce_nm: string;
  ntce_div_cd: string | null;
  prtcpt_cnum: number | null;
  rl_openg_dt: string | null;
  rgst_dt: string | null;
  dminstt_cd: string | null;
  dminstt_nm: string | null;
  bidwinnr_bizno: string | null;
  bidwinnr_nm: string | null;
  bidwinnr_ceo_nm: string | null;
  bidwinnr_adrs: string | null;
  bidwinnr_tel_no: string | null;
  sucsfbid_amt: number | null;
  sucsfbid_rate: number | null;
  fnl_sucsf_date: string | null;
  fnl_sucsf_corp_ofcl: string | null;
  is_ansan: boolean;
  is_bangje: boolean;
  source: string;
  scanned_at: string;
};
