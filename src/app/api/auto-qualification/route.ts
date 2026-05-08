// 공고번호 → BidPublicInfoService 메타 → 공고문 PDF 자동 다운로드 → Gemini 자격 추출 + 매칭.

import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import {
  extractQualification,
  checkEligibility,
  QualConfigError,
  type QualificationDetails,
} from "@/lib/extraction/qualification";
import { DEFAULT_MY_COMPANY } from "@/lib/config/myCompany";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const NARA_BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";

type FileRef = { url: string; name: string };

type ApiItem = Record<string, string | number | null | undefined>;

async function fetchNoticeMeta(bidNtceNo: string): Promise<ApiItem | null> {
  const apiKey = process.env.NARA_API_KEY;
  if (!apiKey) throw new Error("NARA_API_KEY 미설정");
  const qs = new URLSearchParams({
    ServiceKey: apiKey,
    type: "json",
    inqryDiv: "2",
    bidNtceNo,
    pageNo: "1",
    numOfRows: "1",
  });
  const r = await fetch(`${NARA_BASE}/getBidPblancListInfoCnstwk?${qs.toString()}`, { cache: "no-store" });
  if (!r.ok) return null;
  const j = await r.json();
  const items = j?.response?.body?.items;
  if (!items) return null;
  const arr = Array.isArray(items) ? items : items.item ? (Array.isArray(items.item) ? items.item : [items.item]) : [];
  return (arr[0] as ApiItem) ?? null;
}

function extractNoticeFile(item: ApiItem): FileRef | null {
  // ntceSpecDocUrl1~10 + ntceSpecFileNm1~10 — "공고문" 키워드 첫 매치
  for (let i = 1; i <= 10; i++) {
    const url = item[`ntceSpecDocUrl${i}`] as string | undefined;
    const name = item[`ntceSpecFileNm${i}`] as string | undefined;
    if (!url || !name) continue;
    if (name.includes("공고문") || name.startsWith("공고")) {
      return { url, name };
    }
  }
  // fallback: 첫 번째 파일
  const url = item.ntceSpecDocUrl1 as string | undefined;
  const name = item.ntceSpecFileNm1 as string | undefined;
  if (url && name) return { url, name };
  return null;
}

async function downloadPdf(url: string): Promise<Buffer> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`PDF 다운로드 실패: HTTP ${r.status}`);
  const ab = await r.arrayBuffer();
  const buf = Buffer.from(ab);
  const head = buf.subarray(0, 4).toString("ascii");
  if (head.startsWith("%PDF")) return buf;
  // ZIP은 PK\x03\x04 또는 PK\x05\x06 시작 — 조달청이 첨부를 zip 패키징한 경우
  if (head.startsWith("PK")) {
    throw new Error(
      "공고 첨부가 ZIP 파일입니다 (조달청 일부 공고). 직접 다운로드 후 위 '자격 자동 체크' 카드에서 PDF 수동 업로드 권장.",
    );
  }
  throw new Error(`PDF 형식 아님 (첫 4바이트: ${head})`);
}

export async function POST(req: Request) {
  let body: { notice_no?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문 필요" }, { status: 400 });
  }
  const noticeNo = body.notice_no?.trim();
  if (!noticeNo) {
    return NextResponse.json({ error: "notice_no 필수" }, { status: 400 });
  }

  try {
    const meta = await fetchNoticeMeta(noticeNo);
    if (!meta) {
      return NextResponse.json({ error: "공고 메타 못 가져옴" }, { status: 404 });
    }
    const file = extractNoticeFile(meta);
    if (!file) {
      return NextResponse.json({ error: "공고문 첨부파일 없음" }, { status: 404 });
    }
    const pdfBuf = await downloadPdf(file.url);
    const parsed = await pdfParse(pdfBuf);
    const text = parsed.text ?? "";
    if (!text.trim()) {
      return NextResponse.json(
        { error: "PDF 텍스트 추출 실패 (스캔본 가능). 수동 업로드 권장." },
        { status: 422 },
      );
    }
    const data: QualificationDetails = await extractQualification(text);
    const result = checkEligibility(data, DEFAULT_MY_COMPANY);
    return NextResponse.json({
      file: { name: file.name, size: pdfBuf.length },
      data,
      result,
    });
  } catch (e) {
    if (e instanceof QualConfigError) {
      return NextResponse.json({ error: "GEMINI_API_KEY 미설정" }, { status: 500 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (/quota|429|rate/i.test(msg)) {
      return NextResponse.json({ error: "API 한도 도달. 잠시 후 재시도" }, { status: 429 });
    }
    return NextResponse.json({ error: `자격 자동 분석 실패: ${msg}` }, { status: 500 });
  }
}
