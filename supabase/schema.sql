-- 조경 조달청 입찰 MVP 스키마 (2단계)
-- v1과 호환되지 않으므로 기존 테이블을 drop 후 재생성한다.
-- 운영 데이터가 있다면 백업 후 적용할 것.

create extension if not exists "pgcrypto";

drop table if exists public.bids cascade;

create table public.bids (
  id uuid primary key default gen_random_uuid(),

  -- 공고 정보
  notice_no            text          not null,
  notice_title         text          not null,
  agency               text          not null,                    -- 발주처
  work_type            text          not null,                    -- 공종 (선택형)
  region               text,                                       -- 지역
  base_amount          numeric(18,0) not null,                    -- 기초금액
  estimated_price      numeric(18,0),                              -- 예정가격
  bid_date             date,                                       -- 개찰일/입찰일 (날짜 기준 통일)
  bid_method           text,                                       -- 입찰 방식 (적격심사, 종합낙찰제 등)
  qualification_limit  text,                                       -- 등급/면허 제한
  participant_count    integer,                                    -- 참가 업체 수

  -- 내 투찰
  my_bid_amount        numeric(18,0),

  -- 결과
  winning_amount       numeric(18,0),                              -- 낙찰가 (1등)
  second_amount        numeric(18,0),                              -- 2등 금액
  result_status        text          not null
                       check (result_status in ('낙찰','2등','순위권밖','낙찰하한선미달','미참여','유찰')),

  -- 메타
  note                 text,                                       -- 특이사항
  created_at           timestamptz   not null default now(),
  updated_at           timestamptz   not null default now()
);

create index bids_agency_idx    on public.bids (agency);
create index bids_work_type_idx on public.bids (work_type);
create index bids_bid_date_idx  on public.bids (bid_date desc);

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_bids_updated_at on public.bids;
create trigger trg_bids_updated_at
  before update on public.bids
  for each row execute function public.set_updated_at();

-- MVP는 단일 사용자 가정 → RLS 비활성. 다중 사용자로 확장 시 활성화 필요.
alter table public.bids disable row level security;

-- ────────────────────────────────────────────────────────────
-- 스코프 2: 공공데이터포털 낙찰정보서비스 수집 테이블
-- data.go.kr ScsbidInfoService로 수집한 전국 공사 낙찰 기록.
-- 상세 주석은 migrations/20260425_scope2_public_scan.sql 참조.
-- ────────────────────────────────────────────────────────────

create table if not exists public.companies (
  bizno                  text          primary key,
  name                   text          not null,
  ceo_nm                 text,
  address                text,
  tel                    text,
  is_self                boolean       not null default false,
  is_competitor          boolean       not null default false,
  note                   text,
  first_seen_at          timestamptz   not null default now(),
  last_updated_at        timestamptz   not null default now()
);

create index if not exists companies_name_idx on public.companies (name);
create index if not exists companies_is_competitor_idx on public.companies (is_competitor) where is_competitor;

create table if not exists public.public_wins (
  id                     uuid          primary key default gen_random_uuid(),
  bid_ntce_no            text          not null,
  bid_ntce_ord           text          not null default '000',
  bid_clsfc_no           text          not null default '0',
  rbid_no                text          not null default '000',
  bid_ntce_nm            text          not null,
  ntce_div_cd            text,
  prtcpt_cnum            integer,
  rl_openg_dt            timestamptz,
  rgst_dt                timestamptz,
  dminstt_cd             text,
  dminstt_nm             text,
  bidwinnr_bizno         text          references public.companies(bizno) on delete set null,
  bidwinnr_nm            text,
  bidwinnr_ceo_nm        text,
  bidwinnr_adrs          text,
  bidwinnr_tel_no        text,
  sucsfbid_amt           numeric(18,0),
  sucsfbid_rate          numeric(8,4),
  fnl_sucsf_date         date,
  fnl_sucsf_corp_ofcl    text,
  is_ansan               boolean       generated always as (dminstt_nm like '%안산%') stored,
  is_bangje              boolean       generated always as (
    bid_ntce_nm ~ '방제|병해충|살균|살충|소독|약제살포'
  ) stored,
  source                 text          not null default 'ScsbidListSttusCnstwkPPSSrch',
  scanned_at             timestamptz   not null default now(),
  raw                    jsonb,
  constraint public_wins_uniq unique (bid_ntce_no, bid_ntce_ord, bid_clsfc_no, rbid_no)
);

create index if not exists public_wins_bizno_idx on public.public_wins (bidwinnr_bizno);
create index if not exists public_wins_dminstt_idx on public.public_wins (dminstt_nm);
create index if not exists public_wins_rl_openg_dt_idx on public.public_wins (rl_openg_dt desc);
create index if not exists public_wins_ansan_idx on public.public_wins (is_ansan) where is_ansan;
create index if not exists public_wins_ansan_nonbangje_idx on public.public_wins (rl_openg_dt desc)
  where is_ansan and not is_bangje;

create table if not exists public.public_preprices (
  id                     uuid          primary key default gen_random_uuid(),
  bid_ntce_no            text          not null,
  bid_ntce_ord           text          not null default '000',
  bid_clsfc_no           text          not null default '0',
  rbid_no                text          not null default '000',
  compno_rsrvtn_prce_sno integer       not null,
  bsis_plnprc            numeric(18,0) not null,
  drwt_yn                boolean       not null,
  drwt_num               integer       not null default 0,
  plnprc                 numeric(18,0),
  bssamt                 numeric(18,0),
  tot_rsrvtn_prce_num    integer,
  bssamt_bss_up_num      integer,
  compno_rsrvtn_prce_mkng_dt timestamptz,
  rl_openg_dt            timestamptz,
  scanned_at             timestamptz   not null default now(),
  raw                    jsonb,
  constraint public_preprices_uniq unique (bid_ntce_no, bid_ntce_ord, bid_clsfc_no, rbid_no, compno_rsrvtn_prce_sno)
);

create index if not exists public_preprices_ntce_idx on public.public_preprices (bid_ntce_no, bid_ntce_ord);

create table if not exists public.public_openings (
  id                     uuid          primary key default gen_random_uuid(),
  bid_ntce_no            text          not null,
  bid_ntce_ord           text          not null default '000',
  bid_clsfc_no           text          not null default '0',
  rbid_no                text          not null default '000',
  bid_ntce_nm            text,
  openg_dt               timestamptz,
  prtcpt_cnum            integer,
  openg_corp_info        text,
  progrs_div_cd_nm       text,
  inpt_dt                timestamptz,
  rsrvtn_prce_file_existnce_yn boolean,
  ntce_instt_cd          text,
  ntce_instt_nm          text,
  dminstt_cd             text,
  dminstt_nm             text,
  openg_rslt_ntc_cntnts  text,
  scanned_at             timestamptz   not null default now(),
  raw                    jsonb,
  constraint public_openings_uniq unique (bid_ntce_no, bid_ntce_ord, bid_clsfc_no, rbid_no)
);

create or replace function public.set_companies_last_updated_at()
returns trigger language plpgsql as $$
begin
  new.last_updated_at = now();
  return new;
end $$;

drop trigger if exists trg_companies_last_updated_at on public.companies;
create trigger trg_companies_last_updated_at
  before update on public.companies
  for each row execute function public.set_companies_last_updated_at();

insert into public.companies (bizno, name, is_self)
values ('4958603422', '(주)새빛조경', true)
on conflict (bizno) do update set is_self = excluded.is_self, name = excluded.name;

alter table public.companies        disable row level security;
alter table public.public_wins      disable row level security;
alter table public.public_preprices disable row level security;
alter table public.public_openings  disable row level security;

-- 공고별 모든 참여자 (낙찰정보서비스 op13: getOpengResultListInfoOpengCompt)
-- 1 공고 = N rows. public_wins와 보완 관계.
create table if not exists public.public_participants (
  id                   uuid          primary key default gen_random_uuid(),
  bid_ntce_no          text          not null,
  bid_ntce_ord         text          not null default '000',
  bid_clsfc_no         text          not null default '0',
  rbid_no              text          not null default '000',
  openg_rank           integer       not null,
  prcbdr_bizno         text          references public.companies(bizno) on delete set null,
  prcbdr_nm            text,
  prcbdr_ceo_nm        text,
  bidprc_amt           numeric(18,0),
  bidprcrt             numeric(8,4),
  rmrk                 text,
  drwt_no_1            text,
  drwt_no_2            text,
  bidprc_dt            timestamptz,
  bidprce_evl_val      numeric(10,4),
  tech_evl_val         numeric(10,4),
  total_evl_amt_val    numeric(10,4),
  tech_evl_natur_val   numeric(10,4),
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
