#!/usr/bin/env node
// 재입찰 식별 + 분석.
// 재입찰 = 1차 유찰 → 재공고 (bid_ntce_ord != "000" or rbid_no != "000").

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
  "select=bid_ntce_no,bid_ntce_ord,rbid_no,bid_ntce_nm,dminstt_nm,sucsfbid_rate&is_ansan=eq.true&is_bangje=eq.false"
);

const rebids = wins.filter((w) => (w.bid_ntce_ord && w.bid_ntce_ord !== "000") || (w.rbid_no && w.rbid_no !== "000"));
const firstBids = wins.filter((w) => (!w.bid_ntce_ord || w.bid_ntce_ord === "000") && (!w.rbid_no || w.rbid_no === "000"));

console.log(`전체: ${wins.length}건`);
console.log(`첫 입찰: ${firstBids.length} (${(firstBids.length / wins.length * 100).toFixed(1)}%)`);
console.log(`재입찰: ${rebids.length} (${(rebids.length / wins.length * 100).toFixed(1)}%)\n`);

if (rebids.length > 0) {
  // 사정율 비교
  const firstRates = firstBids.map((w) => Number(w.sucsfbid_rate)).filter((r) => !isNaN(r));
  const rebidRates = rebids.map((w) => Number(w.sucsfbid_rate)).filter((r) => !isNaN(r));
  const mean = (arr) => arr.reduce((s, r) => s + r, 0) / arr.length;
  const median = (arr) => [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)];
  console.log("사정율 비교:");
  console.log(`  첫 입찰: 평균 ${mean(firstRates).toFixed(2)}% / 중앙 ${median(firstRates).toFixed(2)}%`);
  console.log(`  재입찰:  평균 ${mean(rebidRates).toFixed(2)}% / 중앙 ${median(rebidRates).toFixed(2)}%`);
  console.log(`  차이: ${(mean(rebidRates) - mean(firstRates)).toFixed(2)}%p\n`);

  console.log("재입찰 케이스 (최근 10건):");
  rebids.slice(0, 10).forEach((r) => {
    console.log(`  ${r.bid_ntce_no} ord=${r.bid_ntce_ord} rbid=${r.rbid_no} ${(r.bid_ntce_nm ?? "").slice(0, 40)} | 사정율 ${r.sucsfbid_rate}%`);
  });
} else {
  console.log("재입찰 케이스 없음 — 5년치에 모두 첫 입찰 1회 만에 낙찰됨.");
}
