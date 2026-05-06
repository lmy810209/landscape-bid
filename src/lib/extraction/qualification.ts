// 공고 PDF에서 자격요건을 구조화 추출 → 새빛조경 자격과 매칭.
// 기존 extract.ts의 qualification_limit (한 줄 요약)보다 자세하게.

import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import {
  MY_QUALIFICATIONS,
  type MyCompany,
} from "@/lib/config/myCompany";

export const PDF_TEXT_LIMIT = 12_000;

export const QualificationSchema = z.object({
  required_licenses: z.array(z.string()).nullable(),
  region_limit: z.string().nullable(),
  performance_required: z.string().nullable(),
  ability_eval_min: z.number().nullable(),
  small_business_only: z.boolean().nullable(),
  joint_venture_required: z.boolean().nullable(),
  other_requirements: z.array(z.string()).nullable(),
  raw_summary: z.string().nullable(),
});

export type QualificationDetails = z.infer<typeof QualificationSchema>;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    required_licenses: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      nullable: true,
    },
    region_limit: { type: Type.STRING, nullable: true },
    performance_required: { type: Type.STRING, nullable: true },
    ability_eval_min: { type: Type.NUMBER, nullable: true },
    small_business_only: { type: Type.BOOLEAN, nullable: true },
    joint_venture_required: { type: Type.BOOLEAN, nullable: true },
    other_requirements: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      nullable: true,
    },
    raw_summary: { type: Type.STRING, nullable: true },
  },
  required: [
    "required_licenses",
    "region_limit",
    "performance_required",
    "ability_eval_min",
    "small_business_only",
    "joint_venture_required",
    "other_requirements",
    "raw_summary",
  ],
};

const SYSTEM_PROMPT = `당신은 한국 조달청/공공기관 입찰 공고에서 **입찰참가자격** 정보만 추출하는 전문가입니다.

[역할 한계]
- 추출과 분류만 수행. 판단·예측·권고 금지.
- 본문에 명시되지 않은 값은 반드시 null.
- 추측 금지. 명확하지 않으면 null.

[필드 가이드]
- required_licenses: 요구되는 면허/업종 등록 목록.
    예: ["조경공사업"], ["조경식재공사업", "조경시설물설치공사업"], ["나무의사 면허"]
    조경공사업 vs 조경식재공사업 vs 조경시설물설치공사업은 서로 다른 면허이므로 정확히 구분.
    없으면 null.
- region_limit: 입찰참가 지역 제한. (예: "경기도 안산시 소재 업체만", "경기도 전역")
    제한 없으면 "전국" 또는 null.
- performance_required: 시공실적 요건 한 줄 요약. (예: "최근 3년간 5억원 이상 1건")
    없으면 null.
- ability_eval_min: 시공능력평가금액 최소 기준 (원 단위 정수). (예: "시평 30억 이상" → 3000000000)
    없으면 null.
- small_business_only: 소기업/소상공인 한정 여부. true/false/null.
- joint_venture_required: 공동도급 의무 여부. true/false/null.
- other_requirements: 위에 안 들어가는 기타 요건 한 줄씩 배열. (예: "방제업 등록", "장비 보유 증빙")
    없으면 null.
- raw_summary: 자격요건 섹션 원문에서 가장 핵심적인 내용 1~2문장 그대로 인용.

[금지]
- 본문에 없는 항목 추측 금지.
- 일반론적 설명 금지. 본 공고 본문에서 읽은 것만.`;

export class QualConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QualConfigError";
  }
}

let _ai: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new QualConfigError("GEMINI_API_KEY가 설정되지 않았습니다.");
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

export async function extractQualification(text: string): Promise<QualificationDetails> {
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
              "다음은 입찰 공고 본문입니다. 시스템 가이드와 응답 스키마에 정확히 맞춰 자격요건만 추출하세요.\n\n" +
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
      temperature: 0,
    },
  });

  const txt = response.text ?? "";
  if (!txt) throw new Error("Gemini 빈 응답");

  const parsed = safeParseJson(txt);
  return QualificationSchema.parse(parsed);
}

// ─────────────────────────────────────────────────────────────
// 매칭: PDF 추출 결과 vs 새빛조경 자격
// ─────────────────────────────────────────────────────────────

export type EligibilityResult = {
  eligible: boolean;
  status: "GO" | "조건부" | "NO-GO";
  reasons: { ok: string[]; warn: string[]; fail: string[] };
};

export function checkEligibility(
  q: QualificationDetails,
  myCompany: MyCompany,
): EligibilityResult {
  const ok: string[] = [];
  const warn: string[] = [];
  const fail: string[] = [];

  // 1) 면허 매칭
  if (q.required_licenses && q.required_licenses.length > 0) {
    const matched = q.required_licenses.filter((lic) =>
      MY_QUALIFICATIONS.industryKeywords.some((kw) => lic.includes(kw)),
    );
    const blocked = q.required_licenses.filter((lic) =>
      MY_QUALIFICATIONS.disqualifyKeywords.some((kw) => lic.includes(kw)),
    );
    if (blocked.length > 0) {
      fail.push(`✗ 면허 부적합: ${blocked.join(", ")} 필요 (없음)`);
    }
    if (matched.length > 0) {
      ok.push(`✓ 면허 충족: ${matched.join(", ")}`);
    } else if (blocked.length === 0) {
      warn.push(`⚠ 면허 ${q.required_licenses.join(", ")} 요구 — 본인 보유 여부 수동 확인 필요`);
    }
  } else {
    warn.push("⚠ 면허 요건 명시 없음 — 공고 원문 직접 확인 권장");
  }

  // 2) 지역 제한
  if (q.region_limit && q.region_limit !== "전국") {
    if (q.region_limit.includes("안산") || q.region_limit.includes(MY_QUALIFICATIONS.homeRegion)) {
      ok.push(`✓ 지역 충족: ${q.region_limit}`);
    } else if (q.region_limit.includes("경기도") || q.region_limit.includes("경기")) {
      ok.push(`✓ 지역 충족: ${q.region_limit} (경기도 소재)`);
    } else {
      fail.push(`✗ 지역 제한: ${q.region_limit}`);
    }
  }

  // 3) 시공능력평가
  if (q.ability_eval_min != null) {
    const myAbility = MY_QUALIFICATIONS.cnstrtnAbltyEvlAmt;
    if (myAbility == null) {
      warn.push(
        `⚠ 시평 ${(q.ability_eval_min / 100_000_000).toFixed(0)}억 이상 요구 — 본인 시평액 미입력 (수동 확인)`,
      );
    } else if (myAbility >= q.ability_eval_min) {
      ok.push(`✓ 시평 충족: ${(myAbility / 100_000_000).toFixed(0)}억 ≥ ${(q.ability_eval_min / 100_000_000).toFixed(0)}억`);
    } else {
      fail.push(
        `✗ 시평 부족: ${(myAbility / 100_000_000).toFixed(0)}억 < ${(q.ability_eval_min / 100_000_000).toFixed(0)}억`,
      );
    }
  }

  // 4) 실적
  if (q.performance_required) {
    warn.push(`⚠ 실적 요건: ${q.performance_required} (수동 확인 필요)`);
  }

  // 5) 공동도급
  if (q.joint_venture_required === true) {
    warn.push("⚠ 공동도급 의무 — 단독 입찰 불가");
  }

  // 6) 소기업
  if (q.small_business_only === true) {
    warn.push("⚠ 소기업/소상공인 한정 — 본인 해당 여부 확인");
  }

  // 7) 기타
  if (q.other_requirements && q.other_requirements.length > 0) {
    for (const r of q.other_requirements) {
      const blocked = MY_QUALIFICATIONS.disqualifyKeywords.some((kw) => r.includes(kw));
      if (blocked) {
        fail.push(`✗ 기타: ${r}`);
      } else {
        warn.push(`⚠ 기타: ${r}`);
      }
    }
  }

  let status: "GO" | "조건부" | "NO-GO";
  if (fail.length > 0) status = "NO-GO";
  else if (warn.length > 0) status = "조건부";
  else status = "GO";

  return {
    eligible: fail.length === 0,
    status,
    reasons: { ok, warn, fail },
  };
}
