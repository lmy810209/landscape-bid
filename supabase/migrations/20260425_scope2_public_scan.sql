-- 스코프 2: 공공데이터포털 낙찰정보서비스 수집 테이블
--
-- 목적: data.go.kr ScsbidInfoService API로 수집한 전국 공사 낙찰 기록 저장.
--       기존 public.bids(본인 투찰 이력)와 분리된 별도 공간.
--
-- 테이블 구성:
--   public_wins        — 낙찰 목록 (1 공고 = 1 row, 최종낙찰자 1명)
--   public_preprices   — 복수예비가격 상세 (1 공고 = 15 rows)
--   public_openings    — 개찰결과 요약 (1 공고 = 1 row, opengCorpInfo 원문)
--   companies          — 업체 마스터 (bizno 기준, 반복 경쟁자 식별용)
--
-- 모든 공고 고유 식별: (bid_ntce_no, bid_ntce_ord, bid_clsfc_no, rbid_no)
-- 소스 원문을 그대로 저장. 가공·분석은 조회 시에만.

create table if not exists public.companies (
  bizno                  text          primary key,              -- 사업자등록번호 10자리
  name                   text          not null,                 -- 최근 알려진 업체명
  ceo_nm                 text,
  address                text,
  tel                    text,
  is_self                boolean       not null default false,   -- 본인 회사 여부
  is_competitor          boolean       not null default false,   -- 수동 지정한 경쟁자
  note                   text,
  first_seen_at          timestamptz   not null default now(),
  last_updated_at        timestamptz   not null default now()
);

create index if not exists companies_name_idx on public.companies (name);
create index if not exists companies_is_competitor_idx on public.companies (is_competitor) where is_competitor;

create table if not exists public.public_wins (
  id                     uuid          primary key default gen_random_uuid(),

  -- 공고 식별자 (복합 유니크)
  bid_ntce_no            text          not null,
  bid_ntce_ord           text          not null default '000',
  bid_clsfc_no           text          not null default '0',
  rbid_no                text          not null default '000',

  -- 공고 본문
  bid_ntce_nm            text          not null,
  ntce_div_cd            text,
  prtcpt_cnum            integer,                                 -- 참가업체수
  rl_openg_dt            timestamptz,                             -- 실개찰일시
  rgst_dt                timestamptz,                             -- 등록일시
  dminstt_cd             text,
  dminstt_nm             text,

  -- 낙찰자 (1명, rank 1)
  bidwinnr_bizno         text          references public.companies(bizno) on delete set null,
  bidwinnr_nm            text,
  bidwinnr_ceo_nm        text,
  bidwinnr_adrs          text,
  bidwinnr_tel_no        text,
  sucsfbid_amt           numeric(18,0),                           -- 최종낙찰금액
  sucsfbid_rate          numeric(8,4),                            -- 최종낙찰률 (예정가격 대비)
  fnl_sucsf_date         date,
  fnl_sucsf_corp_ofcl    text,

  -- 분석 보조 (자동 분류, 추후 업데이트)
  is_ansan               boolean       generated always as (dminstt_nm like '%안산%') stored,
  is_bangje              boolean       generated always as (
    bid_ntce_nm ~ '방제|병해충|살균|살충|소독|약제살포'
  ) stored,

  -- 수집 메타
  source                 text          not null default 'ScsbidListSttusCnstwkPPSSrch',
  scanned_at             timestamptz   not null default now(),
  raw                    jsonb,                                    -- API 원본 item 전체 (revalidation용)

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

  compno_rsrvtn_prce_sno integer       not null,                  -- 예비가격 순번 1~15
  bsis_plnprc            numeric(18,0) not null,                  -- 기초예정가격 (15개 중 하나)
  drwt_yn                boolean       not null,                  -- 추첨여부 Y/N
  drwt_num               integer       not null default 0,        -- 추첨횟수

  -- 공고 전체 단위 메타 (중복 저장 — 조인 절약)
  plnprc                 numeric(18,0),                            -- 예정가격 (확정)
  bssamt                 numeric(18,0),                            -- 기초금액
  tot_rsrvtn_prce_num    integer,                                  -- 총예가건수 (보통 15)
  bssamt_bss_up_num      integer,                                  -- 기초금액기준상위건수
  compno_rsrvtn_prce_mkng_dt timestamptz,                          -- 복수예비가격작성일시
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
  openg_corp_info        text,                                     -- "업체명^사업자번호^대표자명^투찰금액^투찰율"
  progrs_div_cd_nm       text,                                     -- 유찰/개찰완료/재입찰
  inpt_dt                timestamptz,
  rsrvtn_prce_file_existnce_yn boolean,                            -- 예비가격 파일 존재 Y/N
  ntce_instt_cd          text,
  ntce_instt_nm          text,
  dminstt_cd             text,
  dminstt_nm             text,
  openg_rslt_ntc_cntnts  text,

  scanned_at             timestamptz   not null default now(),
  raw                    jsonb,

  constraint public_openings_uniq unique (bid_ntce_no, bid_ntce_ord, bid_clsfc_no, rbid_no)
);

-- companies.last_updated_at 트리거
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

-- 본인 회사 시드
insert into public.companies (bizno, name, is_self)
values ('4958603422', '(주)새빛조경', true)
on conflict (bizno) do update set is_self = excluded.is_self, name = excluded.name;

-- 개발 단계: RLS 비활성 (서버 라우트에서만 접근 가정)
alter table public.companies        disable row level security;
alter table public.public_wins      disable row level security;
alter table public.public_preprices disable row level security;
alter table public.public_openings  disable row level security;
