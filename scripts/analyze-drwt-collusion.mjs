#!/usr/bin/env node
// 5년치 전체에서 추첨번호 담합/편향 신호 검증.
//
// 검증할 것:
// 1) 공고별 번호 집중도 — 1.5x 기대치 초과 빈번? 표본 (어제 1.73x, 4/30 1.88x)
// 2) 상위 업체쌍 — 같은 공고에 둘 다 정상 진입 시 같은 번호 동시 선택 빈도
// 3) 시계열 — 5년간 자주 선정되는 번호 변화 (학습 vs 정해진 번호)
// 4) 발주처별 — 특정 발주처에서만 편향 강한지

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
];
const TARGET_SET = new Set(TARGETS.map((t) => t.bizno));
const NAME_BY = Object.fromEntries(TARGETS.map((t) => [t.bizno, t.name]));

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

console.log("로딩...");
const wins = await fetchAll("public_wins", "select=bid_ntce_no,dminstt_nm,rl_openg_dt&is_ansan=eq.true&is_bangje=eq.false");
const noticeMeta = Object.fromEntries(wins.map((w) => [w.bid_ntce_no, w]));

const noticeIds = wins.map((w) => w.bid_ntce_no);
const participants = [];
for (let i = 0; i < noticeIds.length; i += 100) {
  const chunk = noticeIds.slice(i, i + 100);
  const inList = chunk.map((id) => encodeURIComponent(id)).join(",");
  const data = await fetchAll(
    "public_participants",
    `select=bid_ntce_no,prcbdr_bizno,prcbdr_nm,drwt_no_1,drwt_no_2&bid_ntce_no=in.(${inList})&rmrk=eq.정상`
  );
  participants.push(...data);
}
console.log(`정상 참여 ${participants.length}건 (652 공고)\n`);

// 공고별 번호 집계
const byNotice = {};
for (const p of participants) {
  if (!byNotice[p.bid_ntce_no]) byNotice[p.bid_ntce_no] = { picks: [], biznos: {} };
  for (const n of [(p.drwt_no_1 ?? "").trim(), (p.drwt_no_2 ?? "").trim()]) {
    if (n) {
      byNotice[p.bid_ntce_no].picks.push(n);
      byNotice[p.bid_ntce_no].biznos[p.prcbdr_bizno] = byNotice[p.bid_ntce_no].biznos[p.prcbdr_bizno] || [];
      byNotice[p.bid_ntce_no].biznos[p.prcbdr_bizno].push(n);
    }
  }
}

// ─────────────────────────────────────────
// 1. 공고별 집중도 분포
// ─────────────────────────────────────────
console.log("=".repeat(85));
console.log("1. 공고별 최대 번호 편향 분포 (전체 652 공고)");
console.log("=".repeat(85));
console.log("→ 1배 = 균등 / 1.5배 = 약간 편향 / 2배+ = 강한 편향 (담합 의심)");
console.log("");
const concentrations = [];
for (const [no, d] of Object.entries(byNotice)) {
  const picks = d.picks;
  if (picks.length < 10) continue; // 너무 작은 표본 제외
  const counts = {};
  for (const n of picks) counts[n] = (counts[n] || 0) + 1;
  const expected = picks.length / 15;
  const max = Math.max(...Object.values(counts));
  concentrations.push({ no, ratio: max / expected, total: picks.length, max });
}

const buckets = {
  "1.0~1.5x": concentrations.filter((c) => c.ratio < 1.5).length,
  "1.5~2.0x": concentrations.filter((c) => c.ratio >= 1.5 && c.ratio < 2.0).length,
  "2.0~2.5x": concentrations.filter((c) => c.ratio >= 2.0 && c.ratio < 2.5).length,
  "2.5~3.0x": concentrations.filter((c) => c.ratio >= 2.5 && c.ratio < 3.0).length,
  "3.0x+": concentrations.filter((c) => c.ratio >= 3.0).length,
};
const total = concentrations.length;
for (const [label, count] of Object.entries(buckets)) {
  console.log(`  ${label}: ${count}건 (${(count/total*100).toFixed(1)}%)  ${"█".repeat(Math.round(count/total*40))}`);
}

// 가장 강한 편향 케이스
console.log("\n--- 가장 편향 강한 5건 (담합 의심 가능) ---");
const topConc = [...concentrations].sort((a, b) => b.ratio - a.ratio).slice(0, 5);
for (const c of topConc) {
  const m = noticeMeta[c.no];
  console.log(`  ${c.ratio.toFixed(2)}x  ${c.no} (${m?.dminstt_nm}, 정상 ${c.total/2}명)`);
}

// ─────────────────────────────────────────
// 2. 상위 업체쌍 — 같은 번호 동시 선택 빈도
// ─────────────────────────────────────────
console.log("\n" + "=".repeat(85));
console.log("2. 상위 업체쌍 — 같은 공고에서 같은 번호 둘 다 뽑은 빈도");
console.log("=".repeat(85));
console.log("→ 상위 두 회사가 같은 공고에서 한 번호를 동시 선택 = 담합 가능 신호");
console.log("→ 우연 기대치 ≈ 1/15 × 2 = 13% (2개 중 1개라도 일치)");
console.log("");

const pairCo = {};
const pairBoth = {};
for (const [no, d] of Object.entries(byNotice)) {
  const topInThisNotice = Object.entries(d.biznos).filter(([bz]) => TARGET_SET.has(bz));
  for (let i = 0; i < topInThisNotice.length; i++) {
    for (let j = i + 1; j < topInThisNotice.length; j++) {
      const [bzA, picksA] = topInThisNotice[i];
      const [bzB, picksB] = topInThisNotice[j];
      const key = [bzA, bzB].sort().join("|");
      pairCo[key] = (pairCo[key] || 0) + 1;
      const setA = new Set(picksA);
      const setB = new Set(picksB);
      const overlap = [...setA].filter((x) => setB.has(x)).length;
      if (overlap > 0) pairBoth[key] = (pairBoth[key] || 0) + 1;
    }
  }
}

const sortedPairs = Object.entries(pairCo).sort((a, b) => b[1] - a[1]).slice(0, 20);
console.log("쌍                              동시참여  같은번호 ≥1개  비율   기대대비");
for (const [key, count] of sortedPairs) {
  const [a, b] = key.split("|");
  const both = pairBoth[key] || 0;
  const rate = (both / count) * 100;
  // 기대치: 각자 2개 중 1개라도 같을 확률 = 1 - C(13,2)/C(15,2) = 1 - 78/105 = 25.7%
  // 두 picks 합집합이 2x2 = 4 중 동일 1+ 일 확률
  const expected = 25.7;
  const dev = (rate / expected).toFixed(2);
  const flag = rate / expected > 1.5 ? " ⚠" : "";
  console.log(`${(NAME_BY[a]+'↔'+NAME_BY[b]).padEnd(32)} ${count.toString().padStart(7)}  ${both.toString().padStart(11)}    ${rate.toFixed(0).padStart(4)}%  ${dev}x${flag}`);
}

// ─────────────────────────────────────────
// 3. 시계열 — 연도별 자주 선정되는 번호
// ─────────────────────────────────────────
console.log("\n" + "=".repeat(85));
console.log("3. 시계열 — 연도별 정상 참여자 선택 분포 Top 5");
console.log("=".repeat(85));
console.log("→ 연도별로 인기 번호가 바뀌면 학습 진화 / 같으면 정해진 패턴");
console.log("");
const byYear = {};
for (const p of participants) {
  const meta = noticeMeta[p.bid_ntce_no];
  const y = meta?.rl_openg_dt?.slice(0, 4);
  if (!y) continue;
  if (!byYear[y]) byYear[y] = {};
  for (const n of [(p.drwt_no_1 ?? "").trim(), (p.drwt_no_2 ?? "").trim()]) {
    if (n) byYear[y][n] = (byYear[y][n] || 0) + 1;
  }
}
for (const y of Object.keys(byYear).sort()) {
  const sorted = Object.entries(byYear[y]).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const total = Object.values(byYear[y]).reduce((s, x) => s + x, 0);
  console.log(`${y}: Top 5 = ${sorted.map(([n, c]) => `${n}(${(c/total*100).toFixed(1)}%)`).join(", ")}`);
}

// ─────────────────────────────────────────
// 4. 발주처별 — 편향 강한 발주처
// ─────────────────────────────────────────
console.log("\n" + "=".repeat(85));
console.log("4. 발주처별 평균 편향 (균등=1.0)");
console.log("=".repeat(85));
const byAgency = {};
for (const c of concentrations) {
  const ag = noticeMeta[c.no]?.dminstt_nm;
  if (!ag) continue;
  if (!byAgency[ag]) byAgency[ag] = [];
  byAgency[ag].push(c.ratio);
}
for (const [ag, ratios] of Object.entries(byAgency).filter(([, r]) => r.length >= 5)) {
  const mean = ratios.reduce((s, r) => s + r, 0) / ratios.length;
  console.log(`  ${ag.padEnd(36)} 평균 ${mean.toFixed(2)}x (${ratios.length}건)`);
}

console.log("\n" + "=".repeat(85));
console.log("⚠ 본 분석은 통계적 신호 관찰. 단정 X. 회피·담합으로 결론짓지 않음.");
console.log("=".repeat(85));
