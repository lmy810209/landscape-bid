#!/usr/bin/env node
// 어제 공고(R26BK01294519) 상위권 업체의 과거 3년 낙찰 이력 조회.
//
// 목적: "반복 상위권 업체" 가설 검증 + 본인 경쟁 풀 식별.
//
// 조건:
//   - 본인(새빛조경)은 안산시 사업자, 나무의사 없음 → 방제 공사 참여 불가
//   - 관심: 각 업체의 (a) 안산 집중도, (b) 방제/비방제 분포, (c) 안산+비방제 빈도
//
// API: getScsbidListSttusCnstwkPPSSrch (PPSSrch 변형, bizno 파라미터 지원)
// 기간: 2023-04-24 ~ 2026-04-24 (36개월)
//
// 분류 규칙:
//   방제 키워드: 방제, 병해충, 살균, 살충, 소독, 약제살포
//   안산 매칭: dminsttNm contains "안산"
//
// 주의: 낙찰 기록만 조회됨. 낙찰 못한 참여는 이 API로 안 나옴
//       (그래서 "상위권 업체"를 "반복 낙찰 업체"로 근사).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const API_KEY = env.NARA_API_KEY;
if (!API_KEY) {
  console.error("❌ NARA_API_KEY 없음");
  process.exit(1);
}

const BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService/getScsbidListSttusCnstwkPPSSrch";

// 어제 공고 상위 7개 정상 낙찰자 (낙찰하한선 통과)
const TARGETS = [
  { name: "(주)새빛조경", bizno: "4958603422", note: "본인 회사, 어제 1등" },
  { name: "샘터조경", bizno: "1342875415", note: "어제 2등, 1693원차" },
  { name: "(주)찬미조경", bizno: "4748703489", note: "어제 3등" },
  { name: "대동이앤씨주식회사", bizno: "1058651768", note: "어제 4등" },
  { name: "초록환경디자인", bizno: "1342271760", note: "어제 5등" },
  { name: "가람조경", bizno: "4032106590", note: "어제 6등" },
  { name: "(주)한솔조경건설", bizno: "1408172761", note: "어제 8등" },
];

const BANGJE = /(방제|병해충|살균|살충|소독|약제살포)/;
const ANSAN = /안산/;

// 3년 = 36개 달력월 윈도우 (API는 end ≤ start + 1 calendar month 만 허용)
// 각 윈도우 = "해당 월 1일 00:00 ~ 해당 월 말일 23:59"
function buildWindows() {
  const windows = [];
  // 2023-05 ~ 2026-04 (36개월)
  let y = 2023, m = 5;
  for (let i = 0; i < 36; i++) {
    const lastDay = new Date(y, m, 0).getDate(); // m 은 1~12
    const mm = String(m).padStart(2, "0");
    const ld = String(lastDay).padStart(2, "0");
    windows.push({ bgn: `${y}${mm}010000`, end: `${y}${mm}${ld}2359` });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return windows;
}

async function fetchBiznoHistory(bizno) {
  const all = [];
  const windows = buildWindows();
  for (const w of windows) {
    let page = 1;
    while (page <= 10) {
      const qs = new URLSearchParams({
        ServiceKey: API_KEY,
        type: "json",
        inqryDiv: "1",
        inqryBgnDt: w.bgn,
        inqryEndDt: w.end,
        bizno,
        pageNo: String(page),
        numOfRows: "100",
      });
      const res = await fetch(`${BASE}?${qs.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      // 에러면 {"nkoneps.com.response.ResponseError":{...}}, 정상이면 {"response":{...}}
      const header = json?.response?.header ?? json?.["nkoneps.com.response.ResponseError"]?.header;
      if (header?.resultCode !== "00") {
        throw new Error(`resultCode=${header?.resultCode} msg=${header?.resultMsg} window=${w.bgn}~${w.end}`);
      }
      const body = json.response.body;
      const items = body?.items ?? [];
      const arr = Array.isArray(items) ? items : items?.item ? (Array.isArray(items.item) ? items.item : [items.item]) : [];
      all.push(...arr);
      const total = Number(body.totalCount);
      if (all.length >= total || arr.length === 0 || total <= page * 100) break;
      page++;
    }
  }
  return all;
}

function analyze(items) {
  const stats = {
    total: items.length,
    ansan: 0,
    bangje: 0,
    ansanBangje: 0,
    ansanNonBangje: 0,
    rates: [],
    samples: { ansanNonBangje: [], ansanBangje: [] },
    agencies: new Map(),
  };
  for (const it of items) {
    const agency = it.dminsttNm ?? "";
    const name = it.bidNtceNm ?? "";
    const rate = Number(it.sucsfbidRate);
    const isAnsan = ANSAN.test(agency);
    const isBangje = BANGJE.test(name);
    if (isAnsan) stats.ansan++;
    if (isBangje) stats.bangje++;
    if (isAnsan && isBangje) {
      stats.ansanBangje++;
      if (stats.samples.ansanBangje.length < 3) stats.samples.ansanBangje.push({ name, agency, rate });
    }
    if (isAnsan && !isBangje) {
      stats.ansanNonBangje++;
      if (stats.samples.ansanNonBangje.length < 5) stats.samples.ansanNonBangje.push({ name, agency, rate });
    }
    if (!Number.isNaN(rate) && rate > 0) stats.rates.push(rate);
    stats.agencies.set(agency, (stats.agencies.get(agency) ?? 0) + 1);
  }
  return stats;
}

function summarizeRates(rates) {
  if (rates.length === 0) return "n/a";
  const sorted = [...rates].sort((a, b) => a - b);
  const mean = rates.reduce((s, x) => s + x, 0) / rates.length;
  const med = sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return `n=${rates.length} mean=${mean.toFixed(2)} med=${med.toFixed(2)} min=${min.toFixed(2)} max=${max.toFixed(2)}`;
}

async function main() {
  console.log(`📊 3년 낙찰 이력 조회 (30일 × 36 슬라이딩 윈도우)\n`);

  const overall = { total: 0, ansan: 0, ansanNonBangje: 0 };
  const ansanCompetitorsPerYear = [];

  for (const t of TARGETS) {
    process.stdout.write(`▶ ${t.name} (${t.bizno}) ${t.note}... `);
    try {
      const items = await fetchBiznoHistory(t.bizno);
      const s = analyze(items);
      console.log(`총 ${s.total}건 낙찰`);
      console.log(`   안산=${s.ansan}  방제=${s.bangje}  안산∩방제=${s.ansanBangje}  안산∩비방제=${s.ansanNonBangje}`);
      console.log(`   낙찰률: ${summarizeRates(s.rates)}`);
      if (s.samples.ansanNonBangje.length > 0) {
        console.log(`   [안산 비방제 샘플]`);
        for (const x of s.samples.ansanNonBangje) {
          console.log(`     · [${x.rate}%] ${x.agency} — ${x.name}`);
        }
      }
      // 발주처 Top 3
      const agTop = [...s.agencies.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      if (agTop.length) {
        console.log(`   [발주처 Top 3]`);
        for (const [ag, n] of agTop) console.log(`     · ${n}건: ${ag}`);
      }
      console.log();

      overall.total += s.total;
      overall.ansan += s.ansan;
      overall.ansanNonBangje += s.ansanNonBangje;
      if (t.bizno !== "4958603422") {
        // 본인 제외 경쟁자만
        ansanCompetitorsPerYear.push({ name: t.name, count3y: s.ansanNonBangje });
      }
    } catch (e) {
      console.log(`❌ ${e.message}`);
    }
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`7개 업체 합산 3년:`);
  console.log(`  총 낙찰: ${overall.total}건`);
  console.log(`  안산: ${overall.ansan}건`);
  console.log(`  안산∩비방제: ${overall.ansanNonBangje}건  ← 본인 경쟁 풀 핵심 지표`);

  console.log(`\n경쟁자 6명 (본인 제외) 안산∩비방제 낙찰 분포 (3년):`);
  ansanCompetitorsPerYear.sort((a, b) => b.count3y - a.count3y);
  for (const x of ansanCompetitorsPerYear) {
    const perYear = (x.count3y / 3).toFixed(1);
    console.log(`  · ${x.name}: 3년 ${x.count3y}건 (연 ${perYear}건)`);
  }

  console.log(`\n[판정 기준]`);
  console.log(`  ✅ 경쟁자들이 안산∩비방제에서 각각 3년 5건 이상 반복 낙찰 → 반복 상위권 확정, 스코프 2 진행`);
  console.log(`  ⚠️  1~4건 산발적 → 애매, 더 넓은 풀 조사 필요`);
  console.log(`  ❌ 대부분 0~1건 → 어제 공고 상위권은 우연, 스코프 2 재검토`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
