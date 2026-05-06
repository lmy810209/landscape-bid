#!/usr/bin/env node
// 상위 업체들이 0.85+ 적중하는 진짜 메커니즘 찾기.
//
// 가설들:
//   A. 자기충족적 모델 — 상위 9개 업체가 서로 비슷하게 행동 → 그들 결정이 추첨됨
//   B. 시기별 패턴 — 계절성, 시점별 변동
//   C. 공고 규모별 패턴
//   D. drwt_num 집중도 — 상위 4개가 정말 독식한다면 적중 쉬움
//   E. 공고 메타(개찰일, 차수 등)와 상관

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const norm = (s) => (s ?? "").toString().trim().padStart(2, "0");

async function fetchAll(table, filter) {
  const all = [];
  let from = 0;
  while (true) {
    let q = sb.from(table).select("*").range(from, from + 999);
    for (const [k, v] of Object.entries(filter ?? {})) q = q.eq(k, v);
    const { data } = await q;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

const TOP_COMPANIES = [
  "4078111745", "1058651768", "1408172761", "1340369716", "3754400359",
  "1408147374", "7648800359", "1348172941", "1348629134"
];
const NAMES = {
  "4078111745": "에스디", "1058651768": "대동", "1408172761": "한솔",
  "1340369716": "향림", "3754400359": "뉴그린", "1408147374": "가림",
  "7648800359": "에코그린", "1348172941": "목림", "1348629134": "경안",
  "4958603422": "새빛(본인)",
};

const allParts = await fetchAll("public_participants");
const allPrices = await fetchAll("public_preprices");
const wins = await fetchAll("public_wins", { is_ansan: true, is_bangje: false });

// 공고별 추첨된 4개
const drawn = new Map();
const byNotice = new Map();
for (const p of allPrices) {
  if (!byNotice.has(p.bid_ntce_no)) byNotice.set(p.bid_ntce_no, []);
  byNotice.get(p.bid_ntce_no).push(p);
}
for (const [n, list] of byNotice) {
  const sorted = list.filter(d=>d.drwt_num>0).sort((a,b)=>b.drwt_num-a.drwt_num);
  drawn.set(n, sorted.slice(0, 4).map(d => norm(d.compno_rsrvtn_prce_sno)));
}

// 공고별 모든 참여자 + 그들 추첨번호
const partsByNotice = new Map();
for (const p of allParts) {
  if (!partsByNotice.has(p.bid_ntce_no)) partsByNotice.set(p.bid_ntce_no, []);
  partsByNotice.get(p.bid_ntce_no).push(p);
}

// ─── 분석 1: drwt_num 집중도 ───
console.log("【분석 1: drwt_num 집중도 — Top 4 vs Bottom 4】\n");
let totalTop = 0, totalBot = 0, ntceCount = 0;
const concentrations = [];
for (const w of wins) {
  const list = byNotice.get(w.bid_ntce_no) ?? [];
  if (list.length < 15) continue;
  const sorted = list.map(d=>d.drwt_num).sort((a,b)=>b-a);
  const top4 = sorted.slice(0, 4).reduce((s,x)=>s+x,0);
  const bot4 = sorted.slice(-4).reduce((s,x)=>s+x,0);
  const total = sorted.reduce((s,x)=>s+x,0);
  totalTop += top4;
  totalBot += bot4;
  ntceCount++;
  concentrations.push({ top4Pct: (top4/total)*100, ratio: top4/Math.max(bot4,1) });
}
const avgTopPct = concentrations.reduce((s,c)=>s+c.top4Pct,0)/concentrations.length;
const avgRatio = concentrations.reduce((s,c)=>s+c.ratio,0)/concentrations.length;
console.log(`  공고당 평균 — Top 4 합/전체 = ${avgTopPct.toFixed(1)}% (균등이면 26.7%)`);
console.log(`  Top 4 / Bottom 4 비율 평균: ${avgRatio.toFixed(2)}배`);
console.log(`  → ${avgTopPct > 35 ? "★ 상위 4개가 명확히 독식" : "균등에 가까움"}`);

// ─── 분석 2: 상위 업체간 추첨번호 일치도 (Coordination) ───
console.log("\n【분석 2: 상위 9개 업체가 같은 공고에서 같은 번호 고르는 비율】\n");
let coordHits = 0, coordTotal = 0;
const overlapDist = []; // 각 공고에서 상위 업체간 평균 일치도
for (const w of wins) {
  const parts = (partsByNotice.get(w.bid_ntce_no) ?? [])
    .filter(p => TOP_COMPANIES.includes(p.prcbdr_bizno));
  if (parts.length < 3) continue;
  // 각 쌍의 일치도 (선택한 2개 중 몇 개 동일)
  const pairs = [];
  for (let i = 0; i < parts.length; i++) {
    for (let j = i+1; j < parts.length; j++) {
      const a = new Set([norm(parts[i].drwt_no_1), norm(parts[i].drwt_no_2)]);
      const b = new Set([norm(parts[j].drwt_no_1), norm(parts[j].drwt_no_2)]);
      const inter = [...a].filter(x => b.has(x)).length;
      pairs.push(inter); // 0, 1, or 2
    }
  }
  const avg = pairs.reduce((s,x)=>s+x,0)/pairs.length;
  overlapDist.push(avg);
}
const meanOverlap = overlapDist.reduce((s,x)=>s+x,0)/overlapDist.length;
console.log(`  상위 업체 쌍별 평균 일치 번호 수: ${meanOverlap.toFixed(3)} / 2`);
console.log(`  랜덤 베이스라인: 2 × 2/15 = 0.267`);
console.log(`  → ${meanOverlap > 0.4 ? "★ 명확한 조정/모방" : meanOverlap > 0.3 ? "약한 조정" : "랜덤 수준"}`);

// ─── 분석 3: 공고별 일치도 분포 ───
const overlapHist = {};
for (const v of overlapDist) {
  const bin = (Math.floor(v * 5) / 5).toFixed(1);
  overlapHist[bin] = (overlapHist[bin] ?? 0) + 1;
}
console.log("\n  공고별 평균 일치도 분포:");
for (const k of Object.keys(overlapHist).sort()) {
  console.log(`    ${k}+ : ${"█".repeat(overlapHist[k])} (${overlapHist[k]}개 공고)`);
}

// ─── 분석 4: 상위 업체들이 자주 고르는 "공통 페어" ───
console.log("\n【분석 4: 상위 업체가 자주 선택하는 (a,b) 페어 — 발주처별】\n");
const pairsByAg = new Map();
for (const p of allParts) {
  if (!TOP_COMPANIES.includes(p.prcbdr_bizno)) continue;
  const a = ag_of(p.bid_ntce_no);
  if (!a) continue;
  const k = [norm(p.drwt_no_1), norm(p.drwt_no_2)].sort().join("-");
  if (!pairsByAg.has(a)) pairsByAg.set(a, new Map());
  const m = pairsByAg.get(a);
  m.set(k, (m.get(k) ?? 0) + 1);
}
function ag_of(ntce) {
  return wins.find(w => w.bid_ntce_no === ntce)?.dminstt_nm;
}
for (const [a, m] of pairsByAg) {
  const top = [...m.entries()].sort((x,y)=>y[1]-x[1]).slice(0, 5);
  console.log(`  ${a}: ${top.map(([p,n])=>`${p}(${n})`).join(", ")}`);
}

// ─── 분석 5: 상위 업체들이 같이 고른 페어를 추천으로 사용 시 시뮬 ───
console.log("\n【분석 5: 상위 업체 모방 추천 — 본인 32회 시뮬】\n");

// 발주처별로 상위 업체들이 자주 선택한 페어 Top → 그 안에서 가장 자주 등장한 번호 2개
function topCoordinationPick(currentNtce) {
  const myAg = ag.get(currentNtce);
  if (!myAg) return null;
  const score = {};
  for (const p of allParts) {
    if (p.bid_ntce_no === currentNtce) continue;
    if (!TOP_COMPANIES.includes(p.prcbdr_bizno)) continue;
    if (ag.get(p.bid_ntce_no) !== myAg) continue;
    score[norm(p.drwt_no_1)] = (score[norm(p.drwt_no_1)] ?? 0) + 1;
    score[norm(p.drwt_no_2)] = (score[norm(p.drwt_no_2)] ?? 0) + 1;
  }
  const sorted = Object.entries(score).sort((a,b)=>b[1]-a[1]);
  if (sorted.length < 2) return null;
  return [sorted[0][0], sorted[1][0]];
}

const ag = new Map(wins.map(w => [w.bid_ntce_no, w.dminstt_nm]));
const myParts = allParts.filter(p => p.prcbdr_bizno === "4958603422");
const hits = [];
for (const p of myParts) {
  const drawnSet = new Set(drawn.get(p.bid_ntce_no) ?? []);
  if (drawnSet.size === 0) continue;
  const pick = topCoordinationPick(p.bid_ntce_no);
  if (!pick) { hits.push(null); continue; }
  hits.push(pick.filter(x => drawnSet.has(x)).length);
}
const valid = hits.filter(x => x !== null);
const avg = valid.reduce((s,x)=>s+x,0)/valid.length;
const h0 = valid.filter(x=>x===0).length;
const h1 = valid.filter(x=>x===1).length;
const h2 = valid.filter(x=>x===2).length;
console.log(`  표본: ${valid.length}건`);
console.log(`  평균 적중: ${avg.toFixed(3)} (분포 ${h0}/${h1}/${h2})`);
console.log(`  vs 본인 0.594: ${avg > 0.594 ? `+${(avg-0.594).toFixed(3)}` : (avg-0.594).toFixed(3)}`);
console.log(`  vs B 단순 발주처별 0.781: ${avg > 0.781 ? `+${(avg-0.781).toFixed(3)} ★` : (avg-0.781).toFixed(3)}`);
