-- 스코프 2 — 공고별 모든 참여자 데이터 적재 테이블.
--
-- 출처: getOpengResultListInfoOpengCompt (낙찰정보서비스 op 13)
-- 1 공고 = N rows (참여 업체 수만큼). 어제 공고 예: 68 rows.
-- public_wins(낙찰자만)와 보완 관계. 함께 쓰면 "전체 참여자 분포 + 본인 위치" 분석 가능.

create table if not exists public.public_participants (
  id                   uuid          primary key default gen_random_uuid(),

  -- 공고 식별
  bid_ntce_no          text          not null,
  bid_ntce_ord         text          not null default '000',
  bid_clsfc_no         text          not null default '0',
  rbid_no              text          not null default '000',
  openg_rank           integer       not null,                          -- 개찰순위

  -- 참여자
  prcbdr_bizno         text          references public.companies(bizno) on delete set null,
  prcbdr_nm            text,
  prcbdr_ceo_nm        text,

  -- 투찰 데이터
  bidprc_amt           numeric(18,0),                                    -- 투찰금액
  bidprcrt             numeric(8,4),                                     -- 투찰률 (vs 예정가격)
  rmrk                 text,                                             -- 비고 ("정상" / "낙찰하한선미달" 등)
  drwt_no_1            text,                                             -- 추첨번호 1
  drwt_no_2            text,                                             -- 추첨번호 2
  bidprc_dt            timestamptz,                                      -- 투찰일시

  -- 기술/평가 점수 (협상에 의한 계약 등에서만 채워짐, 일반 적격심사는 빈값)
  bidprce_evl_val      numeric(10,4),
  tech_evl_val         numeric(10,4),
  total_evl_amt_val    numeric(10,4),
  tech_evl_natur_val   numeric(10,4),

  -- 분류 보조 (rmrk 기반)
  is_qualified         boolean       generated always as (rmrk = '정상') stored,
  is_under_threshold   boolean       generated always as (rmrk like '%미달%') stored,

  source               text          not null default 'OpengResultListInfoOpengCompt',
  scanned_at           timestamptz   not null default now(),
  raw                  jsonb,

  constraint public_participants_uniq unique (bid_ntce_no, bid_ntce_ord, bid_clsfc_no, rbid_no, openg_rank)
);

create index if not exists public_participants_ntce_idx
  on public.public_participants (bid_ntce_no, bid_ntce_ord);
create index if not exists public_participants_bizno_idx
  on public.public_participants (prcbdr_bizno);
create index if not exists public_participants_bidprcrt_idx
  on public.public_participants (bidprcrt);
create index if not exists public_participants_qualified_idx
  on public.public_participants (is_qualified) where is_qualified;

alter table public.public_participants disable row level security;
