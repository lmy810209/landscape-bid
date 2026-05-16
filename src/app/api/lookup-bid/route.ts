// 공고번호 → 3개 공공데이터 API 조회 → BidForm prefill 생성.
//
// 입력: { bidNtceNo, bidNtceOrd? }
// 호출:
//   1) 입찰공고정보서비스 (15129394) — 공고 메타 + 낙찰하한율
//   2) 낙찰정보서비스 (15129397) — 낙찰자 정보 (개찰 후만 존재)
//   3) 예비가격상세 (15129397) — 15개 예비가격 + 예정가격/기초금액 (개찰 후만 존재)
//
// 본인 회사(새빛조경) 매칭은 bizno 4958603422.
// API에 없는 항목(my_bid_amount, second_amount): null. 사용자 직접 입력.
//
// 응답: { found: boolean, prefill: ResultPrefill 형태, sourceFlags: {...} }

import { NextResponse } from "next/server";
import type { ResultPrefill } from "@/lib/extraction/normalize-result";
import type { WorkType, ResultStatus } from "@/types/bid";
import { MY_BIZNO } from "@/lib/config/myCompany";

const NOT_FOUND_RESPONSE = NextResponse.json({ found: false, error: "공고를 찾을 수 없습니다" }, { status: 404 });

const BASE_NOTICE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";
const BASE_RESULT = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";

async function fetchApi<T = unknown>(url: string, params: Record<string, string>): Promise<T | null> {
  const apiKey = process.env.NARA_API_KEY;
  if (!apiKey) throw new Error("NARA_API_KEY 미설정");
  const qs = new URLSearchParams({ ServiceKey: apiKey, type: "json", ...params });
  const res = await fetch(`${url}?${qs.toString()}`, { cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json();
  const header = json?.response?.header ?? json?.["nkoneps.com.response.ResponseError"]?.header;
  if (header?.resultCode !== "00") return null;
  return json.response.body as T;
}

type ApiArrayBody<T> = { items: T[] | { item: T | T[] } | null; totalCount: number | string };

function unwrapItems<T>(body: ApiArrayBody<T> | null): T[] {
  if (!body) return [];
  const items = body.items;
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if ("item" in items) {
    const inner = items.item;
    return Array.isArray(inner) ? inner : inner ? [inner] : [];
  }
  return [];
}

const numOrNull = (v: unknown): number | null => {
  if (v == null || v === "" || v === "N/A") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const strOrNull = (v: unknown): string | null => {
  if (v == null || v === "" || v === "N/A") return null;
  return String(v);
};

const tsToDate = (v: unknown): string | null => {
  const s = strOrNull(v);
  if (!s) return null;
  return s.length >= 10 ? s.slice(0, 10) : null;
};

// 공고명·주공종으로 work_type 추정 (실패 시 "유지관리" 기본)
function inferWorkType(noticeName: string, mainCnstty: string | null): WorkType {
  const t = `${noticeName} ${mainCnstty ?? ""}`;
  if (/식재|보식|이식/.test(t)) return "조경식재";
  if (/시설물|놀이|벤치|운동/.test(t)) return "조경시설물";
  if (/조성|신설|설치/.test(t) && !/유지|관리|민원/.test(t)) return "조경시공";
  if (/유지|관리|민원|전정|가로수|녹지|잔디|화단/.test(t)) return "유지관리";
  return "기타";
}

export async function POST(req: Request) {
  let body: { bidNtceNo?: string; bidNtceOrd?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문 필요" }, { status: 400 });
  }
  const bidNtceNo = body.bidNtceNo?.trim();
  if (!bidNtceNo) {
    return NextResponse.json({ error: "bidNtceNo 필수" }, { status: 400 });
  }
  const bidNtceOrd = body.bidNtceOrd?.trim() || "000";

  // 4개 API 병렬 호출 — 일부 실패해도 나머지는 살림 (allSettled)
  const settled = await Promise.allSettled([
    fetchApi<ApiArrayBody<Record<string, unknown>>>(`${BASE_NOTICE}/getBidPblancListInfoCnstwk`, {
      inqryDiv: "2",
      bidNtceNo,
      pageNo: "1",
      numOfRows: "1",
    }),
    fetchApi<ApiArrayBody<Record<string, unknown>>>(`${BASE_RESULT}/getScsbidListSttusCnstwk`, {
      inqryDiv: "4",
      bidNtceNo,
      pageNo: "1",
      numOfRows: "1",
    }),
    fetchApi<ApiArrayBody<Record<string, unknown>>>(
      `${BASE_RESULT}/getOpengResultListInfoCnstwkPreparPcDetail`,
      { inqryDiv: "2", bidNtceNo, pageNo: "1", numOfRows: "20" },
    ),
    fetchApi<ApiArrayBody<Record<string, unknown>>>(
      `${BASE_RESULT}/getOpengResultListInfoOpengCompt`,
      { inqryDiv: "4", bidNtceNo, pageNo: "1", numOfRows: "500" },
    ),
  ]);
  const pick = <T,>(s: PromiseSettledResult<T | null>) => (s.status === "fulfilled" ? s.value : null);
  const noticeBody = pick(settled[0]);
  const winsBody = pick(settled[1]);
  const prepricesBody = pick(settled[2]);
  const openCompletedBody = pick(settled[3]);
  const failedApis = settled
    .map((s, i) => (s.status === "rejected" ? ["notice", "wins", "preprices", "participants"][i] : null))
    .filter(Boolean) as string[];

  const notice = unwrapItems(noticeBody)[0] ?? null;
  const win = unwrapItems(winsBody)[0] ?? null;
  const preprices = unwrapItems(prepricesBody);
  const participants = unwrapItems(openCompletedBody);

  if (!notice && !win && participants.length === 0) {
    return NOT_FOUND_RESPONSE;
  }

  // 본인 참여 정보 매칭
  const myRow = participants.find((p) => strOrNull(p.prcbdrBizno) === MY_BIZNO);
  const winnerRow = participants.find((p) => strOrNull(p.opengRank) === "1") ?? null;
  const runnerUpRow = participants.find((p) => strOrNull(p.opengRank) === "2") ?? null;

  // 본인 낙찰 여부
  const winnerBizno = strOrNull(win?.bidwinnrBizno) ?? strOrNull(winnerRow?.prcbdrBizno);
  const isMyWin = winnerBizno === MY_BIZNO;
  const myParticipated = !!myRow;

  // 기초금액·예정가격: 개찰 후엔 preprices에 정확값. 개찰 전이면 입찰공고에서 추정 (bdgtAmt)
  const baseFromPreprice = preprices[0] ? numOrNull(preprices[0].bssamt) : null;
  const baseFromNotice = notice ? numOrNull(notice.bdgtAmt) : null;
  const base_amount = baseFromPreprice ?? baseFromNotice;
  const estimated_price = preprices[0] ? numOrNull(preprices[0].plnprc) : null;

  const noticeName = strOrNull(notice?.bidNtceNm) ?? strOrNull(win?.bidNtceNm) ?? "";
  const agency = strOrNull(notice?.dminsttNm) ?? strOrNull(win?.dminsttNm);
  const region = strOrNull(notice?.cnstrtsiteRgnNm);
  const bidDate =
    tsToDate(win?.rlOpengDt) ??
    tsToDate(notice?.opengDt) ??
    tsToDate(notice?.bidNtceDt);

  const sucsfbidLwltRate = notice ? numOrNull(notice.sucsfbidLwltRate) : null;
  const bidMethodNm = strOrNull(notice?.sucsfbidMthdNm) ?? strOrNull(notice?.bidMethdNm);

  // 결과 상태 자동 판정
  // - 본인 row 있음:
  //   · rmrk가 "정상"이고 opengRank=1 → "낙찰"
  //   · rmrk가 "정상"이고 opengRank=2 → "2등"
  //   · rmrk가 "정상"이고 opengRank>2 → "순위권밖"
  //   · rmrk가 "낙찰하한선미달" → "낙찰하한선미달"
  // - 본인 row 없음: 비워둠 (사용자가 직접 결정)
  const myRank = myRow ? Number(strOrNull(myRow.opengRank)) : null;
  const myRmrk = myRow ? strOrNull(myRow.rmrk) ?? "" : "";
  let result_status: ResultStatus | "" = "";
  if (myParticipated) {
    if (myRmrk.includes("미달")) result_status = "낙찰하한선미달";
    else if (myRank === 1) result_status = "낙찰";
    else if (myRank === 2) result_status = "2등";
    else if (myRank != null && myRank > 2) result_status = "순위권밖";
  }

  // 본인 투찰 정보
  const my_bid_amount = myRow ? numOrNull(myRow.bidprcAmt) : null;
  const my_bidprcrt = myRow ? numOrNull(myRow.bidprcrt) : null;

  // 2등 금액 (참가자 데이터에서)
  const second_amount = runnerUpRow ? numOrNull(runnerUpRow.bidprcAmt) : null;

  // 1등 (winning_amount)
  const winning_amount =
    numOrNull(win?.sucsfbidAmt) ?? (winnerRow ? numOrNull(winnerRow.bidprcAmt) : null);

  // 참가업체수
  const participant_count =
    numOrNull(win?.prtcptCnum) ?? (participants.length > 0 ? participants.length : null);

  // note: 낙찰하한율 + 낙찰자 + 본인 투찰률 + 추첨번호 자동 기록
  const noteParts: string[] = [];
  if (sucsfbidLwltRate != null) noteParts.push(`낙찰하한율 ${sucsfbidLwltRate}%`);
  if (winnerBizno && !isMyWin) {
    const winnerName = strOrNull(win?.bidwinnrNm) ?? strOrNull(winnerRow?.prcbdrNm);
    noteParts.push(`낙찰자: ${winnerName} (${winnerBizno})`);
  }
  if (myParticipated && myRow) {
    const dn1 = strOrNull(myRow.drwtNo1)?.trim();
    const dn2 = strOrNull(myRow.drwtNo2)?.trim();
    if (dn1 || dn2) noteParts.push(`내 추첨번호: ${dn1 ?? "?"} ${dn2 ?? "?"}`);
    if (my_bidprcrt != null) noteParts.push(`내 투찰률: ${my_bidprcrt}%`);
    if (myRank != null) noteParts.push(`내 순위: ${myRank}/${participants.length}`);
  }
  if (notice?.mainCnsttyNm) noteParts.push(`주공종: ${strOrNull(notice.mainCnsttyNm)}`);
  const note = noteParts.length ? noteParts.join(" / ") : null;

  const prefill: ResultPrefill = {
    notice_no: bidNtceNo,
    notice_title: noticeName || null,
    agency,
    work_type: inferWorkType(noticeName, strOrNull(notice?.mainCnsttyNm)),
    region,
    base_amount,
    estimated_price,
    bid_date: bidDate,
    bid_method: bidMethodNm,
    qualification_limit: strOrNull(notice?.mainCnsttyNm),
    participant_count,
    my_bid_amount,
    winning_amount,
    second_amount,
    result_status: result_status as ResultStatus,
    note,
  };

  return NextResponse.json({
    found: true,
    prefill,
    sourceFlags: {
      hasNotice: !!notice,
      hasWin: !!win,
      hasPreprices: preprices.length > 0,
      isMyWin,
      myParticipated,
      myRank,
      myRmrk: myRmrk || null,
      participantCount: participants.length,
      sucsfbidLwltRate,
      failedApis,
    },
  });
}
