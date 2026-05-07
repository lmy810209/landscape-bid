#!/usr/bin/env node
// 5년치 시계열 트렌드 — 사정율 추세, 참여자 수, 신규/퇴출.

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

const wins = await fetchAll(
  "public_wins",
  "select=bid_ntce_no,bidwinnr_bizno,bidwinnr_nm,sucsfbid_rate,prtcpt_cnum,rl_openg_dt&is_ansan=eq.true&is_bangje=eq.false&order=rl_openg_dt.asc"
);

const byYear = {};
for (const w of wins) {
  if (!w.rl_openg_dt) continue;
  const y = w.rl_openg_dt.slice(0, 4);
  if (!byYear[y]) byYear[y] = { count: 0, rates: [], parts: [], biznos: new Set() };
  byYear[y].count++;
  if (w.sucsfbid_rate) byYear[y].rates.push(Number(w.sucsfbid_rate));
  if (w.prtcpt_cnum) byYear[y].parts.push(Number(w.prtcpt_cnum));
  if (w.bidwinnr_bizno) byYear[y].biznos.add(w.bidwinnr_bizno);
}

const median = (arr) => arr.length ? [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)] : null;
const mean = (arr) => arr.length ? arr.reduce((s, r) => s + r, 0) / arr.length : null;

console.log("=".repeat(95));
console.log("연도별 안산∩비방제 시장 변화");
console.log("=".repeat(95));
console.log("연도   공고수  사정율 평균  사정율 중앙  참가업체 평균  고유 낙찰자");
console.log("-".repeat(95));
const years = Object.keys(byYear).sort();
for (const y of years) {
  const v = byYear[y];
  console.log(
    y +
      "    " +
      v.count.toString().padStart(5) +
      "    " +
      (mean(v.rates)?.toFixed(2) ?? "—").padStart(6) +
      "%" +
      "      " +
      (median(v.rates)?.toFixed(2) ?? "—").padStart(6) +
      "%" +
      "      " +
      (mean(v.parts)?.toFixed(0) ?? "—").padStart(4) +
      "명" +
      "        " +
      v.biznos.size.toString().padStart(3) +
      "명"
  );
}

// 신규 진입자 (전 연도에 없던 업체)
console.log("\n--- 신규 진입자 / 퇴출자 ---");
let prevBiznos = new Set();
for (const y of years) {
  const cur = byYear[y].biznos;
  const newComers = [...cur].filter((b) => !prevBiznos.has(b));
  const dropped = [...prevBiznos].filter((b) => !cur.has(b));
  if (prevBiznos.size > 0) {
    console.log(`${y}: 신규 ${newComers.length} / 사라진 ${dropped.length}`);
  }
  for (const b of cur) prevBiznos.add(b);
}

// 사정율 트렌드 — 88% vs 90%대 분포 변화
console.log("\n--- 사정율 영역 분포 변화 ---");
console.log("연도   88%대(85~89.5)  89.5~90.5  90%대(90.5~92)");
for (const y of years) {
  const r = byYear[y].rates;
  const aggressive = r.filter((x) => x < 89.5).length;
  const middle = r.filter((x) => x >= 89.5 && x <= 90.5).length;
  const safe = r.filter((x) => x > 90.5).length;
  const total = r.length || 1;
  console.log(
    `${y}   ${((aggressive / total) * 100).toFixed(0)}% (${aggressive}건)`.padEnd(20) +
      `   ${((middle / total) * 100).toFixed(0)}% (${middle}건)`.padEnd(15) +
      `   ${((safe / total) * 100).toFixed(0)}% (${safe}건)`
  );
}
