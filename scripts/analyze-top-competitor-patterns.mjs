#!/usr/bin/env node
// 상위 10개 업체의 (B) 사정율 정밀도 + (C) 발주처 집중도 분석.
//
// 목적: 반복 낙찰이 우연인지 패턴이 있는지 확인.
// 우연 기준: 발주처 전체 낙찰 / 업체 수 = 기대 점유율.
//
// 출력: 콘솔만. UI 미반영.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const MY_BIZNO = "4958603422";
const MY_NAME = "(주)새빛조경";

async function fetchAll() {
  const all = [];
  let from = 0;
  while (true) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/public_wins?select=bidwinnr_bizno,bidwinnr_nm,dminstt_nm,sucsfbid_rate,rl_openg_dt&is_ansan=eq.true&is_bangje=eq.false&order=rl_openg_dt.asc&limit=1000&offset=${from}`,
      { headers: { apikey: KEY } }
    );
    const data = await r.json();
    if (!data.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

function quantile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function classifyPrecision(iqr) {
  if (iqr == null) return "데이터 부족";
  if (iqr < 1.0) return "정밀형 (IQR < 1.0%p)";
  if (iqr < 2.0) return "보통";
  return "분산형 (IQR ≥ 2.0%p)";
}

function pad(s, n, right = false) {
  s = String(s);
  if (s.length >= n) return s.slice(0, n);
  return right ? s.padStart(n) : s.padEnd(n);
}

const wins = await fetchAll();
console.log(`\n전체 안산∩비방제 5년 낙찰: ${wins.length}건`);

// 업체별 집계
const byBizno = {};
for (const w of wins) {
  const k = w.bidwinnr_bizno || "unknown";
  if (!byBizno[k]) byBizno[k] = { name: w.bidwinnr_nm, wins: [] };
  byBizno[k].wins.push(w);
}
const totalCompanies = Object.keys(byBizno).length;
console.log(`고유 낙찰자: ${totalCompanies}명`);
const expectedSharePerCompany = 1 / totalCompanies;
console.log(`업체 수 기준 우연 기대 점유율: ${(expectedSharePerCompany * 100).toFixed(2)}%/업체\n`);

const sorted = Object.entries(byBizno).sort((a, b) => b[1].wins.length - a[1].wins.length);
const top10 = sorted.slice(0, 10);

// 발주처별 전체 통계 (점유율 계산용)
const byAgency = {};
for (const w of wins) {
  if (!w.dminstt_nm) continue;
  byAgency[w.dminstt_nm] = (byAgency[w.dminstt_nm] || 0) + 1;
}

// ───────────────────────────────────
// 분석 1: 발주처 집중도
// ───────────────────────────────────
console.log("=".repeat(110));
console.log("분석 1: 발주처 집중도 — 상위 10개 + 새빛조경");
console.log("=".repeat(110));
console.log("열: 발주처 / 본 업체 낙찰 / 본 업체 전체 중 비중 / 발주처 전체 중 점유율 / 우연 기대 대비 배수");
console.log("-".repeat(110));

const targets = [...top10];
const myEntry = byBizno[MY_BIZNO];
if (myEntry && !top10.find(([bz]) => bz === MY_BIZNO)) {
  targets.push([MY_BIZNO, myEntry]);
}

for (const [bizno, info] of targets) {
  const isMy = bizno === MY_BIZNO;
  const totalWins = info.wins.length;
  const agencyCount = {};
  for (const w of info.wins) {
    if (!w.dminstt_nm) continue;
    agencyCount[w.dminstt_nm] = (agencyCount[w.dminstt_nm] || 0) + 1;
  }
  const top5Agencies = Object.entries(agencyCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  console.log(
    `\n${isMy ? "▶ " : ""}${pad(info.name, 26)} (${totalWins}건${isMy ? ", 본인" : ""})`
  );
  console.log("  " + pad("발주처", 30) + " " + pad("낙찰", 5, true) + " " + pad("본업체%", 8, true) + " " + pad("점유%", 7, true) + " " + pad("기대대비", 10, true));
  for (const [agency, count] of top5Agencies) {
    const totalAgencyWins = byAgency[agency] || 0;
    const myShareInAgency = totalAgencyWins > 0 ? count / totalAgencyWins : 0;
    const expectedRatio = myShareInAgency / expectedSharePerCompany;
    const ofMyTotal = (count / totalWins) * 100;
    console.log(
      "  " +
        pad(agency, 30) +
        " " +
        pad(count, 5, true) +
        " " +
        pad(ofMyTotal.toFixed(0) + "%", 8, true) +
        " " +
        pad((myShareInAgency * 100).toFixed(1) + "%", 7, true) +
        " " +
        pad(expectedRatio.toFixed(1) + "x", 10, true)
    );
  }
}

// ───────────────────────────────────
// 분석 2: 사정율 정밀도
// ───────────────────────────────────
console.log("\n" + "=".repeat(110));
console.log("분석 2: 사정율 정밀도 — IQR 기반 정밀형 vs 분산형");
console.log("=".repeat(110));
console.log(pad("업체", 26) + pad("건수", 6, true) + pad("평균", 8, true) + pad("중앙", 8, true) + pad("P25", 8, true) + pad("P75", 8, true) + pad("IQR", 8, true) + pad("min~max", 14, true) + " " + "분류");
console.log("-".repeat(110));

for (const [bizno, info] of targets) {
  const isMy = bizno === MY_BIZNO;
  const rates = info.wins.map((w) => Number(w.sucsfbid_rate)).filter((r) => !isNaN(r) && r > 0);
  const sortedRates = [...rates].sort((a, b) => a - b);
  if (sortedRates.length === 0) {
    console.log(pad((isMy ? "▶ " : "") + info.name, 26) + " 데이터 없음");
    continue;
  }
  const mean = rates.reduce((s, r) => s + r, 0) / rates.length;
  const median = quantile(sortedRates, 0.5);
  const p25 = quantile(sortedRates, 0.25);
  const p75 = quantile(sortedRates, 0.75);
  const iqr = p75 != null && p25 != null ? p75 - p25 : null;
  const min = sortedRates[0];
  const max = sortedRates[sortedRates.length - 1];
  console.log(
    pad((isMy ? "▶ " : "") + info.name, 26) +
      pad(rates.length, 6, true) +
      pad(mean.toFixed(2), 8, true) +
      pad(median.toFixed(2), 8, true) +
      pad(p25.toFixed(2), 8, true) +
      pad(p75.toFixed(2), 8, true) +
      pad(iqr != null ? iqr.toFixed(2) : "—", 8, true) +
      pad(`${min.toFixed(1)}~${max.toFixed(1)}`, 14, true) +
      " " +
      classifyPrecision(iqr)
  );
}

// ───────────────────────────────────
// 종합 메모
// ───────────────────────────────────
console.log("\n" + "=".repeat(110));
console.log("주의:");
console.log("  - 본 분석은 운영 패턴 관찰일 뿐, 관계·담합·정보 우위로 단정하지 않음.");
console.log("  - 발주처 반복 집중도, 선택적 진입 가능성, 사정율 운영 폭만 표시.");
console.log("  - 우연 대비 배수 = 본 업체의 발주처 점유율 / (1/전체업체수).");
console.log("    예: 5x = 우연이면 기대 점유율의 5배만큼 그 발주처에 반복 낙찰.");
console.log("=".repeat(110));
