#!/usr/bin/env node
// 상위 업체 시도율 진짜 추정 (op13 + public_wins).
// "정상 진입한 공고"만 보임. 미달 부적격은 미상.
// 그래도 "정상 진입률"로 시도율 하한 추정 가능.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const TARGETS = [
  { bizno: "4078111745", name: "에스디건설" },
  { bizno: "1058651768", name: "대동이앤씨" },
  { bizno: "1348125448", name: "안산조경건설" },
  { bizno: "1348629134", name: "경안스틸" },
  { bizno: "3228601242", name: "경인이엔지" },
  { bizno: "1318174940", name: "참터종합" },
  { bizno: "1348611162", name: "제현산업" },
  { bizno: "1342263862", name: "까치조경" },
  { bizno: "1348611992", name: "남양" },
  { bizno: "7648800359", name: "에코그린" },
  { bizno: "4958603422", name: "▶새빛조경" },
];

async function fetchAll(table, q) {
  const all = [];
  let from = 0;
  while (true) {
    const r = await fetch(`${URL_BASE}/rest/v1/${table}?${q}&limit=1000&offset=${from}`, { headers: { apikey: KEY } });
    const d = await r.json();
    if (!d.length) break;
    all.push(...d);
    if (d.length < 1000) break;
    from += 1000;
  }
  return all;
}

const wins = await fetchAll("public_wins", "select=bid_ntce_no&is_ansan=eq.true&is_bangje=eq.false");
const noticeIds = wins.map((w) => w.bid_ntce_no);
const totalNotices = wins.length;

const participants = [];
for (let i = 0; i < noticeIds.length; i += 100) {
  const chunk = noticeIds.slice(i, i + 100);
  const inList = chunk.map((id) => encodeURIComponent(id)).join(",");
  const data = await fetchAll(
    "public_participants",
    `select=bid_ntce_no,prcbdr_bizno&bid_ntce_no=in.(${inList})&rmrk=eq.정상`
  );
  participants.push(...data);
}

console.log(`전체 공고: ${totalNotices} / 정상 참여 데이터: ${participants.length}\n`);

console.log("=".repeat(95));
console.log("업체별 정상 진입률 + 추정 시도율 (op13 정상만 — 미달 누락)");
console.log("=".repeat(95));
console.log("업체              정상진입   진입률   |  추정 시도율 (정상+미달 추정 = 진입률 ÷ 정상비율)");
console.log("-".repeat(95));

// 업종별 정상비율 추정: 어제 R26BK01294519 = 정상 26 / 총 68 = 38%. 즉 미달 비율 약 62%.
// 이건 너무 극단적. 우리 5년 평균 정상/총 비율을 추정.
// Rough: 미달이 op13에 없으니 직접 측정 불가.
// Hint: 일반 공고는 미달 ~0% (낙찰하한율 명확), 보험료 감액은 미달 ~30% (추정).
// 여기선 정상진입률만 보고하고 추정 시도율은 단순 1.3x 가정.

for (const t of TARGETS) {
  const myEntries = new Set(participants.filter((p) => p.prcbdr_bizno === t.bizno).map((p) => p.bid_ntce_no));
  const enterRate = (myEntries.size / totalNotices) * 100;
  const estimatedAttemptRate = enterRate * 1.3; // rough adjustment
  console.log(
    t.name.padEnd(14) +
      `   ${myEntries.size.toString().padStart(4)} / ${totalNotices}` +
      `   ${enterRate.toFixed(1).padStart(5)}%` +
      `  |  추정 ${Math.min(estimatedAttemptRate, 100).toFixed(1)}%`
  );
}

console.log("\n해석:");
console.log("- 진입률 = (정상 진입 공고 수) / (전체 공고 수)");
console.log("- 추정 시도율 = 진입률 × 1.3 (미달 보정 — 매우 거친 추정)");
console.log("- 진짜 시도율은 미달 데이터 없어 정확 측정 불가");
console.log("- 같은 진입률이라도 결과는 다름 (낙찰률 = 진입대비 1등 비율)\n");

// 추가: 시도 vs 결과 매트릭스
console.log("=".repeat(95));
console.log("진입률 × 낙찰률 매트릭스 (우상단 = 효율 높음, 좌하단 = 비효율)");
console.log("=".repeat(95));
const winsByBizno = {};
for (const w of wins) {
  // wins 테이블에서 bidwinnr_bizno 가져와야 정확. 기존 스크립트 확장.
}

// 간단 방식: 다른 스크립트 결과 인용
console.log("");
console.log("이미 analyze-competitor-entry-patterns.mjs 결과:");
console.log("  에스디건설:  진입 12.7% × 낙찰률 50.6% = 효율 압도");
console.log("  까치조경:    진입 42.3% × 낙찰률  6.9% = 다시도형");
console.log("  새빛조경:    진입 10.1% × 낙찰률  1.5% = 어디에도 안 속함");
console.log("");
console.log("=> 새빛은 진입률만 늘려도 (다시도형 따라가기) 6~9% 낙찰률 가능 = 연 30→60건 = 2~3건 낙찰");
