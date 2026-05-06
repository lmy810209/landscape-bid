#!/usr/bin/env node
// 단일 호출 최대 범위 + 데이터 가용 연도 확인.

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
const BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";

async function probe(label, url, params) {
  const qs = new URLSearchParams({ ServiceKey: API_KEY, type: "json", pageNo: "1", numOfRows: "1", ...params });
  const res = await fetch(`${url}?${qs.toString()}`);
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    const header = json?.response?.header ?? json?.["nkoneps.com.response.ResponseError"]?.header;
    const body = json?.response?.body;
    const hasItem = body?.items && (Array.isArray(body.items) ? body.items.length > 0 : !!body.items.item);
    console.log(`${header?.resultCode === "00" ? "✅" : "❌"} ${label}: code=${header?.resultCode} total=${body?.totalCount ?? "-"} ${hasItem ? "(items)" : ""}`);
    return { code: header?.resultCode, total: Number(body?.totalCount ?? 0) };
  } catch {
    console.log(`❌ ${label}: parse error`);
    return null;
  }
}

console.log("=== 1. PPSSrch + bizno: 최대 윈도우 탐색 ===");
const PPS = `${BASE}/getScsbidListSttusCnstwkPPSSrch`;
await probe("1개월 (Mar 24→Apr 24)", PPS, {
  inqryDiv: "1", inqryBgnDt: "202603240000", inqryEndDt: "202604242359", bizno: "4958603422",
});
await probe("1개월+1시간", PPS, {
  inqryDiv: "1", inqryBgnDt: "202603240000", inqryEndDt: "202604250059", bizno: "4958603422",
});
await probe("2개월", PPS, {
  inqryDiv: "1", inqryBgnDt: "202602240000", inqryEndDt: "202604242359", bizno: "4958603422",
});

console.log("\n=== 2. 기본 op (bizno 없이): 최대 윈도우 탐색 ===");
const SCS = `${BASE}/getScsbidListSttusCnstwk`;
await probe("3개월", SCS, { inqryDiv: "1", inqryBgnDt: "202601240000", inqryEndDt: "202604242359" });
await probe("6개월", SCS, { inqryDiv: "1", inqryBgnDt: "202510240000", inqryEndDt: "202604242359" });
await probe("1년", SCS, { inqryDiv: "1", inqryBgnDt: "202504240000", inqryEndDt: "202604242359" });
await probe("2년", SCS, { inqryDiv: "1", inqryBgnDt: "202404240000", inqryEndDt: "202604242359" });

console.log("\n=== 3. 데이터 가용 연도 (PPSSrch + bizno=샘터조경 1342875415) ===");
// 샘터조경은 안산 전문이라 오래된 이력이 있을 가능성 높음
for (const y of [2023, 2022, 2021, 2020, 2019, 2018, 2015, 2010]) {
  await probe(`${y}년 1월`, PPS, {
    inqryDiv: "1",
    inqryBgnDt: `${y}01010000`,
    inqryEndDt: `${y}01312359`,
    bizno: "1342875415",
  });
}

console.log("\n=== 4. 참고: 샘터조경 5년치 연간 요약 ===");
for (const y of [2026, 2025, 2024, 2023, 2022, 2021, 2020]) {
  let annual = 0;
  for (let m = 1; m <= 12; m++) {
    const lastDay = new Date(y, m, 0).getDate();
    const mm = String(m).padStart(2, "0");
    const r = await probe(`${y}-${mm} 샘터`, PPS, {
      inqryDiv: "1",
      inqryBgnDt: `${y}${mm}010000`,
      inqryEndDt: `${y}${mm}${String(lastDay).padStart(2, "0")}2359`,
      bizno: "1342875415",
    });
    if (r?.code === "00") annual += r.total;
  }
  console.log(`  → ${y}년 샘터조경 낙찰: ${annual}건`);
}
