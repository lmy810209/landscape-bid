#!/usr/bin/env node
// 더 깊게 — 0.78 한계 돌파 가능성 모든 방향 테스트.
//
// 시도:
//   I. 기초금액 매칭 (비슷한 규모 공고)
//   J. 다중 신호 결합 (발주처+키워드+규모+시점)
//   K. 온라인 학습 (시간 순 점진적 누적)
//   L. 상위 업체 union (그들이 고른 번호들의 union)
//   M. 본인 + 비슷한 업체 데이터 결합 (표본 확대)

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

const TOP9 = ["4078111745","1058651768","1408172761","1340369716","3754400359","1408147374","7648800359","1348172941","1348629134"];
const allPrices = await fetchAll("public_preprices");
const wins = await fetchAll("public_wins", { is_ansan: true, is_bangje: false });
const allParts = await fetchAll("public_participants");
const myParts = allParts.filter(p => p.prcbdr_bizno === MY);

const ag = new Map(wins.map(w => [w.bid_ntce_no, w.dminstt_nm ?? "?"]));
const nm = new Map(wins.map(w => [w.bid_ntce_no, w.bid_ntce_nm ?? ""]));
const dt = new Map(wins.map(w => [w.bid_ntce_no, w.rl_openg_dt ?? ""]));
const winsByNo = new Map(wins.map(w => [w.bid_ntce_no, w]));

const drawn = new Map();
const byNotice = new Map();
const partsByNotice = new Map();
for (const p of allPrices) {
  if (!byNotice.has(p.bid_ntce_no)) byNotice.set(p.bid_ntce_no, []);
  byNotice.get(p.bid_ntce_no).push(p);
}
for (const p of allParts) {
  if (!partsByNotice.has(p.bid_ntce_no)) partsByNotice.set(p.bid_ntce_no, []);
  partsByNotice.get(p.bid_ntce_no).push(p);
}
for (const [n, list] of byNotice) {
  const sorted = list.filter(d=>d.drwt_num>0).sort((a,b)=>b.drwt_num-a.drwt_num);
  drawn.set(n, new Set(sorted.slice(0, 4).map(d => norm(d.compno_rsrvtn_prce_sno))));
}

// preprices에서 base amount 추출
const baseByNo = new Map();
for (const w of wins) {
  const list = byNotice.get(w.bid_ntce_no) ?? [];
  if (list[0]?.bssamt) baseByNo.set(w.bid_ntce_no, Number(list[0].bssamt));
}

const allNoticeNos = wins.map(w => w.bid_ntce_no);
function recommendFromPool(pool) {
  const score = {};
  for (const ntce of pool) {
    const list = byNotice.get(ntce) ?? [];
    for (const p of list) {
      const s = norm(p.compno_rsrvtn_prce_sno);
      score[s] = (score[s] ?? 0) + (p.drwt_num ?? 0);
    }
  }
  return Object.entries(score).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([s])=>s);
}

// ─── I. 기초금액 매칭 ───
function stratI(currentNtce) {
  const myAg = ag.get(currentNtce);
  const myBase = baseByNo.get(currentNtce);
  if (!myBase) return null;
  // 같은 발주처 + 기초금액 ±50% 범위
  const pool = allNoticeNos.filter(n => {
    if (n === currentNtce) return false;
    if (ag.get(n) !== myAg) return false;
    const b = baseByNo.get(n);
    if (!b) return false;
    return b >= myBase * 0.5 && b <= myBase * 1.5;
  });
  if (pool.length < 3) return null;
  return recommendFromPool(pool);
}

// ─── J. 다중 신호 결합 (발주처+키워드+규모+최근) ───
const KEYWORDS = ["가로수","민원처리","수목","전정","녹지","유지관리","잔디","꽃","어린이공원","정비","사면","교체","보식","조성"];
function findKw(name) { return KEYWORDS.find(kw => (name??"").includes(kw)); }
function stratJ(currentNtce) {
  const myAg = ag.get(currentNtce);
  const myBase = baseByNo.get(currentNtce);
  const myKw = findKw(nm.get(currentNtce));
  const myDate = dt.get(currentNtce);
  if (!myAg) return null;
  // 가중치: 발주처 일치 +1, 키워드 일치 +1, 규모 비슷 +0.5, 최근 1년 +0.5
  const score = {};
  for (const ntce of allNoticeNos) {
    if (ntce === currentNtce) continue;
    let weight = 0;
    if (ag.get(ntce) === myAg) weight += 1;
    if (myKw && (nm.get(ntce) ?? "").includes(myKw)) weight += 1;
    const b = baseByNo.get(ntce);
    if (myBase && b && Math.abs(b - myBase) / myBase < 0.5) weight += 0.5;
    if (myDate && dt.get(ntce)) {
      const months = (new Date(myDate) - new Date(dt.get(ntce))) / (30*24*3600*1000);
      if (months > 0 && months < 12) weight += 0.5;
    }
    if (weight === 0) continue;
    const list = byNotice.get(ntce) ?? [];
    for (const p of list) {
      const s = norm(p.compno_rsrvtn_prce_sno);
      score[s] = (score[s] ?? 0) + (p.drwt_num ?? 0) * weight;
    }
  }
  return Object.entries(score).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([s])=>s);
}

// ─── K. 온라인 학습 — 시간 순으로 학습 누적 ───
const myPartsSorted = [...myParts].sort((a,b) => (a.bidprc_dt ?? "") < (b.bidprc_dt ?? "") ? -1 : 1);
function stratK(currentNtce, currentDate) {
  const myAg = ag.get(currentNtce);
  // currentDate 이전의 안산∩비방제 공고만
  const pool = allNoticeNos.filter(n => {
    if (n === currentNtce) return false;
    if (ag.get(n) !== myAg) return false;
    const d = dt.get(n);
    return d && d < currentDate;
  });
  if (pool.length < 3) return null;
  return recommendFromPool(pool);
}

// ─── L. 상위 9개 업체 union 빈도 ───
function stratL(currentNtce) {
  const myAg = ag.get(currentNtce);
  const score = {};
  for (const p of allParts) {
    if (p.bid_ntce_no === currentNtce) continue;
    if (!TOP9.includes(p.prcbdr_bizno)) continue;
    if (ag.get(p.bid_ntce_no) !== myAg) continue;
    const d1 = norm(p.drwt_no_1), d2 = norm(p.drwt_no_2);
    score[d1] = (score[d1] ?? 0) + 1;
    score[d2] = (score[d2] ?? 0) + 1;
  }
  const sorted = Object.entries(score).sort((a,b)=>b[1]-a[1]);
  if (sorted.length < 2) return null;
  return [sorted[0][0], sorted[1][0]];
}

// ─── M. 본인 + 비슷한 낙찰률 업체 그룹 (대동, 한솔, 가림 — 본인과 비슷한 전략 가능성) ───
const SIMILAR = ["1058651768","1408172761","1408147374"]; // 대동, 한솔, 가림
function stratM(currentNtce) {
  const myAg = ag.get(currentNtce);
  // 같은 발주처에서 본인 + 비슷한 업체 그룹의 추첨번호 빈도
  const score = {};
  for (const p of allParts) {
    if (p.bid_ntce_no === currentNtce) continue;
    if (![MY, ...SIMILAR].includes(p.prcbdr_bizno)) continue;
    if (ag.get(p.bid_ntce_no) !== myAg) continue;
    const d1 = norm(p.drwt_no_1), d2 = norm(p.drwt_no_2);
    score[d1] = (score[d1] ?? 0) + 1;
    score[d2] = (score[d2] ?? 0) + 1;
  }
  const sorted = Object.entries(score).sort((a,b)=>b[1]-a[1]);
  if (sorted.length < 2) return null;
  return [sorted[0][0], sorted[1][0]];
}

// 시뮬
const strategies = { I: stratI, J: stratJ, L: stratL, M: stratM };
const results = { actual: [] };
for (const k of Object.keys(strategies)) results[k] = [];
results.K = [];

for (const p of myParts) {
  const drawnSet = drawn.get(p.bid_ntce_no);
  if (!drawnSet || drawnSet.size === 0) continue;
  const myPick = [norm(p.drwt_no_1), norm(p.drwt_no_2)];
  results.actual.push(myPick.filter(x => drawnSet.has(x)).length);
  for (const [name, fn] of Object.entries(strategies)) {
    const pick = fn(p.bid_ntce_no);
    if (!pick) results[name].push(null);
    else results[name].push(pick.filter(x => drawnSet.has(x)).length);
  }
  // K — 시간 순 학습
  const pick = stratK(p.bid_ntce_no, dt.get(p.bid_ntce_no) ?? p.bidprc_dt ?? "");
  if (!pick) results.K.push(null);
  else results.K.push(pick.filter(x => drawnSet.has(x)).length);
}

function summary(arr) {
  const valid = arr.filter(x => x !== null);
  if (valid.length === 0) return { avg: 0, n: 0, h0:0, h1:0, h2:0 };
  return {
    avg: valid.reduce((s,x)=>s+x,0)/valid.length,
    n: valid.length,
    h0: valid.filter(x=>x===0).length,
    h1: valid.filter(x=>x===1).length,
    h2: valid.filter(x=>x===2).length,
  };
}

console.log("📊 본인 32회 시뮬 — 새 5개 전략\n");
console.log("전략 | 표본 | 평균 적중 | 분포 | vs 본인 | vs B(0.781)");
console.log("-".repeat(80));
const act = summary(results.actual);
console.log(`본인 실제                | ${String(act.n).padStart(2)} | ${act.avg.toFixed(3)} | ${act.h0}/${act.h1}/${act.h2} | (-)    |`);
for (const [name, label] of [
  ["I", "I 발주처+규모(±50%)"],
  ["J", "J 다중 신호 결합"],
  ["K", "K 온라인 학습"],
  ["L", "L 상위9 업체 union"],
  ["M", "M 본인+유사3 업체"],
]) {
  const s = summary(results[name]);
  if (s.n === 0) { console.log(`${label.padEnd(22)} | -- | (적용 불가)`); continue; }
  const dActual = s.avg - act.avg;
  const dB = s.avg - 0.781;
  console.log(`${label.padEnd(22)} | ${String(s.n).padStart(2)} | ${s.avg.toFixed(3)} | ${s.h0}/${s.h1}/${s.h2} | ${(dActual>=0?"+":"")}${dActual.toFixed(3)} | ${(dB>=0?"+":"")}${dB.toFixed(3)}${dB>0?" ★":""}`);
}

// 추가: 모든 전략 best ensemble — 각 시뮬 적중을 조합해서 최선 선택
console.log("\n📊 앙상블 — 발주처(B) + 다중신호(J) + 상위업체union(L) 다수결\n");
const ensemble = [];
for (let i = 0; i < myParts.length; i++) {
  const drawnSet = drawn.get(myParts[i].bid_ntce_no);
  if (!drawnSet || drawnSet.size === 0) continue;
  // 각 전략의 추천을 모아 voting
  const votes = {};
  // B: 단순 발주처
  const bPick = recommendFromPool(allNoticeNos.filter(n => n !== myParts[i].bid_ntce_no && ag.get(n) === ag.get(myParts[i].bid_ntce_no)));
  for (const x of bPick) votes[x] = (votes[x] ?? 0) + 2; // B 가중치 높음
  const jPick = stratJ(myParts[i].bid_ntce_no);
  if (jPick) for (const x of jPick) votes[x] = (votes[x] ?? 0) + 1;
  const lPick = stratL(myParts[i].bid_ntce_no);
  if (lPick) for (const x of lPick) votes[x] = (votes[x] ?? 0) + 1;
  const top2 = Object.entries(votes).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([s])=>s);
  if (top2.length < 2) continue;
  ensemble.push(top2.filter(x => drawnSet.has(x)).length);
}
const e = summary(ensemble);
console.log(`앙상블 (B*2 + J + L)    | ${e.n} | ${e.avg.toFixed(3)} | ${e.h0}/${e.h1}/${e.h2} | ${e.avg - 0.594 > 0 ? "+" : ""}${(e.avg-0.594).toFixed(3)} vs 본인 / ${e.avg - 0.781 > 0 ? "+" : ""}${(e.avg-0.781).toFixed(3)} vs B`);
