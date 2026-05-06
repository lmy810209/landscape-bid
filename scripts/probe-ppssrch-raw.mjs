#!/usr/bin/env node
// PPSSrch 엔드포인트 raw 응답 확인용.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);

const API_KEY = env.NARA_API_KEY;
const URL = "https://apis.data.go.kr/1230000/as/ScsbidInfoService/getScsbidListSttusCnstwkPPSSrch";

async function probe(label, params) {
  const qs = new URLSearchParams({ ServiceKey: API_KEY, type: "json", ...params });
  const res = await fetch(`${URL}?${qs.toString()}`);
  const text = await res.text();
  console.log(`\n=== ${label} ===`);
  console.log(`HTTP ${res.status}`);
  console.log(text.slice(0, 800));
}

// 날짜 경계 규칙 탐색
const cases = [
  { label: "같은 월 23일", bgn: "202604010000", end: "202604242359" },
  { label: "동일 day 1개월 차", bgn: "202603240000", end: "202604242359" },
  { label: "1일 더 긴 1개월", bgn: "202603230000", end: "202604242359" },
  { label: "한 달 + 하루 초과", bgn: "202603010000", end: "202604012359" },
  { label: "깔끔히 3월 전체", bgn: "202603010000", end: "202603312359" },
  { label: "깔끔히 2월 전체", bgn: "202602010000", end: "202602282359" },
  { label: "2월말-3월말", bgn: "202602280000", end: "202603282359" },
];

for (const w of cases) {
  await probe(`${w.label} (${w.bgn} ~ ${w.end})`, {
    inqryDiv: "1", inqryBgnDt: w.bgn, inqryEndDt: w.end,
    bizno: "4958603422", pageNo: "1", numOfRows: "1",
  });
}
