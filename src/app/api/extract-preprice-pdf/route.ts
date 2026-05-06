import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import { ExtractionConfigError, PDF_TEXT_LIMIT } from "@/lib/extraction/extract";
import { extractPrepriceFromText } from "@/lib/extraction/extract-preprice";
import { normalizePrepriceExtraction } from "@/lib/extraction/normalize-preprice";
import { computeLowerBound } from "@/lib/analysis/lowerBound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(req: Request) {
  // 1) multipart
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "multipart/form-data 본문이 필요합니다." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file 필드가 비어있습니다." }, { status: 400 });
  }
  if (file.type && file.type !== "application/pdf") {
    return NextResponse.json({ error: "PDF 파일만 업로드 가능합니다." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `최대 ${MAX_BYTES / 1024 / 1024}MB까지 업로드 가능합니다.` },
      { status: 413 },
    );
  }

  // 선택적 입력: 하한율 규칙을 함께 보내면 금액까지 계산해 반환.
  // 제공되지 않으면 lowerBoundAmount는 null로 반환 (추정 금지).
  const lowerBoundRateRuleRaw = formData.get("lowerBoundRateRule");
  const lowerBoundRateRule = parseOptionalNumber(lowerBoundRateRuleRaw);

  const baseAmountOverrideRaw = formData.get("baseAmount");
  const baseAmountOverride = parseOptionalNumber(baseAmountOverrideRaw);

  // 2) PDF → text
  let text: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await pdfParse(buffer);
    text = parsed.text ?? "";
  } catch (e) {
    return NextResponse.json(
      {
        error: `PDF 텍스트 추출에 실패했습니다: ${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 422 },
    );
  }

  if (!text.trim()) {
    return NextResponse.json(
      {
        error:
          "PDF에서 텍스트를 추출하지 못했습니다. 스캔본(이미지 PDF)이라면 OCR이 필요합니다. 수동 입력으로 진행해 주세요.",
      },
      { status: 422 },
    );
  }

  // 3) Gemini 추출 + 정규화 + 계산
  try {
    const raw = await extractPrepriceFromText(text);
    const extracted = normalizePrepriceExtraction(raw);

    const warnings: string[] = [];
    if (!extracted.selected_prices || !extracted.selected_numbers) {
      warnings.push(
        "추첨된 4개 번호/가격을 신뢰성 있게 추출하지 못했습니다. 수동 입력으로 보정해 주세요.",
      );
    }
    if (!extracted.base_amount && baseAmountOverride == null) {
      warnings.push("문서에서 기초금액을 찾지 못했습니다. 공고 값으로 보정이 필요합니다.");
    }

    const calculated = computeLowerBound({
      baseAmount: baseAmountOverride ?? extracted.base_amount,
      estimatedPrice: extracted.estimated_price,
      selectedPrices: extracted.selected_prices,
      selectedNumbers: extracted.selected_numbers,
      lowerBoundRateRule,
    });

    return NextResponse.json({
      data: {
        extracted,
        calculated,
      },
      meta: {
        success: calculated.calculable,
        text_length: text.length,
        used_chars: Math.min(text.length, PDF_TEXT_LIMIT),
        warnings: [...warnings, ...calculated.warnings],
      },
    });
  } catch (e) {
    return mapExtractionError(e);
  }
}

function parseOptionalNumber(v: FormDataEntryValue | null): number | null {
  if (v == null || typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function mapExtractionError(e: unknown) {
  if (e instanceof ExtractionConfigError) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY가 설정되지 않았습니다. 환경 변수를 확인하세요." },
      { status: 500 },
    );
  }

  const msg = e instanceof Error ? e.message : String(e);
  const status =
    e && typeof e === "object" && "status" in e && typeof (e as { status: unknown }).status === "number"
      ? (e as { status: number }).status
      : null;

  if (status === 429 || /quota|rate[ -]?limit|too many requests/i.test(msg)) {
    return NextResponse.json(
      { error: "Gemini API 호출 한도/쿼터에 도달했습니다. 잠시 후 다시 시도하세요." },
      { status: 429 },
    );
  }
  if (status === 401 || status === 403 || /api[_ -]?key|unauthen|permission denied/i.test(msg)) {
    return NextResponse.json(
      { error: "Gemini API 인증에 실패했습니다." },
      { status: 500 },
    );
  }
  if (status && status >= 500) {
    return NextResponse.json(
      { error: `Gemini API 일시 오류 (${status}). 잠시 후 다시 시도하세요.` },
      { status: 502 },
    );
  }
  if (/스키마|JSON|빈 응답|safety/i.test(msg)) {
    return NextResponse.json(
      { error: `자동 추출이 실패했습니다 (${msg.slice(0, 120)}). 수동 입력으로 진행해 주세요.` },
      { status: 422 },
    );
  }

  return NextResponse.json({ error: `추출 처리 실패: ${msg}` }, { status: 500 });
}
