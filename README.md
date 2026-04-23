# 조경 조달청 입찰 전략 MVP

조달청 조경 입찰 데이터를 입력·축적하고, 발주처/공종별 사정율 분포와
2등 데이터 기반 미세 조정값을 분석해 **추천 사정율 구간**을 제시한다.

> 본 시스템은 낙찰가를 "예측/보장"하지 않는다.
> 데이터 기반 **추천 구간** 제시와 의사결정 보조가 목표다.

## 현재 진행 상황

- ✅ 1단계: 입력/저장/조회 (CRUD)
- ✅ 2단계: 발주처/공종 필터 + 추천 사정율 구간 + 2등 차이값
- ✅ 3단계: 공고 단건 분석 화면 (`/analyze`) — 참여 권장 + 리스크 + 결과 설명
- ✅ 4단계: Gemini 2.5 Flash 공고 PDF 자동 추출 (`/api/extract-pdf`)

## 기술 스택

- Next.js 14 (App Router) + TypeScript + Tailwind
- Supabase (Postgres)
- 분석은 `src/lib/analysis/`에 순수 함수로 격리 (설명 가능한 통계/룰 기반)

## 디렉토리 구조

```
src/
  app/
    layout.tsx
    page.tsx              # 분석 대시보드 (필터 + 추천 카드)
    analyze/page.tsx      # 공고 단건 분석 (?from=:bidId 로 prefill)
    bids/page.tsx         # 입찰 목록
    bids/[id]/page.tsx    # 입찰 상세
    bids/new/page.tsx     # 입찰 등록
    api/bids/             # CRUD 라우트
    api/extract-pdf/      # PDF → Claude 추출 라우트
  components/
    BidForm.tsx
    FilterBar.tsx
    AnalyzePanel.tsx      # 단건 분석 폼 + 결과
    AnalyzeWithUpload.tsx # PdfUploader + AnalyzePanel wrapper
    PdfUploader.tsx       # PDF 업로드 + /api/extract-pdf 호출
  lib/
    supabase/{client,server}.ts
    analysis/
      calculations.ts     # 사정율/투찰률/my_gap_rate/runner_up_gap_rate
      recommendation.ts   # 분포·가중치·추천 구간·analyzeNotice·Risk
    extraction/
      extract.ts          # Gemini 2.5 Flash + responseSchema + Zod 검증
      normalize.ts        # work_type 매핑, 날짜/금액 정규화
  types/bid.ts            # Bid + RESULT_STATUSES + WORK_TYPES
supabase/schema.sql
```

## 실행 방법

1. `npm install`
2. Supabase 프로젝트 생성 후 SQL 에디터에서 `supabase/schema.sql` 실행
   - 2단계 마이그레이션 시 v1 테이블이 있으면 `drop table` 됩니다. 데이터가 있다면 백업하세요.
3. `.env.local` 작성
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   GEMINI_API_KEY=AIza...            # PDF 자동 추출에 필요 (https://aistudio.google.com/apikey)
   ```
4. `npm run dev` → http://localhost:3000

## 데이터 모델 핵심

| 필드 | 의미 |
|---|---|
| `agency` | 발주처 |
| `work_type` | 공종 (선택형: 조경식재/조경시설물/조경시공/유지관리/기타) |
| `bid_date` | 개찰일/입찰일 (날짜 기준 통일) |
| `base_amount` | 기초금액 |
| `estimated_price` | 예정가격 |
| `bid_method` | 입찰 방식 |
| `qualification_limit` | 등급/면허 제한 |
| `participant_count` | 참가 업체 수 |
| `my_bid_amount` | 나의 투찰가 |
| `winning_amount` | 낙찰가 (1등) |
| `second_amount` | 2등 금액 |
| `result_status` | 낙찰 / 2등 / 순위권밖 / 미참여 / 유찰 |
| `note` | 특이사항 |

파생값:
- 사정율 = `winning_amount / base_amount`
- 투찰률 = `my_bid_amount / base_amount`
- `my_gap_rate` = `(winning_amount - my_bid_amount) / base_amount`
- `runner_up_gap_rate` = `(winning_amount - second_amount) / base_amount` (2등 데이터 없으면 보류)

## 분석 정책 (설명 가능)

`src/lib/analysis/recommendation.ts` 상수로 명시:

- `BIN_SIZE = 0.005` — 사정율 분포 0.5% 단위 히스토그램
- `RECENT_COUNT = 3`, `RECENT_WEIGHT = 2.0` — 최근 3건 가중치 2배
- `RANGE_EXPAND_THRESHOLD = 0.8` — 인접 bin 흡수 기준 (최고 bin의 80% 이상)
- `MIN_FOR_RECOMMEND = 5`, `MIN_FOR_CONDITIONAL = 2` — 참여 권장 임계

추천 사정율 구간 도출:
1. 발주처/공종 필터링
2. `bid_date` 내림차순 정렬 후 최근 3건 가중치 2배
3. 0.5% bin 가중 빈도 히스토그램 → **가중 합 최대 bin** 식별
4. 좌/우로 인접한 bin이 최고 bin의 **80% 이상**이면 흡수해 구간 확장
5. 결과는 항상 `low~high` 범위로만 표시 (단일 값 금지)

참여 권장 등급:
- 유효 표본 ≥ 5 → **참여 가능**
- 2~4 → **조건부 참여**
- 0~1 → **비추천**

## 공고 단건 분석 (`/analyze`)

발주처/공종/지역/기초금액/개찰일/자격/입찰방식/참가업체수를 입력하면 즉시 다음을 산출:

- 추천 사정율 구간 + 가중 평균 + 데이터 근거 수
- `my_gap_rate` 평균 / `runner_up_gap_rate` 평균 (2등 데이터 없으면 보류)
- 기초금액 입력 시 추천 구간 → 투찰가 환산 범위 (참고용)
- 자동 생성된 결과 설명 문장
- 주요 리스크 (최대 3개): 표본 부족 / 경쟁 강도 미반영 / 자격 미입력 등

상세 페이지에서 "이 공고로 분석하기" 버튼으로 prefill 가능 (`/analyze?from=:bidId`).

## PDF 자동 추출 (`/api/extract-pdf`)

`/analyze` 화면 상단의 업로더에 PDF를 올리면:

1. 서버에서 `pdf-parse`로 텍스트 추출 (전반부 10,000자만 사용 — 핵심 라벨이 밀집된 영역)
2. **Gemini 2.5 Flash** (`gemini-2.5-flash`) + `responseSchema` + Zod 검증으로 구조화 추출
3. 정규화 레이어가 work_type을 기존 `WORK_TYPES`로 매핑하고, 금액/날짜를 표준화
4. AnalyzePanel에 자동 prefill → 즉시 추천 구간/리스크 확인

추출 필드: title, agency, work_type, region, base_amount, bid_date, participant_count, qualification_limit, bid_method, estimated_price, note (특이사항 요약).

work_type은 Gemini가 `[유지관리, 식재, 조경시설물, 기타]` 4종으로 분류하고,
[normalize.ts](src/lib/extraction/normalize.ts)에서 앱의 `WORK_TYPES`로 매핑됩니다 (`식재 → 조경식재` 등).

**원칙**:
- Gemini는 **추출과 요약만** 한다 (예측/추정/판단 금지, 모호하면 null).
- 추천 구간·리스크 판단은 [recommendation.ts](src/lib/analysis/recommendation.ts)가 담당하며, AI가 개입하지 않는다.
- 추출 결과는 항상 사용자가 수정할 수 있다.
- 실패해도 수동 입력으로 진행 가능 (스캔본/안전 필터/스키마 불일치 등 모두 graceful degradation).

## 다음 단계 로드맵

1. `participant_count`를 활용한 경쟁 강도 보정 모델 (현재는 리스크 표시만)
2. 추출 결과를 곧바로 `/bids/new`로 이어 등록 가능하게 (현재는 분석까지)
3. 스캔본 PDF용 OCR 폴백 (예: Claude vision 또는 외부 OCR)
4. 다중 사용자 대응 시 RLS 활성화 + auth 연동
