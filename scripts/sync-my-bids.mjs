#!/usr/bin/env node
// 본인(새빛조경) 정상 참여 데이터를 op13 + public_wins에서 가져와 bids 테이블에 자동 sync.
// 미달은 API에 없음 — 수동 입력 필요 (별도 안내).
//
// 동작:
// 1) public_participants에서 본인 정상 참여 모두
// 2) public_wins에서 본인 낙찰 (낙찰자 = 본인)
// 3) bids 테이블 upsert (notice_no 키로 중복 방지)
// 4) 결과 status: 낙찰 / 2등 / 순위권밖 (opengRank 기반)

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

async function upsertBids(rows) {
  const r = await fetch(`${URL_BASE}/rest/v1/bids`, {
    method: "POST",
    headers: {
      apikey: KEY,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("upsert 실패:", r.status, t.slice(0, 300));
    return false;
  }
  return true;
}

console.log("로딩...");

// 1) 본인 정상 참여 (op13)
const myParts = await fetchAll(
  "public_participants",
  `select=bid_ntce_no,bidprc_amt,bidprcrt,openg_rank,rmrk,drwt_no_1,drwt_no_2&prcbdr_bizno=eq.${MY_BIZNO}`
);
console.log(`본인 op13 참여: ${myParts.length}건`);

// 2) 본인 낙찰
const myWins = await fetchAll(
  "public_wins",
  `select=bid_ntce_no,bid_ntce_nm,dminstt_nm,sucsfbid_amt,sucsfbid_rate,rl_openg_dt&bidwinnr_bizno=eq.${MY_BIZNO}`
);
console.log(`본인 낙찰: ${myWins.length}건`);

// 3) 공고 메타 — chunked
const noticeIds = [...new Set([...myParts.map((p) => p.bid_ntce_no), ...myWins.map((w) => w.bid_ntce_no)])];
const noticeMetas = [];
for (let i = 0; i < noticeIds.length; i += 100) {
  const chunk = noticeIds.slice(i, i + 100);
  const inList = chunk.map((id) => encodeURIComponent(id)).join(",");
  const data = await fetchAll(
    "public_wins",
    `select=bid_ntce_no,bid_ntce_nm,dminstt_nm,sucsfbid_amt,sucsfbid_rate,rl_openg_dt,raw&bid_ntce_no=in.(${inList})`
  );
  noticeMetas.push(...data);
}
const metaByNo = Object.fromEntries(noticeMetas.map((m) => [m.bid_ntce_no, m]));

// 기초금액 보강 — preprices에서 bssamt 가져옴
const prepriceMetas = [];
for (let i = 0; i < noticeIds.length; i += 100) {
  const chunk = noticeIds.slice(i, i + 100);
  const inList = chunk.map((id) => encodeURIComponent(id)).join(",");
  const data = await fetchAll(
    "public_preprices",
    `select=bid_ntce_no,bssamt,plnprc&bid_ntce_no=in.(${inList})&compno_rsrvtn_prce_sno=eq.1`
  );
  prepriceMetas.push(...data);
}
const baseByNo = Object.fromEntries(prepriceMetas.map((p) => [p.bid_ntce_no, p]));
console.log(`기초금액 매칭: ${Object.keys(baseByNo).length}/${noticeIds.length}건`);

// 4) 기존 bids 테이블 — 중복 방지
const existing = await fetchAll("bids", "select=notice_no");
const existingSet = new Set(existing.map((b) => b.notice_no));
console.log(`기존 bids: ${existing.length}건\n`);

// 5) 행 빌드
const rows = [];
for (const p of myParts) {
  const meta = metaByNo[p.bid_ntce_no];
  if (!meta) continue;
  const win = myWins.find((w) => w.bid_ntce_no === p.bid_ntce_no);
  const prep = baseByNo[p.bid_ntce_no];
  const baseAmount = prep?.bssamt ? Number(prep.bssamt) :
    (meta?.raw?.bdgtAmt ? Number(meta.raw.bdgtAmt) : null);
  if (!baseAmount) continue; // 기초금액 없으면 skip
  const rank = Number(p.openg_rank);
  let status = "";
  if (p.rmrk === "낙찰하한선미달" || (p.rmrk ?? "").includes("미달")) status = "낙찰하한선미달";
  else if (rank === 1) status = "낙찰";
  else if (rank === 2) status = "2등";
  else if (rank >= 3) status = "순위권밖";

  const bidDate = meta.rl_openg_dt?.slice(0, 10) ?? null;
  const noticeTitle = meta.bid_ntce_nm ?? "";
  const isBangje = /방제|병해충|살균|살충|소독|약제살포/.test(noticeTitle);
  const workType = isBangje ? "기타" : (/유지관리|관리|유지|예초|풀깎기|전정/.test(noticeTitle) ? "유지관리" : "기타");

  rows.push({
    notice_no: p.bid_ntce_no,
    notice_title: noticeTitle,
    agency: meta.dminstt_nm ?? "",
    work_type: workType,
    region: null,
    base_amount: baseAmount,
    estimated_price: null,
    bid_date: bidDate,
    bid_method: null,
    qualification_limit: null,
    participant_count: null,
    my_bid_amount: p.bidprc_amt ? Number(p.bidprc_amt) : null,
    winning_amount: win ? Number(win.sucsfbid_amt) : null,
    second_amount: null,
    result_status: status,
    note: `[자동 sync] op13 정상 참여. 추첨번호 ${(p.drwt_no_1 ?? "").trim()}/${(p.drwt_no_2 ?? "").trim()}`,
  });
}
console.log(`sync 후보: ${rows.length}건 (기존 ${existing.length} + 신규 ${rows.length - existing.length}이상 가능)`);

// 6) 신규만 upsert
const newRows = rows.filter((r) => !existingSet.has(r.notice_no));
console.log(`upsert 시작 — 신규 ${newRows.length}건...`);
const BATCH = 50;
let okCount = 0;
for (let i = 0; i < newRows.length; i += BATCH) {
  const batch = newRows.slice(i, i + BATCH);
  const ok = await upsertBids(batch);
  if (ok) okCount += batch.length;
}
console.log(`✅ 적재 완료: ${okCount}건`);

// 7) 결과 보고
const { length: finalCount } = await fetchAll("bids", "select=notice_no");
console.log(`\nbids 테이블 최종: ${finalCount}건 (이전 ${existing.length})`);
console.log(`\n⚠ 미달 부적격 4건은 op13에 안 잡힘. /bids/new에서 수동 입력 필요.`);
