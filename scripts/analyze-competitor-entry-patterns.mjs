#!/usr/bin/env node
// 상위 10개 업체 + 새빛조경의 정상 진입 패턴 분석.
//
// 데이터 한계 (반드시 보고서 본문에 명시):
//  - "정상 진입" = op13에 정상 투찰로 잡힌 경우.
//  - "정상 진입하지 않음" = 비참여 또는 미달 부적격 (구분 불가).
//  - 미달은 op13에 누락 — 실제 참여율은 더 높을 수 있음.
//
// 콘솔 전용. UI 미반영.

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
  { bizno: "4078111745", name: "유한회사 에스디건설" },
  { bizno: "1058651768", name: "대동이앤씨주식회사" },
  { bizno: "1348125448", name: "안산조경건설(주)" },
  { bizno: "1348629134", name: "(주)경안스틸" },
  { bizno: "3228601242", name: "경인이엔지주식회사" },
  { bizno: "1318174940", name: "참터종합건설 주식회사" },
  { bizno: "1348611162", name: "주식회사제현산업" },
  { bizno: "1342263862", name: "까치조경" },
  { bizno: "1348611992", name: "주식회사 남양" },
  { bizno: "7648800359", name: "주식회사 에코그린" },
  { bizno: "4958603422", name: "(주)새빛조경" },
];

async function fetchAll(table, query) {
  const all = [];
  let from = 0;
  while (true) {
    const url = `${URL_BASE}/rest/v1/${table}?${query}&limit=1000&offset=${from}`;
    const r = await fetch(url, { headers: { apikey: KEY } });
    const data = await r.json();
    if (!data.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

const KEYWORDS = ["공원", "유지관리", "보수", "풀깎기", "전정", "녹지", "수목", "식재", "예초", "민원"];
const AMOUNT_BUCKETS = [
  ["~2천만", 0, 20_000_000],
  ["2~5천만", 20_000_000, 50_000_000],
  ["5천~1억", 50_000_000, 100_000_000],
  ["1~3억", 100_000_000, 300_000_000],
  ["3억~", 300_000_000, Infinity],
];

function quantile(sorted, p) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(Math.floor(sorted.length * p), sorted.length - 1)];
}

function pad(s, n, right = false) {
  s = String(s);
  if (s.length >= n) return s.slice(0, n);
  return right ? s.padStart(n) : s.padEnd(n);
}

console.log("\n데이터 로딩 중...");
const wins = await fetchAll(
  "public_wins",
  "select=bid_ntce_no,bidwinnr_bizno,bidwinnr_nm,bid_ntce_nm,dminstt_nm,sucsfbid_amt,sucsfbid_rate,rl_openg_dt&is_ansan=eq.true&is_bangje=eq.false&order=rl_openg_dt.asc"
);
// participants는 양이 많아서 안산∩비방제 공고 IDs 필터로 한정
const noticeIds = wins.map((w) => w.bid_ntce_no);
console.log(`안산∩비방제 공고: ${wins.length}건, 참여자 데이터 로딩...`);

const participants = [];
const CHUNK = 100;
for (let i = 0; i < noticeIds.length; i += CHUNK) {
  const chunk = noticeIds.slice(i, i + CHUNK);
  const inList = chunk.map((id) => encodeURIComponent(id)).join(",");
  const data = await fetchAll(
    "public_participants",
    `select=bid_ntce_no,prcbdr_bizno,prcbdr_nm,bidprcrt,openg_rank,rmrk&bid_ntce_no=in.(${inList})`
  );
  participants.push(...data);
}
console.log(`참여자 records: ${participants.length}\n`);

// 공고 → bizno 매핑
const noticeMeta = {};
for (const w of wins) noticeMeta[w.bid_ntce_no] = w;

// participant 빠른 조회: bizno → set of notice_no
const entriesByBizno = {};
for (const p of participants) {
  if (!p.prcbdr_bizno) continue;
  const k = p.prcbdr_bizno;
  if (!entriesByBizno[k]) entriesByBizno[k] = { all: new Set(), normal: new Set(), bidRates: [] };
  entriesByBizno[k].all.add(p.bid_ntce_no);
  if (p.rmrk === "정상") {
    entriesByBizno[k].normal.add(p.bid_ntce_no);
    if (p.bidprcrt != null) entriesByBizno[k].bidRates.push({ rate: Number(p.bidprcrt), notice: p.bid_ntce_no });
  }
}

const totalNotices = wins.length;

// ─────────────────────────────────────────
// A. 업체별 정상 진입률 + 낙찰률
// ─────────────────────────────────────────
console.log("=".repeat(110));
console.log("A. 업체별 정상 진입률 / 낙찰률");
console.log("=".repeat(110));
console.log(
  pad("업체", 26) +
    pad("정상진입", 10, true) +
    pad("진입률", 9, true) +
    pad("낙찰", 6, true) +
    pad("진입대비", 10, true) +
    pad("전체대비", 10, true)
);
console.log("-".repeat(110));

for (const t of TARGETS) {
  const e = entriesByBizno[t.bizno];
  const normalCount = e ? e.normal.size : 0;
  const winsCount = wins.filter((w) => w.bidwinnr_bizno === t.bizno).length;
  const enterRate = (normalCount / totalNotices) * 100;
  const winPerEntry = normalCount > 0 ? (winsCount / normalCount) * 100 : null;
  const winPerTotal = (winsCount / totalNotices) * 100;
  console.log(
    pad((t.bizno === "4958603422" ? "▶ " : "") + t.name, 26) +
      pad(normalCount, 10, true) +
      pad(enterRate.toFixed(1) + "%", 9, true) +
      pad(winsCount, 6, true) +
      pad(winPerEntry != null ? winPerEntry.toFixed(1) + "%" : "—", 10, true) +
      pad(winPerTotal.toFixed(1) + "%", 10, true)
  );
}

// ─────────────────────────────────────────
// B. 발주처별 정상 진입 패턴 (Top 5 발주처 위주)
// ─────────────────────────────────────────
console.log("\n" + "=".repeat(110));
console.log("B. 발주처별 정상 진입 — 우연 기대 대비 집중도");
console.log("=".repeat(110));
const totalCompanies = 61;
const expectedShare = 1 / totalCompanies;
console.log(`(우연 기대 점유율 = 1/61 = ${(expectedShare * 100).toFixed(2)}%)`);
console.log("-".repeat(110));

const TOP_AGENCIES = ["경기도 안산시", "경기도 안산시 상록구", "경기도 안산시 단원구", "경기도교육청 경기도안산교육지원청"];

console.log(pad("업체", 26) + TOP_AGENCIES.map((a) => pad(a.split(" ").pop(), 18, true)).join(""));
for (const t of TARGETS) {
  const e = entriesByBizno[t.bizno];
  const row = [pad((t.bizno === "4958603422" ? "▶ " : "") + t.name, 26)];
  for (const agency of TOP_AGENCIES) {
    const noticesInAgency = wins.filter((w) => w.dminstt_nm === agency).map((w) => w.bid_ntce_no);
    if (noticesInAgency.length === 0) {
      row.push(pad("—", 18, true));
      continue;
    }
    const myEntries = e ? noticesInAgency.filter((n) => e.normal.has(n)).length : 0;
    const enterRate = (myEntries / noticesInAgency.length) * 100;
    const wonInAgency = wins.filter(
      (w) => w.dminstt_nm === agency && w.bidwinnr_bizno === t.bizno
    ).length;
    row.push(pad(`${myEntries}/${noticesInAgency.length} ${enterRate.toFixed(0)}% (낙${wonInAgency})`, 18, true));
  }
  console.log(row.join(""));
}

// ─────────────────────────────────────────
// C. 키워드별 정상 진입 패턴
// ─────────────────────────────────────────
console.log("\n" + "=".repeat(110));
console.log("C. 키워드별 정상 진입률 (해당 키워드 공고 중 정상 진입한 비율)");
console.log("=".repeat(110));
console.log(pad("업체", 26) + KEYWORDS.map((k) => pad(k, 8, true)).join(""));
console.log("-".repeat(110));
for (const t of TARGETS) {
  const e = entriesByBizno[t.bizno];
  const row = [pad((t.bizno === "4958603422" ? "▶ " : "") + t.name, 26)];
  for (const kw of KEYWORDS) {
    const noticesWithKw = wins.filter((w) => w.bid_ntce_nm?.includes(kw));
    if (noticesWithKw.length === 0) {
      row.push(pad("—", 8, true));
      continue;
    }
    const myEntries = e ? noticesWithKw.filter((w) => e.normal.has(w.bid_ntce_no)).length : 0;
    const rate = (myEntries / noticesWithKw.length) * 100;
    row.push(pad(`${myEntries}/${noticesWithKw.length}`, 8, true));
  }
  console.log(row.join(""));
}

// ─────────────────────────────────────────
// D. 금액대별 정상 진입
// ─────────────────────────────────────────
console.log("\n" + "=".repeat(110));
console.log("D. 금액대별 정상 진입");
console.log("=".repeat(110));
console.log(pad("업체", 26) + AMOUNT_BUCKETS.map(([n]) => pad(n, 14, true)).join(""));
console.log("-".repeat(110));
for (const t of TARGETS) {
  const e = entriesByBizno[t.bizno];
  const row = [pad((t.bizno === "4958603422" ? "▶ " : "") + t.name, 26)];
  for (const [name, lo, hi] of AMOUNT_BUCKETS) {
    const noticesInBucket = wins.filter(
      (w) => Number(w.sucsfbid_amt) >= lo && Number(w.sucsfbid_amt) < hi
    );
    if (noticesInBucket.length === 0) {
      row.push(pad("—", 14, true));
      continue;
    }
    const myEntries = e ? noticesInBucket.filter((w) => e.normal.has(w.bid_ntce_no)).length : 0;
    const rate = (myEntries / noticesInBucket.length) * 100;
    row.push(pad(`${myEntries}/${noticesInBucket.length} ${rate.toFixed(0)}%`, 14, true));
  }
  console.log(row.join(""));
}

// ─────────────────────────────────────────
// F. 정상 진입 사정율 분포 (E 계절은 통계 약하니 생략)
// ─────────────────────────────────────────
console.log("\n" + "=".repeat(110));
console.log("F. 정상 진입 사정율 분포 (op13 정상 투찰 기준, vs 예정가격)");
console.log("=".repeat(110));
console.log(
  pad("업체", 26) +
    pad("진입수", 8, true) +
    pad("평균", 8, true) +
    pad("중앙", 8, true) +
    pad("P25", 8, true) +
    pad("P75", 8, true) +
    pad("IQR", 8, true) +
    pad("min~max", 14, true) +
    " 분류"
);
console.log("-".repeat(110));
for (const t of TARGETS) {
  const e = entriesByBizno[t.bizno];
  if (!e || e.bidRates.length === 0) {
    console.log(pad((t.bizno === "4958603422" ? "▶ " : "") + t.name, 26) + " (데이터 없음)");
    continue;
  }
  const rates = e.bidRates.map((x) => x.rate).sort((a, b) => a - b);
  const mean = rates.reduce((s, r) => s + r, 0) / rates.length;
  const median = quantile(rates, 0.5);
  const p25 = quantile(rates, 0.25);
  const p75 = quantile(rates, 0.75);
  const iqr = p75 - p25;
  const min = rates[0];
  const max = rates[rates.length - 1];
  const cls =
    iqr < 0.5 ? "🎯 매우정밀" : iqr < 1.0 ? "정밀" : iqr < 2.0 ? "보통" : "분산형";
  console.log(
    pad((t.bizno === "4958603422" ? "▶ " : "") + t.name, 26) +
      pad(rates.length, 8, true) +
      pad(mean.toFixed(2), 8, true) +
      pad(median.toFixed(2), 8, true) +
      pad(p25.toFixed(2), 8, true) +
      pad(p75.toFixed(2), 8, true) +
      pad(iqr.toFixed(2), 8, true) +
      pad(`${min.toFixed(1)}~${max.toFixed(1)}`, 14, true) +
      " " +
      cls
  );
}

console.log("\n" + "=".repeat(110));
console.log("⚠ 데이터 한계");
console.log("  - '정상 진입' = op13에 정상 투찰로 잡힌 공고만.");
console.log("  - '정상 진입하지 않음' = 실제 비참여 또는 낙찰하한선미달 부적격 (구분 불가).");
console.log("  - 미달 부적격은 op13에 누락 — 실제 시도율은 더 높을 수 있음.");
console.log("  - 본 결과는 '운영 패턴 관찰'일 뿐, 회피·담합·정보 우위로 단정하지 않음.");
console.log("=".repeat(110));
