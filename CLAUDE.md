# 조경 조달청 입찰 — 프로젝트 가이드

Claude가 이 프로젝트에서 작업할 때 참고하는 기술·정책 문서. 의사결정의 "왜"와 파일 간 관계를 기록한다.

## 사용 컨텍스트 (★ 2026-04-26 정정)

**도구 사용자 = (주)새빛조경 사장**. 도구 개발자 = 사장의 지인(도와주는 사람).

- **회사**: (주)새빛조경, bizno 4958603422, **2024년 설립 신규 법인**
- **입찰 시작**: 2025년 1월부터 (현재 약 15개월차)
- **현재 상태**: 정상 투찰 32회 / 낙찰 1회 (어제 R26BK01294519)
- **현재까지 입찰 운영 방식**: 외부 입찰 대행업체 의뢰, **낙찰 시 1.5% 수수료** 지불
- **도구 목적 1**: 자체 입찰 운영 → **대행 수수료 영구 절약** (낙찰 1건당 평균 100만원+ 절약)
- **도구 목적 2**: 부적격 회피 + 시장 트렌드 기반 투찰가 가이드 + 자격 자동 매칭

도구가 **약속하는 것**:
- 입찰 대행 수수료 절약 (자체 운영 가능)
- 모니터링 자동화 (시도율 ↑)
- 부적격(낙찰하한선 미달) 회피 가이드
- 자격/면허/지역 자동 매칭 (시간 절약)
- 보험료 감액 공고 effective cutoff 경고

도구가 **약속 못 하는 것**:
- 낙찰 보장 (추첨 운에 좌우)
- **추첨번호 추천** — 2026-05-12 정정. 조달청 화면에서 1~15번 박스가 라벨 없이 블라인드로 표시되어 본인이 어떤 번호를 선택했는지 사후에야 알 수 있음. 5년 누적 분포가 7~11% 균등이었던 이유 = 모두가 무작위 클릭한 결과. 사전 추천 = 무의미.

## 무엇을 만드는가

조달청 조경 입찰 데이터를 축적하고, 발주처/공종별 사정율 분포와 내 과거 투찰 차이값으로
**추천 사정율 구간**을 제시하는 분석 도구. 낙찰가를 "예측/보장하지 않는다."

## 스택

- Next.js 14 (App Router) + TypeScript + Tailwind
- Supabase (Postgres, RLS 개발 단계 비활성)
- Claude Opus 4.7 (공고/개찰결과 PDF 구조화 추출) — `@anthropic-ai/sdk`
- pdf-parse (Node 전용, `next.config.js`의 `serverComponentsExternalPackages`에서 번들링 제외)

## 디렉토리

```
src/
  app/
    page.tsx                    # 분석 대시보드 (기본 필터 적용)
    analyze/page.tsx            # 공고 단건 분석 (기본 필터 적용)
    backtest/page.tsx           # Leave-One-Out 백테스트 (기본 필터 적용)
    bids/page.tsx               # 전체 입찰 목록 (기본 필터 미적용 — 전체 기록)
    bids/[id]/page.tsx          # 상세
    bids/[id]/edit/page.tsx     # 수정
    bids/new/page.tsx           # ★ 통합 등록 (자격체크 + lookup + 시장분석 + 폼)
    api/bids/                   # CRUD
    api/extract-pdf/            # 공고 PDF → 구조화 추출
    api/extract-result-pdf/     # 개찰결과 PDF → 일괄 등록
    api/extract-preprice-pdf/   # 복수예비가격 PDF
    api/lookup-bid/             # 공고번호 → 4 API 병렬 조회
    api/recommend-drwt/         # 발주처별 추첨번호 추천 Top 4
    api/check-qualification/    # ★ 공고 PDF → 자격요건 자동 추출 + 매칭
    api/market-analysis/        # ★ 공고 → 시장분석 4개 카드 통합 응답
  components/
    FilterBar.tsx               # 발주처 / 공종 / 참여여부 + 기본값 배지
    BidForm.tsx                 # create/edit 겸용 폼
    BidRowActions.tsx           # 수정/삭제 버튼
    AnalyzePanel.tsx / AnalyzeWithUpload.tsx
    BidEntryWithUpload.tsx      # ★ /bids/new 통합 컨테이너
    BidLookup.tsx               # 공고번호 자동 채움 (lookup + 가격가이드 + 추첨번호)
    BidPriceGuide.tsx / DrwtRecommend.tsx
    PdfUploader.tsx / ResultPdfUploader.tsx / PrepricePdfUploader.tsx
    QualificationCheck.tsx      # ★ 자격 자동 체크 (PDF 업로드 + GO/NO-GO)
    MarketAnalysisPanel.tsx     # ★ 시장 분석 4 카드 컨테이너
    FinalJudgmentBox.tsx        # ★ 최종 판단 (GO/조건부/NO-GO + 가격 전략)
    MarketTypeCard.tsx          # ★ 시장 유형 (공격형/안전형/강자회피/데이터부족)
    AggressiveScenariosCard.tsx # ★ 공격 시뮬 A/B/C + 보험료 감액 경고
    TopCompetitorsCard.tsx      # ★ 상위 5명 패턴 + 새빛 비교
  lib/
    config/analysis.ts          # ★ 분석 기본값 (안산/유지관리 등)
    config/myCompany.ts         # ★ 새빛조경 정보 + 자격 매칭 (matchQualification)
    analysis/
      filters.ts                # ★ 공통 필터 — 모든 분석이 여기를 통과
      recommendation.ts         # 분포·구간·보정
      strategy.ts               # 투찰 전략 3종 (공격/균형/보수)
      personalAdjustment.ts     # ★ 개인 투찰 패턴 보정 (시장 분포와 분리)
      finalBid.ts               # ★ 전략 + 개인 보정 결합 → 최종 투찰값 3옵션
      goNoGo.ts                 # ★ 공고 선택 점수 (GO/조건부 GO/NO-GO) — 룰 기반 100점
      lowerBound.ts             # ★ 복수예비가격 → 예정가격/A값 산술 복원
      backtest.ts               # LOO 검증
      calculations.ts           # 사정율/투찰률/gap_rate
      scope2.ts                 # ★ 안산 풀 분석 (경쟁자 요약, 히스토그램)
      stats.ts                  # 백테스트 통계
    marketAnalysis/             # ★ 시장 분석 모듈 (2026-05 추가)
      types.ts                  # NoticeContext, MarketType, 임계값, 보험료 감지
      marketType.ts             # ★ 시장 유형 분류 (4종)
      topCompetitors.ts         # ★ 상위 5명 통계 + 새빛 비교
      aggressiveScenarios.ts    # ★ 공격 A/B/C + effective cutoff 추정
      finalJudgment.ts          # ★ GO 판정 룰
    extraction/                 # Gemini 추출 + 정규화
      extract.ts / normalize.ts          # 공고 PDF
      extract-result.ts / normalize-result.ts  # 개찰결과 PDF
      extract-preprice.ts / normalize-preprice.ts  # ★ 복수예비가격 PDF
      qualification.ts          # ★ 자격요건 추출 + 매칭 (Gemini)
    supabase/{client,server}.ts
  types/bid.ts                  # Bid + RESULT_STATUSES + WORK_TYPES
supabase/
  schema.sql                    # 스키마 (bids 테이블, trigger, RLS 비활성)
  migrations/
    2026xxxx_allow_all_dev.sql  # 개발용 RLS 우회 정책
```

★ 표시는 분석 정책의 **단일 진리원(single source of truth)**.

## 분석 정책 — 반드시 이 원칙을 유지할 것

### 1) 단일 예측값 금지, 항상 구간으로

모든 추천은 `{ low, high }` 구간으로만 제시한다. 단일 값을 자신 있게 말하지 않는다.

### 2) 설명 가능한 상수만 사용

머신러닝, 블랙박스 금지. 모든 상수는 `recommendation.ts` / `strategy.ts` / `config/analysis.ts`
상단에 명시. 변경 이력은 커밋 메시지로만 남긴다.

핵심 상수 (변경 시 `CLAUDE.md`와 README 동시 갱신 권장):
- `BIN_SIZE = 0.005` — 0.5% bin 히스토그램
- `RECENT_COUNT = 3`, `RECENT_WEIGHT = 2.0` — 최근 3건 가중치 2배
- `RANGE_EXPAND_THRESHOLD = 0.8` — 최고 bin의 80% 이상 인접 bin 흡수
- `MIN_FOR_RECOMMEND = 5`, `MIN_FOR_CONDITIONAL = 2`

### 3) 시장 분포 vs 개인 보정 — 데이터 분리

| 지표 | 데이터 범위 | 비고 |
|---|---|---|
| `weightedMean`, `bins`, `range` (시장 분포) | **전체 필터링 결과** | 미참여 포함 가능 |
| `myGapRateMean` (개인 보정) | **참여 데이터만** | `result_status !== '미참여'` |
| `runnerUpGapRateMean` (시장 미세 신호) | **전체 필터링 결과** | 내 데이터 아님 |

이 분리는 `computeRecommendation`이 내부에서 `filterForPersonalAdjustment`를 호출해 처리.
호출자는 신경 쓸 필요 없음.

### 4) 참여 정의

`result_status !== '미참여'` 이면 참여로 간주. 포함:
- 낙찰 / 2등 / 순위권밖 / 낙찰하한선미달 / 유찰

`낙찰하한선미달` 포함 여부는 `INCLUDE_UNDER_THRESHOLD_IN_PERSONAL_ADJUSTMENT`로 토글 가능.
기본값 `true`. 추후 실험을 위한 옵션. API:

```ts
computeRecommendation(bids, {
  personalAdjustment: { includeUnderThreshold: false },
});
```

### 5) 기본 분석 기준 (필터)

`src/lib/config/analysis.ts`의 `ANALYSIS_DEFAULTS`로 관리:

```ts
ANALYSIS_DEFAULTS = {
  agencyKeyword: "안산",  // 부분 일치
  workType: "유지관리",    // 정확 일치
}
```

적용 범위:

| 페이지 | 기본 필터 | 이유 |
|---|---|---|
| `/` (대시보드) | ✅ 적용 | 핵심 분석 화면 |
| `/analyze` | ✅ 적용 (form.work_type prefill) | 새 공고 평가 |
| `/backtest` | ✅ 적용 | 동일 조건 재현 |
| `/bids` | ❌ 미적용 | 전체 기록 조회용 |

**오버라이드 규칙** (`resolveAnalysisFilter` 참조):
- `?scope=all` → 기본값 무시, 사용자 명시 파라미터만
- `?agency=` 또는 `?work_type=` 지정 → 사용자 값이 기본값 대체
- 모두 비어있고 `scope=all`도 아님 → 기본값 (`agencyKeyword=안산` + `workType=유지관리`)

### 6) FilterBar 사용법

```tsx
<FilterBar
  agencies={uniqueValues(all, "agency")}
  workTypes={uniqueValues(all, "work_type")}
  basePath="/backtest"               // URL 갱신 시 push할 경로
  defaultApplied={isDefaultApplied(criteria)}
  criteriaLabel={describeFilter(criteria)}
/>
```

URL 파라미터: `agency`, `work_type`, `participation` (`all|participated|not_participated`),
`scope` (`all`이면 기본값 OFF).

## 데이터 모델 요약

`supabase/schema.sql` — `bids` 테이블.

| 필드 | 타입 | 비고 |
|---|---|---|
| `notice_no` | text | 공고번호 |
| `agency` | text | 발주처 (자유입력, 부분 일치 검색됨) |
| `work_type` | text | 공종 (WORK_TYPES enum) |
| `base_amount` | numeric | 기초금액 |
| `my_bid_amount` | numeric? | 내 투찰가 (미참여면 null) |
| `winning_amount` | numeric? | 1등 |
| `second_amount` | numeric? | 2등 — runner_up_gap 계산용 |
| `result_status` | enum | 낙찰/2등/순위권밖/낙찰하한선미달/미참여/유찰 |

### 파생값 (`calculations.ts`)

- `calcWinRatio = winning / base` — 사정율 (시장 신호)
- `calcMyBidRatio = my_bid / base` — 내 투찰률
- `calcMyGapRate = (winning - my_bid) / base` — 내 gap (**개인 보정**)
- `calcRunnerUpGapRate = (winning - second) / base` — 2등 gap (**시장 신호**)

## 회사 정보

매칭 규칙은 `auto-memory`의 `project_landscape_bid_company.md`에서 관리 (사업자번호 등).
코드에는 하드코딩 금지.

## 작업 시 주의

- 분석 상수 변경 → 반드시 이 문서와 README 동기화
- 추천 구간 → 단일 예측값으로 표시 금지
- 새 분석 페이지를 추가할 때 → `resolveAnalysisFilter + filterBids + FilterBar` 패턴 재사용
- `/bids`는 "전체 기록" 성격 — 여기에 분석용 기본 필터를 걸지 말 것
- DB 스키마 변경 시 `schema.sql` + `migrations/` 두 곳 모두 갱신
- PDF 추출은 Claude로 하되 예측 금지. "읽기와 정규화"만.

## 개인 투찰 패턴 보정 (`personalAdjustment.ts`)

시장 분포(`recommendation.ts`)와 **완전 분리**된 개인 신호. 내 투찰가와 실제 낙찰가 사이
차이(`my_gap_rate`)를 가중 평균해서 다음 공고에 적용할 상향/하향 보정값을 제안.

### 알고리즘

1. 동일 발주처/공종 매칭 → `filterForPersonalAdjustment` (참여만, 낙찰하한선미달 기본 포함)
2. `my_gap_rate = (winning - my_bid) / base` 계산 가능한 행만 유지
3. 최근순 정렬 후 최대 `WINDOW_SIZE=10`건 절단
4. 가중치:
   - `recencyWeight`: 가장 최근 `2.0` → 윈도우 내 가장 오래됨 `1.0` 선형 보간
   - `statusWeight`: 낙찰하한선미달이면 `1.5`, 나머지 `1.0`
   - `totalWeight = recencyWeight × statusWeight`
5. `weightedAvgGapRate = Σ(gap × w) / Σw`
6. `rawAdjustment = weightedAvgGapRate × 0.8`
7. `recommendedAdjustment = clamp(rawAdjustment, -0.003, +0.003)`

### 상수

```ts
WINDOW_SIZE = 10
RECENCY_WEIGHT_MAX = 2.0
RECENCY_WEIGHT_MIN = 1.0
UNDER_THRESHOLD_WEIGHT = 1.5
ADJUSTMENT_FACTOR = 0.8
ADJUSTMENT_CAP = 0.003   // ±0.3%
```

### 부호 규약

- `gap > 0` → 낙찰가 > 내 투찰가 → **내가 너무 낮게 썼음** → `+` 상향 보정 권장
- `gap < 0` → 낙찰가 < 내 투찰가 → **내가 너무 높게 썼음** → `-` 하향 보정 권장
- `|gap| < 0.0001` → 보정 거의 없음 (요약 문구에서 별도 처리)

### 주의

- `strategy.ts`에는 이미 `my_gap_rate` 기반 보정이 있으나, 단순 평균 × 0.3 (±0.0003). 
  `personalAdjustment`는 **가중 평균 × 0.8 (±0.003)** 로 더 강한 제안. 
  두 모듈은 독립적으로 작동 — UI에서 사용자에게 참고값으로 제시, 자동 적용하지 않음.
- 개인 보정 카드는 AnalyzePanel 우측 하단에 녹색 톤으로 배치 (시장 분포 카드 그룹과 색상 분리).

## 최종 투찰값 결합 (`finalBid.ts`)

`strategy.ts`의 3전략(`aggressive/balanced/conservative`)에 `personalAdjustment`의
`recommendedAdjustment`를 더해 최종 사정율과 투찰금액을 산출.

### 계산

```
final_rate_i = clamp(strategy.rate_i + adjustment, range.low, range.high)
final_bid_i  = round(baseAmount * final_rate_i)
```

- 보정값이 `null`이면 `0`으로 처리 (전략값 그대로)
- 추천 구간 밖으로 나가면 `clamp`, `cappedByRange=true` 표시
- `rate`는 float 그대로 보존 (4~6자리 정밀도). 반올림은 UI에서만.

### 명명 메모

- `safe === conservative` — 전략 모듈 키와 통일
- UI 라벨은 한글(`보수형/균형형/공격형`) 고정

### 표시 원칙

**"추천" 금지, "전략 옵션" 표기만.** 단일 정답을 제시하지 않는다.

AnalyzePanel 흐름 순서 (위→아래):
1. 추천 구간 + 시장 분포 카드 (파랑 톤)
2. 전략 3옵션 (strategy.ts)
3. 개인 보정 카드 (녹색 톤)
4. **최종 투찰값 카드** (남색 톤) ← 위 3단계 결합
5. 리스크 + 히스토그램

## 공고 선택 점수 (`goNoGo.ts`)

앞의 모든 계산(`recommendation` + `personalAdjustment` + `finalBid`)을 입력으로 받는
**최상위 요약 점수**. 설명 가능한 룰 기반 100점 만점.

### 카테고리 (합 = 100)

| 항목 | 상한 | 기준 |
|---|---|---|
| 데이터 신뢰도 | 30 | sampleCount ≥10→30 / 5-9→20 / 2-4→10 / 0-1→0 |
| 개인 패턴 적합도 | 25 | sampleCount≥5→+10, underThresholdCount 0→+15 / 1-2→+8 / 3+→0 |
| 경쟁 강도 | 20 | <20→20 / 20-49→12 / 50-99→6 / 100+→0 / null→5 |
| 자격/방식 명확성 | 15 | qualification_limit +8, bid_method +7 |
| 최종 전략 안정성 | 10 | 모두 clamp 없음→10 / balanced만 안전→7 / balanced 잘림→5 / finalBid null→0 |

### 상태

- ≥80 → **GO** (초록)
- 50-79 → **조건부 GO** (노랑)
- <50 → **NO-GO** (빨강)

### 금칙어 / 권장 표현

- ❌ "무조건 참여하세요" / "이 공고는 반드시 들어가라" / "낙찰 확률 N%"
- ✅ "참여 검토 가치가 높습니다" / "조건부 접근이 적절합니다" / "보수적으로 판단"

### 반환

```ts
{
  score: number,                // 0~100 정수
  status: "GO" | "조건부 GO" | "NO-GO",
  breakdown: { dataReliability, personalFit, competition, qualification, strategyStability },
  reasons: string[],            // 가점 사유
  warnings: string[],           // 감점/위험
  summary: string,              // 한 줄 종합
}
```

### UI 규칙

- AnalyzePanel 결과 섹션 **최상단**에 크게 표시
- 점수 숫자 + 상태 배지 + 카테고리별 breakdown 막대 + 사유 2열 (가점/경고)
- 하단 고정 주석: "점수는 참고값이며 최종 판단은 사용자가 한다"

## 복수예비가격 / 낙찰하한율 (`lowerBound.ts`)

**목적**: 예측이 아닌 **산술 복원**. 복수예비가격 문서에서 추첨된 4개 가격을 추출해
예정가격과 A값을 정확히 복원.

### 계산 순서

1. `selectedPriceAverage = mean(selectedPrices)` — 4개 추첨값 평균
2. `estimatedPrice`:
   - 문서에 명시된 값이 있으면 그대로 (`source = "document"`)
   - 없으면 `selectedPriceAverage` 사용 (`source = "selected_prices_average"`)
   - 둘 다 없으면 null (`source = "none"`, `calculable = false`)
3. `aValue = estimatedPrice - baseAmount`
4. `lowerBoundAmount = estimatedPrice × lowerBoundRateRule` — 규칙이 **주입된 경우에만**

### 절대 하지 않는 것

- **낙찰하한율(rate rule) 자동 추정 금지**. 공고/계약 유형마다 다름.
- 문서 예정가격과 추첨 평균이 0.1% 이상 어긋나면 경고만 띄우고 값은 건드리지 않음.
- 추첨값 4개가 안 모이면 `selectedPrices = null`로 돌려 UI에서 수동 입력 유도.

### API

`POST /api/extract-preprice-pdf`
- form-data: `file` (PDF), optional `lowerBoundRateRule` (0~1), optional `baseAmount`
- 반환: `{ data: { extracted, calculated }, meta: { success, warnings, ... } }`

### finalBid와의 관계 (이번 단계)

**자동 보정 반영 없음**. 규칙이 주입되어 `lowerBoundAmount`가 계산되면
FinalBidCard 하단에 **참고 경고 문구만** 추가:
"투찰가가 하한 아래면 부적격 가능성. 자동 반영이 아니라 수동 판단이 필요합니다."

finalBid 계산식(`strategy.rate + adjustment → clamp to range`)은 **그대로 유지**.

### UI 톤

- 파랑 테두리 카드. "참고값" 배지 강조.
- "정답", "확정 낙찰가" 같은 표현 금지.
- 계산 불가 시 쌍 "경고 + 수동 입력으로 진행" 안내.

## 튜닝 이력 (2026-04, v3 잠정 확정)

상수 튜닝은 현재 **중단 상태**. 추가 조정보다 **실데이터 축적 + 정기 백테스트**가 우선.

### 확정된 상수 세트 (v3)

| 파일 | 상수 | 값 |
|---|---|---|
| recommendation.ts | `BIN_SIZE` | **0.003** |
| recommendation.ts | `RANGE_EXPAND_THRESHOLD` | **0.55** |
| recommendation.ts | `RECENT_COUNT` / `RECENT_WEIGHT` | 3 / 2.0 |
| recommendation.ts | `MIN_FOR_RECOMMEND` / `MIN_FOR_CONDITIONAL` | 5 / 2 |
| strategy.ts | `POSITION_RATIOS.scarce` (≤4) | 0.42 / 0.50 / **0.68** |
| strategy.ts | `.moderate` (5~9) | 0.38 / 0.50 / **0.70** |
| strategy.ts | `.rich` (≥10) | 0.35 / 0.50 / **0.72** |
| personalAdjustment.ts | `ADJUSTMENT_FACTOR` | **1.0** |
| personalAdjustment.ts | `ADJUSTMENT_CAP` | 0.003 |
| personalAdjustment.ts | `WINDOW_SIZE` | 10 |
| personalAdjustment.ts | `RECENCY_WEIGHT_MAX/MIN` | 2.0 / 1.0 |
| personalAdjustment.ts | `UNDER_THRESHOLD_WEIGHT` | 1.5 |

### 백테스트 스냅샷 (안산/유지관리, 평가 17건)

| 지표 | v3 결과 |
|---|---|
| 추천 구간 포함률 | 17.65% |
| 최소 오차 평균 | 0.913% |
| 개선된 비율 (사용자 투찰 대비) | 52.94% |
| 부적격 회피 가능 비율 | 28.57% |
| 공격형/균형형/보수형 평균 오차 | 0.955% / 0.956% / 0.966% |
| 사용자 투찰 평균 오차 | 0.566% |

### 튜닝 시도 요약

| 버전 | 변경 | 결과 | 판정 |
|---|---|---|---|
| v0 (원본) | BIN 0.005, threshold 0.8, ratios .30/.70, factor 0.8 | 포함률 17.65% / 개선률 41.18% / 회피율 14.29% | 기준선 |
| v1 (중앙집중) | ratios .40/.60, factor 1.2, BIN 0.002 | **포함률 0%** 악화 | ❌ 폐기 |
| v2 (방어강화) | ratios .35/.72, threshold 0.6, BIN 0.003, factor 1.0 | **개선률 52.94% / 회피율 28.57%** | ✅ 핵심 개선 |
| v3 (threshold 완화) | threshold 0.55 | v2와 동일 (변화 없음) | 잠정 확정 |

### 왜 포함률 17.65%에 고정됐나 (구조적 원인)

`expandRange`는 `isAdjacent = |b.low - a.high| < 1e-9`로 **엄격한 인접성**을 요구.
평가 표본이 17건인 환경에서 top bin 옆이 대부분 빈 칸이라, threshold 값을 아무리 낮춰도
**첫 칸에서 루프가 끊긴다**. 즉 포함률은 현재 알고리즘에서 **구조적 상한**에 가까움.

### 다음 개선 후보 (아직 구현 금지)

우선순위 낮음 — 데이터 축적 후 재평가 시점에 결정:

1. **`isAdjacent` 완화**: 1칸 skip 허용 (`b.low - a.high ≤ BIN_SIZE + ε`). 저비용, 포함률 직접 상승 가능성 높음.
2. **대체 구간 생성 함수**: `quantileRange` (상하 25%~75%), `denseClusterRange` (KDE 기반) 등. 지금 **미리 만들지 않음** — 필요 시점에 만든다.
3. **BIN_SIZE 적응형**: 표본 수에 따라 동적 조정 (sparse = 큰 bin). 복잡도 상승 대비 효과 불확실.

### 운영 원칙

- 상수는 **실데이터 추가 + 백테스트 재실행**으로 재검증 후에만 조정
- 튜닝은 **한 번에 하나의 상수**. v1 실수(4개 동시 변경)를 반복하지 말 것
- `BIN_SIZE`와 `RANGE_EXPAND_THRESHOLD`는 **짝으로 움직인다** (v1의 교훈)
- 튜닝 이력은 이 문서에 누적 기록

## 백테스트

`/backtest`는 Leave-One-Out. 각 공고를 1건씩 떼어내고 나머지로 추천 산출 후 실제 결과와 비교.
필터가 적용되면 모수 자체가 줄어든다는 점 유의 (LOO 표본 축소).

핵심 지표:
- 추천 구간 포함률
- 3개 전략 최소 오차 평균 (이론 상한)
- 내 투찰 대비 개선 비율
- 2등 공고 한정 개선 비율
- 낙찰하한선미달 회피 가능 비율 (보수형 rate ≥ 1등 사정율)

## 레거시 / 호환

- `recommendation.ts`에서 `filterBids`, `uniqueValues`는 **filters.ts로부터 재노출**된다.
  새 코드는 filters.ts에서 직접 import 권장.
- `analyzeNotice(input, bids)`는 이제 세 번째 인자 `baseCriteria?: FilterCriteria`를 받는다 (optional).

---

# 스코프 2 — 공공데이터포털 기반 안산 풀 분석 (2026-04-25 시작)

## 배경

스코프 1(본인 18건 이력 기반 도구)는 σ_bias 벽에 막혀 통계적 유의 개선이 어려웠다.
다른 4개 AI가 합의한 "접어라" 결론은 **데이터 범위 가정이 틀렸기 때문**이었음.
실제 사용자 의도는 "**반복 상위권 업체의 데이터 기반 감각을 재현**"이지
"본인 참여 이력 기반 보조"가 아니었다.

스코프 2는 공공데이터포털 OpenAPI로 **전국 공사 낙찰 기록을 대량 수집**하여
본인이 안 들어간 공고까지 포함한 풀 분포를 학습한다.

## 본인 회사 / 도메인 제약

- 사업자: **(주)새빛조경**, bizno **4958603422**, 안산시 사업자
- **나무의사 면허 없음** → 방제(병해충/살균/살충/소독/약제살포) 공사 참여 불가
- 따라서 분석 범위는 항상 **안산 ∩ 비방제** 로 제약 (`is_ansan AND NOT is_bangje`)

## 사용 API (data.go.kr 활용신청 완료)

| data ID | 서비스명 | 엔드포인트 | 용도 |
|---|---|---|---|
| 15129397 | 낙찰정보서비스 | `/1230000/as/ScsbidInfoService` | 낙찰자 + 15개 예비가격 |
| 15129394 | 입찰공고정보서비스 | `/1230000/ad/BidPublicInfoService` | 공고 메타 (지역·업종·실적) |
| 15129459 | 계약과정통합공개서비스 | `/1230000/ao/CntrctProcssIntgOpenService` | 공고→낙찰→계약 조인 |

인증키는 `.env.local`의 `NARA_API_KEY` (Decoding 원본, URL 인코딩 전).

### 핵심 오퍼레이션 (낙찰정보서비스)

- `getScsbidListSttusCnstwk` — 공사 낙찰 목록
- `getScsbidListSttusCnstwkPPSSrch` — **PPSSrch 변형, `bizno` 파라미터 지원** (1.1 개정)
- `getOpengResultListInfoCnstwk` — 개찰결과 요약 (rank 1만)
- `getOpengResultListInfoCnstwkPreparPcDetail` — **15개 예비가격 + 추첨횟수**
- 16~23번 PPSSrch 변형들 — 모두 bizno 검색 가능

### API 제약 (실측)

- **단일 호출 날짜 범위 = 최대 1 calendar month**. 1개월+1시간도 거부 (resultCode 07).
  → 3년 수집은 36개월 윈도우 반복. 윈도우는 `(YYYY-MM-01 00:00, YYYY-MM-말일 23:59)` 권장.
- **HTTP 429 rate limit** 빈발. 공식 30tps지만 실제 분당 한도는 훨씬 빡빡.
  → 호출당 150ms+ 딜레이 + 지수 백오프 5회 재시도.
- **`opengCorpInfo`는 rank 1만 제공** (다수 낙찰자 시 "낙찰예정자 다수"). 68명 전체 투찰가는 API로 못 가져옴.
- **응답 구조 차이**: 정상 응답 `{response: {header, body}}`, 에러 응답 `{nkoneps.com.response.ResponseError: {header}}`.

## DB 스키마 (4 테이블, 마이그레이션 `20260425_scope2_public_scan.sql`)

기존 `bids`(본인 투찰 이력)와 **완전 분리**된 별도 공간.

| 테이블 | 1 공고당 행 수 | 핵심 필드 |
|---|---:|---|
| `companies` | — | `bizno`(PK), `name`, `is_self`, `is_competitor` |
| `public_wins` | 1 | 낙찰자 1명 + 공고 메타. `is_ansan`, `is_bangje` **generated columns** |
| `public_preprices` | 15 | 복수예비가격 + `drwt_yn` + `drwt_num`(추첨횟수) |
| `public_openings` | 1 | `openg_corp_info` 원문 |

복합 유니크: `(bid_ntce_no, bid_ntce_ord, bid_clsfc_no, rbid_no)`. 재입찰·차수 다른 같은 공고 구분.
원본 API 응답을 `raw jsonb`에 보존 (스키마 진화 시 재파싱).

⚠️ **Supabase는 새 테이블 생성 시 RLS 자동 활성화**. 마이그레이션 끝 `alter table ... disable row level security`도 SQL Editor에서 별도 실행 필요할 수 있음.

## 수집 스크립트 (`scripts/`)

- `probe-public-data-api.mjs` — 4개 API 단건 검증
- `probe-ppssrch-raw.mjs` — 날짜 경계·rate limit 진단용
- `probe-competitor-biznos.mjs` — bizno 7개 × 36개월
- `scope2-scan-68.mjs` — 어제 공고 R26BK01294519 참여 68명 전체 × 36개월 (2,448 호출)
  - 체크포인트 저장: `data/scope2-scan.json` (재실행 시 자동 재개)
- `ingest-scope2-scan.mjs` — JSON → `companies` + `public_wins` upsert
- `analyze-partial.mjs` — 적재 전 JSON 직접 집계 (검증용)

## 분석 라이브러리 (`src/lib/analysis/scope2.ts`)

- `summarizeCompetitors(wins)` — bizno별 wins/median/P25-P75/topAgencies/yearCounts
- `buildRateHistogram(rates, binSize=0.5)` — 0.5%p bin 히스토그램
- `summarizeAgencies(wins)` — 발주처별 Top 5 낙찰자

## ⚠️ 정정 (2026-04-25 후반, op13 데이터 추가 후)

이전 분석은 **표본 편향 artefact**였음을 확인. 정정 사항:

### 1. "이중 봉우리"는 표본 편향 artefact

**낙찰자 199명만**의 분포에서는 89.0~89.5% 갭 + 88% / 90% 봉우리로 보였으나,
**모든 정상 참여자 5,299명** 분포로 보면:

| 구간 | 낙찰자만 | 모든 참여자 |
|---|---:|---:|
| 88.0~88.5% | 68 | 415 |
| **88.5~89.0%** | 34 | **1,124** ★ 단봉 |
| 89.0~89.5% | 2 (갭) | 847 |
| 89.5~90.0% | 6 | 524 |
| 90.0~90.5% | 48 | 614 |

진짜 분포는 **88.5~89.0% 단봉 + 우측 long-tail**. 낙찰자 분포의 이중 봉우리는 낙찰 결정 알고리즘(예정가격 결정 + 낙찰하한율 통과)이 만들어낸 artefact였음.

### 2. "본인은 안전형 봉우리에 정중앙 위치" 잘못된 결론

이전: "본인 평균 90.33% = 안전형 봉우리(48건)에 위치, 공격형 88% 풀에 못 들어감"

새 데이터(scope 2 새빛조경 정상 투찰 32건 from API):

| 본인 투찰률 구간 | 건수 |
|---|---:|
| 88.5~89.0% | 5 |
| 89.0~89.5% | 3 |
| 89.5~90.0% | 2 |
| 90.0~90.5% | 8 |
| 90.5~91.0% | 5 |
| 91.0~91.5% | 5 |
| 91.5~92.0% | 4 |

본인은 **88.5~91.88% 광범위 시도**. 안전형 풀에 머물지 않음. 본인 DB 19건의 "90% 클러스터링"은 미달 4건 + 순위권밖 편중에서 나온 표본 편향. 본인 실제 투찰 행동은 훨씬 다양함.

### 3. API 한계 재확인

`getOpengResultListInfoOpengCompt` (op13)는 **정상 참여자만** 반환. 낙찰하한선미달은 API에 없음. 본인 19건 중 8건(미달 4 + 순위권밖 6)이 op13에 안 잡혔는데, 미달은 API 한계 때문이고 순위권밖 일부는 wins 풀(199건) 자체가 27/68명 스캔 미완으로 누락된 영향.

## 핵심 발견 (2026-04-25, 27/68명 분석 시점)

### 1. 풀 규모 (3년 안산∩비방제)

- 199건 / 26명 / 연 66건
- 전체 풀 추정: 연 80~110건 (이 26명이 전체의 60~80% 점유 가정)
- **본인 18건 대비 11~18배 데이터 확보 가능** → σ_bias 조건부 분해 가능 스케일

### 2. ★ 이중 봉우리(bimodal) 낙찰률 분포

| 낙찰률 구간 | 건수 | 의미 |
|---|---:|---|
| 87.5~88.0% | 26 | 공격형 꼬리 |
| **88.0~88.5%** | **68** | **공격형 메인 봉우리** |
| 88.5~89.0% | 34 | 공격형 꼬리 |
| **89.0~89.5%** | **2** | **갭 — 거의 없음** |
| 89.5~90.0% | 6 | — |
| **90.0~90.5%** | **48** | **안전형 봉우리** |
| 90.5~91.0% | 9 | 안전형 꼬리 |

89.0~89.5%에 단 2건만 있는 **명확한 갭** = 풀이 두 그룹으로 분리됨:
- **공격형 (~128건, 88% 부근)**: 부적격 위험 무릅쓰고 저가 투찰. 이기면 다수 차지.
- **안전형 (~57건, 90% 부근)**: 부적격 위험 적지만 공격형이 들어간 공고는 못 이김.

### 3. 본인 위치

- 새빛조경 3년 안산∩비방제 낙찰: **1건** (26명 중 25위)
- 평균 낙찰률 **90.33%** = 안전형 봉우리 정중앙
- 본인 18건 평소 투찰 median **88.91%** (vs 기초금액)
- → 본인 낙찰률 낮은 이유 = **공격형 풀에 못 들어가는 위치**.
  안전형끼리 경쟁하는 공고(전체 약 30%)에서만 이길 수 있음.

### 4. 안산 최강자: 유한회사 에스디건설 (bizno 4078111745)

- **3년 안산∩비방제 26건 낙찰 (연 8.7건)** — 압도적 1위
- 어제 R26BK01294519 공고에서는 낙찰하한선 **미달**(부적격, 88.861%)
- 발주처: 안산시 16건 + 단원구 5건 + 교육지원청 3건
- 어제 정상 26명 중 누구보다 더 많이 낙찰. **공격형 전략의 명확한 사례**.

### 5. 어제 공고 정상 26명 vs 미달 42명의 의미 재해석

어제 공고 한 건만 보면 새빛조경 1등 낙찰. 하지만 3년치로 보면:
- 정상 26명은 그 공고에서만 우연히 90%대로 모임 (안전형끼리 경쟁한 공고)
- 미달 42명 중 에스디건설 같은 **3년 누적 1위 업체**가 있음
- 어제 공고는 우연히 안전형 풀이 우세했던 공고

## /competitors 페이지

`src/app/competitors/page.tsx` — 안산 비방제 풀 분석 대시보드.

섹션: PoolPredictor (공고명 입력 → 풀 예측) → **참여자 데이터 카드(보라)** → 요약 카드 4개 → 본인 위치 알림(앰버) → 낙찰률 히스토그램 → 반복 경쟁자 Top 20 → 발주처별 Top 5.

데이터 소스:
- `bids` — 본인 19건 (DB 입력)
- `public_wins` — 안산∩비방제 낙찰자 199건
- `public_participants` — 정상 참여자 5,299명 (op13 수집)

키워드별 풀 분류는 `summarizeByKeywordParticipants(wins, participants)` 사용 — 표본 25배 큰 정확한 분류.

## API 라우트 `/api/lookup-bid` (자동 채움)

공고번호 입력 → 4 API 병렬 호출 → BidForm prefill.

호출 API:
1. `BidPublicInfoService.getBidPblancListInfoCnstwk` — 공고 메타 + 낙찰하한율
2. `ScsbidInfoService.getScsbidListSttusCnstwk` — 낙찰자 (rank 1)
3. `ScsbidInfoService.getOpengResultListInfoCnstwkPreparPcDetail` — 15 예비가격
4. **`ScsbidInfoService.getOpengResultListInfoOpengCompt`** — 모든 정상 참여자 (★ 본인 자동 매칭)

본인 자동 매칭 (bizno=4958603422 검색):
- `myRow` 발견 시 → my_bid_amount, opengRank 기반 result_status 자동
- result_status 매핑: rmrk="낙찰하한선미달" → 그대로 / opengRank 1→낙찰 / 2→2등 / 3+→순위권밖
- 단, op13에 미달은 안 나오므로 **본인 미달 케이스는 자동 매칭 불가** (사용자 수동)

UI: `src/components/BidLookup.tsx` — 공고번호 input + 조회 버튼. PDF 업로더와 병렬 배치.

## 운영 원칙

- 스코프 2 데이터는 **읽기 전용 보강용**. 기존 `bids`(본인 이력) 분석을 대체하지 않음.
- `public_wins`는 낙찰자만, 부적격/순위권밖은 없음. 이걸로 모든 경쟁자 윤곽을 그릴 수 없음을 항상 명시.
- 방제 키워드 정규식은 `is_bangje` generated column에 박혀있음. 변경 시 컬럼 재생성 필요.
- 27/68명 미완 상태. 41명 추가 스캔은 rate limit 리셋 후 재실행 (체크포인트 자동 재개).
- 본인의 회사 정보(bizno·이름·면허 제약)는 코드 하드코딩 금지. `companies.is_self=true` 행으로 관리하고 페이지에서 조회.
- 다음 분석 후보:
  - 발주처별 88% vs 90% 봉우리 비율 → 본인 진입 가능 공고 분류
  - 예비가격 15개 분포 실측 (`public_preprices` 적재 후) → 노트 v2 §2.2 균등 가정 검증
  - 일별 자동 수집 cron (어제 등록 낙찰 자동 추가)

---

# 데이터 현황 (2026-05-04 갱신)

5년치 안산 풀 스캔 완료 (3년치 → 5년치 확장, 2026-05-07 추가):

| 테이블 | 이전 (3년) | 현재 (5년) |
|---|---:|---:|
| `public_wins` (전체) | ~280 | **871** |
| `public_wins` (안산∩비방제) | 199 | **652** |
| `public_preprices` | 2,910 | **9,690** |
| `public_participants` (op13) | 5,303 | **18,497** |
| 안산∩비방제 고유 낙찰자 | 26 | **61** |
| 연평균 안산∩비방제 공고 | 66 | **108.7** |
| `bids` (본인) | 19 | **85** (op13 자동 sync) |
| `data/notice-methods.json` | — | **652 공고 메타** (sucsfbidMthdNm) |
| `companies` | — | **1,441** |

**상위 5개 (안산∩비방제 5년 누적)**:
| 순위 | 업체 (bizno) | 누적 | 평균 사정율 | 패턴 |
|---|---|---:|---:|---|
| 1 | 유한회사 에스디건설 (4078111745) | 42 | 88.61% | 공격형 |
| 2 | 대동이앤씨주식회사 (1058651768) | 24 | 88.70% | 공격형 |
| 3 | 안산조경건설(주) (1348125448) | 23 | 88.69% | 공격형 |
| 4 | (주)경안스틸 (1348629134) | 22 | 88.34% | 가장 공격적 |
| 5 | 경인이엔지주식회사 (3228601242) | 22 | 88.50% | 공격형 |

**핵심 발견**: 상위 5명 전부 88% 사정율 영역. 새빛조경 평균 90.33% — 다른 풀.
(경인이엔지는 비안산 38건도 있어 전체 60건. 안산 점유는 상대적으로 낮음.)

**키워드 절대 강자** (5년 누적):
- 공원 (193건) → 안산조경건설 15건
- 유지관리 (103건) → 에스디건설 7건
- 보수 (23건) → 제현산업 6건 (점유 26%)
- 풀깎기 (17건) → 시민조경

**스캔 미완료**: 64/68 업체. 마지막 4명(청솔/대림/경원/서림) quota로 미수집. 영향 미미.

---

# 시장 분석 모듈 (2026-05-04 추가)

스코프 2 데이터(public_wins, public_preprices) 기반으로 공고별 의사결정을 자동화하는 모듈.
**예측이 아닌 의사결정 보조** — "들어갈지 말지", "안전형/공격형", "강자 영역" 판단.

## 위치

- 라이브러리: `src/lib/marketAnalysis/{types,marketType,topCompetitors,aggressiveScenarios,finalJudgment}.ts`
- API: `src/app/api/market-analysis/route.ts`
- UI: `src/components/MarketAnalysisPanel.tsx` + 4개 카드
- 통합 지점: `BidEntryWithUpload.tsx` — lookup 성공 후 자동 호출

## 4개 카드 (UI 순서)

### ① FinalJudgmentBox — 최종 판단 (맨 위)
```
참여 판단: GO / 조건부 GO / NO-GO
가격 전략: 안전형 / 혼합형 / 공격형 / 회피
추천 이유: 한 문장
주의사항: 한 문장
```

### ② MarketTypeCard — 시장 유형
4종 분류: **공격형 가능 / 안전형 필요 / 강자 회피 / 데이터 부족**

분류 우선순위 (`marketType.ts`):
1. 데이터 < 5건 → 데이터 부족
2. 강자 매칭 → 강자 회피 (덮어씀)
3. recent5 90%대 ≥3건 OR median ≥ 89.8% → 안전형 필요
4. recent5 89% 이하 ≥3건 OR median ≤ 89.0% → 공격형 가능
5. 모호 → 데이터 부족 fallback

임계값 상수 (`MARKET_TYPE_THRESHOLDS`):
- `AGGRESSIVE_MAX_MEDIAN = 89.0`
- `SAFE_MIN_MEDIAN = 89.8`
- `RECENT_AGGRESSIVE_THRESHOLD = 89.0` / count 3
- `RECENT_SAFE_THRESHOLD = 90.0` / count 3
- `MIN_SAMPLE_SIZE = 5`

강자 정의 (`KEYWORD_STRONG_THRESHOLD_*`):
- 동일 키워드 5년 누적 **5건 이상** + **점유 10% 이상**

### ③ AggressiveScenariosCard — 공격형 시뮬 3개
- **공격 A**: 유사 공고 P25 사정율
- **공격 B**: 유사 공고 중앙값 사정율
- **공격 C**: 상위 5개 업체 평균 사정율

각 시나리오: 사정율 + 투찰가 + 하한선 여유 + **미달 위험 (낮음/중간/높음)** + **위치 (공격권/정상권/미달위험권)**

### ④ TopCompetitorsCard — 상위 5명 + 새빛 비교
하드코드된 상위 5 (`TOP5_COMPETITORS` in `topCompetitors.ts`):
- 5년 총/안산/평균/중앙/P25/P75
- 주력 발주처 Top 3, 주력 키워드 Top 5
- 월별 막대 그래프 (12달)
- 마지막 줄: "새빛조경 평균 X% / 상위 5 평균 Y% / 의미 한 문장"

## 보험료 감액 룰 처리 (★ 중요)

`detectInsuranceDeduction(bid_method)`: 입찰방식 텍스트에 **"소액수의견적" + ("국민연금" or "보험료" or "감액" or "합산액")** 둘 다 포함되면 true.

감지 시:
1. 경고 문구: *"이 공고는 보험료 등 합산액 감액 적용 공고입니다. 단순 낙찰하한율보다 실제 미달선이 높게 형성될 수 있습니다."*
2. **effective cutoff 추정**: 매칭 풀 최근 8건 중 가장 낮은 사정율 - 0.05%p (단, advertised 낙찰하한율 미만으로 내려가지 않음)
3. 공격 A/B/C 미달 위험 판정에 effective cutoff 사용 (단순 89.745% 대신)

검증: 4월 30일 R26BK01476896 케이스에서:
- advertised 89.745% → 실제 effective cutoff ~90.65% (정상 진입선)
- 도구 추정 effective cutoff: 90.141% (오차 0.5%p, 충분히 보수적)
- 경고로 사용자에게 미달 위험 알림. 공격 A/B/C 모두 "위험 높음" 표시.

## FinalJudgment 룰 우선순위 (`finalJudgment.ts`)

1. 보험료 감액 → 조건부 GO + 안전형 (덮어씀)
2. 강자 회피 → 공격형 안전 가능 시 조건부 GO + 공격형 / 아니면 NO-GO + 회피
3. 데이터 부족 → 조건부 GO + 안전형
4. 안전형 필요 → GO + 안전형
5. 공격형 가능 → 공격 시뮬 안전 ≥2개 시 GO + 혼합형 / 아니면 GO + 안전형

## 금지 표현 (코드/UI 모두)

- "낙찰 가능", "예상 낙찰가", "낙찰 보장" 금지.
- "참고 시나리오", "공격형 검토", "미달 위험" 표현만 사용.
- 모든 카드 하단에 "최종 판단은 사용자가 합니다" 명시.

## API 응답 구조

`POST /api/market-analysis` (body: `NoticeContext`):
```ts
{
  notice_context: NoticeContext,
  market_type: MarketTypeResult,
  top_competitors: TopCompetitorsAnalysis,
  aggressive: AggressiveScenariosResult,
  final_judgment: FinalJudgment,
}
```

## 통합 흐름 (`/bids/new`, 2026-05-07 갱신)

```
BidEntryWithUpload
  ├─ QualificationCheck (수동 PDF 업로드 + Gemini 매칭)
  ├─ BidLookup (공고번호 → 4 API 병렬)
  ├─ ResultPdfUploader (개찰결과 PDF)
  ├─ AutoQualificationCheck ← 신규. lookup 후 자동 PDF 다운 + Gemini 자격 분석
  ├─ MarketAnalysisPanel ← lookup 성공 시 자동 호출
  │   ├─ FinalJudgmentBox
  │   ├─ MarketTypeCard
  │   ├─ AggressiveScenariosCard ← 일반/감액 라벨 표시
  │   └─ TopCompetitorsCard
  ├─ AnalyzePanel (기존 v2.2 — 사정율 분포 시각화)
  └─ BidForm (등록)
```

## 시장 분석 라이브러리 추가 모듈 (2026-05-07)

- `noticeMethods.ts` — `data/notice-methods.json` 로더 + `isInsuranceNotice(noticeNo)`
- `effectiveCutoff.ts` — op13 정상 참여자 분포로 per-notice cutoff 추정 + `isSurvivableAggressive`

## /safe-zone 페이지 — 추가 섹션 (2026-05-07)

기존 cross-tab + 신규:
- 본인 진입 영역 분포 (보험료 감액 vs 일반)
- 발주처별 일반/감액 비율 테이블

## AggressiveScenariosCard — 일반/감액 명시 라벨

- 보험료 감액 공고: 앰버 카드 "90%대 권장. 88%대 미달 위험 매우 높음"
- 일반 공고: 에메랄드 카드 "88%대 시도 영역. 상위 업체 학습 공격형"

---

# 자격 자동 체크 (2026-05-03 추가)

`src/lib/extraction/qualification.ts` + `src/components/QualificationCheck.tsx` + `src/app/api/check-qualification/route.ts`.

공고서 PDF 업로드 → Gemini로 자격요건 구조화 추출:
- `required_licenses`: 면허 목록 (조경공사업/조경식재공사업 정확 구분)
- `region_limit`, `performance_required`, `ability_eval_min`
- `small_business_only`, `joint_venture_required`, `other_requirements`

매칭 (`checkEligibility`):
- 새빛 면허 키워드 (`MY_QUALIFICATIONS.industryKeywords`) 충족
- 방제 키워드 발견 시 즉시 NO-GO (`disqualifyKeywords`)
- 시평액은 `cnstrtnAbltyEvlAmt`가 null이라 수동 확인 안내

UI: GO/조건부/NO-GO 큰 배지 + 추출 원본 + 매칭 사유 3분할 (충족/확인필요/미충족).

---

# 운영 메모

## NAS 컨테이너 자동 재시작

`docker-compose.yml`의 `restart: always` (이전 `unless-stopped`에서 변경, 2026-05-06).
NAS 재부팅이나 시스템 이벤트 후에도 컨테이너가 자동 재시작되도록.

## 데이터 수집 운영

- `scope2-scan-5y.mjs` — 68 업체 × 60개월 = 4080 호출. 일일 quota 한도로 보통 **3일에 걸쳐 분할** 실행됨.
- 체크포인트 자동 (`data/scope2-scan-5y.json`). 다음 날 quota 풀리면 미완료분만 자동 스캔.
- `ingest-scope2-scan-5y.mjs` — JSON → Supabase upsert.
- `collect-preprices.mjs` — 안산∩비방제 wins 전체의 예비가격 수집 (별도 quota).

## ⚠️ 추첨번호 추천 — 폐기 (2026-05-12)

이전에 `simulate-drwt-recommendation.mjs` 결과로 "0.594 → 0.781 (+32%)" 적중률 향상을 주장했으나
**근본 전제가 틀렸음**. 조달청 실제 입찰 화면에서 1~15번 추첨번호 박스는 **라벨 없이 블라인드**로 표시.
본인이 어떤 박스를 누르는지 사전에 알 수 없고, 사후(개찰 후)에야 어떤 번호였는지 확인 가능.

→ 도구가 "이 번호 고르세요"라고 추천해도 사장님이 그 번호를 클릭할 방법이 없음. 
5년 누적 분포가 7~11% 균등이었던 것은 패턴 부재가 아니라 **모든 참여자가 무작위 클릭하는 결과**.

**제거된 코드** (이 커밋):
- `src/components/DrwtRecommend.tsx`
- `src/app/api/recommend-drwt/route.ts`
- `src/app/competitors/page.tsx` 상위업체 × 추첨번호 매트릭스 카드
- `BidLookup.tsx`의 DrwtRecommend 호출

`scripts/simulate-*.mjs` 시뮬레이션 파일들은 유지 (역사적 기록), 결과는 사용하지 않음.

---

# /alerts 페이지 (신규 공고 모니터링)

`src/app/alerts/page.tsx` — 매 요청마다 나라장터 API 호출 (30분 메모리 캐시).
별도 cron 불필요. 페이지 새로고침 = 최신 데이터.

## 표시 컬럼

`공고일 | 입찰마감 | 개찰일 | 공고명 | 발주처 | 기초금액 | 분류 | 자격 | 하한율 | 상태`

**입찰마감 컬럼** (`bidClseDt`) — 사용자가 신경써야 할 진짜 데드라인. D-day 배지:
- 오늘: 빨강 강조
- D-1, D-2: 앰버 강조
- D-3~D-5: 블루
- 마감 지남: 회색 "마감"
- 마우스오버 시 시:분까지 표시

## 정렬 우선순위

```ts
1. 본인 등록 / 마감 지남 → 맨 아래
2. 자격 가능 우선
3. 입찰마감 가까운 순 (오름차순) — fallback: 개찰일
4. 같은 마감 → 안전형 > 혼합 > 공격형
```

핵심: **마감 임박 + 자격 가능 + 미등록**이 가장 위. 사용자가 그 순서로 처리.

## 데이터 소스

`src/lib/scope2/fetchRecentNotices.ts` — `BidPublicInfoService.getBidPblancListInfoCnstwk`.
한 번 호출 = 1 calendar month 제약. 30일 N=14 default. 30분 메모리 캐시.

응답 필드 (이미 fetch 중): `bidNtceDt, bidClseDt, opengDt, bidNtceNo, bidNtceNm, dminsttNm,
bdgtAmt, presmptPrce, sucsfbidLwltRate, sucsfbidMthdNm, mainCnsttyNm, prtcptLmtRgnNm`.

## 의미

- **공고일**: 게시일 (참고용)
- **입찰마감 (`bidClseDt`)**: 입찰서 제출 마지막 시각 — **본인이 신경써야 할 진짜 데드라인**
- **개찰일 (`opengDt`)**: 시스템 자동 발표일. 마감 1~2시간 후 즉시 결과 공개

마감 = 개찰 같은 날, 1~2시간 차이 일반적.

---

# 로컬 / NAS / Vercel 운영 상태 (2026-05-07 기준)

- **로컬 개발**: `npm run dev` 정상. 사용자가 매매 봇 NAS 부담 줄이려고 NAS 컨테이너 일시 중단 (`docker-compose down`). 이미지는 보존됨, 다시 `up -d`로 재가동 가능.
- **NAS 메모리 압박**: 1.7GB / 가용 200MB / Swap 1.5GB 사용 중. 매매 봇(us-stock-bot, bybit_spot_bot)이 24/7 핵심.
- **Vercel 이전 계획**: GitHub push → Vercel 무료 배포로 이전 예정. NAS 매매 봇 부담 영구 해소 + 배포 30초.

---

# 도구 한계 — 진짜 못하는 것 vs 데이터로 가능한 것 (2026-05-07 정리)

**"도구가 못 한다"고 잘못 답한 적 다수. 실제로는 대부분 데이터 분석으로 가능. 정확한 경계 정리.**

## ✅ 데이터(API)로 가능 (오해 정정)

| 항목 | 어떻게 |
|---|---|
| 발주처별 발주 시기 패턴 | `public_wins.rl_openg_dt` 월별 그룹화 |
| 보험료 감액 적용 감지 | `BidPublicInfoService.sucsfbidMthdNm` 텍스트 매칭 |
| 추첨번호 업체별 패턴 | `public_participants.drwt_no_1/2` 누적 분석 |
| 동시 출현 패턴 | 같은 `bid_ntce_no`에 여러 업체 정상 진입 |
| 시기별 사정율 변화 | 시계열 분석 (5년 데이터) |
| 금액대별 강자 분석 | `sucsfbid_amt` 버킷 + 업체별 점유율 |
| 키워드 × 발주처 cross-tab | 다중 그룹화 |
| 정상 진입률 / 낙찰률 분리 | op13 정상 참여자 vs `public_wins` 비교 |

## ❌ 진짜 못 하는 것 (데이터에 없음)

| 항목 | 이유 |
|---|---|
| **공고 게시 전 사전 정보** | 게시 전엔 API에 없음 (정보 우위는 비공식 채널) |
| **인적 관계 / 비공식 정보 흐름** | API에 없음. 추정만 가능 (점유율 ↑로 간접 시사) |
| **회사 내부 의사결정 (회의 등)** | 외부 데이터 없음 |
| **op13 미달자의 추첨번호 / 투찰가** | API가 정상 참여자만 반환 (`OpengResultListInfoOpengCompt` 한계) |
| **5년 초과 과거 데이터** | API 한도 (낙찰정보서비스 기준) |
| **회사 인지도 / 평판** | 데이터에 없음 |
| **사용자가 사적으로 가진 정보** | 본인이 입력해야 |

## ⚠ 데이터로 부분 가능

| 항목 | 한계 |
|---|---|
| 미달 부적격자 시도율 | 미달은 op13에 누락 — 정상 진입자만 셀 수 있음 |
| 진짜 effective cutoff | 미달 부적격선이지만 데이터에 미달자 가격 없어 정확 추정 어려움 (op13 정상 최저로 근사) |
| 카르텔 / 담합 | 같은 공고 동시 출현 빈도 + 사정율 일치도로 의심 시그널은 가능. 단정 불가 |

## 운영 원칙 (스스로에게 메모)

1. "데이터로 못 한다"고 단정하기 전에 **반드시 코드/스키마 확인**.
2. 오해의 소지 있으면 **분석 스크립트로 즉시 검증**.
3. CLAUDE.md 한계 섹션은 **데이터 검증 결과만** 적기.

---

# 5년치 분석 핵심 발견 (2026-05-07)

`scripts/analyze-*.mjs` 5개 실행 결과 종합:

## 1. 보험료 감액 공고 비중 — 33.6%

- 안산∩비방제 652건 중 **219건이 보험료 감액 적용** (33.6%)
- 일반 공고 effective cutoff (정상 진입 최저 사정율 중앙): **87.88%**
- 보험료 감액 cutoff: **90.20%**
- 차이 **+2.32%p** — 룰 영향 큼
- 출처: `analyze-insurance-pattern.mjs`

## 2. 상위 업체 운영 모델 = 룰 따라 사정율 조정

- 상위 5개 모두 보험료 감액 공고에서 사정율 **+1.5~1.9%p** 올려서 들어감
- 회피 X. 룰 알고 적응함
- 데이터로 명확히 보임 (5년 시행착오 결과)

## 3. 새빛 진입 패턴 (충격적)

| 영역 | 본인 정상 진입 |
|---|---|
| 보험료 감액 219건 | **25건 진입 (11%)** — 사정율 90.21% |
| 일반 433건 | **1건 진입 (0.2%)** — 사정율 90.80% |

새빛은 **일반 공고 영역(88%대) 거의 미진입**. 미개척 영역.

## 4. 직접 매칭 — 새빛 vs 에스디건설 14/15 패배

같은 공고에 둘 다 정상 진입한 케이스:
- 에스디건설 vs 새빛: **에스디 14승 1패** (본인이 14번 더 높게 갔음)
- 본인 평균 90.75% vs 에스디 89.80%
- 손실 사례 TOP 10 모두 보험료 감액 공고에서 차이 1.2~1.7%p

## 5. 발주처 × 보험료 감액 비율

| 발주처 | 일반 비율 | 새빛 일반 진입 |
|---|---:|---:|
| 교육지원청 | **89%** | 0건 |
| 도시공사 | 80% | 0건 |
| 상록구 | 68% | 0건 |
| 안산시 본청 | 63% | 1건 |
| 단원구 | 62% | 0건 |

→ 일반 공고 423건 중 새빛 진입 1건. 가장 큰 미개척.

## 6. 추첨번호 패턴 — 업체 간 차이 작음

상위 10개 모두 7~11% 균등 분포. **명확한 "정답" 번호 없음**.

## 분석 스크립트 (전부 콘솔 출력)

| 스크립트 | 분석 |
|---|---|
| `analyze-top-competitor-patterns.mjs` | 발주처 집중도 + 사정율 IQR |
| `analyze-competitor-entry-patterns.mjs` | 정상 진입률 / 낙찰률 |
| `analyze-deeper-patterns.mjs` | 추첨번호 + 동시 출현 |
| `analyze-insurance-pattern.mjs` | 보험료 감액 vs 일반 |
| `analyze-head-to-head.mjs` | 본인 vs 상위 직접 매칭 + 발주처×보험료 |
| `analyze-rebids.mjs` | 재입찰 식별 (의미 작음) |
| `analyze-attempt-rate.mjs` | 시도율 추정 |
| `analyze-bid-methods.mjs` | bid_method 세분화 분포 |
| `analyze-timeline-trend.mjs` | ★ 5년 시계열 트렌드 (시장 변화) |
| `analyze-drwt-rate-combo.mjs` | 추첨번호 + 사정율 결합 |

## 7. ⚡ 시장 시계열 변화 (최대 발견)

`analyze-timeline-trend.mjs` 결과:

| 연도 | 88%대 | 89.5~90.5% | 90%대 |
|---|---:|---:|---:|
| 2021 | **100%** | 0% | 0% |
| 2022~2024 | 100% | 0% | 0% |
| 2025 | 54% | 36% | 10% |
| **2026** | **0%** | **70%** | **30%** |

**시장 자체가 88% → 90%대로 명확히 이동**. 4월 30일 도구가 빗나간 진짜 원인.
5년 누적 평균(88.65%)은 옛날 데이터에 끌려 현재 트렌드 못 잡음.

### 알고리즘 반영 후보 (미수행)

- `recommendation.ts`: `RECENT_COUNT 3 → 8`, `RECENT_WEIGHT 2.0 → 5.0`
- 또는 시기별 분리 (최근 12개월만 사용)
- 또는 /safe-zone에 시계열 카드

→ 미반영. 사용자 1개월 실험으로 검증 후 결정.

## 8. 시공능력평가 정보 (#1, 미수집)

조달청 BidPublicInfoService에는 시평액 필드 없음 (확인됨).
별도 API (KISCON 등) 필요 — 활용신청 안 됨.

대안: 본인 시평액 1회 수동 입력 → `myCompany.ts`의 `cnstrtnAbltyEvlAmt`.
매년 1회 갱신.

## 9. bid_method 분포

```
공고서참조       65.3%  평균 88.02%
소액수의견적+감액  33.6%  평균 89.69%
수의시담          0.9%  평균 94.84%
```

대부분 적격심사(공고서참조). 보험료 감액 외 별다른 패턴 X.

---

# API 자동화 — 2026-05-07 추가 작업

## 본인 입찰 자동 sync (`scripts/sync-my-bids.mjs`)
op13 정상 참여 + public_wins로 본인 `bids` 테이블 자동 채움.
- 19건 (수동) → 85건 (자동 +66) 적재
- 미달 부적격 4건은 op13에 없음 — 수동 입력 필요

## 공고문 자동 다운로드 + Gemini 자격 추출
- API: `POST /api/auto-qualification` (body: `{ notice_no }`)
- BidPublicInfoService에서 `ntceSpecDocUrl1~10` + `ntceSpecFileNm` 매칭
- "공고문" 키워드 PDF 자동 다운 → pdf-parse → Gemini → 매칭
- UI: `AutoQualificationCheck.tsx` (cyan 톤 카드)
- `/bids/new` lookup 후 자동 표시 (사용자 클릭으로 시작)

## 재입찰 분석 (`scripts/analyze-rebids.mjs`)
- 5년치 652건 중 23건 (3.5%) 재입찰 (`bid_ntce_ord != "000"` or `rbid_no != "000"`)
- 첫 입찰 vs 재입찰 사정율 차이 -0.15%p — 신호 없음
- 결론: 재입찰 분석은 별 가치 없음

## 미완료 — 계약 체결 정보 (CntrctProcssIntgOpenService)
- 활용신청 했지만 정확한 endpoint operation 이름 미확인
- 시도한 것: getCntrctInfoListInfoCnstwk → 500/404
- TODO: data.go.kr 문서에서 operation 정확한 이름 찾기
- 가치 ⭐ 낮음 (낙찰 후 포기 케이스 식별 정도)

## PDF 가격 룰 추출 확장 (2026-05-07 추가)
API endpoint 못 찾은 #2 (순공사비 80% 룰)을 PDF 추출로 우회.

`qualification.ts` 확장 필드:
- `pure_construction_cost`: 순공사비 (PDF 명시 시)
- `base_amount_in_doc`: PDF 기초금액 (검증용)
- `lower_bound_rule_text`: 낙찰하한 룰 원문 (자유 텍스트)
- `applies_purcost_floor`: 순공사비 80% 미만 부적격 룰 적용 여부
- `purcost_floor_pct`: 적용 % (예: 80)

UI: AutoQualificationCheck에 "💰 가격 룰" 별도 섹션 (오렌지 톤). 순공사비 80% 룰 적용 시 빨강 경고 + 최소 투찰가 자동 계산.

검증: R26BK01294519에서 보험료 감액 룰 원문 정확히 추출됨.

## 사전규격 서비스 (15129404) — 미사용
- 403 권한 거부 → 활용신청 안 됨
- 사용자가 data.go.kr에서 추가 활용신청 필요 (1~3일)
- 가치: 정식 공고 1~2주 전 인지 → 시도율 ↑

---

# 추가 분석 가능 목록 (미수행, 2026-05-07)

데이터는 있지만 아직 분석/UI화 안 한 항목:

1. **추첨번호 시계열** — 연도별 선정 빈도 변화 (학습 가능 패턴 변화)
2. **업체 × 추첨번호 매트릭스** — 어떤 업체가 어떤 번호 자주 뽑는지 (`analyze-deeper-patterns.mjs` 일부 함)
3. **참여자수 시계열** — 안산 풀 경쟁 강도 변화
4. **사정율 정밀도 시계열** — 업체별 IQR이 시간에 따라 좁아지는지
5. **본인 32건 vs 상위 업체 정상진입 사정율 매칭 비교** — 같은 공고에 둘 다 정상 진입한 케이스에서 누가 더 낮게 갔나
6. **보험료 감액 공고 vs 일반 공고 사정율 분포 비교** (notice methods 수집 후)
7. **발주처 × 시기 × 사정율 분포 3D**
8. **공고명 임베딩 기반 유사 공고 매칭** (현재 키워드 매칭만)

미리 만들지 않음 — 사용 중 진짜 필요할 때 추가.
