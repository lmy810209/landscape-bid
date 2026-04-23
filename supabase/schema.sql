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
