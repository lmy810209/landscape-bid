#!/usr/bin/env node
// 어제 공고(R26BK01294519) 참여 68명 전체의 3년 낙찰 이력 스캔.
//
// 목적: 진짜 "안산 반복 경쟁자"가 68명 중 몇 명인지 확정.
//
// 규모: 68업체 × 36개월 윈도우 ≈ 2,448 호출 (일일 할당 10,000 내 안전).
// 예상 시간: 10~30분.
//
// 저장: data/scope2-scan.json 에 {bizno: [items]} 형식. 이미 있으면 스킵(재개).
// 중간 저장: 각 업체 끝날 때마다 저장 (크래시 대비).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const API_KEY = env.NARA_API_KEY;
if (!API_KEY) { console.error("❌ NARA_API_KEY 없음"); process.exit(1); }

const BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService/getScsbidListSttusCnstwkPPSSrch";
const OUT = path.join(__dirname, "..", "data", "scope2-scan.json");

// 어제 공고 R26BK01294519 참여 68명 (사업자번호, 업체명)
const TARGETS = [
  // 정상 투찰 26명 (상위 → 하위)
  ["4958603422", "(주)새빛조경"],
  ["1342875415", "샘터조경"],
  ["4748703489", "(주)찬미조경"],
  ["1058651768", "대동이앤씨주식회사"],
  ["1342271760", "초록환경디자인"],
  ["4032106590", "가람조경"],
  ["8508803021", "신라 주식회사"],
  ["1408172761", "(주)한솔조경건설"],
  ["1408147374", "주식회사 가림엔지니어링"],
  ["1248602216", "주식회사 피에스엠씨"],
  ["8965100645", "남경조경"],
  ["3128702542", "주식회사 나무누리"],
  ["7888603023", "(주)지비조경개발"],
  ["1348629134", "(주)경안스틸"],
  ["1340369716", "향림조경"],
  ["6548802894", "쌍송백조경건설 주식회사"],
  ["3178700480", "주식회사 은봉조경"],
  ["7648800359", "주식회사 에코그린"],
  ["8658803095", "주식회사 창대하조경"],
  ["2158743771", "예주조경개발 주식회사"],
  ["1400716186", "세화조경"],
  ["3754400359", "뉴그린조경"],
  ["1348611992", "주식회사 남양"],
  ["1348649862", "(주)인하조경건설"],
  ["4140199674", "하나조경건설"],
  ["1348172941", "목림조경(주)"],
  // 낙찰하한선 미달 42명
  ["4078111745", "유한회사 에스디건설"],
  ["1348120972", "신경기건설(주)"],
  ["2148672112", "덕조종합조경 주식회사"],
  ["4108123757", "수림종합개발 주식회사"],
  ["1758603116", "(주)코리아조경"],
  ["1348611162", "주식회사제현산업"],
  ["7208701875", "(주)한국조경"],
  ["3798103203", "주식회사 물댄조경"],
  ["1228612421", "(주)동산이엔씨"],
  ["5802300150", "만탑건설"],
  ["4098600972", "주식회사 맥스조경"],
  ["5028147548", "풍천건설산업(주)"],
  ["1343288222", "엔에스(NS) 조경건설"],
  ["6768701393", "주식회사뉴피닉스"],
  ["1342263862", "까치조경"],
  ["8878100707", "(주)시원조경"],
  ["1348125448", "안산조경건설(주)"],
  ["7052201561", "꽃과나무(F&T)"],
  ["5378702665", "주식회사 늘푸른원"],
  ["6778701998", "주식회사광풍"],
  ["3228601242", "경인이엔지주식회사"],
  ["1343069920", "봉림조경"],
  ["2858601619", "주식회사 다온종합관리"],
  ["6308100310", "주식회사 부경조경"],
  ["8078800923", "주식회사 란"],
  ["1348618506", "청아조경(주)"],
  ["1348189817", "주식회사 현성조경"],
  ["1245236609", "아트코리아"],
  ["1341015504", "시민조경"],
  ["6632500347", "엠지엠(MGM)이엔지"],
  ["7221102860", "해솔조경"],
  ["1318174940", "참터종합건설 주식회사"],
  ["2578803329", "주식회사제이케이조경"],
  ["3858703118", "(주)정글"],
  ["4568602637", "천호조경 주식회사"],
  ["2110184489", "한우리조경"],
  ["7428600597", "주식회사 청호조경"],
  ["1348158274", "미래조경(주)"],
  ["3608701805", "청솔조경주식회사"],
  ["1875600740", "대림조경"],
  ["5895800237", "경원산업"],
  ["1348673396", "주식회사 서림조경"],
];

// 3년 × 12개월 = 36 calendar-month windows ending 2026-04
function buildWindows() {
  const windows = [];
  let y = 2023, m = 5;
  for (let i = 0; i < 36; i++) {
    const lastDay = new Date(y, m, 0).getDate();
    const mm = String(m).padStart(2, "0");
    const ld = String(lastDay).padStart(2, "0");
    windows.push({ bgn: `${y}${mm}010000`, end: `${y}${mm}${ld}2359` });
    m++; if (m > 12) { m = 1; y++; }
  }
  return windows;
}
const WINDOWS = buildWindows();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBiznoMonth(bizno, win, retry = 0) {
  const qs = new URLSearchParams({
    ServiceKey: API_KEY, type: "json", inqryDiv: "1",
    inqryBgnDt: win.bgn, inqryEndDt: win.end,
    bizno, pageNo: "1", numOfRows: "100",
  });
  const res = await fetch(`${BASE}?${qs.toString()}`);
  if (res.status === 429) {
    if (retry < 5) {
      const wait = 2000 * (retry + 1);
      await sleep(wait);
      return fetchBiznoMonth(bizno, win, retry + 1);
    }
    throw new Error(`HTTP 429 (${retry}회 재시도 실패)`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const header = json?.response?.header ?? json?.["nkoneps.com.response.ResponseError"]?.header;
  if (header?.resultCode !== "00") throw new Error(`code=${header?.resultCode} ${header?.resultMsg}`);
  const items = json.response.body?.items ?? [];
  await sleep(150); // rate limit 완화 (1초 6~7회 정도)
  return Array.isArray(items) ? items : items?.item ? (Array.isArray(items.item) ? items.item : [items.item]) : [];
}

// 기존 저장 로드 (재개용)
let store = {};
if (fs.existsSync(OUT)) {
  try { store = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch {}
}

function saveStore() {
  fs.writeFileSync(OUT, JSON.stringify(store, null, 2));
}

async function main() {
  const startedAt = Date.now();
  const todo = TARGETS.filter(([bz]) => !(bz in store));
  console.log(`🎯 대상 68명 중 미완료 ${todo.length}명 스캔 시작`);
  console.log(`   (이미 완료: ${Object.keys(store).length}명)\n`);

  for (let idx = 0; idx < todo.length; idx++) {
    const [bizno, name] = todo[idx];
    process.stdout.write(`[${idx + 1}/${todo.length}] ${name} (${bizno}) ... `);
    const items = [];
    try {
      for (const w of WINDOWS) {
        const r = await fetchBiznoMonth(bizno, w);
        items.push(...r);
      }
      store[bizno] = { name, items };
      saveStore();
      console.log(`✅ ${items.length}건`);
    } catch (e) {
      console.log(`❌ ${e.message}`);
      // 실패해도 계속 — 다음 실행 때 재시도됨
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000 / 60).toFixed(1);
  console.log(`\n✅ 완료. 총 ${elapsed}분 소요. 결과: ${OUT}`);

  // 간단 집계
  const ANSAN = /안산/;
  const BANGJE = /(방제|병해충|살균|살충|소독|약제살포)/;
  const rows = [];
  for (const [bz, v] of Object.entries(store)) {
    const its = v.items;
    const total = its.length;
    const ansan = its.filter((it) => ANSAN.test(it.dminsttNm ?? "")).length;
    const bangje = its.filter((it) => BANGJE.test(it.bidNtceNm ?? "")).length;
    const ansanNonBangje = its.filter((it) => ANSAN.test(it.dminsttNm ?? "") && !BANGJE.test(it.bidNtceNm ?? "")).length;
    rows.push({ bizno: bz, name: v.name, total, ansan, bangje, ansanNonBangje });
  }
  rows.sort((a, b) => b.ansanNonBangje - a.ansanNonBangje);

  console.log(`\n📊 안산∩비방제 낙찰 3년치 순위 (상위 20):\n`);
  console.log(`순위 | 업체 | 총 | 안산 | 안산∩비방제 | 연 환산`);
  console.log(`-----|------|----|------|-------------|---------`);
  rows.slice(0, 20).forEach((r, i) => {
    console.log(`${String(i + 1).padStart(2)} | ${r.name.padEnd(30, " ")} | ${String(r.total).padStart(3)} | ${String(r.ansan).padStart(3)} | ${String(r.ansanNonBangje).padStart(3)} | ${(r.ansanNonBangje / 3).toFixed(1)}건/년`);
  });

  const bucket5plus = rows.filter((r) => r.ansanNonBangje >= 5).length;
  const bucket2to4 = rows.filter((r) => r.ansanNonBangje >= 2 && r.ansanNonBangje < 5).length;
  const bucket01 = rows.filter((r) => r.ansanNonBangje < 2).length;
  console.log(`\n분포:`);
  console.log(`  안산∩비방제 5건+: ${bucket5plus}명 (반복 경쟁자)`);
  console.log(`  2~4건: ${bucket2to4}명 (간헐 경쟁자)`);
  console.log(`  0~1건: ${bucket01}명 (어제만 참여 / 외지)`);

  const totalPool = rows.reduce((s, r) => s + r.ansanNonBangje, 0);
  console.log(`\n68명 합산 안산∩비방제 3년 낙찰: ${totalPool}건`);
  console.log(`(이 68명이 풀 전체의 X%라 가정 시 실제 풀 크기는 ${totalPool} / X%)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
