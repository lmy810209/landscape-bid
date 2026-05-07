#!/usr/bin/env node
// bid_method (낙찰자결정방법) 세분화 분포 + 사정율 비교.

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

const methods = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "notice-methods.json"), "utf8"));

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

const wins = await fetchAll("public_wins", "select=bid_ntce_no,sucsfbid_rate&is_ansan=eq.true&is_bangje=eq.false");
const rateByNo = Object.fromEntries(wins.map((w) => [w.bid_ntce_no, Number(w.sucsfbid_rate)]));

// bid_method를 단순화하여 그룹화
function classify(m) {
  if (!m) return "(미상)";
  if (m.includes("적격심사")) return "적격심사";
  if (m.includes("종합평가") || m.includes("종합심사")) return "종합평가";
  if (m.includes("협상")) return "협상에 의한 계약";
  if (m.includes("소액수의견적")) {
    if (m.includes("국민연금") || m.includes("감액") || m.includes("보험료") || m.includes("합산액")) {
      return "소액수의견적 (보험료 감액)";
    }
    return "소액수의견적";
  }
  if (m.includes("수의계약")) return "수의계약";
  if (m.includes("최저가")) return "최저가";
  return m.slice(0, 30);
}

const groups = {};
for (const [no, m] of Object.entries(methods)) {
  const cat = classify(m?.sucsfbid_method);
  const rate = rateByNo[no];
  if (!groups[cat]) groups[cat] = [];
  if (rate && !isNaN(rate)) groups[cat].push(rate);
}

const median = (arr) => arr.length ? [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)] : null;
const mean = (arr) => arr.length ? arr.reduce((s, r) => s + r, 0) / arr.length : null;

console.log("=".repeat(85));
console.log("낙찰자결정방법별 분포 + 사정율 (5년 안산∩비방제 652건)");
console.log("=".repeat(85));
console.log("방식                                  공고수  비율    평균사정    중앙사정");
console.log("-".repeat(85));
const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
const total = wins.length;
for (const [cat, rates] of sorted) {
  const m = mean(rates);
  const med = median(rates);
  console.log(
    cat.padEnd(38) +
      rates.length.toString().padStart(5) +
      " " +
      ((rates.length / total) * 100).toFixed(1).padStart(5) +
      "%" +
      (m != null ? "  " + m.toFixed(2) + "%" : "  —     ") +
      (med != null ? "    " + med.toFixed(2) + "%" : "    —     ")
  );
}

console.log("\n해석:");
console.log("- 보험료 감액 적용 vs 기타 → 사정율 차이 큼 (이미 분석)");
console.log("- 적격심사 / 종합평가 / 협상 / 수의 별 패턴 → 영역별 새빛 진입 전략 차이");
