#!/usr/bin/env node
// 적중률을 0.85+ 까지 올릴 수 있는지 다양한 전략 시뮬레이션.
//
// 시도:
//   D. 발주처 + 최근 12개월 가중치 2배
//   E. 발주처 + 공고명 키워드 매칭
//   F. 뉴그린조경 모방 — 그들이 자주 고르는 번호 그대로 사용
//   G. 추첨번호 쌍 패턴 — (07, 11) 같은 동시 선택 빈도
//   H. 발주처 + 가까운 시점 (반년 이내)

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
const NEUGREEN = "3754400359"; // 뉴그린조경 (0.967)

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
const ngParts = await fetchAll("public_participants", { prcbdr_bizno: NEUGREEN });

const ag = new Map(wins.map((w) => [w.bid_ntce_no, w.dminstt_nm ?? "?"]));
const nm = new Map(wins.map((w) => [w.bid_ntce_no, w.bid_ntce_nm ?? ""]));
const dt = new Map(wins.map((w) => [w.bid_ntce_no, w.rl_openg_dt ?? ""]));

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

const ansanNoticeNos = wins.map((w) => w.bid_ntce_no);

function recommendByPool(pool, decay = null, currentDate = null) {
  const score = {};
  for (const ntce of pool) {
    const list = byNotice.get(ntce) ?? [];
    let weight = 1;
    if (decay && currentDate) {
      const ntceDate = dt.get(ntce);
      if (ntceDate) {
        const monthsAgo = (new Date(currentDate) - new Date(ntceDate)) / (30 * 24 * 3600 * 1000);
        if (monthsAgo < 12) weight = 2;
        else if (monthsAgo < 24) weight = 1;
        else weight = 0.5;
      }
    }
    for (const p of list) {
      const s = norm(p.compno_rsrvtn_prce_sno);
      score[s] = (score[s] ?? 0) + (p.drwt_num ?? 0) * weight;
    }
  }
  return Object.entries(score).sort((a, b) => b[1] - a[1]).map(([s]) => s);
}

const KEYWORDS = ["가로수", "민원처리", "수목", "전정", "녹지", "유지관리", "잔디", "꽃", "어린이공원", "정비", "사면", "교체", "보식", "조성"];
function findKeyword(name) {
  return KEYWORDS.find((kw) => (name ?? "").includes(kw));
}

// ─── 전략 D: 발주처 + 최근 12개월 가중치 ───
function stratD(currentNtce) {
  const myAg = ag.get(currentNtce);
  const myDate = dt.get(currentNtce);
  const pool = ansanNoticeNos.filter((n) => n !== currentNtce && ag.get(n) === myAg);
  if (pool.length < 3) return null;
  return recommendByPool(pool, true, myDate).slice(0, 2);
}

// ─── 전략 E: 발주처 + 키워드 ───
function stratE(currentNtce) {
  const myAg = ag.get(currentNtce);
  const myKw = findKeyword(nm.get(currentNtce));
  if (!myKw) return null;
  const pool = ansanNoticeNos.filter(
    (n) => n !== currentNtce && ag.get(n) === myAg && (nm.get(n) ?? "").includes(myKw),
  );
  if (pool.length < 3) return null;
  return recommendByPool(pool).slice(0, 2);
}

// ─── 전략 F: 뉴그린조경 모방 (그들 발주처별 추첨번호 빈도) ───
const ngByAg = new Map();
for (const p of ngParts) {
  const a = ag.get(p.bid_ntce_no);
  if (!a) continue;
  if (!ngByAg.has(a)) ngByAg.set(a, { drwt1: {}, drwt2: {} });
  const e = ngByAg.get(a);
  const d1 = norm(p.drwt_no_1), d2 = norm(p.drwt_no_2);
  e.drwt1[d1] = (e.drwt1[d1] ?? 0) + 1;
  e.drwt2[d2] = (e.drwt2[d2] ?? 0) + 1;
}
function stratF(currentNtce) {
  const myAg = ag.get(currentNtce);
  const e = ngByAg.get(myAg);
  if (!e) return null;
  const total = {};
  for (const k of Object.keys(e.drwt1)) total[k] = (total[k] ?? 0) + e.drwt1[k];
  for (const k of Object.keys(e.drwt2)) total[k] = (total[k] ?? 0) + e.drwt2[k];
  const sorted = Object.entries(total).sort((a, b) => b[1] - a[1]);
  if (sorted.length < 2) return null;
  return [sorted[0][0], sorted[1][0]];
}

// ─── 전략 G: 추첨번호 쌍 패턴 ───
// 같은 발주처에서 동시에 자주 추첨된 쌍을 보고 그 쌍 중 하나 사용
function stratG(currentNtce) {
  const myAg = ag.get(currentNtce);
  const pool = ansanNoticeNos.filter((n) => n !== currentNtce && ag.get(n) === myAg);
  if (pool.length < 5) return null;
  // 각 공고에서 추첨된 4개 번호의 모든 쌍을 카운트
  const pairCount = new Map();
  for (const ntce of pool) {
    const drwSet = drawn.get(ntce);
    if (!drwSet || drwSet.size < 2) continue;
    const arr = [...drwSet];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const key = [arr[i], arr[j]].sort().join(",");
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }
    }
  }
  const topPair = [...pairCount.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!topPair) return null;
  return topPair[0].split(",");
}

// ─── 시뮬 ───
const strategies = { D: stratD, E: stratE, F: stratF, G: stratG };
const results = { D: [], E: [], F: [], G: [], actual: [] };

for (const p of myParts) {
  const drawnSet = drawn.get(p.bid_ntce_no);
  if (!drawnSet || drawnSet.size === 0) continue;
  const myPick = [norm(p.drwt_no_1), norm(p.drwt_no_2)];
  results.actual.push(myPick.filter((x) => drawnSet.has(x)).length);
  for (const [name, fn] of Object.entries(strategies)) {
    const pick = fn(p.bid_ntce_no);
    if (!pick) {
      results[name].push(null);
      continue;
    }
    const hits = pick.filter((x) => drawnSet.has(x)).length;
    results[name].push(hits);
  }
}

function summary(arr) {
  const valid = arr.filter((x) => x !== null);
  if (valid.length === 0) return { avg: 0, n: 0, h0: 0, h1: 0, h2: 0 };
  const avg = valid.reduce((s, x) => s + x, 0) / valid.length;
  const h0 = valid.filter((x) => x === 0).length;
  const h1 = valid.filter((x) => x === 1).length;
  const h2 = valid.filter((x) => x === 2).length;
  return { avg, n: valid.length, h0, h1, h2 };
}

console.log("📊 고급 전략 시뮬 (LOO, 본인 32회)\n");
console.log("전략 | 표본 | 평균 적중 | 0/1/2 분포 | 1+ 적중률");
console.log("-".repeat(70));

const act = summary(results.actual);
console.log(`본인 실제      | ${String(act.n).padStart(2)} | ${act.avg.toFixed(3)} | ${act.h0}/${act.h1}/${act.h2} | ${((act.h1 + act.h2) / act.n * 100).toFixed(1)}%`);
console.log(`B (이전: 발주처) | 32 | 0.781 | 12/15/5 | 62.5% (참고)`);
console.log("-".repeat(70));

for (const [name, label] of [
  ["D", "D 발주처+최근가중"],
  ["E", "E 발주처+키워드"],
  ["F", "F 뉴그린 모방"],
  ["G", "G 쌍 패턴"],
]) {
  const s = summary(results[name]);
  if (s.n === 0) {
    console.log(`${label.padEnd(20)} | -- | (적용 불가) |`);
    continue;
  }
  const oneplus = ((s.h1 + s.h2) / s.n) * 100;
  const arrow = s.avg > act.avg ? `+${(s.avg - act.avg).toFixed(3)}` : `${(s.avg - act.avg).toFixed(3)}`;
  console.log(`${label.padEnd(20)} | ${String(s.n).padStart(2)} | ${s.avg.toFixed(3)} ${arrow.padStart(7)} | ${s.h0}/${s.h1}/${s.h2} | ${oneplus.toFixed(1)}%`);
}

console.log("\n참고: 다른 상위 업체 적중률");
console.log("  뉴그린조경: 0.967  (Top 1)");
console.log("  가림엔지니어링: 0.890");
console.log("  향림조경: 0.882");
console.log("  목림조경: 0.880");
console.log("  한솔조경건설: 0.880");
console.log("  유한회사 에스디건설: 0.837");
console.log("  운 베이스라인: 0.533");
