// 서버 전용. 나라장터 개찰결과 PDF에서 공고 정보 + 1등/2등/참가수 + 내 회사 매칭을 추출.
// 결과 PDF는 78건 같은 다수 행이 있어 텍스트가 길다 → PDF_TEXT_LIMIT을 더 크게 둠.

import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";

export const PDF_TEXT_LIMIT = 15_000;

const WORK_TYPE_VALUES = ["유지관리", "식재", "조경시설물", "기타"] as const;

export const ResultExtractedSchema = z.object({
  notice_no: z.string().nullable(),
  notice_title: z.string().nullable(),
  agency: z.string().nullable(),
  region: z.string().nullable(),
  work_type: z.enum(WORK_TYPE_VALUES).nullable(),
  base_amount: z.number().nullable(),
  estimated_price: z.number().nullable(),
  bid_date: z.string().nullable(),
  bid_method: z.string().nullable(),
  winning_amount: z.number().nullable(),
  second_amount: z.number().nullable(),
  participant_count: z.number().int().nullable(),
  my_match: z.object({
    found: z.boolean(),
    rank: z.number().int().nullable(),
    bid_amount: z.number().nullable(),
    matched_company_name: z.string().nullable(),
    // "비고" 컬럼 값 (예: "정상", "낙찰하한선 미달", "부적격" 등)
    // 부적격이면 보통 순위 컬럼이 비어있어 rank=null이지만 참여는 한 것이므로
    // note 정보가 분석에 매우 중요.
    note: z.string().nullable(),
  }),
});

export type RawResultExtraction = z.infer<typeof ResultExtractedSchema>;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    notice_no: { type: Type.STRING, nullable: true },
    notice_title: { type: Type.STRING, nullable: true },
    agency: { type: Type.STRING, nullable: true },
    region: { type: Type.STRING, nullable: true },
    work_type: { type: Type.STRING, nullable: true },
    base_amount: { type: Type.NUMBER, nullable: true },
    estimated_price: { type: Type.NUMBER, nullable: true },
    bid_date: { type: Type.STRING, nullable: true },
    bid_method: { type: Type.STRING, nullable: true },
    winning_amount: { type: Type.NUMBER, nullable: true },
    second_amount: { type: Type.NUMBER, nullable: true },
    participant_count: { type: Type.INTEGER, nullable: true },
    my_match: {
      type: Type.OBJECT,
      properties: {
        found: { type: Type.BOOLEAN },
        rank: { type: Type.INTEGER, nullable: true },
        bid_amount: { type: Type.NUMBER, nullable: true },
        matched_company_name: { type: Type.STRING, nullable: true },
        note: { type: Type.STRING, nullable: true },
      },
      required: ["found", "rank", "bid_amount", "matched_company_name", "note"],
    },
  },
  required: [
    "notice_no",
    "notice_title",
    "agency",
    "region",
    "work_type",
    "base_amount",
    "estimated_price",
    "bid_date",
    "bid_method",
    "winning_amount",
    "second_amount",
    "participant_count",
    "my_match",
  ],
};

const SYSTEM_PROMPT = `당신은 한국 조달청 나라장터 개찰결과 PDF에서 핵심 정보를 추출하는 전문가입니다.

[역할 한계]
- 추출과 매칭만 수행. 예측·추정·판단 금지.
- 본문에 명시되지 않은 값은 반드시 null.
- 응답은 도구 스키마 형식만 사용.

[정규화 규칙]
- 금액: 모든 금액은 KRW 정수. 콤마/원/단위 표기 제거.
- 날짜: YYYY-MM-DD. 시각이 함께 있으면 날짜만.
- 정수: participant_count, my_match.rank.

[PDF 구조 — 상단: 공고정보]
- notice_no: "입찰공고번호" (예: R26BK01456796-000)
- notice_title: "입찰공고명"
- agency: "공고기관" (예: "경기도 안산시 단원구")
- region: 발주처 주소에서 시/도만 추출 (예: 안산시 단원구 → "경기")
- base_amount: "공사예정금액(추정금액)" 또는 "기초금액"
- estimated_price: "예정가격" (있을 때만)
- bid_date: "실제개찰일시" → YYYY-MM-DD만
- work_type: notice_title 표현으로 분류
    * "유지관리": 유지관리/관리/방제/전정 키워드
    * "식재": 식재/수목/잔디/이식 키워드
    * "조경시설물": 시설물/놀이/운동장/벤치 키워드
    * "기타": 위 어디에도 분명히 속하지 않으면
- bid_method: 본문에 "낙찰하한율" 또는 "(입찰가격-A)/(예정가격-A)" 표기가 보이면 "적격심사". 그 외엔 본문 표현 그대로.

[PDF 구조 — 하단: 개찰결과 테이블]
테이블 컬럼: 순위 / 사업자등록번호 / 업체명 / 대표자명 / 투찰금액(원) / 투찰률(%) / (입찰가격-A)/(예정가격-A)*100 / 추첨번호 / 투찰일시 / 비고
- winning_amount: 순위 1의 "투찰금액(원)"
- second_amount: 순위 2의 "투찰금액(원)"
- participant_count: "목록 전체 N건"의 N. 명시 없으면 테이블 행 수.

[내 회사 매칭]
사용자 식별자(my_company_query)로 결과 테이블에서 본인 회사 행을 찾으세요.
- 식별자는 사업자등록번호(예: "495-86-03422") 또는 회사명("(주)새빛조경") 형태
- 사업자등록번호 정확 일치 우선 (가장 신뢰도 높음)
- 회사명 매칭은 (주)/주식회사/공백 등을 무시한 부분 일치 허용
- 매칭 성공: my_match = {
    found: true,
    rank: 그 행의 "순위" (부적격/낙찰하한선 미달 등으로 순위 컬럼이 비어 있으면 null로 두되 found는 true 유지),
    bid_amount: 그 행의 "투찰금액(원)",
    matched_company_name: 그 행의 "업체명",
    note: 그 행의 "비고" 컬럼 값 그대로 (예: "정상", "낙찰하한선 미달", "부적격" 등). 비어 있으면 null
  }
- 매칭 실패(본문 어디에도 그 회사 없음 = 미참여): my_match = { found: false, rank: null, bid_amount: null, matched_company_name: null, note: null }
- 핵심: 회사명/사업자번호가 보이는데 순위만 비어있으면 found: true + rank: null. 절대 found: false로 두지 말 것.
- 매칭이 모호하면 found: false로 두세요. 추측 금지.

[금지]
- 추측 금지. 모르면 null.
- 추천/판단/평가 문장 금지.`;

let _ai: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ResultExtractionConfigError("GEMINI_API_KEY가 설정되지 않았습니다.");
  if (!_ai) _ai = new GoogleGenAI({ apiKey: key });
  return _ai;
}

export class ResultExtractionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResultExtractionConfigError";
  }
}

function safeParseJson(raw: string): unknown {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  return JSON.parse(s);
}

export async function extractResultFromText(
  text: string,
  myCompanyQuery: string,
): Promise<RawResultExtraction> {
  const ai = getClient();
  const truncated = text.slice(0, PDF_TEXT_LIMIT);

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              `다음은 나라장터 개찰결과 PDF 본문입니다.\n` +
              `사용자 회사 식별자(my_company_query): "${myCompanyQuery}"\n\n` +
              "스키마에 맞춰 추출하세요. 모르면 null. 내 회사 매칭은 위 식별자로 정확히 찾고, 모호하면 found: false로 두세요.\n\n" +
              "--- PDF 본문 시작 ---\n" +
              truncated +
              "\n--- PDF 본문 끝 ---",
          },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
    },
  });

  const raw = response.text ?? "";
  if (!raw.trim()) {
    throw new Error("Gemini가 빈 응답을 반환했습니다. 안전 필터 또는 입력 길이 문제일 수 있습니다.");
  }

  let parsed: unknown;
  try {
    parsed = safeParseJson(raw);
  } catch {
    throw new Error(`Gemini 응답이 JSON이 아닙니다: ${raw.slice(0, 200)}`);
  }

  const result = ResultExtractedSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Gemini 응답이 스키마에 맞지 않습니다: ${result.error.message}`);
  }
  return result.data;
}
