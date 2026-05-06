-- 개발 단계 임시 정책: bids 테이블 전체 허용
-- 다중 사용자 / 실운영 시에는 이 정책을 제거하고 auth 기반 정책으로 교체할 것.
-- 적용 방법: Supabase SQL Editor에서 실행.

-- 방법 A) RLS 완전 비활성 (schema.sql과 동일한 선택)
alter table public.bids disable row level security;

-- 방법 B) RLS는 켜두되 전부 허용 (anon 키로도 CRUD 가능)
-- 방법 A를 이미 적용했다면 B는 필요 없음. 둘 중 하나만 선택.
--
-- alter table public.bids enable row level security;
--
-- drop policy if exists "Allow all for now" on public.bids;
-- create policy "Allow all for now"
--   on public.bids
--   for all
--   using (true)
--   with check (true);
