#!/usr/bin/env node
// 공공데이터포털 나라장터 API 테스트 호출 — 스코프 2 데이터 레이어 실측.
//
// 대상 공고: R26BK01294519 (2026년 상반기 상록구 가로수 민원처리공사)
//   - 새빛조경 1등 낙찰 (77,374,350원, 투찰률 90.327%)
//   - 참여 68건, 정상 26 / 낙찰하한선 미달 42
//
// 호출 API 4종:
//   1) getScsbidListSttusCnstwk           — 낙찰자 정보 (rank 1만)
//   2) getOpengResultListInfoCnstwk        — 개찰결과 요약 (opengCorpInfo 한 줄)
//   3) getOpengResultListInfoCnstwkPreparPcDetail — 15개 예비가격 + 추첨횟수
//   4) getCntrctProcssIntgOpenCnstwk       — 계약과정통합 (공고→낙찰→계약 조인)
//
// 목적: 문서 스펙과 실응답 일치 확인, 필드 누락/오타 발견, 68명 전체 데이터 미제공 최종 확인.
//
// 실행: node scripts/probe-public-data-api.mjs
// 사전: .env.local 에 NARA_API_KEY=... (일반 인증키, URL 인코딩 전 원본) 추가

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const API_KEY = env.NARA_API_KEY;
if (!API_KEY) {
  console.error("❌ .env.local 에 NARA_API_KEY 가 없습니다.");
  console.error("   data.go.kr 마이페이지 → 일반 인증키(Decoding) 복사 → .env.local 에 추가");
  process.exit(1);
}

const BID_NTCE_NO = "R26BK01294519";
const SCSBID = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";
const CONTRACT = "https://apis.data.go.kr/1230000/ao/CntrctProcssIntgOpenService";

async function call(label, url, params) {
  const qs = new URLSearchParams({
    ServiceKey: API_KEY,
    type: "json",
    pageNo: "1",
    numOfRows: "50",
    ...params,
  });
  const full = `${url}?${qs.toString()}`;
  console.log(`\n=== ${label} ===`);
  console.log(`GET ${url}?${new URLSearchParams({ ...params, pageNo: "1", numOfRows: "50", ServiceKey: "***" }).toString()}`);

  const res = await fetch(full);
  const text = await res.text();

  if (!res.ok) {
    console.error(`HTTP ${res.status}`);
    console.error(text.slice(0, 500));
    return null;
  }

  try {
    const json = JSON.parse(text);
    const body = json?.response?.body;
    const header = json?.response?.header;
    console.log(`resultCode: ${header?.resultCode} / resultMsg: ${header?.resultMsg}`);
    console.log(`totalCount: ${body?.totalCount}, returned: ${Array.isArray(body?.items?.item) ? body.items.item.length : body?.items?.item ? 1 : 0}`);
    const items = body?.items?.item;
    if (Array.isArray(items) ? items.length > 0 : items) {
      const first = Array.isArray(items) ? items[0] : items;
      console.log("--- first item fields ---");
      console.log(JSON.stringify(first, null, 2));
      if (Array.isArray(items) && items.length > 1) {
        console.log(`--- ${items.length - 1} more item(s) omitted ---`);
      }
    } else {
      console.log("(no items)");
      console.log(text.slice(0, 1000));
    }
    return json;
  } catch {
    console.error("JSON parse 실패, 응답 원문 앞 1000자:");
    console.error(text.slice(0, 1000));
    return null;
  }
}

async function main() {
  console.log(`대상 공고번호: ${BID_NTCE_NO}\n`);

  await call("1. 낙찰 목록 (공사) — getScsbidListSttusCnstwk", `${SCSBID}/getScsbidListSttusCnstwk`, {
    inqryDiv: "4",
    bidNtceNo: BID_NTCE_NO,
  });

  await call("2. 개찰결과 공사 — getOpengResultListInfoCnstwk", `${SCSBID}/getOpengResultListInfoCnstwk`, {
    inqryDiv: "4",
    bidNtceNo: BID_NTCE_NO,
  });

  await call("3. 예비가격상세 — getOpengResultListInfoCnstwkPreparPcDetail", `${SCSBID}/getOpengResultListInfoCnstwkPreparPcDetail`, {
    inqryDiv: "2",
    bidNtceNo: BID_NTCE_NO,
  });

  await call("4. 계약과정통합 — getCntrctProcssIntgOpenCnstwk", `${CONTRACT}/getCntrctProcssIntgOpenCnstwk`, {
    inqryDiv: "1",
    bidNtceNo: BID_NTCE_NO,
  });

  console.log("\n✅ 4개 API 호출 완료. 각 응답의 field 이름이 문서와 일치하는지 확인하세요.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
