#!/usr/bin/env node
// 현재까지 수집된 scope2-scan.json 심층 분석.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "scope2-scan.json"), "utf8"));

const ANSAN = /안산/;
const BANGJE = /(방제|병해충|살균|살충|소독|약제살포)/;

// 어제 공고 68명 순위 (정상 26 + 미달 42)
const YESTERDAY_STATUS = {
  "4958603422": { rank: 1, status: "정상", name: "(주)새빛조경", rate: 90.327 },
  "1342875415": { rank: 2, status: "정상", name: "샘터조경", rate: 90.329 },
  "4748703489": { rank: 3, status: "정상", name: "(주)찬미조경", rate: 90.378 },
  "1058651768": { rank: 4, status: "정상", name: "대동이앤씨주식회사", rate: 90.378 },
  "1342271760": { rank: 5, status: "정상", name: "초록환경디자인", rate: 90.481 },
  "4032106590": { rank: 6, status: "정상", name: "가람조경", rate: 90.506 },
  "8508803021": { rank: 7, status: "정상", name: "신라 주식회사", rate: 90.556 },
  "1408172761": { rank: 8, status: "정상", name: "(주)한솔조경건설", rate: 90.576 },
  "1408147374": { rank: 9, status: "정상", name: "주식회사 가림엔지니어링", rate: 90.605 },
  "1248602216": { rank: 10, status: "정상", name: "주식회사 피에스엠씨", rate: 90.65 },
  "8965100645": { rank: 11, status: "정상", name: "남경조경", rate: 90.655 },
  "3128702542": { rank: 12, status: "정상", name: "주식회사 나무누리", rate: 90.681 },
  "7888603023": { rank: 13, status: "정상", name: "(주)지비조경개발", rate: 90.709 },
  "1348629134": { rank: 14, status: "정상", name: "(주)경안스틸", rate: 90.786 },
  "1340369716": { rank: 15, status: "정상", name: "향림조경", rate: 90.809 },
  "6548802894": { rank: 16, status: "정상", name: "쌍송백조경건설 주식회사", rate: 90.834 },
  "3178700480": { rank: 17, status: "정상", name: "주식회사 은봉조경", rate: 90.84 },
  "7648800359": { rank: 18, status: "정상", name: "주식회사 에코그린", rate: 90.848 },
  "8658803095": { rank: 19, status: "정상", name: "주식회사 창대하조경", rate: 90.911 },
  "2158743771": { rank: 20, status: "정상", name: "예주조경개발 주식회사", rate: 91.033 },
  "1400716186": { rank: 21, status: "정상", name: "세화조경", rate: 91.071 },
  "3754400359": { rank: 22, status: "정상", name: "뉴그린조경", rate: 91.117 },
  "1348611992": { rank: 23, status: "정상", name: "주식회사 남양", rate: 91.221 },
  "1348649862": { rank: 24, status: "정상", name: "(주)인하조경건설", rate: 91.235 },
  "4140199674": { rank: 25, status: "정상", name: "하나조경건설", rate: 91.683 },
  "1348172941": { rank: 26, status: "정상", name: "목림조경(주)", rate: 93.336 },
  "4078111745": { rank: 27, status: "미달", name: "유한회사 에스디건설", rate: 88.861 },
};

function classify(items) {
  const out = { total: items.length, ansan: 0, bangje: 0, ansanNonBangje: 0, agencies: new Map(), rates: [], years: new Map() };
  for (const it of items) {
    const agency = it.dminsttNm ?? "";
    const name = it.bidNtceNm ?? "";
    const rate = Number(it.sucsfbidRate);
    const isAnsan = ANSAN.test(agency);
    const isBangje = BANGJE.test(name);
    if (isAnsan) out.ansan++;
    if (isBangje) out.bangje++;
    if (isAnsan && !isBangje) out.ansanNonBangje++;
    out.agencies.set(agency, (out.agencies.get(agency) ?? 0) + 1);
    if (!Number.isNaN(rate) && rate > 0) out.rates.push(rate);
    const year = (it.rlOpengDt ?? "").slice(0, 4);
    out.years.set(year, (out.years.get(year) ?? 0) + 1);
  }
  return out;
}

function pct(n) { const s = n.sort((a, b) => a - b); const p = (q) => s[Math.floor(s.length * q)]; return { p25: p(0.25), p50: p(0.5), p75: p(0.75), min: s[0], max: s.at(-1), mean: s.reduce((a, b) => a + b, 0) / s.length }; }

// 1. 어제 공고 순위 vs 3년 성과 대비표
console.log("━━━ 어제 공고 순위 vs 3년 안산∩비방제 낙찰 ━━━\n");
console.log("어제순위 | 상태 | 업체 | 3년 안산∩비방제 | 낙찰률 median");
console.log("---------|------|------|------------------|--------------");
const rows = [];
for (const [bz, meta] of Object.entries(YESTERDAY_STATUS)) {
  if (!(bz in store)) continue;
  const c = classify(store[bz].items);
  const medianRate = c.rates.length ? pct(c.rates).p50.toFixed(2) : "n/a";
  rows.push({ ...meta, bz, ansanNonBangje: c.ansanNonBangje, medianRate, total: c.total });
}
rows.sort((a, b) => a.rank - b.rank);
for (const r of rows) {
  console.log(`${String(r.rank).padStart(2)} | ${r.status} | ${r.name.padEnd(28, " ")} | ${String(r.ansanNonBangje).padStart(3)}건 | ${r.medianRate}`);
}

// 2. "공격형" vs "안전형" 분류
console.log("\n━━━ 공격형 vs 안전형 투찰 업체 분류 ━━━\n");
console.log("   공격형 = 어제 낙찰하한선 미달이면서 3년치 낙찰이 많은 업체");
console.log("   안전형 = 어제 정상 투찰이면서 3년치 낙찰이 많은 업체\n");

const aggressive = rows.filter((r) => r.status === "미달" && r.ansanNonBangje >= 5);
const safe = rows.filter((r) => r.status === "정상" && r.ansanNonBangje >= 5);
console.log(`공격형 (${aggressive.length}명):`);
for (const r of aggressive) console.log(`  · ${r.name}: 3년 ${r.ansanNonBangje}건, 어제 ${r.rate}%`);
console.log(`\n안전형 (${safe.length}명):`);
for (const r of safe.slice(0, 10)) console.log(`  · ${r.name}: 3년 ${r.ansanNonBangje}건, 어제 ${r.rate}%`);

// 3. 연도별 트렌드 (상위 5개 업체)
console.log("\n━━━ Top 5 업체 연도별 낙찰 추이 ━━━\n");
const top5 = [...rows].sort((a, b) => b.ansanNonBangje - a.ansanNonBangje).slice(0, 5);
const years = ["2023", "2024", "2025", "2026"];
console.log(`업체 | ${years.join(" | ")}`);
console.log("------|" + years.map(() => "------").join("|"));
for (const r of top5) {
  const c = classify(store[r.bz].items);
  const line = years.map((y) => String(c.years.get(y) ?? 0).padStart(4)).join(" | ");
  console.log(`${r.name.padEnd(24, " ")} | ${line}`);
}

// 4. 발주처 집중도 (상위 5개 업체)
console.log("\n━━━ Top 5 업체 주요 발주처 ━━━\n");
for (const r of top5) {
  const c = classify(store[r.bz].items);
  const topAgs = [...c.agencies.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log(`\n▶ ${r.name} (3년 ${c.ansanNonBangje}건 안산 낙찰)`);
  for (const [ag, n] of topAgs) console.log(`   ${String(n).padStart(2)}건: ${ag}`);
}

// 5. 본인 (새빛조경) 심층
console.log("\n━━━ 본인 회사 (새빛조경) 심층 ━━━\n");
const meItems = store["4958603422"]?.items ?? [];
console.log(`3년 낙찰: ${meItems.length}건`);
for (const it of meItems) {
  console.log(`  · ${it.rlOpengDt} [${it.sucsfbidRate}%] ${it.dminsttNm} — ${it.bidNtceNm}`);
}

// 6. 전체 추정 풀 크기
console.log("\n━━━ 안산 비방제 경쟁 풀 추정 ━━━\n");
const scanned = Object.keys(store).length;
const totalAnsanNonBangje = rows.reduce((s, r) => s + r.ansanNonBangje, 0);
console.log(`스캔 완료: ${scanned}명`);
console.log(`이 ${scanned}명의 3년 안산∩비방제 낙찰 합: ${totalAnsanNonBangje}건`);
console.log(`연 환산: ${(totalAnsanNonBangje / 3).toFixed(1)}건/년 (이 ${scanned}명 만의 점유)`);
console.log(`가정: 이 ${scanned}명이 전체 낙찰의 60%를 차지하면 → 전체 풀 ≈ 연 ${(totalAnsanNonBangje / 3 / 0.6).toFixed(0)}건`);
console.log(`              70%를 차지하면 → 전체 풀 ≈ 연 ${(totalAnsanNonBangje / 3 / 0.7).toFixed(0)}건`);
console.log(`              80%를 차지하면 → 전체 풀 ≈ 연 ${(totalAnsanNonBangje / 3 / 0.8).toFixed(0)}건`);
