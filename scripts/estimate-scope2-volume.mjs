#!/usr/bin/env node
// 스코프 2 수집 규모 추정.
//
// 질문: "경기도 안산시 + 조경 유지관리 + 최근 3년" 예상 낙찰 건수는?
//
// 방법:
//   1) 최근 30일 전국 공사 낙찰 totalCount 획득 (개찰일시 기준)
//   2) 처음 N 페이지(각 50건) 샘플링
//   3) 클라이언트 필터: dminsttNm contains "안산", bidNtceNm contains ("조경"|"유지관리"|"가로수"|"수목")
//   4) 매칭 비율 × totalCount × (36/1) = 3년 추정치
//
// 주의: 표본 일치율 기반 점추정이라 ±50% 오차 가능. 대략 스케일만 확인.

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

const BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService/getScsbidListSttusCnstwk";

// 오늘: 2026-04-24 → 30일 전: 2026-03-25
const today = new Date("2026-04-24T00:00:00+09:00");
const start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
const fmt = (d) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}0000`;
const fmtEnd = (d) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}2359`;

const inqryBgnDt = fmt(start);
const inqryEndDt = fmtEnd(today);
const WINDOW_DAYS = 30;

console.log(`조회 기간: ${inqryBgnDt} ~ ${inqryEndDt} (${WINDOW_DAYS}일)`);

const AGENCY_PATTERN = /안산/;
const WORK_PATTERN = /(조경|유지관리|가로수|수목|녹지|식재|전정|병해충|화단|보식)/;

async function call(params) {
  const qs = new URLSearchParams({
    ServiceKey: API_KEY,
    type: "json",
    ...params,
  });
  const res = await fetch(`${BASE}?${qs.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const header = json?.response?.header;
  if (header?.resultCode !== "00") {
    throw new Error(`API 오류: ${header?.resultCode} ${header?.resultMsg}`);
  }
  return json.response.body;
}

async function main() {
  // 1. totalCount 확인 (inqryDiv=3 개찰일시 기준)
  const first = await call({
    inqryDiv: "3",
    inqryBgnDt,
    inqryEndDt,
    pageNo: "1",
    numOfRows: "1",
  });
  const total = Number(first.totalCount);
  console.log(`\n최근 ${WINDOW_DAYS}일 전국 공사 낙찰 totalCount: ${total.toLocaleString()}건`);

  if (total === 0) {
    console.log("❌ 0건 — 기간/조회구분 문제 가능. inqryDiv=1(등록일시) 재시도 권장");
    return;
  }

  // 2. 페이지 샘플링: 전체가 많으면 앞 5페이지만
  const PAGE_SIZE = 50;
  const MAX_PAGES = Math.min(Math.ceil(total / PAGE_SIZE), 5);
  console.log(`샘플링: ${MAX_PAGES}페이지 × ${PAGE_SIZE}건 = 최대 ${MAX_PAGES * PAGE_SIZE}건 조사`);

  const agencyHits = [];
  const workHits = [];
  const bothHits = [];
  let sampled = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await call({
      inqryDiv: "3",
      inqryBgnDt,
      inqryEndDt,
      pageNo: String(page),
      numOfRows: String(PAGE_SIZE),
    });
    const items = body?.items ?? [];
    const arr = Array.isArray(items) ? items : items?.item ? (Array.isArray(items.item) ? items.item : [items.item]) : [];
    sampled += arr.length;

    for (const it of arr) {
      const agency = it.dminsttNm ?? "";
      const name = it.bidNtceNm ?? "";
      const agencyMatch = AGENCY_PATTERN.test(agency);
      const workMatch = WORK_PATTERN.test(name);
      if (agencyMatch) agencyHits.push({ agency, name, rate: it.sucsfbidRate });
      if (workMatch) workHits.push({ agency, name, rate: it.sucsfbidRate });
      if (agencyMatch && workMatch) bothHits.push({ agency, name, rate: it.sucsfbidRate });
    }
  }

  console.log(`\n샘플 ${sampled}건 분석:`);
  console.log(`  - 안산 매칭: ${agencyHits.length}건 (${((agencyHits.length / sampled) * 100).toFixed(2)}%)`);
  console.log(`  - 조경/유지관리 계열 매칭: ${workHits.length}건 (${((workHits.length / sampled) * 100).toFixed(2)}%)`);
  console.log(`  - 둘 다 매칭: ${bothHits.length}건 (${((bothHits.length / sampled) * 100).toFixed(3)}%)`);

  const ratio = bothHits.length / sampled;
  const scaled30 = Math.round(total * ratio);
  const scaled3y = Math.round(scaled30 * 36); // 30일 → 36배 = 3년
  console.log(`\n📊 추정치:`);
  console.log(`  - 30일 전국 예상 매칭: ${scaled30}건`);
  console.log(`  - 3년 전국 예상 매칭 (×36): ${scaled3y}건`);

  if (bothHits.length > 0) {
    console.log(`\n둘 다 매칭 샘플 (최대 10건):`);
    bothHits.slice(0, 10).forEach((h) => {
      console.log(`  · [${h.rate}%] ${h.agency} — ${h.name}`);
    });
  }

  if (agencyHits.length > 0 && bothHits.length === 0) {
    console.log(`\n안산 매칭은 있으나 조경 계열 매칭 없음 — 샘플이 작거나 키워드 조정 필요`);
    console.log(`안산 매칭 샘플:`);
    agencyHits.slice(0, 5).forEach((h) => {
      console.log(`  · [${h.rate}%] ${h.agency} — ${h.name}`);
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
