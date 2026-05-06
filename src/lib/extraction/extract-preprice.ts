// 복수예비가격 PDF 추출 (서버 전용)
//
// 추첨된 4개 예비가격과 관련 메타데이터를 Gemini로 구조화 추출한다.
// 추출만 수행 — 계산/판단은 lowerBound.ts에서.

import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import { ExtractionConfigError, PDF_TEXT_LIMIT } from "./extract";

export const PrepriceExtractedSchema = z.object({
  notice_no: z.string().nullable(),
  agency: z.string().nullable(),
  base_amount: z.number().nullable(),
  estimated_price: z.number().nullable(),
  // 문서에 예비가격 전체 리스트가 있으면 수집. 없으면 null.
  preprice_candidates: z.array(z.number()).nullable(),
  // 추첨된 4개. 길이가 4가 아니면 normalize에서 null 처리.
  selected_numbers: z.array(z.number().int()).nullable(),
  selected_prices: z.array(z.number()).nullable(),
  note: z.string().nullable(),
});

export type RawPrepriceExtraction = z.infer<typeof PrepriceExtractedSchema>;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    notice_no: { type: Type.STRING, nullable: true },
    agency: { type: Type.STRING, nullable: true },
    base_amount: { type: Type.NUMBER, nullable: true },
    estimated_price: { type: Type.NUMBER, nullable: true },
    preprice_candidates: {
      type: Type.ARRAY,
      nullable: true,
      items: { type: Type.NUMBER },
    },
    selected_numbers: {
      type: Type.ARRAY,
      nullable: true,
      items: { type: Type.INTEGER },
    },
    selected_prices: {
      type: Type.ARRAY,
      nullable: true,
      items: { type: Type.NUMBER },
    },
    note: { type: Type.STRING, nullable: true },
  },
  required: [
    "notice_no",
    "agency",
    "base_amount",
    "estimated_price",
    "preprice_candidates",
    "selected_numbers",
    "selected_prices",
    "note",
  ],
};

const SYSTEM_PROMPT = `당신은 한국 조달청/공공기관의 "복수예비가격 산정조서" 혹은 "예비가격 추첨조서" 문서에서 핵심 수치를 추출하는 전문가입니다.

[역할 한계 — 절대 준수]
- 추출만 수행하세요. 예측/추정/판단/권고 금지.
- 본문에 명시되지 않은 값은 반드시 null입니다.
- 모호하면 null입니다. 추측으로 빈 칸을 채우지 마세요.
- 응답은 오직 JSON 스키마 형식으로만.

[이 문서의 구조 이해]
- 복수예비가격: 발주처가 사전에 산정한 여러 개(보통 15개)의 예비가격 후보.
- 개찰 시 그 중 4개가 무작위 추첨되며, 추첨된 4개의 산술 평균이 "예정가격"이 됩니다.
- 이 문서에는 보통 예비가격 번호 표(01~15 또는 그 외), 각 번호의 가격, 추첨된 4개 번호가 표기됩니다.

[최우선 추출 대상]
- selected_numbers: 추첨된 4개 예비가격의 번호 (예: [3, 7, 11, 14]).
- selected_prices: 그 번호에 해당하는 4개 예비가격 금액 (원 단위 정수).
- selected_numbers와 selected_prices는 같은 순서로 반환하세요.
- 4개가 아니거나 대응이 불분명하면 null로 반환.

[나머지 필드]
- notice_no: 공고번호.
- agency: 발주처 / 공고기관 / 수요기관.
- base_amount: 기초금액 (문서에 명시된 경우만).
- estimated_price: 예정가격. 문서에 직접 계산되어 표기된 경우만. 없으면 null.
- preprice_candidates: 문서에 보이는 예비가격 전체 목록 (가능하면 15개). 불완전하면 null.
- note: 특이사항 1~2문장 요약. 없으면 null.

[정규화 규칙]
- 금액은 모두 원(KRW) 단위 정수. 콤마/단위 표기 제거.
  (예: "1,234,567원" → 1234567)
- 번호는 정수 (예: "03번" → 3).
- 숫자 외 문자 혼입 금지. 반드시 숫자로 반환.

[금지]
- 추첨 결과 추측 금지. 표에 하이라이트/체크/별표가 있거나 "추첨" "당첨" "선정" 같은 명시적 표식이 있어야만 selected_*로 추출.
- 판단/권장 표현 금지.`;

let _ai: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ExtractionConfigError("GEMINI_API_KEY가 설정되지 않았습니다.");
  if (!_ai) _ai = new GoogleGenAI({ apiKey: key });
  return _ai;
}

function safeParseJson(raw: string): unknown {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  return JSON.parse(s);
}

export async function extractPrepriceFromText(text: string): Promise<RawPrepriceExtraction> {
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
              "다음은 복수예비가격 문서(또는 개찰조서 중 예비가격 부분)의 텍스트입니다. 시스템 가이드와 응답 스키마에 정확히 맞춰 추출하세요. 모르면 null입니다.\n\n" +
              "--- 문서 본문 시작 ---\n" +
              truncated +
              "\n--- 문서 본문 끝 ---",
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
    throw new Error("Gemini가 빈 응답을 반환했습니다. 스캔본(이미지) PDF이거나 안전 필터에 걸렸을 수 있습니다.");
  }

  let parsed: unknown;
  try {
    parsed = safeParseJson(raw);
  } catch {
    throw new Error(`Gemini 응답이 JSON이 아닙니다: ${raw.slice(0, 200)}`);
  }

  const result = PrepriceExtractedSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Gemini 응답이 스키마에 맞지 않습니다: ${result.error.message}`);
  }
  return result.data;
}
