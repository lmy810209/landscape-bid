#!/usr/bin/env node
// 추첨번호 + 사정율 결합 — 어떤 번호 + 사정율 조합이 1등 됐나.

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

// 1등 (rank=1) 정상 진입자 가져오기
const rank1 = [];
for (let i = 0; i < noticeIds.length; i += 100) {
  const chunk = noticeIds.slice(i, i + 100);
  const inList = chunk.map((id) => encodeURIComponent(id)).join(",");
  const data = await fetchAll(
    "public_participants",
    `select=bid_ntce_no,bidprcrt,drwt_no_1,drwt_no_2,prcbdr_nm&bid_ntce_no=in.(${inList})&openg_rank=eq.1&rmrk=eq.정상`
  );
  rank1.push(...data);
}

console.log(`1등 정상 진입자: ${rank1.length}건\n`);

// 추첨번호별 1등 빈도 (드라이 + 사정율 평균)
const byNumber = {};
for (const r of rank1) {
  const n1 = (r.drwt_no_1 ?? "").trim();
  const n2 = (r.drwt_no_2 ?? "").trim();
  const rate = Number(r.bidprcrt);
  if (isNaN(rate)) continue;
  for (const n of [n1, n2]) {
    if (!n) continue;
    if (!byNumber[n]) byNumber[n] = { count: 0, rates: [] };
    byNumber[n].count++;
    byNumber[n].rates.push(rate);
  }
}

console.log("=".repeat(85));
console.log("추첨번호별 1등 빈도 + 그 때 사정율");
console.log("=".repeat(85));
const sorted = Object.entries(byNumber)
  .map(([n, d]) => ({ n, count: d.count, mean: d.rates.reduce((s, r) => s + r, 0) / d.rates.length }))
  .sort((a, b) => b.count - a.count);
console.log("번호    1등 횟수     평균 사정율 (1등됐을 때)");
console.log("-".repeat(85));
for (const x of sorted) {
  console.log(`${x.n.padStart(2, "0")}      ${x.count.toString().padStart(4)}       ${x.mean.toFixed(2)}%`);
}

// 사정율 영역별 1등 추첨번호
console.log("\n=== 사정율 영역별 1등 추첨번호 ===");
const buckets = [
  ["88% 이하 (공격형)", (r) => r < 89],
  ["89~90% (중간)", (r) => r >= 89 && r < 90],
  ["90~91% (안전형)", (r) => r >= 90 && r < 91],
  ["91% 이상 (보수)", (r) => r >= 91],
];
for (const [label, fn] of buckets) {
  const matches = rank1.filter((r) => fn(Number(r.bidprcrt)));
  const numbers = {};
  for (const r of matches) {
    for (const n of [(r.drwt_no_1 ?? "").trim(), (r.drwt_no_2 ?? "").trim()]) {
      if (n) numbers[n] = (numbers[n] ?? 0) + 1;
    }
  }
  const top5 = Object.entries(numbers).sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log(`${label}: ${matches.length}건 | Top 5 번호: ${top5.map(([n, c]) => `${n}(${c})`).join(", ")}`);
}

console.log("\n해석:");
console.log("- 모든 영역에서 번호 분포 비슷하면 추첨번호 영역 의존성 X");
console.log("- 영역별 다르면 사정율과 번호 결합 패턴 존재");
