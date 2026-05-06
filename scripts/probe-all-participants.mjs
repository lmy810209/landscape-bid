#!/usr/bin/env node
// 낙찰정보서비스의 미확인 오퍼레이션들 — 모든 참여자 데이터가 API로 나오는지 검증.
// 어제 공고 R26BK01294519 (참여 68명) 으로 테스트.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const API_KEY = env.NARA_API_KEY;
const BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";
const BID = "R26BK01294519";

async function probe(label, op, params) {
  const qs = new URLSearchParams({ ServiceKey: API_KEY, type: "json", pageNo: "1", numOfRows: "100", ...params });
  const res = await fetch(`${BASE}/${op}?${qs.toString()}`);
  const text = await res.text();
  console.log(`\n=== ${label} (${op}) ===`);
  console.log(`HTTP ${res.status}`);
  let json;
  try { json = JSON.parse(text); } catch { console.log(text.slice(0, 500)); return; }
  const header = json?.response?.header ?? json?.["nkoneps.com.response.ResponseError"]?.header;
  console.log(`code=${header?.resultCode} msg=${header?.resultMsg}`);
  if (header?.resultCode !== "00") return;
  const body = json.response.body;
  console.log(`totalCount=${body?.totalCount}`);
  const items = body?.items ?? [];
  const arr = Array.isArray(items) ? items : items?.item ? (Array.isArray(items.item) ? items.item : [items.item]) : [];
  console.log(`returned=${arr.length}`);
  if (arr[0]) {
    console.log("first item keys:", Object.keys(arr[0]).join(", "));
    console.log("first item full:");
    console.log(JSON.stringify(arr[0], null, 2));
  }
  if (arr.length > 1 && arr.length <= 100) {
    console.log(`\n--- 두번째~끝까지 핵심 필드 ---`);
    arr.slice(0, 10).forEach((it, i) => {
      const summary = Object.entries(it).map(([k, v]) => `${k}=${v}`).slice(0, 6).join(" | ");
      console.log(`  [${i + 1}] ${summary}`);
    });
  }
}

await probe("13. 개찰완료 목록", "getOpengResultListInfoOpengCompt", {
  inqryDiv: "4", bidNtceNo: BID,
});

await probe("14. 유찰 목록", "getOpengResultListInfoFailing", {
  inqryDiv: "4", bidNtceNo: BID,
});

await probe("15. 재입찰 목록", "getOpengResultListInfoRebid", {
  inqryDiv: "4", bidNtceNo: BID,
});

// PPSSrch 변형 (16~23)
await probe("21. 개찰결과 PPSSrch (공사)", "getOpengResultListInfoCnstwkPPSSrch", {
  inqryDiv: "4", bidNtceNo: BID,
});

// 새빛조경 bizno로 PPSSrch — 본인 참여 공고 검색
await probe("17. 낙찰목록 PPSSrch + 새빛 bizno", "getScsbidListSttusCnstwkPPSSrch", {
  inqryDiv: "1", inqryBgnDt: "202602010000", inqryEndDt: "202602282359", bizno: "4958603422",
});

await probe("21. 개찰결과 PPSSrch + 새빛 bizno", "getOpengResultListInfoCnstwkPPSSrch", {
  inqryDiv: "1", inqryBgnDt: "202602010000", inqryEndDt: "202602282359", bizno: "4958603422",
});
