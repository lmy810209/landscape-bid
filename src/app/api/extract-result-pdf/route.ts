import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import {
  PDF_TEXT_LIMIT,
  ResultExtractionConfigError,
  extractResultFromText,
} from "@/lib/extraction/extract-result";
import { normalizeResultExtraction } from "@/lib/extraction/normalize-result";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

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
  const myCompanyQueryRaw = formData.get("my_company_query");
  const myCompanyQuery =
    typeof myCompanyQueryRaw === "string" ? myCompanyQueryRaw.trim() : "";

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
  if (!myCompanyQuery) {
    return NextResponse.json(
      { error: "내 회사 식별자(사업자등록번호 또는 회사명)가 필요합니다." },
      { status: 400 },
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

  // 3. Gemini → 정규화
  try {
    const raw = await extractResultFromText(text, myCompanyQuery);
    const { prefill, myMatch } = normalizeResultExtraction(raw);
    return NextResponse.json({
      data: prefill,
      myMatch,
      meta: {
        text_length: text.length,
        used_chars: Math.min(text.length, PDF_TEXT_LIMIT),
      },
    });
  } catch (e) {
    return mapExtractionError(e);
  }
}

function mapExtractionError(e: unknown) {
  if (e instanceof ResultExtractionConfigError) {
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
  if (
    status === 401 ||
    status === 403 ||
    /api[_ -]?key|unauthen|permission denied/i.test(msg)
  ) {
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
    return NextResponse.json(
      {
        error: `자동 추출이 실패했습니다 (${msg.slice(0, 120)}). 수동 입력으로 진행해 주세요.`,
      },
      { status: 422 },
    );
  }

  return NextResponse.json({ error: `추출 처리 실패: ${msg}` }, { status: 500 });
}
