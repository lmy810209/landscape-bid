#!/usr/bin/env node
// 공고명 임베딩(유사도) 매칭 시뮬레이션.
//
// 가설: "2026년 단원구 가로수 민원처리공사" 와 의미적으로 유사한 과거 공고 →
//       그들의 추첨번호 패턴을 더 정확히 반영.
//
// 외부 임베딩 API 없이 char n-gram Jaccard 유사도 사용 (한국어에 적합).

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

const ag = new Map(wins.map((w) => [w.bid_ntce_no, w.dminstt_nm ?? "?"]));
const nm = new Map(wins.map((w) => [w.bid_ntce_no, w.bid_ntce_nm ?? ""]));

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

// ─── 임베딩: 공고명 → char trigram set + word set 합집합 ───
function tokenize(text) {
  if (!text) return new Set();
  // 1) char trigrams (한글 의미 단위 잡기)
  const cleaned = text.replace(/\s+/g, " ").replace(/[()공사사업등년]/g, "");
  const trigrams = new Set();
  for (let i = 0; i < cleaned.length - 2; i++) {
    trigrams.add(cleaned.slice(i, i + 3));
  }
  // 2) words (공백 분리)
  const words = text.split(/\s+/).filter((w) => w.length >= 2);
  return new Set([...trigrams, ...words]);
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

const tokensByNtce = new Map();
for (const w of wins) tokensByNtce.set(w.bid_ntce_no, tokenize(w.bid_ntce_nm));

// ─── 시뮬: 본인 32회 LOO ───
function recommendByEmbedding(currentNtce, topK) {
  const myTokens = tokensByNtce.get(currentNtce);
  if (!myTokens) return null;
  // 다른 모든 안산∩비방제 공고에 대해 유사도 계산
  const sims = [];
  for (const w of wins) {
    if (w.bid_ntce_no === currentNtce) continue;
    const t = tokensByNtce.get(w.bid_ntce_no);
    if (!t) continue;
    const s = jaccard(myTokens, t);
    if (s > 0) sims.push({ ntce: w.bid_ntce_no, s });
  }
  sims.sort((a, b) => b.s - a.s);
  const top = sims.slice(0, topK);
  if (top.length === 0) return null;

  const score = {};
  for (const { ntce, s } of top) {
    const list = byNotice.get(ntce) ?? [];
    for (const p of list) {
      const sno = norm(p.compno_rsrvtn_prce_sno);
      score[sno] = (score[sno] ?? 0) + (p.drwt_num ?? 0) * s; // 유사도 가중
    }
  }
  return Object.entries(score).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([s]) => s);
}

const KS = [5, 10, 15, 20, 30];
const results = { actual: [] };
for (const k of KS) results[`K${k}`] = [];

for (const p of myParts) {
  const drawnSet = drawn.get(p.bid_ntce_no);
  if (!drawnSet || drawnSet.size === 0) continue;
  const myPick = [norm(p.drwt_no_1), norm(p.drwt_no_2)];
  results.actual.push(myPick.filter((x) => drawnSet.has(x)).length);
  for (const k of KS) {
    const pick = recommendByEmbedding(p.bid_ntce_no, k);
    if (!pick) {
      results[`K${k}`].push(null);
    } else {
      results[`K${k}`].push(pick.filter((x) => drawnSet.has(x)).length);
    }
  }
}

function summary(arr) {
  const valid = arr.filter((x) => x !== null);
  if (valid.length === 0) return { avg: 0, n: 0 };
  return {
    avg: valid.reduce((s, x) => s + x, 0) / valid.length,
    n: valid.length,
    h0: valid.filter((x) => x === 0).length,
    h1: valid.filter((x) => x === 1).length,
    h2: valid.filter((x) => x === 2).length,
  };
}

console.log("📊 공고명 유사도(Jaccard) 임베딩 시뮬\n");
console.log("전략 | 표본 | 평균 적중 | 분포 | vs 본인");
console.log("-".repeat(70));
const act = summary(results.actual);
console.log(`본인 실제                       | ${act.n} | ${act.avg.toFixed(3)} | ${act.h0}/${act.h1}/${act.h2} |`);
console.log(`B 단순 발주처별 (이전 결과)        | 32 | 0.781 | 12/15/5 | +0.188`);
console.log("-".repeat(70));
for (const k of KS) {
  const s = summary(results[`K${k}`]);
  const diff = s.avg - act.avg;
  console.log(`임베딩 Top ${String(k).padStart(2)} 가중합           | ${String(s.n).padStart(2)} | ${s.avg.toFixed(3)} | ${s.h0}/${s.h1}/${s.h2} | ${diff >= 0 ? "+" : ""}${diff.toFixed(3)}`);
}

// 임베딩 + 발주처 매칭 결합
console.log("\n📊 임베딩 + 발주처 결합 (같은 발주처 안에서만 유사도)\n");
function recommendByAgencyEmbedding(currentNtce, topK) {
  const myAg = ag.get(currentNtce);
  const myTokens = tokensByNtce.get(currentNtce);
  if (!myTokens || !myAg) return null;
  const sims = [];
  for (const w of wins) {
    if (w.bid_ntce_no === currentNtce || w.dminstt_nm !== myAg) continue;
    const t = tokensByNtce.get(w.bid_ntce_no);
    const s = jaccard(myTokens, t);
    if (s > 0) sims.push({ ntce: w.bid_ntce_no, s });
  }
  sims.sort((a, b) => b.s - a.s);
  const top = sims.slice(0, topK);
  if (top.length < 3) return null;
  const score = {};
  for (const { ntce, s } of top) {
    const list = byNotice.get(ntce) ?? [];
    for (const p of list) {
      const sno = norm(p.compno_rsrvtn_prce_sno);
      score[sno] = (score[sno] ?? 0) + (p.drwt_num ?? 0) * s;
    }
  }
  return Object.entries(score).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([s]) => s);
}

console.log("전략 | 표본 | 평균 적중");
console.log("-".repeat(50));
for (const k of [5, 10, 15, 20]) {
  const hits = [];
  for (const p of myParts) {
    const drawnSet = drawn.get(p.bid_ntce_no);
    if (!drawnSet || drawnSet.size === 0) continue;
    const pick = recommendByAgencyEmbedding(p.bid_ntce_no, k);
    if (!pick) { hits.push(null); continue; }
    hits.push(pick.filter((x) => drawnSet.has(x)).length);
  }
  const s = summary(hits);
  console.log(`발주처+임베딩 Top ${String(k).padStart(2)}      | ${String(s.n).padStart(2)} | ${s.avg.toFixed(3)} (${s.h0}/${s.h1}/${s.h2})`);
}
