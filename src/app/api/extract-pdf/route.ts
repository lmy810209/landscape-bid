import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import {
  ExtractionConfigError,
  extractFromText,
  PDF_TEXT_LIMIT,
} from "@/lib/extraction/extract";
import { normalizeExtraction } from "@/lib/extraction/normalize";

// pdf-parse는 Node 전용. 명시적으로 nodejs 런타임 강제.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(req: Request) {
  // 1. multipart 파싱
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

  // 2. PDF → 텍스트
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

  // 3. Gemini 호출 → 정규화
  try {
    const raw = await extractFromText(text);
    const normalized = normalizeExtraction(raw);
    return NextResponse.json({
      data: normalized,
      meta: {
        text_length: text.length,
        used_chars: Math.min(text.length, PDF_TEXT_LIMIT),
      },
    });
  } catch (e) {
    return mapExtractionError(e);
  }
}

// Gemini SDK는 Anthropic처럼 강타입 에러 클래스를 제공하지 않으므로,
// HTTP status 필드(있다면)와 메시지 패턴으로 분기한다.
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
      ? ((e as { status: number }).status)
      : null;

  if (status === 429 || /quota|rate[ -]?limit|too many requests/i.test(msg)) {
    return NextResponse.json(
      { error: "Gemini API 호출 한도/쿼터에 도달했습니다. 잠시 후 다시 시도하세요." },
      { status: 429 },
    );
  }
  if (status === 401 || status === 403 || /api[_ -]?key|unauthen|permission denied/i.test(msg)) {
    return NextResponse.json(
      { error: "Gemini API 인증에 실패했습니다. GEMINI_API_KEY를 확인하세요." },
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
    // 스키마 불일치/안전 필터/빈 응답 → 사용자에게 수동 입력으로 폴백 안내
    return NextResponse.json(
      { error: `자동 추출이 실패했습니다 (${msg.slice(0, 120)}). 수동 입력으로 진행해 주세요.` },
      { status: 422 },
    );
  }

  return NextResponse.json({ error: `추출 처리 실패: ${msg}` }, { status: 500 });
}
