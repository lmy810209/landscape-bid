import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import {
  QualConfigError,
  extractQualification,
  PDF_TEXT_LIMIT,
} from "@/lib/extraction/qualification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart/form-data 본문이 필요합니다." }, { status: 400 });
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

  let text: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await pdfParse(buffer);
    text = parsed.text ?? "";
  } catch (e) {
    return NextResponse.json(
      { error: `PDF 텍스트 추출 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 422 },
    );
  }

  if (!text.trim()) {
    return NextResponse.json(
      { error: "PDF에서 텍스트 추출 실패 (스캔본일 수 있음). 수동 확인 권장." },
      { status: 422 },
    );
  }

  try {
    const data = await extractQualification(text);
    return NextResponse.json({
      data,
      meta: { text_length: text.length, used_chars: Math.min(text.length, PDF_TEXT_LIMIT) },
    });
  } catch (e) {
    return mapError(e);
  }
}

function mapError(e: unknown) {
  if (e instanceof QualConfigError) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY가 설정되지 않았습니다." },
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
      { error: "Gemini API 호출 한도/쿼터 도달. 잠시 후 재시도." },
      { status: 429 },
    );
  }
  if (/스키마|JSON|빈 응답|safety/i.test(msg)) {
    return NextResponse.json(
      { error: `자격 추출 실패 (${msg.slice(0, 120)}). 수동 확인 권장.` },
      { status: 422 },
    );
  }
  return NextResponse.json({ error: `처리 실패: ${msg}` }, { status: 500 });
}
