#!/usr/bin/env node
// 추가 분석 — 못 한다고 했지만 실제 가능한 3가지.
// 1) 상위 업체별 추첨번호 패턴
// 2) 상위 업체 동시 출현 (같은 공고에 같이 등장)
// 3) 보험료 감액 공고에서 상위 업체 행동

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
  { bizno: "4958603422", name: "▶새빛조경" },
];
const TARGET_BIZNOS = new Set(TARGETS.map((t) => t.bizno));

async function fetchAll(table, query) {
  const all = [];
  let from = 0;
  while (true) {
    const r = await fetch(`${URL_BASE}/rest/v1/${table}?${query}&limit=1000&offset=${from}`, { headers: { apikey: KEY } });
    const d = await r.json();
    if (!d.length) break;
    all.push(...d);
    if (d.length < 1000) break;
    from += 1000;
  }
  return all;
}

console.log("데이터 로딩 중...");
const wins = await fetchAll("public_wins", "select=bid_ntce_no,bid_ntce_nm,dminstt_nm,raw&is_ansan=eq.true&is_bangje=eq.false");
const noticeIds = wins.map((w) => w.bid_ntce_no);

const participants = [];
for (let i = 0; i < noticeIds.length; i += 100) {
  const chunk = noticeIds.slice(i, i + 100);
  const inList = chunk.map((id) => encodeURIComponent(id)).join(",");
  const data = await fetchAll(
    "public_participants",
    `select=bid_ntce_no,prcbdr_bizno,prcbdr_nm,bidprcrt,drwt_no_1,drwt_no_2,rmrk&bid_ntce_no=in.(${inList})`
  );
  participants.push(...data);
}
console.log(`공고 ${wins.length}건 / 참여자 ${participants.length}명 로드 완료\n`);

function pad(s, n, right = false) {
  s = String(s);
  if (s.length >= n) return s.slice(0, n);
  return right ? s.padStart(n) : s.padEnd(n);
}

// ─────────────────────────────────────
// ① 상위 업체별 추첨번호 패턴
// ─────────────────────────────────────
console.log("=".repeat(110));
console.log("① 상위 업체별 추첨번호 선호 (정상 참여자 op13 누적)");
console.log("=".repeat(110));
console.log(
  pad("업체", 14) +
    "  Top1  freq |  Top2  freq |  Top3  freq |  Top4  freq |  Top5  freq | 총 입찰"
);
console.log("-".repeat(110));
for (const t of TARGETS) {
  const myEntries = participants.filter((p) => p.prcbdr_bizno === t.bizno && p.rmrk === "정상");
  const numbers = {};
  for (const e of myEntries) {
    const n1 = (e.drwt_no_1 || "").trim();
    const n2 = (e.drwt_no_2 || "").trim();
    if (n1) numbers[n1] = (numbers[n1] || 0) + 1;
    if (n2) numbers[n2] = (numbers[n2] || 0) + 1;
  }
  const total = Object.values(numbers).reduce((s, x) => s + x, 0);
  const top5 = Object.entries(numbers).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const cells = top5
    .map(([n, c]) => `${pad(n, 4, true)} ${pad(((c / total) * 100).toFixed(1) + "%", 5, true)}`)
    .concat(Array(5 - top5.length).fill("           "))
    .join(" | ");
  console.log(pad(t.name, 14) + "  " + cells + " | " + pad(myEntries.length, 7, true));
}

// ─────────────────────────────────────
// ② 상위 업체 동시 출현
// ─────────────────────────────────────
console.log("\n" + "=".repeat(110));
console.log("② 상위 업체 동시 출현 — 같은 공고에 정상 참여한 빈도");
console.log("=".repeat(110));
const noticeToTopBiznos = {};
for (const p of participants) {
  if (p.rmrk !== "정상") continue;
  if (!TARGET_BIZNOS.has(p.prcbdr_bizno)) continue;
  if (!noticeToTopBiznos[p.bid_ntce_no]) noticeToTopBiznos[p.bid_ntce_no] = new Set();
  noticeToTopBiznos[p.bid_ntce_no].add(p.prcbdr_bizno);
}
const biznoToName = Object.fromEntries(TARGETS.map((t) => [t.bizno, t.name]));
const pairCo = {};
for (const set of Object.values(noticeToTopBiznos)) {
  const arr = [...set];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const key = [arr[i], arr[j]].sort().join("|");
      pairCo[key] = (pairCo[key] || 0) + 1;
    }
  }
}
const topPairs = Object.entries(pairCo).sort((a, b) => b[1] - a[1]).slice(0, 15);
console.log("쌍                                  공동 정상 출현 공고 수");
for (const [key, count] of topPairs) {
  const [a, b] = key.split("|");
  console.log(`${pad(biznoToName[a] + " ↔ " + biznoToName[b], 36)}  ${count}건`);
}

// ─────────────────────────────────────
// ③ 보험료 감액 공고에서 상위 업체 행동
// ─────────────────────────────────────
console.log("\n" + "=".repeat(110));
console.log("③ 보험료 감액 적용 공고 vs 일반 공고 — 상위 업체 정상 진입률");
console.log("=".repeat(110));
function isInsurance(raw) {
  if (!raw) return false;
  const t = JSON.stringify(raw);
  return t.includes("소액수의견적") && (t.includes("국민연금") || t.includes("감액") || t.includes("보험료"));
}
const insuranceNotices = new Set();
const normalNotices = new Set();
for (const w of wins) {
  if (isInsurance(w.raw)) insuranceNotices.add(w.bid_ntce_no);
  else normalNotices.add(w.bid_ntce_no);
}
console.log(`보험료 감액 공고: ${insuranceNotices.size}건 / 일반: ${normalNotices.size}건\n`);
console.log(pad("업체", 14) + "  보험료감액 진입율 | 일반 진입율  | 차이");
console.log("-".repeat(110));
for (const t of TARGETS) {
  const myEntries = participants.filter((p) => p.prcbdr_bizno === t.bizno && p.rmrk === "정상");
  const insIn = new Set([...myEntries].filter((p) => insuranceNotices.has(p.bid_ntce_no)).map((p) => p.bid_ntce_no));
  const normIn = new Set([...myEntries].filter((p) => normalNotices.has(p.bid_ntce_no)).map((p) => p.bid_ntce_no));
  const insRate = insuranceNotices.size > 0 ? (insIn.size / insuranceNotices.size) * 100 : 0;
  const normRate = normalNotices.size > 0 ? (normIn.size / normalNotices.size) * 100 : 0;
  const diff = insRate - normRate;
  const arrow = diff < -5 ? "🚫 회피?" : diff > 5 ? "선호?" : "차이 없음";
  console.log(
    pad(t.name, 14) +
      pad(`${insIn.size}/${insuranceNotices.size} ${insRate.toFixed(0)}%`, 16, true) +
      "  | " +
      pad(`${normIn.size}/${normalNotices.size} ${normRate.toFixed(0)}%`, 12, true) +
      "  | " +
      pad(diff.toFixed(0) + "%p " + arrow, 18)
  );
}

console.log("\n" + "=".repeat(110));
console.log("⚠ 본 분석은 운영 패턴 관찰. 회피·담합·정보 우위로 단정하지 않음.");
console.log("=".repeat(110));
