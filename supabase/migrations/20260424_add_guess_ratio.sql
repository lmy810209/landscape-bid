-- 측정 프로토콜 (concept-note §10) 도입
--
-- guess_ratio: 사용자가 분석 결과를 보기 전 "예상 투찰 사정율" (소수).
-- 선택 입력. 미입력 건은 측정 프로토콜 분석에서 제외.
-- UI 안내: "과거 데이터를 보기 전 직관으로 찍어주세요".
-- 이 컬럼 도입은 도구 효과를 "도구 본 후 사용자 vs 도구 안 본 사용자"로
-- 측정하기 위함. (§10.2 참조)

alter table public.bids
  add column if not exists guess_ratio numeric(6,4);

comment on column public.bids.guess_ratio is
  '분석 보기 전 사용자의 직관 투찰 사정율 (0~1 소수). 측정 프로토콜 §10 전용. 미입력 허용.';
