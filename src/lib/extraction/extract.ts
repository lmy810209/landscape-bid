// 서버 전용. Gemini 2.5 Flash로 PDF 텍스트에서 핵심 필드를 구조화 추출한다.
// Gemini는 추출과 요약만 수행한다. 추천/판단 로직은 recommendation.ts가 담당.
import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";

export const PDF_TEXT_LIMIT = 10_000;

// Gemini는 4종 분류로 응답하고, 매핑은 normalize 단계에서 한다.
// "식재" → "조경식재" 매핑이 필요해 분리 유지.
const WORK_TYPE_VALUES = ["유지관리", "식재", "조경시설물", "기타"] as const;

export const ExtractedSchema = z.object({
  title: z.string().nullable(),
  agency: z.string().nullable(),
  work_type: z.enum(WORK_TYPE_VALUES).nullable(),
  region: z.string().nullable(),
  base_amount: z.number().nullable(),
  bid_date: z.string().nullable(),
  participant_count: z.number().int().nullable(),
  qualification_limit: z.string().nullable(),
  bid_method: z.string().nullable(),
  estimated_price: z.number().nullable(),
  note: z.string().nullable(),
});

export type RawExtraction = z.infer<typeof ExtractedSchema>;

// Gemini responseSchema는 OpenAPI 3.0 서브셋. nullable + enum 조합이 모델 버전에
// 따라 불안정한 보고가 있어, enum은 프롬프트와 zod에서만 강제하고 스키마는 type만 명시.
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, nullable: true },
    agency: { type: Type.STRING, nullable: true },
    work_type: { type: Type.STRING, nullable: true },
    region: { type: Type.STRING, nullable: true },
    base_amount: { type: Type.NUMBER, nullable: true },
    bid_date: { type: Type.STRING, nullable: true },
    participant_count: { type: Type.INTEGER, nullable: true },
    qualification_limit: { type: Type.STRING, nullable: true },
    bid_method: { type: Type.STRING, nullable: true },
    estimated_price: { type: Type.NUMBER, nullable: true },
    note: { type: Type.STRING, nullable: true },
  },
  required: [
    "title",
    "agency",
    "work_type",
    "region",
    "base_amount",
    "bid_date",
    "participant_count",
    "qualification_limit",
    "bid_method",
    "estimated_price",
    "note",
  ],
};

const SYSTEM_PROMPT = `당신은 한국 조달청/공공기관 조경 입찰 공고 문서에서 핵심 필드를 추출하는 전문가입니다.

[역할 한계]
- 추출과 요약만 수행하세요. 예측, 추정, 판단, 권고는 절대 하지 마세요.
- 본문에 명시되지 않은 값은 반드시 null로 반환하세요.
- 모호하거나 확신이 없으면 추측하지 말고 null입니다.
- 응답은 반드시 응답 스키마(JSON) 형식만 사용하세요.

[정규화 규칙]
- 금액: 모든 금액은 한국 원(KRW) 단위 정수로 변환합니다. 콤마/소수점/단위 표기("원", "백만원", "천원")를 제거하고 풀어진 정수 값으로 응답하세요.
  (예: "1,234,567원" → 1234567, "12.5백만원" → 12500000)
- 날짜: 모두 "YYYY-MM-DD" 형식. 시각이 함께 있으면 날짜 부분만.
  (예: "2026년 4월 23일 14:00" → "2026-04-23")
- participant_count: 0 이상의 정수만. 추정 금지.

[필드 가이드]
- title: 공고명 / 사업명 / 용역명.
- agency: 발주처 / 공고기관 / 수요기관 / 계약담당기관.
- work_type: 다음 4개 중 하나로만 분류하세요. 본문 표현이 모호하거나 어디에도 명확히 속하지 않으면 "기타" 또는 null.
    * "유지관리": 가로수 관리, 잡초/병해충 방제, 전정, 청소, 시설물 점검 등 정기 유지·관리 위주
    * "식재": 수목/묘목/꽃·잔디/이식 등 식재 위주
    * "조경시설물": 운동장·놀이시설·파고라·벤치·분수 등 조경 시설물 설치/유지 위주
    * "기타": 위 분류 어느 것에도 분명히 속하지 않거나 복합/판단 불가
  추측해서 분류하지 말고, 명확하지 않으면 "기타" 또는 null.
- region: 시/도 단위 지역명만. (예: "서울", "경기"). 시/군/구 단위면 상위 시/도로 변환.
- base_amount: 기초금액 ("기초금액", "추정가격" 라벨). 부가세 포함/별도 구분 없이 본문 표기 그대로.
- bid_date: 개찰일 또는 입찰일. 둘 다 있으면 개찰일 우선.
- qualification_limit: 면허/등급/지역/시평액 제한 중 핵심을 한 줄 요약. (예: "조경공사업, 시평 30억 이상")
- bid_method: 입찰 방식 표현 그대로. (예: "적격심사", "종합심사낙찰제", "최저가")
- estimated_price: 예정가격. "비공개"/"미정"/누락은 null.
- note: 입찰 의사결정에 영향을 줄 만한 핵심 특이사항만 1~3문장 요약. 자격/방식/일정/특수조건 중 중요한 것만. 장황한 설명·반복·평가성 표현은 금지. 없으면 null.

[금지]
- 추천, 권장, 가능성 평가, "유리하다/불리하다" 같은 판단 문장 금지.
- 추측으로 빈 칸을 채우지 마세요.`;

let _ai: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ExtractionConfigError("GEMINI_API_KEY가 설정되지 않았습니다.");
  if (!_ai) _ai = new GoogleGenAI({ apiKey: key });
  return _ai;
}

// 호출부에서 환경변수 누락을 분기하기 위한 전용 에러
export class ExtractionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionConfigError";
  }
}

// Gemini 응답을 안전하게 JSON으로 파싱한다. responseMimeType이 application/json이면
// 보통 깨끗한 JSON이지만, 모델이 코드펜스를 두른 경우를 대비해 방어적으로 정리한다.
function safeParseJson(raw: string): unknown {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  return JSON.parse(s);
}

export async function extractFromText(text: string): Promise<RawExtraction> {
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
              "다음은 입찰 공고 본문(전반부)입니다. 시스템 가이드와 응답 스키마에 정확히 맞춰 핵심 필드를 추출하세요. 모르면 null입니다.\n\n" +
              "--- 공고 본문 시작 ---\n" +
              truncated +
              "\n--- 공고 본문 끝 ---",
          },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      // 추출 작업은 결정론적이어야 함. 창의성 불필요.
      temperature: 0,
    },
  });

  const raw = response.text ?? "";
  if (!raw.trim()) {
    throw new Error("Gemini가 빈 응답을 반환했습니다. 입력이 너무 짧거나 안전 필터에 걸렸을 수 있습니다.");
  }

  let parsed: unknown;
  try {
    parsed = safeParseJson(raw);
  } catch {
    throw new Error(`Gemini 응답이 JSON이 아닙니다: ${raw.slice(0, 200)}`);
  }

  const result = ExtractedSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Gemini 응답이 스키마에 맞지 않습니다: ${result.error.message}`);
  }
  return result.data;
}
