#!/usr/bin/env node
// #1: 같은 공고에 본인 + 상위 업체 둘 다 정상 진입한 케이스 — 직접 매칭 비교.
// 본인 사정율 vs 상위 사정율 → 어디서 졌는지 추출.
// #2: 발주처 × 보험료 감액 비율 — 어느 발주처가 일반 공고 많은가.

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

const MY_BIZNO = "4958603422";
const TOP10 = [
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
];
const TOP_BIZNO_SET = new Set(TOP10.map((t) => t.bizno));
const NAME_BY_BIZNO = Object.fromEntries(TOP10.map((t) => [t.bizno, t.name]));

const methods = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "notice-methods.json"), "utf8"));
function isInsurance(no) {
  const m = methods[no]?.sucsfbid_method;
  if (!m) return false;
  return m.includes("소액수의견적") && (m.includes("국민연금") || m.includes("감액") || m.includes("보험료") || m.includes("합산액"));
}

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

console.log("로딩...");
const wins = await fetchAll("public_wins", "select=bid_ntce_no,bidwinnr_bizno,bidwinnr_nm,bid_ntce_nm,dminstt_nm,sucsfbid_amt&is_ansan=eq.true&is_bangje=eq.false");
const noticeMeta = Object.fromEntries(wins.map((w) => [w.bid_ntce_no, w]));
const noticeIds = wins.map((w) => w.bid_ntce_no);

const participants = [];
for (let i = 0; i < noticeIds.length; i += 100) {
  const chunk = noticeIds.slice(i, i + 100);
  const inList = chunk.map((id) => encodeURIComponent(id)).join(",");
  const data = await fetchAll(
    "public_participants",
    `select=bid_ntce_no,prcbdr_bizno,prcbdr_nm,bidprcrt,bidprc_amt,rmrk&bid_ntce_no=in.(${inList})`
  );
  participants.push(...data);
}
console.log(`공고 ${wins.length} / 참여자 ${participants.length}\n`);

function pad(s, n, right = false) {
  s = String(s);
  if (s.length >= n) return s.slice(0, n);
  return right ? s.padStart(n) : s.padEnd(n);
}

// ─────────────────────────────────────────
// #1: 본인 + 상위 동시 정상 진입 공고 매칭
// ─────────────────────────────────────────
console.log("=".repeat(110));
console.log("#1: 같은 공고에 본인 + 상위 둘 다 정상 진입 — 직접 사정율 비교");
console.log("=".repeat(110));

// 본인 정상 진입 공고들
const myEntries = participants.filter((p) => p.prcbdr_bizno === MY_BIZNO && p.rmrk === "정상");
console.log(`본인 정상 진입 공고: ${myEntries.length}개\n`);

// 각 공고에 어떤 상위 업체가 들어왔는지 + 사정율
const myNoticeIds = new Set(myEntries.map((e) => e.bid_ntce_no));
const myRateByNotice = Object.fromEntries(myEntries.map((e) => [e.bid_ntce_no, Number(e.bidprcrt)]));
const winnerByNotice = {};
for (const w of wins) {
  winnerByNotice[w.bid_ntce_no] = { bizno: w.bidwinnr_bizno, name: w.bidwinnr_nm };
}

// 본인이 진입한 공고에서 다른 상위 업체들이 어떻게 했는지
const headToHead = []; // { notice, my_rate, top_bizno, top_rate, winner_bizno, am_i_lower, am_i_winner }
for (const myE of myEntries) {
  const noticeId = myE.bid_ntce_no;
  const myRate = Number(myE.bidprcrt);
  const otherTops = participants.filter(
    (p) => p.bid_ntce_no === noticeId && TOP_BIZNO_SET.has(p.prcbdr_bizno) && p.rmrk === "정상"
  );
  const winner = winnerByNotice[noticeId];
  const amIWinner = winner?.bizno === MY_BIZNO;
  for (const top of otherTops) {
    headToHead.push({
      notice: noticeId,
      notice_name: noticeMeta[noticeId]?.bid_ntce_nm,
      agency: noticeMeta[noticeId]?.dminstt_nm,
      is_insurance: isInsurance(noticeId),
      my_rate: myRate,
      top_bizno: top.prcbdr_bizno,
      top_name: NAME_BY_BIZNO[top.prcbdr_bizno],
      top_rate: Number(top.bidprcrt),
      winner_name: winner?.name,
      am_i_winner: amIWinner,
    });
  }
}

console.log(`본인 vs 상위 직접 매칭 케이스: ${headToHead.length}건\n`);

// 상위 업체별 매칭 통계
console.log(pad("상위", 12) + pad("매칭", 5, true) + pad("본인↑", 7, true) + pad("본인=", 7, true) + pad("본인↓", 7, true) + " | 본인 평균 / 상위 평균");
console.log("-".repeat(110));
for (const t of TOP10) {
  const matches = headToHead.filter((h) => h.top_bizno === t.bizno);
  if (matches.length === 0) continue;
  const lowerCount = matches.filter((h) => h.my_rate < h.top_rate).length;
  const equalCount = matches.filter((h) => Math.abs(h.my_rate - h.top_rate) < 0.01).length;
  const higherCount = matches.filter((h) => h.my_rate > h.top_rate).length;
  const myMean = matches.reduce((s, h) => s + h.my_rate, 0) / matches.length;
  const topMean = matches.reduce((s, h) => s + h.top_rate, 0) / matches.length;
  console.log(
    pad(t.name, 12) +
      pad(matches.length, 5, true) +
      pad(lowerCount, 7, true) +
      pad(equalCount, 7, true) +
      pad(higherCount, 7, true) +
      ` | ${myMean.toFixed(2)} / ${topMean.toFixed(2)}`
  );
}

// 본인이 졌지만 큰 차이 케이스 (학습 가치 큼)
console.log("\n--- 본인이 상위보다 더 높게 (졌고) 차이 큰 사례 (TOP 10) ---");
const losses = headToHead
  .filter((h) => h.my_rate > h.top_rate)
  .map((h) => ({ ...h, gap: h.my_rate - h.top_rate }))
  .sort((a, b) => b.gap - a.gap)
  .slice(0, 10);
for (const l of losses) {
  const ins = l.is_insurance ? "[감액]" : "[일반]";
  console.log(
    `  ${ins} ${l.notice_name?.slice(0, 35)} | 본인 ${l.my_rate.toFixed(2)} vs ${l.top_name} ${l.top_rate.toFixed(2)} (차이 ${l.gap.toFixed(2)})`
  );
}

// ─────────────────────────────────────────
// #2: 발주처 × 보험료 감액 비율
// ─────────────────────────────────────────
console.log("\n" + "=".repeat(110));
console.log("#2: 발주처별 보험료 감액 vs 일반 공고 비율 — 새빛이 시도해야 할 일반 공고 영역");
console.log("=".repeat(110));

const byAgency = {};
for (const w of wins) {
  if (!w.dminstt_nm) continue;
  if (!byAgency[w.dminstt_nm]) byAgency[w.dminstt_nm] = { total: 0, insurance: 0, normal: 0 };
  byAgency[w.dminstt_nm].total++;
  if (isInsurance(w.bid_ntce_no)) byAgency[w.dminstt_nm].insurance++;
  else byAgency[w.dminstt_nm].normal++;
}

const sortedAgencies = Object.entries(byAgency)
  .filter(([, v]) => v.total >= 5)
  .sort((a, b) => b[1].total - a[1].total);

console.log(pad("발주처", 36) + pad("총공고", 7, true) + pad("감액", 7, true) + pad("일반", 7, true) + pad("일반비율", 10, true) + "  | 새빛 진입");
console.log("-".repeat(110));
for (const [agency, v] of sortedAgencies) {
  const normalRate = (v.normal / v.total) * 100;
  // 새빛 정상 진입 (이 발주처 한정)
  const myInThisAgency = participants.filter(
    (p) => p.prcbdr_bizno === MY_BIZNO && p.rmrk === "정상" && noticeMeta[p.bid_ntce_no]?.dminstt_nm === agency
  ).length;
  const myNormalInThisAgency = participants.filter(
    (p) =>
      p.prcbdr_bizno === MY_BIZNO &&
      p.rmrk === "정상" &&
      noticeMeta[p.bid_ntce_no]?.dminstt_nm === agency &&
      !isInsurance(p.bid_ntce_no)
  ).length;
  console.log(
    pad(agency, 36) +
      pad(v.total, 7, true) +
      pad(v.insurance, 7, true) +
      pad(v.normal, 7, true) +
      pad(normalRate.toFixed(0) + "%", 10, true) +
      `  | 정상 ${myInThisAgency} (일반에 ${myNormalInThisAgency})`
  );
}

console.log("\n핵심: '일반비율' 높은 발주처 = 새빛이 88%대 시도해야 할 영역");
console.log("\n" + "=".repeat(110));
