#!/usr/bin/env node
// 추첨번호 추천 도구 시뮬레이션 (Leave-One-Out 검증).
//
// 가설: 발주처(또는 공고 키워드)별로 자주 추첨되는 예비가격 번호 패턴이 있다.
// 본인이 그 패턴 따르면 적중률 0.594 → 0.7+ 상승 가능.
//
// 시뮬:
//   - 본인 32건 각각에 대해
//   - LOO: 그 공고를 제외한 과거 데이터로 추천 Top 2 계산
//   - 실제 추첨된 4개와 비교 → 적중 수 기록
//   - 평균 적중 vs 본인 실제 0.594 비교
//
// 추천 전략 3가지:
//   A. 글로벌 (모든 안산∩비방제 풀의 drwt_num 합)
//   B. 발주처별 (같은 발주처의 drwt_num 합)
//   C. 발주처+공종 키워드 (가장 좁은 매칭)

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
const MY = "4958603422";

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

const allPrices = await fetchAll("public_preprices");
const wins = await fetchAll("public_wins", { is_ansan: true, is_bangje: false });
const myParts = await fetchAll("public_participants", { prcbdr_bizno: MY });

// 공고번호 → 발주처
const ag = new Map(wins.map((w) => [w.bid_ntce_no, w.dminstt_nm ?? "?"]));
// 공고번호 → 공고명 (키워드 매칭용)
const nm = new Map(wins.map((w) => [w.bid_ntce_no, w.bid_ntce_nm ?? ""]));

// 공고번호 → 실제 추첨된 4개 번호
const drawn = new Map();
const byNotice = new Map();
for (const p of allPrices) {
  if (!byNotice.has(p.bid_ntce_no)) byNotice.set(p.bid_ntce_no, []);
  byNotice.get(p.bid_ntce_no).push(p);
}
for (const [n, list] of byNotice) {
  const top4 = list.filter((d) => d.drwt_num > 0).sort((a, b) => b.drwt_num - a.drwt_num).slice(0, 4);
  drawn.set(n, new Set(top4.map((d) => norm(d.compno_rsrvtn_prce_sno))));
}

// 추천 함수: 주어진 공고 풀에서 drwt_num을 합산해 Top N
function recommendTopN(noticeNos, n) {
  const score = {}; // sno → cumulative drwt_num
  for (const ntce of noticeNos) {
    const list = byNotice.get(ntce) ?? [];
    for (const p of list) {
      const s = norm(p.compno_rsrvtn_prce_sno);
      score[s] = (score[s] ?? 0) + (p.drwt_num ?? 0);
    }
  }
  return Object.entries(score)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([s]) => s);
}

const ansanNoticeNos = wins.map((w) => w.bid_ntce_no);

// 키워드 매칭: 같은 핵심 단어 포함하는 공고만
function getMatchingByKeyword(currentName) {
  const KEYWORDS = ["가로수", "민원처리", "수목", "전정", "녹지", "유지관리", "잔디", "꽃", "어린이공원", "정비", "사면", "교체", "보식", "조성", "관리"];
  const matched = KEYWORDS.find((kw) => currentName.includes(kw));
  if (!matched) return null;
  return ansanNoticeNos.filter((n) => (nm.get(n) ?? "").includes(matched));
}

// 시뮬레이션
console.log("📊 본인 32건 시뮬레이션 (Leave-One-Out)\n");
console.log("전략 A = 글로벌 (안산∩비방제 풀 전체)");
console.log("전략 B = 발주처별 (같은 dminstt_nm)");
console.log("전략 C = 키워드 매칭 (가로수/민원처리/수목 등)\n");

const results = { A: { hits: [], by: [] }, B: { hits: [], by: [] }, C: { hits: [], by: [] }, actual: { hits: [], by: [] } };

for (const p of myParts) {
  const ntce = p.bid_ntce_no;
  const drawnSet = drawn.get(ntce);
  if (!drawnSet || drawnSet.size === 0) continue;

  // 실제 본인 선택
  const myPick = [norm(p.drwt_no_1), norm(p.drwt_no_2)];
  const actualHit = myPick.filter((x) => drawnSet.has(x)).length;
  results.actual.hits.push(actualHit);

  // 전략 A: 글로벌 (이 공고 제외)
  const aPool = ansanNoticeNos.filter((n) => n !== ntce);
  const aTop = recommendTopN(aPool, 2);
  results.A.hits.push(aTop.filter((x) => drawnSet.has(x)).length);

  // 전략 B: 같은 발주처 (이 공고 제외)
  const myAg = ag.get(ntce);
  const bPool = ansanNoticeNos.filter((n) => n !== ntce && ag.get(n) === myAg);
  if (bPool.length >= 3) {
    const bTop = recommendTopN(bPool, 2);
    results.B.hits.push(bTop.filter((x) => drawnSet.has(x)).length);
  } else {
    results.B.hits.push(null);
  }

  // 전략 C: 키워드
  const cMatchedAll = getMatchingByKeyword(nm.get(ntce) ?? "") ?? [];
  const cPool = cMatchedAll.filter((n) => n !== ntce);
  if (cPool.length >= 3) {
    const cTop = recommendTopN(cPool, 2);
    results.C.hits.push(cTop.filter((x) => drawnSet.has(x)).length);
  } else {
    results.C.hits.push(null);
  }
}

function summary(arr) {
  const valid = arr.filter((x) => x !== null);
  const avg = valid.reduce((s, x) => s + x, 0) / valid.length;
  const h0 = valid.filter((x) => x === 0).length;
  const h1 = valid.filter((x) => x === 1).length;
  const h2 = valid.filter((x) => x === 2).length;
  return { avg, n: valid.length, h0, h1, h2, oneplus: ((h1 + h2) / valid.length) * 100 };
}

const a = summary(results.A.hits);
const b = summary(results.B.hits);
const c = summary(results.C.hits);
const act = summary(results.actual.hits);

console.log("─".repeat(80));
console.log("결과");
console.log("─".repeat(80));
console.log("전략               | 표본 | 평균 적중 | 분포 (0/1/2) | 1+ 적중률");
console.log("-".repeat(80));
console.log(`본인 실제          | ${String(act.n).padStart(3)}  | ${act.avg.toFixed(3)}    | ${act.h0}/${act.h1}/${act.h2}        | ${act.oneplus.toFixed(1)}%`);
console.log(`A (글로벌)         | ${String(a.n).padStart(3)}  | ${a.avg.toFixed(3)}    | ${a.h0}/${a.h1}/${a.h2}        | ${a.oneplus.toFixed(1)}%`);
console.log(`B (발주처별)       | ${String(b.n).padStart(3)}  | ${b.avg.toFixed(3)}    | ${b.h0}/${b.h1}/${b.h2}        | ${b.oneplus.toFixed(1)}%`);
console.log(`C (키워드)         | ${String(c.n).padStart(3)}  | ${c.avg.toFixed(3)}    | ${c.h0}/${c.h1}/${c.h2}        | ${c.oneplus.toFixed(1)}%`);
console.log("─".repeat(80));
console.log(`운 베이스라인       |  -  | 0.533    | 균등 가정    | 50%`);
console.log("─".repeat(80));

// 통계적 유의성 (단순 t-test 근사)
function tTest(sample1, sample2) {
  const n1 = sample1.length, n2 = sample2.length;
  const m1 = sample1.reduce((s,x)=>s+x,0)/n1;
  const m2 = sample2.reduce((s,x)=>s+x,0)/n2;
  const v1 = sample1.reduce((s,x)=>s+(x-m1)**2,0)/(n1-1);
  const v2 = sample2.reduce((s,x)=>s+(x-m2)**2,0)/(n2-1);
  const se = Math.sqrt(v1/n1 + v2/n2);
  return { meanDiff: m1-m2, t: (m1-m2)/se };
}

const tA = tTest(results.A.hits.filter(x=>x!==null), results.actual.hits);
const tB = tTest(results.B.hits.filter(x=>x!==null), results.actual.hits);
const tC = tTest(results.C.hits.filter(x=>x!==null), results.actual.hits);

console.log("\n본인 실제 vs 시뮬 차이 (t-stat, |t|>2 → 유의):");
console.log(`  A: 평균 +${tA.meanDiff.toFixed(3)}, t=${tA.t.toFixed(2)}`);
console.log(`  B: 평균 +${tB.meanDiff.toFixed(3)}, t=${tB.t.toFixed(2)}`);
console.log(`  C: 평균 +${tC.meanDiff.toFixed(3)}, t=${tC.t.toFixed(2)}`);

// 추가: 현재 데이터로 본 발주처별 Top 4 추천 (운영 도구)
console.log("\n📋 발주처별 추천 Top 4 (현재 데이터, 표본 ≥3):");
const byAgency = new Map();
for (const w of wins) {
  if (!byAgency.has(w.dminstt_nm)) byAgency.set(w.dminstt_nm, []);
  byAgency.get(w.dminstt_nm).push(w.bid_ntce_no);
}
for (const [agency, list] of [...byAgency.entries()].sort((a,b)=>b[1].length - a[1].length)) {
  if (list.length < 3) continue;
  const top4 = recommendTopN(list, 4);
  console.log(`  ${agency} (${list.length}건): ${top4.join(" / ")}`);
}
