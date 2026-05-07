#!/usr/bin/env node
// 보험료 감액 공고 vs 일반 공고에서 상위 업체 정상 진입 패턴.
// notice-methods.json 캐시 사용.

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

const methods = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "notice-methods.json"), "utf8"));

// 보험료 감액 분류
const insuranceNotices = new Set();
const normalNotices = new Set();
let totalKnown = 0, missingMethod = 0;
for (const [no, m] of Object.entries(methods)) {
  if (!m || !m.sucsfbid_method) {
    missingMethod++;
    continue;
  }
  totalKnown++;
  const txt = m.sucsfbid_method;
  if (txt.includes("소액수의견적") && (txt.includes("국민연금") || txt.includes("감액") || txt.includes("보험료") || txt.includes("합산액"))) {
    insuranceNotices.add(no);
  } else {
    normalNotices.add(no);
  }
}
console.log(`총 메타 ${totalKnown} / 메타 누락 ${missingMethod}`);
console.log(`보험료 감액 공고: ${insuranceNotices.size}건 (${(insuranceNotices.size / totalKnown * 100).toFixed(1)}%)`);
console.log(`일반 공고: ${normalNotices.size}건\n`);

// 참여자 데이터
async function fetchAll(table, query) {
  const all = [];
  let from = 0;
  while (true) {
    const r = await fetch(`${URL_BASE}/rest/v1/${table}?${query}&limit=1000&offset=${from}`, { headers: { apikey: KEY } });
    const d = await r.json();
    if (!d.length) break;
    all.push(...d);
    if (d.length < 1000) break;
    from += 1000;
  }
  return all;
}
const allIds = [...insuranceNotices, ...normalNotices];
console.log("참여자 로딩...");
const participants = [];
for (let i = 0; i < allIds.length; i += 100) {
  const chunk = allIds.slice(i, i + 100);
  const inList = chunk.map((id) => encodeURIComponent(id)).join(",");
  const data = await fetchAll(
    "public_participants",
    `select=bid_ntce_no,prcbdr_bizno,bidprcrt,rmrk&bid_ntce_no=in.(${inList})`
  );
  participants.push(...data);
}
console.log(`참여자 ${participants.length}명\n`);

function pad(s, n, right = false) {
  s = String(s);
  if (s.length >= n) return s.slice(0, n);
  return right ? s.padStart(n) : s.padEnd(n);
}
function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

console.log("=".repeat(110));
console.log("① 상위 업체 정상 진입률 — 보험료 감액 vs 일반");
console.log("=".repeat(110));
console.log(pad("업체", 14) + "  보험료감액 진입         | 일반 진입             | 차이 (%p) | 평가");
console.log("-".repeat(110));
for (const t of TARGETS) {
  const myEntries = participants.filter((p) => p.prcbdr_bizno === t.bizno && p.rmrk === "정상");
  const insIn = new Set();
  const normIn = new Set();
  for (const p of myEntries) {
    if (insuranceNotices.has(p.bid_ntce_no)) insIn.add(p.bid_ntce_no);
    else if (normalNotices.has(p.bid_ntce_no)) normIn.add(p.bid_ntce_no);
  }
  const insRate = insuranceNotices.size > 0 ? (insIn.size / insuranceNotices.size) * 100 : 0;
  const normRate = normalNotices.size > 0 ? (normIn.size / normalNotices.size) * 100 : 0;
  const diff = insRate - normRate;
  const arrow =
    diff < -10 ? "🚫 회피 경향" :
    diff < -5 ? "⚠ 약한 회피" :
    diff > 10 ? "선호" :
    diff > 5 ? "약한 선호" : "차이 없음";
  console.log(
    pad(t.name, 14) +
      pad(`${insIn.size}/${insuranceNotices.size} (${insRate.toFixed(0)}%)`, 22) +
      "  | " +
      pad(`${normIn.size}/${normalNotices.size} (${normRate.toFixed(0)}%)`, 22) +
      "  | " +
      pad((diff > 0 ? "+" : "") + diff.toFixed(1) + "%p", 11, true) +
      "  | " +
      arrow
  );
}

// ② 사정율 분포 비교
console.log("\n" + "=".repeat(110));
console.log("② 정상 진입 사정율 비교 — 보험료 감액 vs 일반");
console.log("=".repeat(110));
console.log(pad("업체", 14) + "  감액 평균 / 중앙       | 일반 평균 / 중앙       | 차이 (%p)");
console.log("-".repeat(110));
for (const t of TARGETS) {
  const myEntries = participants.filter((p) => p.prcbdr_bizno === t.bizno && p.rmrk === "정상");
  const insRates = myEntries.filter((p) => insuranceNotices.has(p.bid_ntce_no)).map((p) => Number(p.bidprcrt)).filter((r) => !isNaN(r));
  const normRates = myEntries.filter((p) => normalNotices.has(p.bid_ntce_no)).map((p) => Number(p.bidprcrt)).filter((r) => !isNaN(r));
  if (insRates.length === 0 && normRates.length === 0) continue;
  const insMean = insRates.length ? insRates.reduce((s, r) => s + r, 0) / insRates.length : null;
  const normMean = normRates.length ? normRates.reduce((s, r) => s + r, 0) / normRates.length : null;
  const insMed = median(insRates);
  const normMed = median(normRates);
  const diff = insMean != null && normMean != null ? insMean - normMean : null;
  console.log(
    pad(t.name, 14) +
      pad(insMean != null ? `${insMean.toFixed(2)} / ${insMed.toFixed(2)} (${insRates.length})` : "—", 22) +
      "  | " +
      pad(normMean != null ? `${normMean.toFixed(2)} / ${normMed.toFixed(2)} (${normRates.length})` : "—", 22) +
      "  | " +
      pad(diff != null ? (diff > 0 ? "+" : "") + diff.toFixed(2) : "—", 10, true)
  );
}

// ③ 보험료 감액 공고에서 정상 진입자 cutoff 분포 (도구의 effective cutoff 추정 검증)
console.log("\n" + "=".repeat(110));
console.log("③ 보험료 감액 공고 — 정상 진입자 사정율 분포 (effective cutoff 추정)");
console.log("=".repeat(110));
const insRatesAll = participants
  .filter((p) => p.rmrk === "정상" && insuranceNotices.has(p.bid_ntce_no))
  .map((p) => Number(p.bidprcrt))
  .filter((r) => !isNaN(r))
  .sort((a, b) => a - b);
const normRatesAll = participants
  .filter((p) => p.rmrk === "정상" && normalNotices.has(p.bid_ntce_no))
  .map((p) => Number(p.bidprcrt))
  .filter((r) => !isNaN(r))
  .sort((a, b) => a - b);

function quantile(s, p) { return s[Math.floor(s.length * p)] ?? null; }
console.log(`보험료 감액: 정상 ${insRatesAll.length}명 | 평균 ${(insRatesAll.reduce((s, r) => s + r, 0) / insRatesAll.length).toFixed(2)}% | min ${insRatesAll[0]}% | P25 ${quantile(insRatesAll, 0.25)}% | 중앙 ${quantile(insRatesAll, 0.5)}%`);
console.log(`일반:        정상 ${normRatesAll.length}명 | 평균 ${(normRatesAll.reduce((s, r) => s + r, 0) / normRatesAll.length).toFixed(2)}% | min ${normRatesAll[0]}% | P25 ${quantile(normRatesAll, 0.25)}% | 중앙 ${quantile(normRatesAll, 0.5)}%`);

// per-notice cutoff 차이
const insCutoffs = {};
const normCutoffs = {};
for (const p of participants) {
  if (p.rmrk !== "정상") continue;
  const r = Number(p.bidprcrt);
  if (isNaN(r)) continue;
  if (insuranceNotices.has(p.bid_ntce_no)) {
    insCutoffs[p.bid_ntce_no] = Math.min(insCutoffs[p.bid_ntce_no] ?? 999, r);
  } else if (normalNotices.has(p.bid_ntce_no)) {
    normCutoffs[p.bid_ntce_no] = Math.min(normCutoffs[p.bid_ntce_no] ?? 999, r);
  }
}
const insCutoffArr = Object.values(insCutoffs).sort((a, b) => a - b);
const normCutoffArr = Object.values(normCutoffs).sort((a, b) => a - b);
console.log(`\nper-공고 effective cutoff (각 공고 정상 최저 사정율):`);
console.log(`보험료 감액 ${insCutoffArr.length}공고 — min ${insCutoffArr[0]}, P25 ${quantile(insCutoffArr, 0.25)}, 중앙 ${quantile(insCutoffArr, 0.5)}, P75 ${quantile(insCutoffArr, 0.75)}`);
console.log(`일반        ${normCutoffArr.length}공고 — min ${normCutoffArr[0]}, P25 ${quantile(normCutoffArr, 0.25)}, 중앙 ${quantile(normCutoffArr, 0.5)}, P75 ${quantile(normCutoffArr, 0.75)}`);

console.log("\n" + "=".repeat(110));
console.log("⚠ 본 분석은 운영 패턴 관찰. 회피·담합·정보 우위로 단정하지 않음.");
console.log("=".repeat(110));
